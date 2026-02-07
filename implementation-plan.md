# Implementation Roadmap

## MVP (1-2 weeks)

### Core Data Pipeline
```python
# 1. Claude Code Export Hook
# Автоматический экспорт каждого диалога в JSON

# 2. Simple Ingestion  
# Python script что парсит JSON и складывает в Postgres + ChromaDB

# 3. Basic Search
# FastAPI endpoint для поиска по content + semantic similarity
```

### Database Setup
```bash
# PostgreSQL + ChromaDB в Docker
docker-compose up -d postgres chromadb redis
```

### Minimal Features
- Импорт истории чатов
- Поиск по тексту + семантический поиск
- Просмотр отдельного разговора
- Список всех разговоров с фильтрами

## Phase 1 (2-4 weeks) 

### Intelligence Layer
- Автоматические summaries через OpenAI API
- Topic extraction из разговоров
- Similarity scoring между диалогами
- Автоматические связи (threshold > 0.8)

### Enhanced Search
- Фильтры по датам, проектам, тегам
- Поиск по file mentions
- Related conversations suggestions

## Phase 2 (1-2 months)

### Knowledge Graph
- Neo4j integration
- Graph algorithms для clustering
- Визуализация связей
- Topic hierarchy

### Advanced UI  
- React dashboard
- Interactive timeline
- Graph exploration view
- Manual cluster editing

## Phase 3 (Future)

### Analytics & Insights
- Patterns в разговорах
- Most discussed topics
- Evolution tracking
- Cross-project analysis

### Integrations
- Claude Code plugin hook
- VS Code extension
- Slack/Discord bots
- Export to Obsidian/Notion

## Quick Start Commands

```bash
# 1. Setup environment
cd /Users/tomtam/Developer/tools/history
python -m venv venv
source venv/bin/activate
pip install fastapi chromadb psycopg2 openai sentence-transformers

# 2. Start services  
docker-compose up -d

# 3. Initialize database
python scripts/init_db.py

# 4. Import first conversations
python scripts/import_claude_history.py --source ~/claude_exports/

# 5. Start API
uvicorn main:app --reload
```