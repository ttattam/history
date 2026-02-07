# Claude Code History Database Architecture

## Core Requirements
- Хранить ВСЕ диалоги с Claude Code с датами
- Семантическое кластеринг чатов по смыслу  
- Ручное объединение связанных бесед
- Граф связей между разговорами
- Быстрый поиск по содержанию и смыслу

## Database Design

### 1. Main Tables (PostgreSQL)

```sql
-- Основная таблица разговоров
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255),
    started_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    total_messages INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    project_path TEXT, -- откуда запущен Claude Code
    tags TEXT[], -- ручные теги
    summary TEXT, -- краткое описание о чем был разговор
    created_at TIMESTAMP DEFAULT NOW()
);

-- Сообщения в разговорах
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL, -- 'user' | 'assistant' | 'system'
    content TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    tokens_used INTEGER,
    tool_calls JSONB, -- вызовы функций Claude
    file_references TEXT[], -- упоминания файлов
    created_at TIMESTAMP DEFAULT NOW()
);

-- Связи между разговорами (граф)
CREATE TABLE conversation_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    to_conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    link_type VARCHAR(50) NOT NULL, -- 'related', 'continuation', 'manual', 'semantic'
    similarity_score FLOAT, -- для автоматических связей
    reason TEXT, -- почему связаны
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(from_conversation_id, to_conversation_id, link_type)
);

-- Кластеры разговоров
CREATE TABLE conversation_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7), -- hex цвет для визуализации
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE conversation_cluster_members (
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    cluster_id UUID REFERENCES conversation_clusters(id) ON DELETE CASCADE,
    PRIMARY KEY(conversation_id, cluster_id)
);
```

### 2. Vector Store (ChromaDB)

```python
# Для каждого сообщения создаем embedding
{
    "id": "msg_uuid",
    "embedding": [...], # vector embedding от OpenAI/local model
    "metadata": {
        "conversation_id": "conv_uuid",
        "role": "user|assistant", 
        "timestamp": "2025-01-15T10:30:00Z",
        "project_path": "/path/to/project",
        "file_mentions": ["file1.py", "file2.js"]
    },
    "document": "текст сообщения"
}

# Для каждого разговора создаем summary embedding
{
    "id": "conv_uuid", 
    "embedding": [...], # embedding от summary + заголовка
    "metadata": {
        "title": "Разговор о React компонентах",
        "started_at": "2025-01-15T10:00:00Z",
        "total_messages": 25,
        "project_path": "/path/to/project"
    },
    "document": "summary текст"
}
```

### 3. Knowledge Graph (Neo4j или граф в Postgres)

```cypher
# Nodes
(:Conversation {id, title, started_at, summary})
(:Topic {name, description}) 
(:File {path, project})
(:Project {path, name})

# Relationships
(:Conversation)-[:RELATED_TO {score, reason}]->(:Conversation)
(:Conversation)-[:DISCUSSES]->(:Topic)
(:Conversation)-[:MENTIONS]->(:File)
(:Conversation)-[:BELONGS_TO]->(:Project)
(:Topic)-[:PART_OF]->(:Topic) # иерархия тем
```

## Implementation Strategy

### Phase 1: Core Infrastructure
1. PostgreSQL для метаданных и связей
2. ChromaDB для embeddings и семантического поиска
3. Python FastAPI для API
4. Basic ingestion pipeline

### Phase 2: Intelligence 
1. Автоматическое создание summary для разговоров
2. Семантическое кластеринг через vector similarity  
3. Автоматические связи между похожими чатами
4. Topic extraction from conversations

### Phase 3: Graph & UI
1. Knowledge graph в Neo4j
2. Web UI для просмотра истории
3. Граф-визуализация связей
4. Ручное редактирование кластеров

## Data Flow

```
Claude Code Dialog → JSON Export → Ingestion API → 
{PostgreSQL + ChromaDB + Knowledge Graph} → 
Semantic Analysis → Auto-clustering → Manual Review → 
Search & Discovery UI
```

## Key Features

- **Semantic Search**: "Найти все разговоры где обсуждали React hooks"
- **Timeline View**: Хронологическая лента всех диалогов  
- **Graph Exploration**: Навигация по связанным разговорам
- **Smart Clustering**: Автоматическая группировка по темам
- **Cross-Project Insights**: Связи между разными проектами
- **Export/Import**: Backup и миграция данных

## Tech Stack Recommendations

- **Database**: PostgreSQL + ChromaDB + Redis (cache)
- **Backend**: Python FastAPI + SQLAlchemy + ChromaDB client  
- **Embeddings**: OpenAI API или local Sentence Transformers
- **Graph**: Neo4j или pgvector для простоты
- **Frontend**: React + D3.js для графов + Tailwind CSS
- **Deploy**: Docker Compose для всех сервисов