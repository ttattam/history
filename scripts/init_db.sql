-- Claude Code History Database Schema
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Core conversations table
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255),
    started_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    total_messages INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    project_path TEXT,
    tags TEXT[] DEFAULT '{}',
    summary TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at_local TIMESTAMP DEFAULT NOW()
);

-- Messages in conversations
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    tokens_used INTEGER,
    tool_calls JSONB,
    file_references TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Conversation relationships/links
CREATE TABLE conversation_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    to_conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    link_type VARCHAR(50) NOT NULL CHECK (link_type IN ('related', 'continuation', 'manual', 'semantic', 'temporal')),
    similarity_score FLOAT CHECK (similarity_score >= 0 AND similarity_score <= 1),
    reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(from_conversation_id, to_conversation_id, link_type)
);

-- Conversation clusters
CREATE TABLE conversation_clusters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#6366f1', -- hex color for visualization
    auto_generated BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Cluster membership
CREATE TABLE conversation_cluster_members (
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    cluster_id UUID REFERENCES conversation_clusters(id) ON DELETE CASCADE,
    confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
    assigned_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY(conversation_id, cluster_id)
);

-- Topics/themes extracted from conversations
CREATE TABLE topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    parent_topic_id UUID REFERENCES topics(id),
    frequency_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Topic mentions in conversations
CREATE TABLE conversation_topics (
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
    relevance_score FLOAT CHECK (relevance_score >= 0 AND relevance_score <= 1),
    PRIMARY KEY(conversation_id, topic_id)
);

-- User annotations and manual tags
CREATE TABLE user_annotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    annotation_type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    user_id VARCHAR(255), -- for multi-user support in future
    created_at TIMESTAMP DEFAULT NOW()
);

-- Search history for analytics
CREATE TABLE search_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_text TEXT NOT NULL,
    query_type VARCHAR(50), -- 'text', 'semantic', 'hybrid'
    results_count INTEGER,
    execution_time_ms INTEGER,
    user_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_conversations_started_at ON conversations(started_at);
CREATE INDEX idx_conversations_project_path ON conversations(project_path);
CREATE INDEX idx_conversations_tags ON conversations USING GIN(tags);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_role ON messages(role);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_file_references ON messages USING GIN(file_references);
CREATE INDEX idx_conversation_links_from ON conversation_links(from_conversation_id);
CREATE INDEX idx_conversation_links_to ON conversation_links(to_conversation_id);
CREATE INDEX idx_conversation_links_type ON conversation_links(link_type);
CREATE INDEX idx_cluster_members_conversation ON conversation_cluster_members(conversation_id);
CREATE INDEX idx_cluster_members_cluster ON conversation_cluster_members(cluster_id);
CREATE INDEX idx_topics_name ON topics(name);
CREATE INDEX idx_conversation_topics_conversation ON conversation_topics(conversation_id);
CREATE INDEX idx_conversation_topics_topic ON conversation_topics(topic_id);

-- Create full-text search indexes
CREATE INDEX idx_conversations_summary_fts ON conversations USING GIN(to_tsvector('english', summary));
CREATE INDEX idx_messages_content_fts ON messages USING GIN(to_tsvector('english', content));

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at_local = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_conversations_updated_at 
    BEFORE UPDATE ON conversations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clusters_updated_at 
    BEFORE UPDATE ON conversation_clusters 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();