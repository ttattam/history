#!/usr/bin/env node

// Automatic Claude Code History Importer
// Parses ~/.claude/history.jsonl and imports conversations into our database

import { readFileSync, writeFileSync, existsSync, watchFile } from 'fs';
import { ConversationImporter } from './import-claude.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLAUDE_HISTORY_PATH = '/Users/tomtam/.claude/history.jsonl';
const PROCESSED_LOG_PATH = join(__dirname, 'processed-sessions.json');

class AutoImporter {
    constructor() {
        this.importer = new ConversationImporter();
        this.processedSessions = this.loadProcessedSessions();
        this.sessionStore = new Map(); // sessionId -> conversation data
    }
    
    /**
     * Load processed sessions to avoid duplicates
     */
    loadProcessedSessions() {
        try {
            if (existsSync(PROCESSED_LOG_PATH)) {
                const data = readFileSync(PROCESSED_LOG_PATH, 'utf8');
                return new Set(JSON.parse(data));
            }
        } catch (error) {
            console.error('Error loading processed sessions:', error.message);
        }
        return new Set();
    }
    
    /**
     * Save processed sessions
     */
    saveProcessedSessions() {
        try {
            const data = JSON.stringify([...this.processedSessions], null, 2);
            writeFileSync(PROCESSED_LOG_PATH, data);
        } catch (error) {
            console.error('Error saving processed sessions:', error.message);
        }
    }
    
    /**
     * Parse single JSONL line
     */
    parseHistoryLine(line) {
        try {
            const entry = JSON.parse(line.trim());
            
            return {
                display: entry.display || '',
                timestamp: entry.timestamp,
                project: entry.project,
                sessionId: entry.sessionId,
                pastedContents: entry.pastedContents || {}
            };
        } catch (error) {
            console.error('Error parsing line:', error.message);
            return null;
        }
    }
    
    /**
     * Group messages by session
     */
    groupMessagesBySession(historyEntries) {
        const sessions = new Map();
        
        for (const entry of historyEntries) {
            if (!entry.sessionId || !entry.display.trim()) continue;
            
            const sessionId = entry.sessionId;
            
            if (!sessions.has(sessionId)) {
                sessions.set(sessionId, {
                    id: sessionId,
                    messages: [],
                    project: entry.project,
                    startedAt: entry.timestamp,
                    updatedAt: entry.timestamp
                });
            }
            
            const session = sessions.get(sessionId);
            
            // Determine role (simple heuristic)
            const role = this.determineMessageRole(entry.display, session.messages.length);
            
            session.messages.push({
                id: `msg_${sessionId}_${session.messages.length + 1}`,
                conversation_id: `session_${sessionId}`, // Add conversation_id
                role: role,
                content: entry.display,
                timestamp: Math.floor(entry.timestamp / 1000), // Convert to seconds
                created_at: entry.timestamp
            });
            
            // Update session timestamps
            if (entry.timestamp < session.startedAt) {
                session.startedAt = entry.timestamp;
            }
            if (entry.timestamp > session.updatedAt) {
                session.updatedAt = entry.timestamp;
            }
        }
        
        return sessions;
    }
    
    /**
     * Simple heuristic to determine message role
     */
    determineMessageRole(content, messageIndex) {
        // First message is usually user
        if (messageIndex === 0) return 'user';
        
        // Commands typically start with /
        if (content.trim().startsWith('/')) return 'user';
        
        // Questions typically end with ?
        if (content.trim().endsWith('?')) return 'user';
        
        // Short messages are often user
        if (content.length < 50) return 'user';
        
        // Long explanatory messages are often assistant
        if (content.length > 200) return 'assistant';
        
        // Alternate by default (user -> assistant -> user -> ...)
        return messageIndex % 2 === 0 ? 'user' : 'assistant';
    }
    
    /**
     * Convert session to conversation format for import
     */
    sessionToConversation(session) {
        const conversation = {
            id: `session_${session.id}`,
            title: this.generateTitle(session.messages),
            started_at: Math.floor(session.startedAt / 1000),
            updated_at: Math.floor(session.updatedAt / 1000),
            message_count: session.messages.length,
            project_path: session.project,
            tags: JSON.stringify([]),
            summary: this.generateSummary(session.messages),
            messages: session.messages
        };
        
        return conversation;
    }
    
    /**
     * Generate conversation title from messages
     */
    generateTitle(messages) {
        if (messages.length === 0) return 'Empty conversation';
        
        const firstUserMessage = messages.find(m => m.role === 'user');
        if (!firstUserMessage) return 'System conversation';
        
        const title = firstUserMessage.content.substring(0, 100).trim();
        return title || 'Untitled conversation';
    }
    
    /**
     * Generate conversation summary
     */
    generateSummary(messages) {
        const allText = messages.map(m => m.content).join(' ').toLowerCase();
        const keywords = new Set();
        
        // Tech keywords
        const techWords = allText.match(/\b(react|vue|angular|node|python|javascript|typescript|api|database|sql|git|docker|aws|bug|fix|feature|component|function|class|method|error|install|deploy|test|build|optimization|performance)\b/g);
        
        if (techWords) {
            techWords.forEach(word => keywords.add(word));
        }
        
        return [...keywords].slice(0, 5).join(', ') || 'General discussion';
    }
    
    /**
     * Process complete history file
     */
    async processHistoryFile() {
        console.log('🚀 Processing Claude Code history...');
        
        try {
            const historyContent = readFileSync(CLAUDE_HISTORY_PATH, 'utf8');
            const lines = historyContent.split('\n').filter(line => line.trim());
            
            console.log(`📄 Found ${lines.length} history entries`);
            
            // Parse all entries
            const entries = [];
            for (const line of lines) {
                const entry = this.parseHistoryLine(line);
                if (entry) entries.push(entry);
            }
            
            // Group by session
            const sessions = this.groupMessagesBySession(entries);
            console.log(`📊 Grouped into ${sessions.size} sessions`);
            
            // Import new sessions
            let imported = 0;
            let skipped = 0;
            
            for (const [sessionId, session] of sessions) {
                if (this.processedSessions.has(sessionId)) {
                    skipped++;
                    continue;
                }
                
                // Skip sessions with too few messages
                if (session.messages.length < 2) {
                    skipped++;
                    continue;
                }
                
                try {
                    const conversation = this.sessionToConversation(session);
                    await this.importer.importConversation(conversation);
                    
                    this.processedSessions.add(sessionId);
                    imported++;
                    
                    console.log(`✅ Imported session: "${conversation.title}" (${session.messages.length} messages)`);
                    
                } catch (error) {
                    console.error(`❌ Failed to import session ${sessionId}:`, error.message);
                }
            }
            
            // Save processed sessions
            this.saveProcessedSessions();
            
            console.log(`\n📈 Import Summary:`);
            console.log(`   Imported: ${imported} conversations`);
            console.log(`   Skipped: ${skipped} conversations`);
            console.log(`   Total messages: ${[...sessions.values()].reduce((sum, s) => sum + s.messages.length, 0)}`);
            
            return { imported, skipped, sessions: sessions.size };
            
        } catch (error) {
            console.error('❌ Failed to process history:', error.message);
            return { imported: 0, skipped: 0, sessions: 0 };
        }
    }
    
    /**
     * Watch for changes and auto-import
     */
    startWatching() {
        console.log('👀 Watching Claude history for changes...');
        
        watchFile(CLAUDE_HISTORY_PATH, async () => {
            console.log('📝 Claude history updated, processing new entries...');
            await this.processHistoryFile();
        });
        
        console.log('✅ Auto-import watcher started');
    }
    
    /**
     * Get import statistics
     */
    getStats() {
        const stats = this.importer.getStats();
        return {
            ...stats,
            processed_sessions: this.processedSessions.size
        };
    }
    
    close() {
        this.importer.close();
    }
}

// CLI Usage
async function main() {
    const args = process.argv.slice(2);
    const autoImporter = new AutoImporter();
    
    try {
        if (args.includes('--watch')) {
            // Watch mode - continuous import
            await autoImporter.processHistoryFile();
            autoImporter.startWatching();
            
            console.log('\n🔄 Running in watch mode. Press Ctrl+C to stop.');
            
            // Keep process alive
            process.on('SIGINT', () => {
                console.log('\n🛑 Shutting down...');
                autoImporter.close();
                process.exit(0);
            });
            
            // Keep alive
            setInterval(() => {}, 1000);
            
        } else {
            // One-time import
            const result = await autoImporter.processHistoryFile();
            
            const stats = autoImporter.getStats();
            console.log('\n📊 Final Stats:');
            console.log(`   Total conversations: ${stats.total_conversations}`);
            console.log(`   Total messages: ${stats.total_messages}`);
            console.log(`   Date range: ${stats.earliest} to ${stats.latest}`);
            console.log(`   Processed sessions: ${stats.processed_sessions}`);
            
            console.log('\n✅ Import completed successfully!');
            console.log('💡 Use --watch flag to enable continuous monitoring');
        }
        
    } catch (error) {
        console.error('❌ Auto-import failed:', error.message);
        process.exit(1);
    } finally {
        if (!args.includes('--watch')) {
            autoImporter.close();
        }
    }
}

if (import.meta.main) {
    await main();
}

export { AutoImporter };