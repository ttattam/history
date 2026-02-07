// Claude Code History Frontend

class HistoryApp {
    constructor() {
        this.apiBase = '';
        this.currentResults = [];
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        await this.loadStats();
        
        // Auto-search on page load if there's a query parameter
        const urlParams = new URLSearchParams(window.location.search);
        const query = urlParams.get('q');
        if (query) {
            document.getElementById('searchInput').value = query;
            this.search();
        }
    }
    
    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        
        // Enter key to search
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.search();
            }
        });
        
        // Auto-search as you type (debounced)
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            
            if (query.length >= 3) {
                searchTimeout = setTimeout(() => {
                    this.search();
                }, 300);
            } else if (query.length === 0) {
                this.showEmptyState();
            }
        });
        
        // Filter changes
        document.getElementById('searchType').addEventListener('change', () => {
            if (document.getElementById('searchInput').value.trim()) {
                this.search();
            }
        });
        
        document.getElementById('projectFilter').addEventListener('change', () => {
            this.loadConversations();
        });
    }
    
    async loadStats() {
        try {
            const response = await fetch(`${this.apiBase}/stats`);
            const stats = await response.json();
            
            if (stats.error) {
                console.error('Stats error:', stats.error);
                return;
            }
            
            document.getElementById('totalConversations').textContent = stats.total_conversations || 0;
            document.getElementById('totalMessages').textContent = stats.total_messages || 0;
            document.getElementById('totalProjects').textContent = stats.projects || 0;
            
            if (stats.earliest && stats.latest) {
                const earliest = new Date(stats.earliest * 1000);
                const latest = new Date(stats.latest * 1000);
                const range = `${earliest.getFullYear()} - ${latest.getFullYear()}`;
                document.getElementById('dateRange').textContent = range;
            }
            
            document.getElementById('statsContainer').style.display = 'flex';
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }
    
    async search() {
        const query = document.getElementById('searchInput').value.trim();
        const searchType = document.getElementById('searchType').value;
        const limit = document.getElementById('limitFilter').value;
        
        if (!query) {
            this.showEmptyState();
            return;
        }
        
        this.showLoading();
        
        try {
            const url = `${this.apiBase}/search?q=${encodeURIComponent(query)}&type=${searchType}&limit=${limit}`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.error) {
                this.showError('Search failed: ' + data.error);
                return;
            }
            
            this.displaySearchResults(data);
            
            // Update URL
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('q', query);
            window.history.pushState({}, '', newUrl);
            
        } catch (error) {
            this.showError('Search request failed: ' + error.message);
        }
    }
    
    async loadConversations() {
        const project = document.getElementById('projectFilter').value;
        const limit = document.getElementById('limitFilter').value;
        
        this.showLoading();
        
        try {
            let url = `${this.apiBase}/conversations?limit=${limit}`;
            if (project) {
                url += `&project=${encodeURIComponent(project)}`;
            }
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.error) {
                this.showError('Failed to load conversations: ' + data.error);
                return;
            }
            
            this.displayConversations(data.conversations);
            
        } catch (error) {
            this.showError('Failed to load conversations: ' + error.message);
        }
    }
    
    displaySearchResults(data) {
        const container = document.getElementById('resultsContainer');
        
        if (!data.results || data.results.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>🔍 No results found</h3>
                    <p>No conversations match your search query "${data.query}".</p>
                    <p>Try different keywords or check the search type filter.</p>
                </div>
            `;
            return;
        }
        
        let html = `
            <div style="margin-bottom: 20px; padding: 12px; background: #f0f9ff; border-radius: 8px; border-left: 4px solid #3b82f6;">
                <strong>Found ${data.results.length} results</strong> for "${data.query}" in ${data.type}
            </div>
        `;
        
        data.results.forEach(result => {
            if (data.type === 'conversations') {
                html += this.renderConversationResult(result);
            } else {
                html += this.renderMessageResult(result);
            }
        });
        
        container.innerHTML = html;
    }
    
    displayConversations(conversations) {
        const container = document.getElementById('resultsContainer');
        
        if (!conversations || conversations.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>📝 No conversations yet</h3>
                    <p>Import some Claude Code conversations to get started.</p>
                    <p>Use: <code>node scripts/import-claude.js path/to/export.json</code></p>
                </div>
            `;
            return;
        }
        
        let html = `
            <div style="margin-bottom: 20px; padding: 12px; background: #f0fdf4; border-radius: 8px; border-left: 4px solid #22c55e;">
                <strong>${conversations.length} conversations</strong> found
            </div>
        `;
        
        conversations.forEach(conv => {
            html += this.renderConversationResult(conv);
        });
        
        container.innerHTML = html;
    }
    
    renderConversationResult(conversation) {
        const date = new Date(conversation.started_at * 1000).toLocaleDateString();
        const time = new Date(conversation.started_at * 1000).toLocaleTimeString();
        
        let tags = '';
        if (conversation.project_path) {
            const projectName = conversation.project_path.split('/').pop() || 'Unknown';
            tags += `<span class="tag">📁 ${projectName}</span>`;
        }
        
        if (conversation.summary) {
            const summaryTags = conversation.summary.split(', ').slice(0, 3);
            tags += summaryTags.map(tag => `<span class="tag">${tag}</span>`).join('');
        }
        
        return `
            <div class="result-item">
                <div class="result-header">
                    <a href="#" onclick="viewConversation('${conversation.id}')" class="conversation-title">
                        ${this.escapeHtml(conversation.title)}
                    </a>
                    <div style="display: flex; gap: 8px; align-items: flex-start;">
                        <button 
                            class="btn btn-secondary" 
                            style="font-size: 12px; padding: 6px 10px;" 
                            onclick="exportConversation('${conversation.id}')"
                            title="Экспорт в Markdown">
                            📄 MD
                        </button>
                        <div class="conversation-meta">
                            ${date}<br>
                            ${conversation.message_count || conversation.actual_message_count || 0} messages
                        </div>
                    </div>
                </div>
                ${conversation.summary ? `<p style="color: #64748b; margin: 8px 0;">${this.escapeHtml(conversation.summary)}</p>` : ''}
                ${tags ? `<div class="conversation-tags">${tags}</div>` : ''}
            </div>
        `;
    }
    
    renderMessageResult(message) {
        const date = new Date(message.timestamp * 1000).toLocaleDateString();
        const time = new Date(message.timestamp * 1000).toLocaleTimeString();
        
        let tags = '';
        if (message.project_path) {
            const projectName = message.project_path.split('/').pop() || 'Unknown';
            tags += `<span class="tag">📁 ${projectName}</span>`;
        }
        
        return `
            <div class="result-item">
                <div class="result-header">
                    <a href="#" onclick="viewConversation('${message.conversation_id}')" class="conversation-title">
                        ${this.escapeHtml(message.conversation_title)}
                    </a>
                    <div style="display: flex; gap: 8px; align-items: flex-start;">
                        <button 
                            class="btn btn-secondary" 
                            style="font-size: 12px; padding: 6px 10px;" 
                            onclick="exportConversation('${message.conversation_id}')"
                            title="Экспорт в Markdown">
                            📄 MD
                        </button>
                        <div class="conversation-meta">
                            ${date} ${time}
                        </div>
                    </div>
                </div>
                <div class="message-preview">
                    <div class="message-role">${message.role}</div>
                    <div class="message-content">
                        ${message.snippet || this.escapeHtml(message.content.substring(0, 300) + (message.content.length > 300 ? '...' : ''))}
                    </div>
                </div>
                ${tags ? `<div class="conversation-tags">${tags}</div>` : ''}
            </div>
        `;
    }
    
    async viewConversation(conversationId) {
        this.showLoading();
        
        try {
            const response = await fetch(`${this.apiBase}/conversations/${conversationId}`);
            const data = await response.json();
            
            if (data.error) {
                this.showError('Failed to load conversation: ' + data.error);
                return;
            }
            
            this.displayConversationDetail(data);
            
        } catch (error) {
            this.showError('Failed to load conversation: ' + error.message);
        }
    }
    
    displayConversationDetail(data) {
        const { conversation, messages } = data;
        const container = document.getElementById('resultsContainer');
        
        const date = new Date(conversation.started_at * 1000).toLocaleDateString();
        const time = new Date(conversation.started_at * 1000).toLocaleTimeString();
        
        let html = `
            <div style="margin-bottom: 20px; padding: 16px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #3b82f6;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                    <h2 style="margin: 0; color: #1e293b;">${this.escapeHtml(conversation.title)}</h2>
                    <button class="btn btn-secondary" onclick="history.back()" style="margin-left: 16px;">← Back</button>
                </div>
                <div style="color: #64748b; font-size: 14px;">
                    <strong>${messages.length} messages</strong> • ${date} ${time}
                    ${conversation.project_path ? ` • ${conversation.project_path}` : ''}
                </div>
                ${conversation.summary ? `<p style="margin-top: 8px; color: #374151;">${this.escapeHtml(conversation.summary)}</p>` : ''}
            </div>
        `;
        
        messages.forEach(message => {
            const msgDate = new Date(message.timestamp * 1000);
            const roleColor = message.role === 'user' ? '#059669' : '#3b82f6';
            const roleBg = message.role === 'user' ? '#ecfdf5' : '#eff6ff';
            
            html += `
                <div style="margin-bottom: 16px; padding: 16px; background: ${roleBg}; border-radius: 8px; border-left: 4px solid ${roleColor};">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <div style="font-weight: 600; color: ${roleColor}; text-transform: uppercase; font-size: 12px;">
                            ${message.role}
                        </div>
                        <div style="font-size: 12px; color: #64748b;">
                            ${msgDate.toLocaleTimeString()}
                        </div>
                    </div>
                    <div style="color: #374151; line-height: 1.6; white-space: pre-wrap;">
                        ${this.escapeHtml(message.content)}
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }
    
    showLoading() {
        document.getElementById('resultsContainer').innerHTML = `
            <div class="loading">
                <div>🔍 Searching...</div>
            </div>
        `;
    }
    
    showEmptyState() {
        document.getElementById('resultsContainer').innerHTML = `
            <div class="empty-state">
                <h3>👋 Welcome to your Claude Code memory!</h3>
                <p>Search for specific topics or view all conversations to get started.</p>
                <br>
                <p><strong>Try searching for:</strong> "React", "bug fix", "optimization", or any topic you've discussed.</p>
            </div>
        `;
    }
    
    showError(message) {
        document.getElementById('resultsContainer').innerHTML = `
            <div class="error">
                <strong>Error:</strong> ${this.escapeHtml(message)}
            </div>
        `;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global functions
let app;

window.onload = () => {
    app = new HistoryApp();
};

function search() {
    app.search();
}

function loadConversations() {
    app.loadConversations();
}

function viewConversation(id) {
    app.viewConversation(id);
}

function exportConversation(id) {
    // Create download link for markdown export
    const url = `${app.apiBase}/conversations/${id}/export/markdown`;
    
    // Create temporary link and trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = ''; // Let the server set the filename
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}