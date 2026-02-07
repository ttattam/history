#!/usr/bin/env node

import Database from 'better-sqlite3';
import { readFileSync, statSync, readdirSync } from 'fs';
import { join, extname, basename } from 'path';
import { randomUUID } from 'crypto';

class ConversationImporter {
    constructor(dbPath = './history.db') {
        this.db = new Database(dbPath);
        
        // Prepared statements for performance
        this.insertConversation = this.db.prepare(`
            INSERT OR REPLACE INTO conversations 
            (id, title, started_at, updated_at, message_count, project_path, tags, summary)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        this.insertMessage = this.db.prepare(`
            INSERT OR REPLACE INTO messages 
            (id, conversation_id, role, content, timestamp, tokens_used, tool_calls, file_references)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        this.checkConversationExists = this.db.prepare(
            "SELECT id FROM conversations WHERE id = ?"
        );
    }
    
    /**
     * Parse Claude Code conversation export JSON
     */
    parseClaudeExport(jsonData) {
        // Handle different possible JSON structures
        let conversation;
        
        if (jsonData.conversation) {
            conversation = jsonData.conversation;
        } else if (jsonData.messages) {
            conversation = jsonData;
        } else if (Array.isArray(jsonData)) {
            conversation = { messages: jsonData };
        } else {
            throw new Error('Unknown JSON format');
        }
        
        const messages = conversation.messages || [];
        if (messages.length === 0) {
            throw new Error('No messages found in conversation');
        }
        
        // Generate conversation metadata
        const firstMessage = messages[0];
        const lastMessage = messages[messages.length - 1];
        
        const conversationId = conversation.id || this.generateConversationId(firstMessage);
        const title = this.extractTitle(messages);
        const startedAt = this.parseTimestamp(firstMessage.timestamp || firstMessage.created_at || Date.now());
        const updatedAt = this.parseTimestamp(lastMessage.timestamp || lastMessage.created_at || Date.now());
        const projectPath = this.extractProjectPath(messages);
        const fileReferences = this.extractFileReferences(messages);
        const summary = this.generateSummary(messages);
        
        return {
            id: conversationId,
            title,
            started_at: startedAt,
            updated_at: updatedAt,
            message_count: messages.length,
            project_path: projectPath,
            tags: JSON.stringify([]),
            summary,
            messages: messages.map((msg, index) => ({
                id: msg.id || randomUUID(),
                conversation_id: conversationId,
                role: msg.role || (index % 2 === 0 ? 'user' : 'assistant'),
                content: msg.content || msg.text || '',
                timestamp: this.parseTimestamp(msg.timestamp || msg.created_at || startedAt + index * 1000),
                tokens_used: msg.tokens || null,
                tool_calls: msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
                file_references: this.extractMessageFileReferences(msg.content || msg.text || '')
            }))
        };
    }
    
    /**
     * Generate unique conversation ID from first message
     */
    generateConversationId(firstMessage) {
        const content = (firstMessage.content || firstMessage.text || '').substring(0, 100);
        const timestamp = firstMessage.timestamp || firstMessage.created_at || Date.now();
        return `conv_${Date.now()}_${Buffer.from(content).toString('base64').substring(0, 8)}`;
    }
    
    /**
     * Extract conversation title from messages
     */
    extractTitle(messages) {
        const firstUserMessage = messages.find(m => m.role === 'user' || !m.role);
        if (!firstUserMessage) return 'Conversation';
        
        const content = firstUserMessage.content || firstUserMessage.text || '';
        const title = content.substring(0, 100).trim();
        return title || 'Untitled Conversation';
    }
    
    /**
     * Parse various timestamp formats
     */
    parseTimestamp(timestamp) {
        if (typeof timestamp === 'number') {
            // Handle both seconds and milliseconds
            return timestamp > 9999999999 ? Math.floor(timestamp / 1000) : timestamp;
        }
        if (typeof timestamp === 'string') {
            return Math.floor(new Date(timestamp).getTime() / 1000);
        }
        return Math.floor(Date.now() / 1000);
    }
    
    /**
     * Extract project path from messages
     */
    extractProjectPath(messages) {
        for (const message of messages) {
            const content = message.content || message.text || '';
            
            // Look for common path patterns
            const pathMatches = content.match(/\/[A-Za-z0-9_\-\.\/]+/g);
            if (pathMatches) {
                for (const path of pathMatches) {
                    if (path.includes('/Developer/') || path.includes('/Users/')) {
                        return path.split('/').slice(0, -1).join('/'); // Remove filename
                    }
                }
            }
        }
        return null;
    }
    
    /**
     * Extract file references from all messages
     */
    extractFileReferences(messages) {
        const files = new Set();
        
        for (const message of messages) {
            const content = message.content || message.text || '';
            const messageFiles = this.extractMessageFileReferences(content);
            if (messageFiles) {
                const parsed = JSON.parse(messageFiles);
                parsed.forEach(f => files.add(f));
            }
        }
        
        return files.size > 0 ? JSON.stringify([...files]) : null;
    }
    
    /**
     * Extract file references from a single message
     */
    extractMessageFileReferences(content) {
        const files = new Set();
        
        // Match file extensions
        const fileMatches = content.match(/[A-Za-z0-9_\-\.\/]+\.[a-z]{1,6}/g);
        if (fileMatches) {
            fileMatches.forEach(f => {
                if (f.includes('.')) files.add(f);
            });
        }
        
        // Match explicit file paths
        const pathMatches = content.match(/[\w\-\.\/]+\/([\w\-\.]+\.[a-z]+)/g);
        if (pathMatches) {
            pathMatches.forEach(p => files.add(p));
        }
        
        return files.size > 0 ? JSON.stringify([...files]) : null;
    }
    
    /**
     * Generate conversation summary
     */
    generateSummary(messages) {
        const topics = new Set();
        const keywords = new Set();
        
        for (const message of messages) {
            const content = (message.content || message.text || '').toLowerCase();
            
            // Extract tech keywords
            const techWords = content.match(/\b(react|vue|angular|node|python|javascript|typescript|api|database|sql|git|docker|aws|bug|fix|feature|component|function|class|method|error|install|deploy|test|build)\b/g);
            if (techWords) {
                techWords.forEach(w => keywords.add(w));
            }
        }
        
        const keywordList = [...keywords].slice(0, 5).join(', ');
        return keywordList || 'General discussion';
    }
    
    /**
     * Import single conversation
     */
    importConversation(conversationData) {
        const transaction = this.db.transaction(() => {
            // Check if conversation already exists
            const existing = this.checkConversationExists.get(conversationData.id);
            if (existing) {
                console.log(`⚠️  Conversation ${conversationData.id} already exists, updating...`);
            }
            
            // Insert conversation
            this.insertConversation.run(
                conversationData.id,
                conversationData.title,
                conversationData.started_at,
                conversationData.updated_at,
                conversationData.message_count,
                conversationData.project_path,
                conversationData.tags,
                conversationData.summary
            );
            
            // Insert messages
            for (const message of conversationData.messages) {
                this.insertMessage.run(
                    message.id,
                    message.conversation_id,
                    message.role,
                    message.content,
                    message.timestamp,
                    message.tokens_used,
                    message.tool_calls,
                    message.file_references
                );
            }
        });
        
        transaction();
        return conversationData;
    }
    
    /**
     * Import from JSON file or directory
     */
    async importFromPath(inputPath) {
        const stats = statSync(inputPath);
        const results = [];
        
        if (stats.isDirectory()) {
            console.log(`📁 Processing directory: ${inputPath}`);
            const files = readdirSync(inputPath).filter(f => extname(f) === '.json');
            
            for (const file of files) {
                const filePath = join(inputPath, file);
                try {
                    const result = await this.importFromFile(filePath);
                    results.push(result);
                } catch (error) {
                    console.error(`❌ Failed to import ${file}:`, error.message);
                }
            }
        } else {
            const result = await this.importFromFile(inputPath);
            results.push(result);
        }
        
        return results;
    }
    
    /**
     * Import from single JSON file
     */
    async importFromFile(filePath) {
        console.log(`📄 Processing file: ${basename(filePath)}`);
        
        const jsonContent = readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(jsonContent);
        
        const conversationData = this.parseClaudeExport(jsonData);
        const imported = this.importConversation(conversationData);
        
        console.log(`✅ Imported: "${imported.title}" (${imported.messages.length} messages)`);
        return imported;
    }
    
    /**
     * Get import statistics
     */
    getStats() {
        const stats = this.db.prepare(`
            SELECT 
                COUNT(*) as total_conversations,
                SUM(message_count) as total_messages,
                MIN(started_at) as earliest,
                MAX(updated_at) as latest
            FROM conversations
        `).get();
        
        return {
            ...stats,
            earliest: new Date(stats.earliest * 1000).toISOString(),
            latest: new Date(stats.latest * 1000).toISOString()
        };
    }
    
    close() {
        this.db.close();
    }
}

// CLI Usage
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('Usage: bun run scripts/import-claude.js <path-to-json-or-directory>');
        console.error('');
        console.error('Examples:');
        console.error('  bun run scripts/import-claude.js conversation.json');
        console.error('  bun run scripts/import-claude.js ~/Downloads/claude-exports/');
        process.exit(1);
    }
    
    const inputPath = args[0];
    const importer = new ConversationImporter();
    
    try {
        console.log('🚀 Starting Claude Code conversation import...\n');
        
        const results = await importer.importFromPath(inputPath);
        
        console.log('\n📊 Import Summary:');
        console.log(`   Processed: ${results.length} conversations`);
        console.log(`   Total messages: ${results.reduce((sum, r) => sum + r.messages.length, 0)}`);
        
        const stats = importer.getStats();
        console.log('\n📈 Database Stats:');
        console.log(`   Total conversations: ${stats.total_conversations}`);
        console.log(`   Total messages: ${stats.total_messages}`);
        console.log(`   Date range: ${stats.earliest} to ${stats.latest}`);
        
        console.log('\n✅ Import completed successfully!');
        console.log('💡 Next: Start the API server with "bun run api/server.js"');
        
    } catch (error) {
        console.error('❌ Import failed:', error.message);
        process.exit(1);
    } finally {
        importer.close();
    }
}

if (import.meta.main) {
    await main();
}

export { ConversationImporter };