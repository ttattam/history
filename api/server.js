#!/usr/bin/env node

import { createServer } from 'http';
import { parse } from 'url';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { ConversationLinkingService } from './services/linking.js';
import { EmbeddingService } from './services/embedding.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'history.db');

class HistoryAPI {
    constructor() {
        this.db = new Database(DB_PATH);
        this.setupQueries();
        
        // Initialize AI services
        this.linkingService = new ConversationLinkingService(this.db);
        this.embeddingService = new EmbeddingService();
    }
    
    setupQueries() {
        // Search queries - fallback to LIKE search for now
        this.searchMessages = this.db.prepare(`
            SELECT 
                m.*, 
                c.title as conversation_title,
                c.project_path,
                c.started_at as conversation_date,
                CASE 
                    WHEN LENGTH(m.content) > 200 
                    THEN SUBSTR(m.content, 1, 200) || '...' 
                    ELSE m.content 
                END as snippet
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            WHERE m.content LIKE '%' || ? || '%'
            ORDER BY m.timestamp DESC
            LIMIT ? OFFSET ?
        `);
        
        this.getConversations = this.db.prepare(`
            SELECT 
                c.*,
                COUNT(m.id) as actual_message_count,
                MIN(m.timestamp) as first_message,
                MAX(m.timestamp) as last_message
            FROM conversations c
            LEFT JOIN messages m ON c.id = m.conversation_id
            WHERE c.project_path LIKE ? OR ? = ''
            GROUP BY c.id
            ORDER BY c.updated_at DESC
            LIMIT ? OFFSET ?
        `);
        
        this.getConversationById = this.db.prepare(`
            SELECT * FROM conversations WHERE id = ?
        `);
        
        this.getMessagesByConversation = this.db.prepare(`
            SELECT * FROM messages 
            WHERE conversation_id = ? 
            ORDER BY timestamp ASC
        `);
        
        this.getStats = this.db.prepare(`
            SELECT 
                COUNT(DISTINCT c.id) as total_conversations,
                COUNT(m.id) as total_messages,
                MIN(c.started_at) as earliest,
                MAX(c.updated_at) as latest,
                COUNT(DISTINCT c.project_path) as projects
            FROM conversations c
            LEFT JOIN messages m ON c.id = m.conversation_id
        `);
        
        this.searchConversations = this.db.prepare(`
            SELECT DISTINCT
                c.*,
                COUNT(m.id) as message_count,
                GROUP_CONCAT(DISTINCT m.file_references) as all_files
            FROM conversations c
            JOIN messages m ON c.id = m.conversation_id
            WHERE m.content LIKE '%' || ? || '%' 
               OR c.title LIKE '%' || ? || '%'
               OR c.summary LIKE '%' || ? || '%'
            GROUP BY c.id
            ORDER BY c.updated_at DESC
            LIMIT ? OFFSET ?
        `);
    }
    
    // API Handlers
    async handleSearch(query, params) {
        const { q, limit = 20, offset = 0, type = 'messages' } = params;
        
        if (!q) {
            return { error: 'Query parameter "q" is required' };
        }
        
        try {
            let results;
            
            if (type === 'conversations') {
                // Search in conversations
                results = this.searchConversations.all(q, q, q, parseInt(limit), parseInt(offset));
            } else {
                // Search in messages (default)
                results = this.searchMessages.all(q, parseInt(limit), parseInt(offset));
            }
            
            return {
                query: q,
                type,
                total: results.length,
                limit: parseInt(limit),
                offset: parseInt(offset),
                results
            };
        } catch (error) {
            console.error('Search error:', error);
            return { error: 'Search failed: ' + error.message };
        }
    }
    
    async handleConversations(query, params) {
        const { limit = 20, offset = 0, project = '' } = params;
        
        try {
            const projectFilter = project ? `%${project}%` : '';
            const conversations = this.getConversations.all(
                projectFilter, projectFilter, 
                parseInt(limit), parseInt(offset)
            );
            
            return {
                total: conversations.length,
                limit: parseInt(limit),
                offset: parseInt(offset),
                conversations
            };
        } catch (error) {
            console.error('Get conversations error:', error);
            return { error: 'Failed to get conversations: ' + error.message };
        }
    }
    
    async handleConversationDetail(conversationId) {
        try {
            const conversation = this.getConversationById.get(conversationId);
            
            if (!conversation) {
                return { error: 'Conversation not found' };
            }
            
            const messages = this.getMessagesByConversation.all(conversationId);
            
            return {
                conversation,
                messages
            };
        } catch (error) {
            console.error('Get conversation detail error:', error);
            return { error: 'Failed to get conversation: ' + error.message };
        }
    }
    
    async handleStats() {
        try {
            const stats = this.getStats.get();
            return stats;
        } catch (error) {
            console.error('Get stats error:', error);
            return { error: 'Failed to get stats: ' + error.message };
        }
    }
    
    /**
     * Get similar conversations for a given conversation
     */
    async handleSimilarConversations(conversationId, threshold = 0.6) {
        try {
            const similar = await this.linkingService.findSimilarConversations(
                conversationId, parseFloat(threshold)
            );
            return { conversation_id: conversationId, similar };
        } catch (error) {
            console.error('Get similar conversations error:', error);
            return { error: 'Failed to find similar conversations: ' + error.message };
        }
    }
    
    /**
     * Auto-link all conversations
     */
    async handleAutoLink(threshold = 0.7) {
        try {
            const result = await this.linkingService.processAllConversations(parseFloat(threshold));
            return result;
        } catch (error) {
            console.error('Auto-link error:', error);
            return { error: 'Auto-linking failed: ' + error.message };
        }
    }
    
    /**
     * Get conversation links
     */
    async handleConversationLinks(conversationId) {
        try {
            const links = this.linkingService.getConversationLinks(conversationId);
            return { conversation_id: conversationId, links };
        } catch (error) {
            console.error('Get conversation links error:', error);
            return { error: 'Failed to get conversation links: ' + error.message };
        }
    }
    
    /**
     * Create manual link between conversations
     */
    async handleCreateLink(fromId, toId, reason = 'Manually linked') {
        try {
            const success = this.linkingService.createManualLink(fromId, toId, reason);
            return { success, from_id: fromId, to_id: toId, reason };
        } catch (error) {
            console.error('Create manual link error:', error);
            return { error: 'Failed to create link: ' + error.message };
        }
    }
    
    /**
     * Export conversation as markdown file
     */
    async handleMarkdownExport(conversationId, res) {
        try {
            const conversation = this.getConversationById.get(conversationId);
            
            if (!conversation) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Conversation not found' }));
                return;
            }
            
            const messages = this.getMessagesByConversation.all(conversationId);
            const markdown = this.generateMarkdown(conversation, messages);
            
            // Create safe filename
            const safeTitle = (conversation.title || 'conversation')
                .replace(/[^a-z0-9\-_]/gi, '_')
                .replace(/_+/g, '_')
                .toLowerCase();
            
            const filename = `${safeTitle}_${conversationId.slice(0, 8)}.md`;
            
            res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.writeHead(200);
            res.end(markdown);
            
        } catch (error) {
            console.error('Markdown export error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Export failed: ' + error.message }));
        }
    }
    
    /**
     * Generate markdown content from conversation and messages
     */
    generateMarkdown(conversation, messages) {
        const formatDate = (timestamp) => {
            return new Date(timestamp * 1000).toLocaleString('ru-RU', {
                year: 'numeric',
                month: '2-digit', 
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        };
        
        const formatRole = (role) => {
            switch (role) {
                case 'user': return '👤 Пользователь';
                case 'assistant': return '🤖 Claude';
                case 'system': return '⚙️  Система';
                default: return role;
            }
        };
        
        let markdown = `# ${conversation.title || 'Разговор'}\n\n`;
        
        // Metadata section
        markdown += `**ID разговора:** \`${conversation.id}\`\n`;
        if (conversation.project_path) {
            markdown += `**Проект:** \`${conversation.project_path}\`\n`;
        }
        markdown += `**Начат:** ${formatDate(conversation.started_at)}\n`;
        markdown += `**Обновлен:** ${formatDate(conversation.updated_at)}\n`;
        markdown += `**Сообщений:** ${messages.length}\n`;
        
        if (conversation.summary) {
            markdown += `**Краткое содержание:** ${conversation.summary}\n`;
        }
        
        if (conversation.tags) {
            try {
                const tags = JSON.parse(conversation.tags);
                if (tags.length > 0) {
                    markdown += `**Теги:** ${tags.map(tag => `\`${tag}\``).join(', ')}\n`;
                }
            } catch (e) {
                // Skip malformed tags
            }
        }
        
        markdown += '\n---\n\n';
        
        // Messages section
        for (const message of messages) {
            const roleHeader = formatRole(message.role);
            const timestamp = formatDate(message.timestamp);
            
            markdown += `## ${roleHeader}\n`;
            markdown += `*${timestamp}*\n\n`;
            
            // Add tool calls info if present
            if (message.tool_calls) {
                try {
                    const toolCalls = JSON.parse(message.tool_calls);
                    if (toolCalls.length > 0) {
                        markdown += '**Использованные инструменты:**\n';
                        for (const tool of toolCalls) {
                            markdown += `- ${tool.name || tool.type || 'unknown'}\n`;
                        }
                        markdown += '\n';
                    }
                } catch (e) {
                    // Skip malformed tool calls
                }
            }
            
            // Add file references if present
            if (message.file_references) {
                try {
                    const files = JSON.parse(message.file_references);
                    if (files.length > 0) {
                        markdown += '**Упомянутые файлы:**\n';
                        for (const file of files) {
                            markdown += `- \`${file}\`\n`;
                        }
                        markdown += '\n';
                    }
                } catch (e) {
                    // Skip malformed file references
                }
            }
            
            // Add message content
            markdown += `${message.content}\n\n`;
            
            // Add separator between messages
            markdown += '---\n\n';
        }
        
        // Footer
        markdown += `\n*Экспортировано из Claude Code History в ${new Date().toLocaleString('ru-RU')}*\n`;
        
        return markdown;
    }
    
    /**
     * Read request body for POST requests
     */
    readRequestBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                resolve(body);
            });
            req.on('error', reject);
        });
    }
    
    // HTTP Request Router
    async handleRequest(req, res) {
        const { pathname, query } = parse(req.url, true);
        
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }
        
        // Route requests
        let response;
        
        if (pathname === '/search' && req.method === 'GET') {
            response = await this.handleSearch(query, query);
        } else if (pathname === '/conversations' && req.method === 'GET') {
            response = await this.handleConversations(query, query);
        } else if (pathname.startsWith('/conversations/') && req.method === 'GET') {
            const pathParts = pathname.split('/');
            const conversationId = pathParts[2];
            
            if (pathParts[3] === 'similar') {
                // GET /conversations/:id/similar?threshold=0.6
                response = await this.handleSimilarConversations(conversationId, query.threshold);
            } else if (pathParts[3] === 'links') {
                // GET /conversations/:id/links
                response = await this.handleConversationLinks(conversationId);
            } else if (pathParts[3] === 'export' && pathParts[4] === 'markdown') {
                // GET /conversations/:id/export/markdown
                return this.handleMarkdownExport(conversationId, res);
            } else {
                // GET /conversations/:id
                response = await this.handleConversationDetail(conversationId);
            }
        } else if (pathname === '/conversations/link' && req.method === 'POST') {
            // POST /conversations/link
            const body = await this.readRequestBody(req);
            const { from_id, to_id, reason } = JSON.parse(body);
            response = await this.handleCreateLink(from_id, to_id, reason);
        } else if (pathname === '/auto-link' && req.method === 'POST') {
            // POST /auto-link?threshold=0.7
            response = await this.handleAutoLink(query.threshold);
        } else if (pathname === '/stats' && req.method === 'GET') {
            response = await this.handleStats();
        } else if (pathname === '/health' && req.method === 'GET') {
            response = { status: 'ok', timestamp: new Date().toISOString() };
        } else if (pathname === '/' || pathname === '/index.html') {
            // Serve index page
            return this.serveStaticFile(res, 'web/index.html');
        } else if (pathname === '/graph.html') {
            // Serve graph page
            return this.serveStaticFile(res, 'web/graph.html');
        } else if (pathname.startsWith('/assets/')) {
            // Serve static assets
            return this.serveStaticFile(res, `web${pathname}`);
        } else {
            response = { error: 'Not found' };
            res.writeHead(404, { 'Content-Type': 'application/json' });
        }
        
        // Send JSON response
        if (!res.headersSent) {
            res.writeHead(response.error ? 400 : 200, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify(response, null, 2));
    }
    
    serveStaticFile(res, filePath) {
        try {
            const fullPath = join(__dirname, '..', filePath);
            const content = readFileSync(fullPath);
            const ext = filePath.split('.').pop();
            
            const contentTypes = {
                'html': 'text/html',
                'js': 'application/javascript',
                'css': 'text/css',
                'json': 'application/json'
            };
            
            res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
            res.end(content);
        } catch (error) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
        }
    }
}

// Start server
const api = new HistoryAPI();

const server = createServer((req, res) => {
    api.handleRequest(req, res).catch(error => {
        console.error('Request error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Claude Code History API running on http://localhost:${PORT}`);
    console.log(`📊 Database: ${DB_PATH}`);
    console.log(`🔍 Try: http://localhost:${PORT}/search?q=React`);
    console.log(`📋 All conversations: http://localhost:${PORT}/conversations`);
    console.log(`📈 Stats: http://localhost:${PORT}/stats`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    api.db.close();
    server.close();
    process.exit(0);
});