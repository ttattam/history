from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import logging
import time
from datetime import datetime

from app.core.database import get_db
from app.models import Conversation, Message, SearchQuery as SearchQueryModel
from app.api.schemas import (
    SearchQuery,
    ConversationSearchResult,
    MessageSearchResult,
    HybridSearchResult,
    ConversationSummary,
    MessageWithSimilarity
)
from app.services.embedding_service import embedding_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/conversations", response_model=ConversationSearchResult)
async def search_conversations(
    search_request: SearchQuery,
    db: Session = Depends(get_db)
):
    """Search conversations using text, semantic, or hybrid search"""
    start_time = time.time()
    
    try:
        results = []
        
        if search_request.search_type in ["semantic", "hybrid"]:
            # Semantic search using ChromaDB
            semantic_results = await embedding_service.search_conversations(
                query=search_request.query,
                limit=search_request.limit,
                filters=_build_chroma_filters(search_request.filters)
            )
            
            # Get conversation details from database
            for result in semantic_results:
                conv_id = result['id']
                conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
                if conv:
                    conv_summary = ConversationSummary.model_validate(conv)
                    conv_summary.similarity = result.get('similarity')
                    results.append(conv_summary)
        
        if search_request.search_type in ["text", "hybrid"]:
            # Text search using PostgreSQL full-text search
            text_results = _text_search_conversations(db, search_request)
            
            # Merge with semantic results if hybrid
            if search_request.search_type == "hybrid":
                # Remove duplicates and combine scores
                existing_ids = {conv.id for conv in results}
                for conv in text_results:
                    if conv.id not in existing_ids:
                        results.append(conv)
            else:
                results = text_results
        
        # Sort by similarity/relevance score
        results.sort(key=lambda x: x.similarity or 0, reverse=True)
        
        # Limit results
        results = results[:search_request.limit]
        
        # Log search query
        execution_time = int((time.time() - start_time) * 1000)
        _log_search_query(db, search_request, len(results), execution_time)
        
        return ConversationSearchResult(
            conversations=results,
            total_count=len(results),
            query_info={
                'query': search_request.query,
                'search_type': search_request.search_type,
                'execution_time_ms': execution_time,
                'filters_applied': search_request.filters
            }
        )
        
    except Exception as e:
        logger.error(f"Failed to search conversations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/messages", response_model=MessageSearchResult)
async def search_messages(
    search_request: SearchQuery,
    db: Session = Depends(get_db)
):
    """Search messages using text, semantic, or hybrid search"""
    start_time = time.time()
    
    try:
        results = []
        
        if search_request.search_type in ["semantic", "hybrid"]:
            # Semantic search using ChromaDB
            semantic_results = await embedding_service.search_messages(
                query=search_request.query,
                limit=search_request.limit * 2,  # Get more results for better hybrid matching
                filters=_build_chroma_filters(search_request.filters)
            )
            
            # Get message details from database
            for result in semantic_results:
                msg_id = result['id']
                msg = db.query(Message).filter(Message.id == msg_id).first()
                if msg:
                    msg_with_sim = MessageWithSimilarity.model_validate(msg)
                    msg_with_sim.similarity = result.get('similarity')
                    results.append(msg_with_sim)
        
        if search_request.search_type in ["text", "hybrid"]:
            # Text search using PostgreSQL full-text search
            text_results = _text_search_messages(db, search_request)
            
            # Merge with semantic results if hybrid
            if search_request.search_type == "hybrid":
                existing_ids = {msg.id for msg in results}
                for msg in text_results:
                    if msg.id not in existing_ids:
                        results.append(msg)
            else:
                results = text_results
        
        # Sort by similarity/relevance score
        results.sort(key=lambda x: x.similarity or 0, reverse=True)
        
        # Limit results
        results = results[:search_request.limit]
        
        # Log search query
        execution_time = int((time.time() - start_time) * 1000)
        _log_search_query(db, search_request, len(results), execution_time)
        
        return MessageSearchResult(
            messages=results,
            total_count=len(results),
            query_info={
                'query': search_request.query,
                'search_type': search_request.search_type,
                'execution_time_ms': execution_time,
                'filters_applied': search_request.filters
            }
        )
        
    except Exception as e:
        logger.error(f"Failed to search messages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/hybrid", response_model=HybridSearchResult)
async def hybrid_search(
    search_request: SearchQuery,
    db: Session = Depends(get_db)
):
    """Perform hybrid search across both conversations and messages"""
    start_time = time.time()
    
    try:
        # Force hybrid search type
        search_request.search_type = "hybrid"
        
        # Search conversations
        conv_limit = max(5, search_request.limit // 2)
        conv_request = SearchQuery(
            query=search_request.query,
            search_type="hybrid",
            limit=conv_limit,
            filters=search_request.filters
        )
        conv_results = await search_conversations(conv_request, db)
        
        # Search messages
        msg_limit = search_request.limit - len(conv_results.conversations)
        msg_request = SearchQuery(
            query=search_request.query,
            search_type="hybrid",
            limit=max(5, msg_limit),
            filters=search_request.filters
        )
        msg_results = await search_messages(msg_request, db)
        
        execution_time = int((time.time() - start_time) * 1000)
        
        return HybridSearchResult(
            conversations=conv_results.conversations,
            messages=msg_results.messages,
            query_info={
                'query': search_request.query,
                'search_type': 'hybrid',
                'execution_time_ms': execution_time,
                'conversation_count': len(conv_results.conversations),
                'message_count': len(msg_results.messages),
                'filters_applied': search_request.filters
            }
        )
        
    except Exception as e:
        logger.error(f"Failed to perform hybrid search: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/suggestions")
async def get_search_suggestions(
    query: str = Query(..., min_length=2),
    limit: int = Query(10, ge=1, le=20),
    db: Session = Depends(get_db)
):
    """Get search suggestions based on existing conversations and common terms"""
    try:
        suggestions = []
        
        # Search conversation titles
        title_matches = db.query(Conversation.title).filter(
            Conversation.title.ilike(f"%{query}%"),
            Conversation.title.isnot(None)
        ).limit(limit // 2).all()
        
        for (title,) in title_matches:
            if title and title not in suggestions:
                suggestions.append(title)
        
        # Search common tags
        from sqlalchemy import func
        tag_matches = db.query(
            func.unnest(Conversation.tags).label('tag'),
            func.count().label('count')
        ).filter(
            func.unnest(Conversation.tags).ilike(f"%{query}%")
        ).group_by(
            func.unnest(Conversation.tags)
        ).order_by(
            func.count().desc()
        ).limit(limit // 2).all()
        
        for tag, count in tag_matches:
            if tag not in suggestions:
                suggestions.append(f"tag:{tag}")
        
        # Search project paths
        project_matches = db.query(Conversation.project_path).filter(
            Conversation.project_path.ilike(f"%{query}%"),
            Conversation.project_path.isnot(None)
        ).distinct().limit(3).all()
        
        for (project_path,) in project_matches:
            if project_path and f"project:{project_path}" not in suggestions:
                suggestions.append(f"project:{project_path}")
        
        return {
            'suggestions': suggestions[:limit],
            'query': query
        }
        
    except Exception as e:
        logger.error(f"Failed to get search suggestions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recent")
async def get_recent_searches(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """Get recent search queries for suggestions"""
    try:
        recent_searches = db.query(SearchQueryModel).order_by(
            SearchQueryModel.created_at.desc()
        ).limit(limit).all()
        
        return {
            'recent_searches': [
                {
                    'query': search.query_text,
                    'type': search.query_type,
                    'timestamp': search.created_at
                }
                for search in recent_searches
            ]
        }
        
    except Exception as e:
        logger.error(f"Failed to get recent searches: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _text_search_conversations(db: Session, search_request: SearchQuery) -> List[ConversationSummary]:
    """Perform text-based search on conversations"""
    query = db.query(Conversation)
    
    # Apply full-text search
    search_term = search_request.query
    query = query.filter(
        (Conversation.title.ilike(f"%{search_term}%")) |
        (Conversation.summary.ilike(f"%{search_term}%"))
    )
    
    # Apply filters
    filters = search_request.filters
    
    if filters.get('project_path'):
        query = query.filter(Conversation.project_path.ilike(f"%{filters['project_path']}%"))
    
    if filters.get('tags'):
        for tag in filters['tags']:
            query = query.filter(Conversation.tags.contains([tag]))
    
    if filters.get('date_from'):
        query = query.filter(Conversation.started_at >= filters['date_from'])
    
    if filters.get('date_to'):
        query = query.filter(Conversation.started_at <= filters['date_to'])
    
    # Order by most recent
    query = query.order_by(Conversation.started_at.desc())
    
    conversations = query.limit(search_request.limit).all()
    
    return [ConversationSummary.model_validate(conv) for conv in conversations]


def _text_search_messages(db: Session, search_request: SearchQuery) -> List[MessageWithSimilarity]:
    """Perform text-based search on messages"""
    query = db.query(Message)
    
    # Apply full-text search
    search_term = search_request.query
    query = query.filter(Message.content.ilike(f"%{search_term}%"))
    
    # Apply filters
    filters = search_request.filters
    
    if filters.get('role'):
        query = query.filter(Message.role == filters['role'])
    
    if filters.get('project_path'):
        # Join with conversations to filter by project
        query = query.join(Conversation).filter(
            Conversation.project_path.ilike(f"%{filters['project_path']}%")
        )
    
    if filters.get('date_from'):
        query = query.filter(Message.timestamp >= filters['date_from'])
    
    if filters.get('date_to'):
        query = query.filter(Message.timestamp <= filters['date_to'])
    
    if filters.get('has_file_references'):
        if filters['has_file_references']:
            query = query.filter(func.array_length(Message.file_references, 1) > 0)
        else:
            query = query.filter(
                (func.array_length(Message.file_references, 1).is_(None)) |
                (func.array_length(Message.file_references, 1) == 0)
            )
    
    # Order by most recent
    query = query.order_by(Message.timestamp.desc())
    
    messages = query.limit(search_request.limit).all()
    
    return [MessageWithSimilarity.model_validate(msg) for msg in messages]


def _build_chroma_filters(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Build ChromaDB where clause from search filters"""
    chroma_filters = {}
    
    if filters.get('project_path'):
        chroma_filters['project_path'] = filters['project_path']
    
    if filters.get('role'):
        chroma_filters['role'] = filters['role']
    
    # ChromaDB doesn't support complex date filtering in where clause
    # We'll handle date filtering in the application layer
    
    return chroma_filters


def _log_search_query(db: Session, search_request: SearchQuery, results_count: int, execution_time_ms: int):
    """Log search query for analytics"""
    try:
        search_log = SearchQueryModel(
            query_text=search_request.query,
            query_type=search_request.search_type,
            results_count=results_count,
            execution_time_ms=execution_time_ms
        )
        db.add(search_log)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to log search query: {e}")
        db.rollback()