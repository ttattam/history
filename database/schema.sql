-- Claude Code Personal Memory System
-- SQLite Schema with FTS5 support

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Main conversations table
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    started_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    message_count INTEGER DEFAULT 0,
    project_path TEXT,
    tags TEXT, -- JSON array
    summary TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
);

-- Individual messages
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    tokens_used INTEGER,
    tool_calls TEXT, -- JSON array of tool calls
    file_references TEXT, -- JSON array of mentioned files
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE messages_fts USING fts5(
    content,
    conversation_title,
    project_path,
    file_references,
    content=messages,
    content_rowid=rowid,
    tokenize='porter ascii'
);

-- Conversation relationships
CREATE TABLE conversation_links (
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    link_type TEXT NOT NULL CHECK (link_type IN ('similar', 'continuation', 'references', 'manual')),
    strength REAL DEFAULT 0.0 CHECK (strength >= 0.0 AND strength <= 1.0),
    reason TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    PRIMARY KEY(from_id, to_id, link_type),
    FOREIGN KEY(from_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY(to_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Clusters for grouping conversations
CREATE TABLE clusters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3B82F6', -- hex color for UI
    created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE cluster_members (
    cluster_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    added_at INTEGER DEFAULT (strftime('%s','now')),
    PRIMARY KEY(cluster_id, conversation_id),
    FOREIGN KEY(cluster_id) REFERENCES clusters(id) ON DELETE CASCADE,
    FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Performance indexes
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_role ON messages(role);
CREATE INDEX idx_conversations_project ON conversations(project_path);
CREATE INDEX idx_conversations_date ON conversations(started_at);
CREATE INDEX idx_conversations_updated ON conversations(updated_at);
CREATE INDEX idx_links_strength ON conversation_links(strength);

-- Triggers to maintain FTS5 sync
CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages
BEGIN
    INSERT INTO messages_fts(rowid, content, conversation_title, project_path, file_references)
    SELECT NEW.rowid, NEW.content, 
           COALESCE((SELECT title FROM conversations WHERE id = NEW.conversation_id), ''),
           COALESCE((SELECT project_path FROM conversations WHERE id = NEW.conversation_id), ''),
           COALESCE(NEW.file_references, '');
END;

CREATE TRIGGER messages_fts_update AFTER UPDATE ON messages
BEGIN
    UPDATE messages_fts SET 
        content = NEW.content,
        conversation_title = COALESCE((SELECT title FROM conversations WHERE id = NEW.conversation_id), ''),
        project_path = COALESCE((SELECT project_path FROM conversations WHERE id = NEW.conversation_id), ''),
        file_references = COALESCE(NEW.file_references, '')
    WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages
BEGIN
    DELETE FROM messages_fts WHERE rowid = OLD.rowid;
END;

-- Update message_count in conversations
CREATE TRIGGER update_message_count_insert AFTER INSERT ON messages
BEGIN
    UPDATE conversations 
    SET message_count = message_count + 1,
        updated_at = strftime('%s','now')
    WHERE id = NEW.conversation_id;
END;

CREATE TRIGGER update_message_count_delete AFTER DELETE ON messages
BEGIN
    UPDATE conversations 
    SET message_count = message_count - 1,
        updated_at = strftime('%s','now')
    WHERE id = OLD.conversation_id;
END;