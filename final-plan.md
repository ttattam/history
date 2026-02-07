# Claude Code Personal Memory System - Final Plan

## Vision
Персональная система памяти для Claude Code чатов с поиском, timeline и graph visualization. 
**Цель:** Ты можешь в любой новой сессии сказать "найди где мы обсуждали React hooks" и получить контекст.

## Architecture Overview

```
SQLite Database (single file: history.db)
├── conversations      # метаданные чатов
├── messages          # все сообщения
├── messages_fts      # FTS5 fulltext search
├── conversation_links # связи между чатами
└── embeddings        # semantic vectors (опционально)

API Server (Bun/Node.js)
├── /import          # импорт Claude Code JSON
├── /search          # hybrid search (text + semantic)  
├── /timeline        # хронологический view
├── /graph           # данные для visualization
└── /context/:project # чаты по проекту

Web UI (simple HTML/JS)
├── search.html      # главный поиск
├── timeline.html    # временная лента
├── graph.html       # D3.js visualization
└── chat/:id         # просмотр чата
```

## Database Schema

```sql
-- Основные таблицы
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,           -- UUID чата
    title TEXT,                    -- заголовок или первые слова
    started_at INTEGER,            -- timestamp начала
    updated_at INTEGER,            -- последнее сообщение
    message_count INTEGER DEFAULT 0,
    project_path TEXT,             -- откуда запущен Claude Code
    tags TEXT,                     -- JSON array тегов
    summary TEXT,                  -- краткое описание чата
    created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,            -- 'user' | 'assistant' | 'system'
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    tokens_used INTEGER,
    tool_calls TEXT,               -- JSON calls если есть
    file_references TEXT,          -- JSON array файлов
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

-- FTS5 для быстрого поиска
CREATE VIRTUAL TABLE messages_fts USING fts5(
    content,
    conversation_title,
    project_path,
    content=messages,
    content_rowid=rowid
);

-- Связи между чатами
CREATE TABLE conversation_links (
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    link_type TEXT NOT NULL,       -- 'similar', 'continuation', 'references', 'manual'
    strength REAL DEFAULT 0.0,    -- 0.0-1.0 similarity score
    reason TEXT,                   -- описание связи
    created_at INTEGER DEFAULT (strftime('%s','now')),
    PRIMARY KEY(from_id, to_id, link_type),
    FOREIGN KEY(from_id) REFERENCES conversations(id),
    FOREIGN KEY(to_id) REFERENCES conversations(id)
);

-- Clusters для группировки
CREATE TABLE clusters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,                    -- hex color для UI
    created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE cluster_members (
    cluster_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    PRIMARY KEY(cluster_id, conversation_id),
    FOREIGN KEY(cluster_id) REFERENCES clusters(id),
    FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

-- Индексы для производительности
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_conversations_project ON conversations(project_path);
CREATE INDEX idx_conversations_date ON conversations(started_at);
```

## Implementation Phases

### Phase 1: MVP Core (Day 1-2)

**Goal:** Базовый импорт и поиск работают

```bash
# Project structure
/history/
├── database/
│   ├── schema.sql           # DDL скрипты
│   ├── init.js             # создание БД
│   └── migrations/         # будущие апгрейды
├── api/
│   ├── server.js           # Bun HTTP server
│   ├── routes/
│   │   ├── import.js       # POST /import
│   │   ├── search.js       # GET /search
│   │   └── conversations.js # CRUD operations
│   └── services/
│       ├── importer.js     # парсинг Claude Code JSON
│       └── search.js       # FTS5 queries
├── web/
│   ├── index.html          # главная с поиском
│   ├── timeline.html       # временная лента
│   ├── chat.html           # просмотр чата
│   └── assets/
│       ├── app.js          # фронтенд логика
│       └── styles.css      # базовые стили
└── scripts/
    ├── setup.sh            # инициализация
    ├── import-claude.js    # импорт из JSON
    └── backup.sh           # бэкап БД
```

**Deliverables Phase 1:**
- [x] SQLite база с схемой
- [x] Импорт Claude Code JSON exports
- [x] FTS5 поиск по сообщениям
- [x] Простой веб UI для поиска
- [x] Timeline view всех чатов

**Tech Stack:**
- **Database:** SQLite 3.45+ с FTS5
- **Backend:** Bun + better-sqlite3
- **Frontend:** Vanilla JS + Fetch API
- **Styling:** Basic CSS (без фреймворков)

### Phase 2: Intelligence Layer (Day 3-5)

**Goal:** Semantic search и auto-linking

**Semantic Search Options:**
```javascript
// Option A: sqlite-vec extension
// Pros: всё в одной БД
// Cons: компилировать extension

// Option B: местный embedding service
// Pros: больше контроля
// Cons: дополнительный сервис

// Option C: OpenAI API
// Pros: работает из коробки
// Cons: стоит денег
```

**Auto-linking Algorithm:**
```javascript
// 1. Для каждого нового чата
// 2. Сравнить с существующими через cosine similarity
// 3. Если similarity > 0.75 - создать link
// 4. Группировать связанные чаты в clusters

const findSimilarChats = (newChatSummary) => {
  const embedding = getEmbedding(newChatSummary);
  const similar = db.query(`
    SELECT conversation_id, similarity 
    FROM embeddings 
    WHERE similarity(embedding, ?) > 0.75
    ORDER BY similarity DESC LIMIT 5
  `, [embedding]);
  return similar;
};
```

**Deliverables Phase 2:**
- [x] Semantic embeddings для чатов
- [x] Hybrid search (keyword + semantic)
- [x] Auto-discovery связанных чатов
- [x] Basic clustering по темам
- [x] Project context filtering

### Phase 3: Graph Visualization (Day 6-7)

**Goal:** Interactive graph of conversations

**Graph Data Structure:**
```javascript
const graphData = {
  nodes: conversations.map(chat => ({
    id: chat.id,
    title: chat.title,
    date: new Date(chat.started_at * 1000),
    size: Math.log(chat.message_count + 1) * 5,
    cluster: chat.cluster_id,
    project: chat.project_path
  })),
  links: conversation_links.map(link => ({
    source: link.from_id,
    target: link.to_id,
    strength: link.strength,
    type: link.link_type,
    reason: link.reason
  }))
};
```

**Graph Features:**
- **Force-directed layout** с D3.js
- **Color coding** по проектам/кластерам
- **Node size** пропорционален количеству сообщений
- **Interactive** - клик на ноду открывает чат
- **Time slider** - показывать граф на определённую дату
- **Search integration** - подсветка найденных чатов

**Deliverables Phase 3:**
- [x] D3.js граф visualization
- [x] Interactive node exploration
- [x] Timeline + graph integration
- [x] Cluster visualization
- [x] Export graph to PNG/SVG

## Deployment & Usage

### One-time Setup
```bash
cd /Users/tomtam/Developer/tools/history

# Инициализация
./scripts/setup.sh

# Создание БД и схемы
bun run database/init.js

# Импорт существующих чатов (если есть)
bun run scripts/import-claude.js ~/Downloads/claude-exports/
```

### Daily Workflow
```bash
# После каждой сессии с Claude Code:
# 1. Экспорт чата в JSON (вручную пока)
# 2. Импорт в базу
bun run scripts/import-claude.js ~/Downloads/new-chat.json

# 3. Запуск сервера (если не запущен)
bun run api/server.js

# 4. Открыть веб UI
open http://localhost:3000
```

### Integration with Claude Code
```bash
# В будущем можно сделать hook в Claude Code
# который автоматически экспортирует чаты в базу

# ~/.claude/hooks/post-conversation.sh
#!/bin/bash
CHAT_JSON="$1"
bun run /Users/tomtam/Developer/tools/history/scripts/import-claude.js "$CHAT_JSON"
```

## Expected Usage Patterns

### Cross-Session Memory
```
You: "Найди где мы обсуждали React performance"
System: [Shows 3 related chats from different dates]

You: "Покажи все чаты по проекту /Users/tomtam/shop"  
System: [Timeline of all conversations in that project]

You: "Что мы делали на прошлой неделе?"
System: [Week timeline with summaries]
```

### Discovery & Context
```
- "Похожие разговоры" для текущей темы
- "Продолжение предыдущих обсуждений"
- "Файлы которые часто упоминаем"
- "Паттерны в наших разговорах"
```

## Success Metrics

### Technical KPIs
- **Import time:** <1s per conversation
- **Search latency:** <200ms for any query
- **Graph render:** <3s for 1000+ nodes
- **Database size:** efficient storage (1MB per 100 conversations)

### User Experience KPIs
- **Search relevance:** Find что искал в топ-3 результатах
- **Context discovery:** Легко найти связанные обсуждения  
- **Timeline navigation:** Быстро найти "что делали когда"

## Future Extensions

### Phase 4 (Optional)
- **Mobile app** через Capacitor
- **Real-time sync** между устройствами
- **AI summaries** для длинных чатов
- **Export to Obsidian** vault
- **Claude Code plugin** для автоимпорта

### Advanced Analytics
- **Topic trending** - какие темы обсуждаем чаще
- **Collaboration patterns** - как темы развиваются
- **Knowledge gaps** - что никогда не обсуждали
- **Code evolution** - как проекты менялись в чатах

## Risk Mitigation

### Data Loss Prevention
- **Daily backups** БД в cloud storage
- **Export to JSON** для portability
- **Schema versioning** для безопасных миграций

### Performance Degradation
- **Pagination** для больших результатов
- **Lazy loading** в граф visualization
- **Database vacuuming** для поддержания скорости

### Privacy & Security
- **Local-only storage** - ничего не уходит в сеть
- **Encrypted backups** если нужно
- **Selective export** только нужных чатов

---

## Getting Started

Ready to build your personal Claude Code memory system?

```bash
# Let's go!
mkdir -p /Users/tomtam/Developer/tools/history
cd /Users/tomtam/Developer/tools/history

# Start with Phase 1 MVP
echo "Starting your personal AI memory system..."
```

This system will give you **superhuman memory** for all Claude Code conversations. No more "where did we discuss that API optimization?" - just search and find instantly! 🚀