// Embedding Service for Semantic Search

import { randomUUID } from 'crypto';

class EmbeddingService {
    constructor() {
        this.model = process.env.EMBEDDING_MODEL || 'local';
        this.openaiKey = process.env.OPENAI_API_KEY;
        
        // Local embedding model (simpler alternative)
        this.localModel = null;
        this.initializeModel();
    }
    
    async initializeModel() {
        if (this.model === 'local') {
            try {
                // Try to use a simple local embedding approach
                console.log('🧠 Using local embedding model (cosine similarity)');
            } catch (error) {
                console.log('⚠️  Local embedding model not available, falling back to text analysis');
            }
        }
    }
    
    /**
     * Generate embedding for text using selected model
     */
    async generateEmbedding(text) {
        if (!text || typeof text !== 'string') {
            return null;
        }
        
        switch (this.model) {
            case 'openai':
                return await this.generateOpenAIEmbedding(text);
            case 'local':
            default:
                return await this.generateLocalEmbedding(text);
        }
    }
    
    /**
     * OpenAI embedding generation
     */
    async generateOpenAIEmbedding(text) {
        if (!this.openaiKey) {
            throw new Error('OpenAI API key not provided');
        }
        
        try {
            const response = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.openaiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    input: text,
                    model: 'text-embedding-ada-002'
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(`OpenAI API error: ${data.error?.message || 'Unknown error'}`);
            }
            
            return {
                vector: data.data[0].embedding,
                model: 'text-embedding-ada-002',
                dimensions: 1536
            };
        } catch (error) {
            console.error('OpenAI embedding error:', error);
            return null;
        }
    }
    
    /**
     * Local embedding using simple text analysis
     */
    async generateLocalEmbedding(text) {
        // Simple local approach: create feature vector from text characteristics
        const features = this.extractTextFeatures(text);
        
        return {
            vector: features,
            model: 'local-features',
            dimensions: features.length
        };
    }
    
    /**
     * Extract text features for local embedding
     */
    extractTextFeatures(text) {
        const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
        const words = normalized.split(/\s+/).filter(w => w.length > 2);
        
        // Technology keywords for Claude Code conversations
        const techKeywords = [
            'react', 'vue', 'angular', 'node', 'python', 'javascript', 'typescript',
            'api', 'database', 'sql', 'git', 'docker', 'aws', 'bug', 'fix', 'feature',
            'component', 'function', 'class', 'method', 'error', 'install', 'deploy',
            'test', 'build', 'optimization', 'performance', 'security', 'frontend',
            'backend', 'server', 'client', 'mobile', 'web', 'app', 'service'
        ];
        
        const features = [];
        
        // 1. Text length (normalized)
        features.push(Math.min(words.length / 100, 1.0));
        
        // 2. Tech keyword presence (binary features)
        techKeywords.forEach(keyword => {
            features.push(words.includes(keyword) ? 1.0 : 0.0);
        });
        
        // 3. Common programming patterns
        const patterns = [
            /\b(class|function|const|let|var)\s+\w+/i,
            /\b(import|export|require)\b/i,
            /\b(async|await|promise)\b/i,
            /\b(error|exception|bug|issue)\b/i,
            /\b(optimize|performance|speed)\b/i,
            /\b(test|testing|spec)\b/i,
            /\b(deploy|build|compile)\b/i,
            /\.(js|ts|py|html|css|json|md)\b/i
        ];
        
        patterns.forEach(pattern => {
            features.push(pattern.test(text) ? 1.0 : 0.0);
        });
        
        // 4. Question vs answer indicators
        features.push(/\?/.test(text) ? 1.0 : 0.0); // Contains question
        features.push(/\b(help|how|what|why|when|where)\b/i.test(text) ? 1.0 : 0.0); // Help request
        features.push(/\b(solution|answer|fix|resolve)\b/i.test(text) ? 1.0 : 0.0); // Solution provided
        
        return features;
    }
    
    /**
     * Calculate cosine similarity between two embeddings
     */
    calculateSimilarity(embedding1, embedding2) {
        if (!embedding1 || !embedding2) return 0;
        
        const vec1 = embedding1.vector || embedding1;
        const vec2 = embedding2.vector || embedding2;
        
        if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;
        
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }
        
        const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
        return magnitude === 0 ? 0 : dotProduct / magnitude;
    }
    
    /**
     * Generate conversation summary from messages
     */
    generateConversationSummary(messages) {
        if (!messages || messages.length === 0) return '';
        
        const allText = messages.map(m => m.content || '').join(' ');
        const keywords = new Set();
        
        // Extract key topics
        const techWords = allText.toLowerCase().match(/\b(react|vue|angular|node|python|javascript|typescript|api|database|sql|git|docker|aws|bug|fix|feature|component|function|class|method|error|install|deploy|test|build|optimization|performance)\b/g);
        
        if (techWords) {
            techWords.forEach(word => keywords.add(word));
        }
        
        // Extract file mentions
        const files = allText.match(/[\w\-\.\/]+\.(js|ts|py|html|css|json|md|txt|sql)/g);
        if (files) {
            files.slice(0, 3).forEach(file => {
                const ext = file.split('.').pop();
                keywords.add(ext);
            });
        }
        
        return [...keywords].slice(0, 5).join(', ') || 'General discussion';
    }
}

export { EmbeddingService };