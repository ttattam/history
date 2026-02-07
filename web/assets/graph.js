// D3.js Graph Visualization for Conversation History

class ConversationGraph {
    constructor() {
        this.apiBase = '';
        this.svg = d3.select('#graph-svg');
        this.tooltip = d3.select('#tooltip');
        this.infoPanel = d3.select('#infoPanel');
        
        this.width = window.innerWidth;
        this.height = window.innerHeight - 80;
        
        this.currentThreshold = 0.5;
        this.selectedNode = null;
        this.data = { nodes: [], links: [] };
        
        this.setupSVG();
        this.setupControls();
        this.loadGraphData();
    }
    
    setupSVG() {
        this.svg
            .attr('width', this.width)
            .attr('height', this.height);
        
        // Add zoom behavior
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.container.attr('transform', event.transform);
            });
        
        this.svg.call(this.zoom);
        
        // Create container group
        this.container = this.svg.append('g');
        
        // Create groups for links and nodes
        this.linkGroup = this.container.append('g').attr('class', 'links');
        this.nodeGroup = this.container.append('g').attr('class', 'nodes');
        
        // Handle window resize
        window.addEventListener('resize', () => this.handleResize());
    }
    
    setupControls() {
        const thresholdSlider = document.getElementById('thresholdSlider');
        const thresholdValue = document.getElementById('thresholdValue');
        
        thresholdSlider.addEventListener('input', (e) => {
            this.currentThreshold = parseFloat(e.target.value);
            thresholdValue.textContent = this.currentThreshold.toFixed(1);
            this.filterLinks();
        });
        
        document.getElementById('layoutSelect').addEventListener('change', (e) => {
            this.changeLayout(e.target.value);
        });
    }
    
    async loadGraphData() {
        try {
            // Load conversations and their links
            const [conversationsResponse, statsResponse] = await Promise.all([
                fetch(`${this.apiBase}/conversations?limit=100`),
                fetch(`${this.apiBase}/stats`)
            ]);
            
            const conversationsData = await conversationsResponse.json();
            const statsData = await statsResponse.json();
            
            if (conversationsData.error || statsData.error) {
                throw new Error(conversationsData.error || statsData.error);
            }
            
            // Build graph data
            await this.buildGraphData(conversationsData.conversations);
            this.renderGraph();
            
        } catch (error) {
            console.error('Failed to load graph data:', error);
            this.showError('Failed to load conversation graph');
        }
    }
    
    async buildGraphData(conversations) {
        const nodes = [];
        const links = [];
        const linkSet = new Set();
        
        // Create nodes
        for (const conv of conversations) {
            const node = {
                id: conv.id,
                title: conv.title,
                summary: conv.summary || 'No summary',
                startedAt: new Date(conv.started_at * 1000),
                messageCount: conv.message_count || 0,
                projectPath: conv.project_path,
                category: this.categorizeConversation(conv.summary, conv.title)
            };
            
            nodes.push(node);
        }
        
        // Load links for each conversation
        for (const conv of conversations) {
            try {
                const linksResponse = await fetch(`${this.apiBase}/conversations/${conv.id}/links`);
                const linksData = await linksResponse.json();
                
                if (linksData.links) {
                    for (const link of linksData.links) {
                        const linkKey = `${link.from_id}-${link.to_id}`;
                        const reverseKey = `${link.to_id}-${link.from_id}`;
                        
                        // Avoid duplicate links
                        if (!linkSet.has(linkKey) && !linkSet.has(reverseKey)) {
                            links.push({
                                source: link.from_id,
                                target: link.to_id,
                                strength: link.strength,
                                type: link.link_type,
                                reason: link.reason
                            });
                            
                            linkSet.add(linkKey);
                        }
                    }
                }
            } catch (error) {
                console.error(`Failed to load links for ${conv.id}:`, error);
            }
        }
        
        this.data = { nodes, links };
        console.log(`📊 Loaded ${nodes.length} nodes and ${links.length} links`);
    }
    
    categorizeConversation(summary, title) {
        const text = (summary + ' ' + title).toLowerCase();
        
        if (text.match(/\b(react|vue|angular|frontend|component|jsx|tsx|css|html)\b/)) {
            return 'frontend';
        } else if (text.match(/\b(database|sql|postgres|backend|api|server|node)\b/)) {
            return 'backend';
        } else if (text.match(/\b(python|django|flask|fastapi|ml|ai)\b/)) {
            return 'python';
        } else if (text.match(/\b(docker|aws|deploy|infrastructure|devops)\b/)) {
            return 'devops';
        }
        
        return 'general';
    }
    
    getNodeColor(category) {
        const colors = {
            frontend: '#3b82f6',   // Blue
            backend: '#10b981',    // Green
            python: '#f59e0b',     // Orange
            devops: '#8b5cf6',     // Purple
            general: '#64748b'     // Gray
        };
        return colors[category] || colors.general;
    }
    
    getNodeRadius(messageCount) {
        return Math.max(8, Math.min(25, Math.sqrt(messageCount) * 3));
    }
    
    renderGraph() {
        // Clear existing elements
        this.linkGroup.selectAll('*').remove();
        this.nodeGroup.selectAll('*').remove();
        
        // Filter links by threshold
        const filteredLinks = this.data.links.filter(d => d.strength >= this.currentThreshold);
        
        // Setup force simulation
        this.simulation = d3.forceSimulation(this.data.nodes)
            .force('link', d3.forceLink(filteredLinks)
                .id(d => d.id)
                .distance(d => 100 - (d.strength * 50))
                .strength(d => d.strength))
            .force('charge', d3.forceManyBody()
                .strength(-300)
                .distanceMin(30))
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .force('collision', d3.forceCollide()
                .radius(d => this.getNodeRadius(d.messageCount) + 5));
        
        // Render links
        this.links = this.linkGroup
            .selectAll('.link')
            .data(filteredLinks)
            .enter().append('line')
            .attr('class', d => `link ${d.type}`)
            .style('stroke-width', d => Math.max(1, d.strength * 3))
            .on('mouseover', (event, d) => this.showLinkTooltip(event, d))
            .on('mouseout', () => this.hideTooltip());
        
        // Render nodes
        this.nodes = this.nodeGroup
            .selectAll('.node')
            .data(this.data.nodes)
            .enter().append('circle')
            .attr('class', 'node')
            .attr('r', d => this.getNodeRadius(d.messageCount))
            .style('fill', d => this.getNodeColor(d.category))
            .style('stroke', d => d3.color(this.getNodeColor(d.category)).darker())
            .on('click', (event, d) => this.selectNode(d))
            .on('mouseover', (event, d) => this.showNodeTooltip(event, d))
            .on('mouseout', () => this.hideTooltip())
            .call(this.dragBehavior());
        
        // Add node labels
        this.labels = this.nodeGroup
            .selectAll('.node-label')
            .data(this.data.nodes)
            .enter().append('text')
            .attr('class', 'node-label')
            .attr('dy', d => this.getNodeRadius(d.messageCount) + 15)
            .style('font-size', d => Math.max(10, this.getNodeRadius(d.messageCount) / 2) + 'px')
            .text(d => this.truncateText(d.title, 30));
        
        // Update positions on simulation tick
        this.simulation.on('tick', () => this.updatePositions());
        
        console.log(`🎨 Rendered ${this.data.nodes.length} nodes and ${filteredLinks.length} links`);
    }
    
    updatePositions() {
        this.links
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);
        
        this.nodes
            .attr('cx', d => d.x)
            .attr('cy', d => d.y);
        
        this.labels
            .attr('x', d => d.x)
            .attr('y', d => d.y);
    }
    
    dragBehavior() {
        return d3.drag()
            .on('start', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });
    }
    
    selectNode(node) {
        // Clear previous selection
        this.nodes.classed('selected', false);
        this.labels.classed('selected', false);
        this.links.classed('highlighted', false);
        
        // Select new node
        this.selectedNode = node;
        this.nodes.filter(d => d.id === node.id).classed('selected', true);
        this.labels.filter(d => d.id === node.id).classed('selected', true);
        
        // Highlight connected links
        this.links
            .filter(d => d.source.id === node.id || d.target.id === node.id)
            .classed('highlighted', true);
        
        // Show info panel
        this.showInfoPanel(node);
    }
    
    showInfoPanel(node) {
        const panel = this.infoPanel;
        
        document.getElementById('infoTitle').textContent = node.title;
        document.getElementById('infoMeta').textContent = 
            `${node.messageCount} messages • ${node.startedAt.toLocaleDateString()}`;
        document.getElementById('infoSummary').textContent = node.summary;
        
        // Show related conversations
        const connectedLinks = this.data.links.filter(d => 
            (d.source === node.id || d.source.id === node.id) ||
            (d.target === node.id || d.target.id === node.id)
        );
        
        const linksContainer = document.getElementById('infoLinks');
        const linksHtml = connectedLinks.map(link => {
            const relatedId = link.source === node.id || link.source.id === node.id ? 
                (link.target.id || link.target) : (link.source.id || link.source);
            const relatedNode = this.data.nodes.find(n => n.id === relatedId);
            
            if (relatedNode) {
                return `
                    <div class="link-item">
                        <span class="link-strength">${Math.round(link.strength * 100)}%</span>
                        <span>${this.truncateText(relatedNode.title, 40)}</span>
                    </div>
                `;
            }
            return '';
        }).join('');
        
        linksContainer.innerHTML = `
            <h5>Related Conversations (${connectedLinks.length})</h5>
            ${linksHtml}
        `;
        
        panel.classed('visible', true);
    }
    
    showNodeTooltip(event, node) {
        const tooltip = this.tooltip;
        
        tooltip.html(`
            <div class="tooltip-title">${this.truncateText(node.title, 50)}</div>
            <div class="tooltip-meta">
                ${node.messageCount} messages • ${node.startedAt.toLocaleDateString()}<br>
                Category: ${node.category} • Project: ${node.projectPath || 'Unknown'}
            </div>
        `);
        
        const [x, y] = d3.pointer(event, document.body);
        
        tooltip
            .style('display', 'block')
            .style('left', (x + 10) + 'px')
            .style('top', (y - 10) + 'px');
    }
    
    showLinkTooltip(event, link) {
        const tooltip = this.tooltip;
        
        const sourceTitle = link.source.title || link.source.id;
        const targetTitle = link.target.title || link.target.id;
        
        tooltip.html(`
            <div class="tooltip-title">Connection: ${Math.round(link.strength * 100)}% similarity</div>
            <div class="tooltip-meta">
                ${this.truncateText(sourceTitle, 30)} ↔ ${this.truncateText(targetTitle, 30)}<br>
                Type: ${link.type} • ${link.reason}
            </div>
        `);
        
        const [x, y] = d3.pointer(event, document.body);
        
        tooltip
            .style('display', 'block')
            .style('left', (x + 10) + 'px')
            .style('top', (y - 10) + 'px');
    }
    
    hideTooltip() {
        this.tooltip.style('display', 'none');
    }
    
    filterLinks() {
        const filteredLinks = this.data.links.filter(d => d.strength >= this.currentThreshold);
        
        // Update simulation with new links
        this.simulation
            .force('link')
            .links(filteredLinks);
        
        // Re-render links
        this.links.remove();
        this.links = this.linkGroup
            .selectAll('.link')
            .data(filteredLinks)
            .enter().append('line')
            .attr('class', d => `link ${d.type}`)
            .style('stroke-width', d => Math.max(1, d.strength * 3))
            .on('mouseover', (event, d) => this.showLinkTooltip(event, d))
            .on('mouseout', () => this.hideTooltip());
        
        this.simulation.alpha(0.3).restart();
        
        console.log(`🔍 Filtered to ${filteredLinks.length} links (threshold: ${this.currentThreshold})`);
    }
    
    changeLayout(layoutType) {
        switch (layoutType) {
            case 'circular':
                this.applyCircularLayout();
                break;
            case 'tree':
                this.applyTreeLayout();
                break;
            default:
                this.applyForceLayout();
        }
    }
    
    applyCircularLayout() {
        const radius = Math.min(this.width, this.height) / 3;
        const angleStep = (2 * Math.PI) / this.data.nodes.length;
        
        this.data.nodes.forEach((node, i) => {
            const angle = i * angleStep;
            node.fx = this.width / 2 + radius * Math.cos(angle);
            node.fy = this.height / 2 + radius * Math.sin(angle);
        });
        
        this.simulation.alpha(0.3).restart();
    }
    
    applyTreeLayout() {
        // Simple tree layout - not fully implemented
        console.log('Tree layout not yet implemented');
    }
    
    applyForceLayout() {
        // Remove fixed positions
        this.data.nodes.forEach(node => {
            node.fx = null;
            node.fy = null;
        });
        
        this.simulation.alpha(0.3).restart();
    }
    
    resetZoom() {
        this.svg
            .transition()
            .duration(750)
            .call(this.zoom.transform, d3.zoomIdentity);
    }
    
    handleResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight - 80;
        
        this.svg
            .attr('width', this.width)
            .attr('height', this.height);
        
        this.simulation
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .alpha(0.3).restart();
    }
    
    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }
    
    showError(message) {
        const container = d3.select('.graph-container');
        container.append('div')
            .attr('class', 'error')
            .style('position', 'absolute')
            .style('top', '50%')
            .style('left', '50%')
            .style('transform', 'translate(-50%, -50%)')
            .style('background', '#fef2f2')
            .style('color', '#dc2626')
            .style('padding', '16px')
            .style('border-radius', '8px')
            .style('border', '1px solid #fecaca')
            .text(message);
    }
}

// Global functions
function refreshGraph() {
    if (window.conversationGraph) {
        window.conversationGraph.loadGraphData();
    }
}

function resetZoom() {
    if (window.conversationGraph) {
        window.conversationGraph.resetZoom();
    }
}

function goHome() {
    window.location.href = '/';
}

// Initialize graph when page loads
window.addEventListener('DOMContentLoaded', () => {
    window.conversationGraph = new ConversationGraph();
});

console.log('🕸️ Conversation Graph loaded');