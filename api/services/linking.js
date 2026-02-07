// Auto-linking Service for Related Conversations

import { EmbeddingService } from './embedding.js';

class ConversationLinkingService {
    constructor(database) {
        this.db = database;
        this.embeddingService = new EmbeddingService();
        
        // Initialize embedding table first
        this.initializeEmbeddingTable();
        
        // Then prepare statements
        this.getConversationEmbedding = this.db.prepare(
            "SELECT * FROM conversation_embeddings WHERE conversation_id = ?"
        );
        
        this.insertConversationEmbedding = this.db.prepare(`
            INSERT OR REPLACE INTO conversation_embeddings 
            (conversation_id, embedding_vector, embedding_model, created_at)
            VALUES (?, ?, ?, ?)
        `);
        
        this.insertConversationLink = this.db.prepare(`
            INSERT OR REPLACE INTO conversation_links 
            (from_id, to_id, link_type, strength, reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        this.getAllConversations = this.db.prepare(`
            SELECT id, title, summary, started_at 
            FROM conversations 
            ORDER BY started_at DESC
        `);
        
        this.getConversationMessages = this.db.prepare(`
            SELECT content, role FROM messages 
            WHERE conversation_id = ? 
            ORDER BY timestamp ASC
        `);
        
        this.getExistingLinks = this.db.prepare(`
            SELECT to_id, strength FROM conversation_links 
            WHERE from_id = ? AND link_type = 'similar'
        `);
    }
    
    /**
     * Initialize embedding table if it doesn't exist
     */
    initializeEmbeddingTable() {
        try {
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS conversation_embeddings (
                    conversation_id TEXT PRIMARY KEY,
                    embedding_vector TEXT NOT NULL,  -- JSON serialized vector
                    embedding_model TEXT NOT NULL,
                    created_at INTEGER DEFAULT (strftime('%s','now')),
                    FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                );
            `);
            console.log('✅ Conversation embeddings table ready');
        } catch (error) {
            console.error('❌ Failed to create embeddings table:', error);
        }
    }
    
    /**
     * Generate and store embedding for a conversation
     */
    async generateConversationEmbedding(conversationId) {
        try {
            // Get conversation messages
            const messages = this.getConversationMessages.all(conversationId);
            
            if (messages.length === 0) {
                console.log(`⚠️ No messages found for conversation ${conversationId}`);
                return null;
            }
            
            // Create conversation text for embedding
            const conversationText = messages
                .map(m => `${m.role}: ${m.content}`)
                .join('\n');
            
            // Generate embedding
            const embedding = await this.embeddingService.generateEmbedding(conversationText);
            
            if (!embedding) {
                console.log(`⚠️ Failed to generate embedding for ${conversationId}`);
                return null;
            }
            
            // Store embedding
            const embeddingJson = JSON.stringify(embedding.vector);
            this.insertConversationEmbedding.run(
                conversationId,
                embeddingJson,
                embedding.model,
                Math.floor(Date.now() / 1000)
            );
            
            console.log(`✅ Generated embedding for conversation ${conversationId}`);
            return embedding;
            
        } catch (error) {
            console.error(`❌ Error generating embedding for ${conversationId}:`, error);
            return null;
        }
    }
    
    /**
     * Find similar conversations for a given conversation
     */
    async findSimilarConversations(targetConversationId, threshold = 0.6) {
        try {
            // Get or generate embedding for target conversation
            let targetEmbedding = this.getConversationEmbedding.get(targetConversationId);
            
            if (!targetEmbedding) {
                const embedding = await this.generateConversationEmbedding(targetConversationId);
                if (!embedding) return [];
                targetEmbedding = {
                    conversation_id: targetConversationId,
                    embedding_vector: JSON.stringify(embedding.vector),
                    embedding_model: embedding.model
                };
            }
            
            const targetVector = JSON.parse(targetEmbedding.embedding_vector);
            const similarities = [];
            
            // Get all other conversations
            const conversations = this.getAllConversations.all();
            
            for (const conv of conversations) {
                if (conv.id === targetConversationId) continue;
                
                // Get or generate embedding for comparison conversation
                let compEmbedding = this.getConversationEmbedding.get(conv.id);
                
                if (!compEmbedding) {
                    const embedding = await this.generateConversationEmbedding(conv.id);
                    if (!embedding) continue;
                    compEmbedding = {
                        embedding_vector: JSON.stringify(embedding.vector)
                    };
                }
                
                const compVector = JSON.parse(compEmbedding.embedding_vector);
                const similarity = this.embeddingService.calculateSimilarity(
                    { vector: targetVector },
                    { vector: compVector }
                );
                
                if (similarity >= threshold) {
                    similarities.push({
                        conversation_id: conv.id,
                        title: conv.title,
                        similarity: similarity,
                        started_at: conv.started_at
                    });
                }
            }
            
            return similarities.sort((a, b) => b.similarity - a.similarity);
            
        } catch (error) {
            console.error(`❌ Error finding similar conversations:`, error);
            return [];
        }
    }
    
    /**
     * Auto-link a conversation to similar conversations
     */
    async autoLinkConversation(conversationId, threshold = 0.7) {
        try {
            const similar = await this.findSimilarConversations(conversationId, threshold);
            let linksCreated = 0;
            
            for (const sim of similar) {
                // Check if link already exists
                const existing = this.getExistingLinks.get(conversationId);
                const alreadyLinked = existing && existing.find(link => link.to_id === sim.conversation_id);
                
                if (!alreadyLinked) {
                    // Create bidirectional links
                    const reason = `Similar topics (${Math.round(sim.similarity * 100)}% similarity)`;
                    const timestamp = Math.floor(Date.now() / 1000);
                    
                    this.insertConversationLink.run(
                        conversationId, sim.conversation_id, 'similar', 
                        sim.similarity, reason, timestamp
                    );
                    
                    this.insertConversationLink.run(
                        sim.conversation_id, conversationId, 'similar', 
                        sim.similarity, reason, timestamp
                    );
                    
                    linksCreated += 2;
                    console.log(`🔗 Linked ${conversationId} ↔ ${sim.conversation_id} (${Math.round(sim.similarity * 100)}%)`);
                }
            }
            
            return { linksCreated, similarConversations: similar.length };
            
        } catch (error) {
            console.error(`❌ Error auto-linking conversation ${conversationId}:`, error);
            return { linksCreated: 0, similarConversations: 0 };
        }
    }
    
    /**
     * Process all conversations for auto-linking
     */
    async processAllConversations(threshold = 0.7) {
        try {
            console.log('🔍 Starting auto-linking process for all conversations...');
            
            const conversations = this.getAllConversations.all();
            let totalLinks = 0;
            let processed = 0;
            
            for (const conv of conversations) {
                const result = await this.autoLinkConversation(conv.id, threshold);
                totalLinks += result.linksCreated;
                processed++;
                
                if (processed % 10 === 0) {
                    console.log(`📊 Processed ${processed}/${conversations.length} conversations`);
                }
                
                // Small delay to prevent overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            console.log(`✅ Auto-linking complete: ${totalLinks} links created for ${conversations.length} conversations`);
            return { totalLinks, processedConversations: conversations.length };
            
        } catch (error) {
            console.error('❌ Error in auto-linking process:', error);
            return { totalLinks: 0, processedConversations: 0 };
        }
    }
    
    /**
     * Get conversation links for a specific conversation
     */
    getConversationLinks(conversationId) {
        try {
            const links = this.db.prepare(`
                SELECT 
                    cl.*,
                    c.title as linked_title,
                    c.started_at as linked_date,
                    c.summary as linked_summary
                FROM conversation_links cl
                JOIN conversations c ON cl.to_id = c.id
                WHERE cl.from_id = ?
                ORDER BY cl.strength DESC, cl.created_at DESC
            `).all(conversationId);
            
            return links;
        } catch (error) {
            console.error(`❌ Error getting links for ${conversationId}:`, error);
            return [];
        }
    }
    
    /**
     * Manual linking between conversations
     */
    createManualLink(fromId, toId, reason = 'Manually linked') {
        try {
            const timestamp = Math.floor(Date.now() / 1000);
            
            // Create bidirectional manual link
            this.insertConversationLink.run(
                fromId, toId, 'manual', 1.0, reason, timestamp
            );
            
            this.insertConversationLink.run(
                toId, fromId, 'manual', 1.0, reason, timestamp
            );
            
            console.log(`🔗 Manual link created: ${fromId} ↔ ${toId}`);
            return true;
            
        } catch (error) {
            console.error(`❌ Error creating manual link:`, error);
            return false;
        }
    }
}

export { ConversationLinkingService };