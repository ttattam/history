# Claude Code History System - Implementation Task

## Task Overview
Implement a comprehensive conversation history management system for Claude Code dialogs with semantic search, automatic clustering, and relationship mapping capabilities.

## Project Context
- **Location**: `/Users/tomtam/Developer/tools/history/`
- **Purpose**: Track, analyze, and discover patterns in all Claude Code conversations
- **Architecture**: Hybrid system combining vector embeddings, relational database, and knowledge graph
- **Expected Outcome**: Production-ready system for conversation history management with 300%+ ROI

## Architecture Requirements

### Core Components
1. **PostgreSQL Database** - Metadata, relationships, user annotations
2. **ChromaDB Vector Store** - Semantic embeddings for conversations and messages  
3. **Knowledge Graph** (Neo4j or pgvector) - Conversation relationships and topic hierarchies
4. **FastAPI Backend** - REST API for all operations
5. **React Frontend** - UI with timeline, search, and graph visualization

### Database Schema (PostgreSQL)
```sql
-- Core tables needed:
conversations (id, title, started_at, updated_at, total_messages, project_path, tags, summary)
messages (id, conversation_id, role, content, timestamp, tool_calls, file_references)  
conversation_links (from_conversation_id, to_conversation_id, link_type, similarity_score)
conversation_clusters (id, name, description, color)
conversation_cluster_members (conversation_id, cluster_id)
```

### Vector Store Structure (ChromaDB)
```python
# Message embeddings
{
    "id": "msg_uuid", 
    "embedding": [...],  # 384-dim from sentence-transformers or 1536-dim from OpenAI
    "metadata": {"conversation_id", "role", "timestamp", "project_path"},
    "document": "message content"
}

# Conversation summary embeddings  
{
    "id": "conv_uuid",
    "embedding": [...],
    "metadata": {"title", "started_at", "total_messages", "project_path"}, 
    "document": "conversation summary"
}
```

## Implementation Requirements

### Phase 1: MVP (Core Infrastructure)
1. **Database Setup**
   - PostgreSQL with proper schema
   - ChromaDB embedded or server mode
   - Redis for caching (optional)

2. **Data Ingestion Pipeline**
   - JSON parser for Claude Code conversation exports
   - Message extraction and preprocessing
   - Embedding generation (sentence-transformers recommended for start)
   - Batch processing for performance

3. **Basic API Endpoints**
   ```python
   POST /conversations/import  # Import conversation JSON
   GET /conversations/search   # Text + semantic search
   GET /conversations/{id}     # Get single conversation
   GET /conversations/         # List with filters (date, project, tags)
   POST /conversations/{id}/link  # Manual conversation linking
   ```

4. **Simple Frontend**
   - Conversation list with search
   - Individual conversation viewer
   - Basic timeline view

### Phase 2: Intelligence Features
1. **Automatic Summarization** 
   - Generate conversation summaries using LLM
   - Extract key topics and themes
   - Identify file mentions and project context

2. **Semantic Clustering**
   - Cosine similarity calculation between conversations
   - HDBSCAN or K-means clustering 
   - Automatic relationship detection (threshold > 0.8)

3. **Enhanced Search**
   - Hybrid search (text + semantic)
   - Filters: date range, project, file mentions, tags
   - Related conversation suggestions

### Phase 3: Advanced Features  
1. **Knowledge Graph Integration**
   - Neo4j setup with conversation nodes
   - Topic extraction and hierarchy
   - Graph algorithms for community detection

2. **Advanced UI**
   - D3.js graph visualization
   - Interactive timeline with clustering
   - Manual cluster editing interface

## Technical Specifications

### Tech Stack
- **Backend**: Python 3.9+, FastAPI, SQLAlchemy, psycopg2
- **Vector DB**: ChromaDB client
- **ML**: sentence-transformers (all-MiniLM-L6-v2) or OpenAI API
- **Database**: PostgreSQL 14+, Redis (optional)
- **Frontend**: React 18, TypeScript, Tailwind CSS, D3.js
- **Deploy**: Docker Compose for local development

### Performance Requirements
- Handle 10,000+ conversations without performance degradation
- Sub-second search response times
- Incremental updates without full re-indexing
- Batch processing for embedding generation

### Data Processing Pipeline
```
Claude Code Export JSON → 
Parse & Extract → 
Generate Embeddings → 
Store in PostgreSQL + ChromaDB → 
Auto-clustering → 
Relationship Detection → 
Knowledge Graph Update
```

## Deliverables

### Code Structure
```
/history/
├── backend/
│   ├── app/
│   │   ├── models/          # SQLAlchemy models
│   │   ├── api/             # FastAPI routes  
│   │   ├── services/        # Business logic
│   │   └── core/            # Config, database
│   ├── scripts/             # Data migration, setup
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/          # Main views
│   │   ├── services/       # API clients
│   │   └── utils/          # Helpers
│   └── package.json
├── docker-compose.yml       # Full stack setup
├── README.md               # Setup instructions
└── .env.example           # Configuration template
```

### Key Features to Implement
1. **Import System**: Parse Claude Code conversation exports
2. **Semantic Search**: Find conversations by meaning, not just keywords
3. **Auto-clustering**: Group related conversations automatically  
4. **Manual Linking**: Allow user to connect related conversations
5. **Timeline View**: Chronological exploration of conversation history
6. **Graph Visualization**: Interactive network of conversation relationships
7. **Export/Backup**: Data portability and backup functionality

## Success Criteria
- Successfully import and index 1000+ conversations
- Sub-second semantic search performance
- Accurate automatic clustering (>80% user satisfaction)
- Intuitive UI for conversation discovery and navigation
- Stable API suitable for integration with Claude Code

## Implementation Notes
- Start with ChromaDB embedded mode for simplicity
- Use sentence-transformers for initial embedding generation  
- Implement proper error handling and logging
- Include comprehensive tests for core functionality
- Document API endpoints with OpenAPI/Swagger
- Plan for horizontal scaling from the start

Please implement this system with clean, production-ready code following Python and React best practices. Focus on performance, user experience, and maintainability.