#!/usr/bin/env node

// Universal Claude Code History Importer
// Monitors both old history.jsonl and new project-based .jsonl files

import { readFileSync, writeFileSync, existsSync, watchFile, watch } from 'fs';
import { readdirSync, statSync } from 'fs';
import { ConversationImporter } from './import-claude.js';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLAUDE_DIR = '/Users/tomtam/.claude';
const OLD_HISTORY_PATH = join(CLAUDE_DIR, 'history.jsonl');
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');
const PROCESSED_LOG_PATH = join(__dirname, 'processed-universal.json');

class UniversalClaudeImporter {
    constructor() {
        this.importer = new ConversationImporter();
        this.processedFiles = this.loadProcessedFiles();
        this.watchedFiles = new Set();
    }
    
    /**
     * Load processed files log
     */
    loadProcessedFiles() {
        try {
            if (existsSync(PROCESSED_LOG_PATH)) {
                const data = readFileSync(PROCESSED_LOG_PATH, 'utf8');
                return new Map(Object.entries(JSON.parse(data)));
            }
        } catch (error) {
            console.error('Error loading processed files log:', error.message);
        }
        return new Map();
    }
    
    /**
     * Save processed files log
     */
    saveProcessedFiles() {
        try {
            const obj = Object.fromEntries(this.processedFiles);
            writeFileSync(PROCESSED_LOG_PATH, JSON.stringify(obj, null, 2));
        } catch (error) {
            console.error('Error saving processed files log:', error.message);
        }
    }
    
    /**
     * Parse new Claude Code project JSONL format
     */
    parseProjectJSONL(filePath) {
        try {
            const content = readFileSync(filePath, 'utf8');
            const lines = content.split('\n').filter(line => line.trim());
            
            const messages = [];
            let sessionId = null;
            let project = null;
            let startTime = null;
            let endTime = null;
            
            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    
                    // Extract session metadata
                    if (entry.sessionId && !sessionId) {
                        sessionId = entry.sessionId;
                    }
                    if (entry.cwd && !project) {
                        project = entry.cwd;
                    }
                    
                    // Parse messages
                    if (entry.message) {
                        const timestamp = new Date(entry.timestamp).getTime();
                        
                        if (!startTime || timestamp < startTime) {
                            startTime = timestamp;
                        }
                        if (!endTime || timestamp > endTime) {
                            endTime = timestamp;
                        }
                        
                        const msg = entry.message;
                        
                        // User messages
                        if (entry.type === 'user' && msg.content) {
                            let content = '';
                            
                            if (typeof msg.content === 'string') {
                                content = msg.content;
                            } else if (Array.isArray(msg.content)) {
                                // Handle complex content format
                                content = msg.content
                                    .map(item => {
                                        if (item.type === 'text') return item.text || '';
                                        if (item.type === 'tool_result') return `Tool result: ${item.content || ''}`;
                                        return '';
                                    })
                                    .filter(Boolean)
                                    .join('\n');
                            }
                            
                            if (content.trim()) {
                                messages.push({
                                    id: entry.uuid || `msg_${messages.length}`,
                                    role: 'user',
                                    content: content.trim(),
                                    timestamp: Math.floor(timestamp / 1000),
                                    uuid: entry.uuid
                                });
                            }
                        }
                        
                        // Assistant messages
                        if (entry.type === 'assistant' && msg.content) {
                            let content = '';
                            
                            if (typeof msg.content === 'string') {
                                content = msg.content;
                            } else if (Array.isArray(msg.content)) {
                                content = msg.content
                                    .map(item => {
                                        if (item.type === 'text') return item.text || '';
                                        if (item.type === 'tool_use') return `Tool: ${item.name}`;
                                        return '';
                                    })
                                    .filter(Boolean)
                                    .join('\n');
                            }
                            
                            if (content.trim()) {
                                messages.push({
                                    id: entry.uuid || `msg_${messages.length}`,
                                    role: 'assistant',
                                    content: content.trim(),
                                    timestamp: Math.floor(timestamp / 1000),
                                    uuid: entry.uuid
                                });
                            }
                        }
                    }
                    
                } catch (lineError) {
                    // Skip malformed lines
                    continue;
                }
            }
            
            if (!sessionId || messages.length === 0) {
                return null;
            }
            
            return {
                id: `project_${sessionId}`,
                sessionId: sessionId,
                title: this.generateTitle(messages),
                started_at: Math.floor((startTime || Date.now()) / 1000),
                updated_at: Math.floor((endTime || Date.now()) / 1000),
                message_count: messages.length,
                project_path: project,
                tags: JSON.stringify([]),
                summary: this.generateSummary(messages),
                messages: messages.map((msg, i) => ({
                    ...msg,
                    conversation_id: `project_${sessionId}`,
                    id: `msg_${sessionId}_${i + 1}`
                }))
            };
            
        } catch (error) {
            console.error(`Error parsing project JSONL ${filePath}:`, error.message);
            return null;
        }
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
     * Scan all project directories for JSONL files
     */
    scanProjectFiles() {
        const projectFiles = [];
        
        if (!existsSync(PROJECTS_DIR)) {
            console.log('⚠️ Projects directory not found');
            return projectFiles;
        }
        
        try {
            const projectDirs = readdirSync(PROJECTS_DIR, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            
            for (const projectDir of projectDirs) {
                const projectPath = join(PROJECTS_DIR, projectDir);
                
                try {
                    const files = readdirSync(projectPath)
                        .filter(file => file.endsWith('.jsonl'))
                        .map(file => ({
                            path: join(projectPath, file),
                            project: projectDir,
                            file: file,
                            mtime: statSync(join(projectPath, file)).mtime
                        }));
                    
                    projectFiles.push(...files);
                } catch (error) {
                    console.error(`Error scanning project ${projectDir}:`, error.message);
                }
            }
        } catch (error) {
            console.error('Error scanning projects directory:', error.message);
        }
        
        return projectFiles.sort((a, b) => b.mtime - a.mtime); // Newest first
    }
    
    /**
     * Process all discovered files
     */
    async processAllFiles() {
        console.log('🚀 Scanning for Claude Code conversations...');
        
        const projectFiles = this.scanProjectFiles();
        console.log(`📁 Found ${projectFiles.length} project files`);
        
        let imported = 0;
        let skipped = 0;
        let errors = 0;
        
        for (const fileInfo of projectFiles) {
            const { path, project, file } = fileInfo;
            const fileKey = `${project}/${file}`;
            const fileStats = statSync(path);
            const fileMtime = fileStats.mtime.getTime();
            
            // Check if file was already processed
            const lastProcessed = this.processedFiles.get(fileKey);
            if (lastProcessed && lastProcessed >= fileMtime) {
                skipped++;
                continue;
            }
            
            try {
                console.log(`📄 Processing: ${fileKey}`);
                const conversation = this.parseProjectJSONL(path);
                
                if (conversation) {
                    await this.importer.importConversation(conversation);
                    this.processedFiles.set(fileKey, fileMtime);
                    imported++;
                    console.log(`✅ Imported: "${conversation.title}" (${conversation.messages.length} messages)`);
                } else {
                    skipped++;
                    console.log(`⚠️ Skipped: ${fileKey} (no valid conversation data)`);
                }
                
            } catch (error) {
                errors++;
                console.error(`❌ Error processing ${fileKey}:`, error.message);
            }
        }
        
        // Save processed files log
        this.saveProcessedFiles();
        
        console.log(`\n📈 Import Summary:`);
        console.log(`   Imported: ${imported} conversations`);
        console.log(`   Skipped: ${skipped} files`);
        console.log(`   Errors: ${errors} files`);
        
        return { imported, skipped, errors };
    }
    
    /**
     * Start watching for file changes
     */
    startWatching() {
        console.log('👀 Starting universal file watcher...');
        
        // Watch projects directory
        if (existsSync(PROJECTS_DIR)) {
            watch(PROJECTS_DIR, { recursive: true }, (eventType, filename) => {
                if (filename && filename.endsWith('.jsonl')) {
                    console.log(`📝 Detected change: ${filename}`);
                    setTimeout(() => this.processAllFiles(), 2000); // Debounce
                }
            });
            console.log(`✅ Watching projects directory: ${PROJECTS_DIR}`);
        }
        
        // Watch old history file if exists
        if (existsSync(OLD_HISTORY_PATH)) {
            watchFile(OLD_HISTORY_PATH, () => {
                console.log('📝 Old history file updated');
                // Process old format if needed
            });
            console.log(`✅ Watching old history: ${OLD_HISTORY_PATH}`);
        }
    }
    
    /**
     * Get import statistics
     */
    getStats() {
        const stats = this.importer.getStats();
        return {
            ...stats,
            processed_files: this.processedFiles.size
        };
    }
    
    close() {
        this.importer.close();
    }
}

// CLI Usage
async function main() {
    const args = process.argv.slice(2);
    const universalImporter = new UniversalClaudeImporter();
    
    try {
        if (args.includes('--watch')) {
            // Watch mode - continuous import
            await universalImporter.processAllFiles();
            universalImporter.startWatching();
            
            console.log('\n🔄 Running in universal watch mode. Press Ctrl+C to stop.');
            console.log('📡 Monitoring:');
            console.log(`   - Projects: ${PROJECTS_DIR}`);
            console.log(`   - Old history: ${OLD_HISTORY_PATH}`);
            
            // Keep process alive
            process.on('SIGINT', () => {
                console.log('\n🛑 Shutting down universal importer...');
                universalImporter.close();
                process.exit(0);
            });
            
            // Keep alive
            setInterval(() => {}, 1000);
            
        } else {
            // One-time import
            const result = await universalImporter.processAllFiles();
            
            const stats = universalImporter.getStats();
            console.log('\n📊 Final Stats:');
            console.log(`   Total conversations: ${stats.total_conversations}`);
            console.log(`   Total messages: ${stats.total_messages}`);
            console.log(`   Date range: ${stats.earliest} to ${stats.latest}`);
            console.log(`   Processed files: ${stats.processed_files}`);
            
            console.log('\n✅ Universal import completed!');
            console.log('💡 Use --watch flag to enable continuous monitoring');
        }
        
    } catch (error) {
        console.error('❌ Universal import failed:', error.message);
        process.exit(1);
    } finally {
        if (!args.includes('--watch')) {
            universalImporter.close();
        }
    }
}

if (import.meta.main) {
    await main();
}

export { UniversalClaudeImporter };