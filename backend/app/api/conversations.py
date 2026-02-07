from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from uuid import UUID
import logging

from app.core.database import get_db
from app.models import Conversation, Message, ConversationLink
from app.api.schemas import (
    Conversation as ConversationSchema,
    ConversationWithMessages,
    ConversationSummary,
    ConversationUpdate,
    Message as MessageSchema,
    PaginatedResponse,
    APIResponse
)
from app.services.embedding_service import embedding_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=PaginatedResponse)
async def list_conversations(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    project_path: Optional[str] = Query(None),
    tags: Optional[str] = Query(None, description="Comma-separated list of tags"),
    search_query: Optional[str] = Query(None, description="Basic text search in title and summary"),
    db: Session = Depends(get_db)
):
    """List conversations with pagination and filters"""
    try:
        query = db.query(Conversation)
        
        # Apply filters
        if project_path:
            query = query.filter(Conversation.project_path.ilike(f"%{project_path}%"))
        
        if tags:
            tag_list = [tag.strip() for tag in tags.split(",")]
            for tag in tag_list:
                query = query.filter(Conversation.tags.contains([tag]))
        
        if search_query:
            query = query.filter(
                (Conversation.title.ilike(f"%{search_query}%")) |
                (Conversation.summary.ilike(f"%{search_query}%"))
            )
        
        # Order by most recent first
        query = query.order_by(Conversation.started_at.desc())
        
        # Get total count
        total = query.count()
        
        # Apply pagination
        offset = (page - 1) * size
        conversations = query.offset(offset).limit(size).all()
        
        # Convert to schema
        items = [ConversationSummary.model_validate(conv) for conv in conversations]
        
        return PaginatedResponse(
            items=items,
            total=total,
            page=page,
            size=size,
            pages=(total + size - 1) // size
        )
        
    except Exception as e:
        logger.error(f"Failed to list conversations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{conversation_id}", response_model=ConversationWithMessages)
async def get_conversation(
    conversation_id: UUID,
    include_messages: bool = Query(True),
    db: Session = Depends(get_db)
):
    """Get a specific conversation by ID"""
    try:
        query = db.query(Conversation).filter(Conversation.id == conversation_id)
        
        if include_messages:
            query = query.options(joinedload(Conversation.messages))
        
        conversation = query.first()
        
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        return ConversationWithMessages.model_validate(conversation)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get conversation {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{conversation_id}", response_model=ConversationSchema)
async def update_conversation(
    conversation_id: UUID,
    update_data: ConversationUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Update conversation metadata"""
    try:
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Update fields
        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(conversation, field, value)
        
        db.commit()
        
        # Update embedding if title or summary changed
        if 'title' in update_dict or 'summary' in update_dict:
            background_tasks.add_task(
                update_conversation_embedding,
                conversation_id,
                conversation.title,
                conversation.summary,
                conversation.project_path
            )
        
        return ConversationSchema.model_validate(conversation)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update conversation {conversation_id}: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{conversation_id}", response_model=APIResponse)
async def delete_conversation(
    conversation_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Delete a conversation and all its messages"""
    try:
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Delete from vector database in background
        background_tasks.add_task(
            delete_conversation_embeddings,
            conversation_id
        )
        
        # Delete from SQL database (cascade will handle messages)
        db.delete(conversation)
        db.commit()
        
        return APIResponse(
            success=True,
            message=f"Conversation {conversation_id} deleted successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete conversation {conversation_id}: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{conversation_id}/messages", response_model=List[MessageSchema])
async def get_conversation_messages(
    conversation_id: UUID,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    role: Optional[str] = Query(None, regex="^(user|assistant|system)$"),
    db: Session = Depends(get_db)
):
    """Get messages from a specific conversation"""
    try:
        # Verify conversation exists
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        query = db.query(Message).filter(Message.conversation_id == conversation_id)
        
        # Apply role filter
        if role:
            query = query.filter(Message.role == role)
        
        # Order by timestamp
        query = query.order_by(Message.timestamp.asc())
        
        # Apply pagination
        offset = (page - 1) * size
        messages = query.offset(offset).limit(size).all()
        
        return [MessageSchema.model_validate(msg) for msg in messages]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get messages for conversation {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{conversation_id}/similar", response_model=List[ConversationSummary])
async def find_similar_conversations(
    conversation_id: UUID,
    limit: int = Query(5, ge=1, le=20),
    threshold: float = Query(0.7, ge=0.0, le=1.0),
    db: Session = Depends(get_db)
):
    """Find conversations similar to the given one"""
    try:
        # Verify conversation exists
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Find similar conversations using embeddings
        similar_results = await embedding_service.find_similar_conversations(
            str(conversation_id),
            limit=limit,
            threshold=threshold
        )
        
        # Get conversation details from database
        similar_conversations = []
        for result in similar_results:
            conv_id = UUID(result['id'])
            conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
            if conv:
                conv_summary = ConversationSummary.model_validate(conv)
                conv_summary.similarity = result['similarity']
                similar_conversations.append(conv_summary)
        
        return similar_conversations
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to find similar conversations for {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{conversation_id}/links", response_model=List[ConversationLink])
async def get_conversation_links(
    conversation_id: UUID,
    db: Session = Depends(get_db)
):
    """Get all links (relationships) for a conversation"""
    try:
        # Verify conversation exists
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Get both incoming and outgoing links
        outgoing_links = db.query(ConversationLink).filter(
            ConversationLink.from_conversation_id == conversation_id
        ).all()
        
        incoming_links = db.query(ConversationLink).filter(
            ConversationLink.to_conversation_id == conversation_id
        ).all()
        
        all_links = outgoing_links + incoming_links
        
        return [ConversationLink.model_validate(link) for link in all_links]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get links for conversation {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Background task functions
async def update_conversation_embedding(
    conversation_id: UUID,
    title: Optional[str],
    summary: Optional[str],
    project_path: Optional[str]
):
    """Update conversation embedding in background"""
    try:
        # Create new summary text
        summary_parts = []
        if title:
            summary_parts.append(f"Title: {title}")
        if summary:
            summary_parts.append(f"Summary: {summary}")
        if project_path:
            summary_parts.append(f"Project: {project_path}")
        
        conversation_text = ' | '.join(summary_parts)
        
        # Update embedding
        metadata = {
            'conversation_id': str(conversation_id),
            'title': title or '',
            'project_path': project_path or '',
        }
        
        await embedding_service.store_conversation_embedding(
            str(conversation_id),
            conversation_text,
            metadata
        )
        
        logger.info(f"Updated embedding for conversation {conversation_id}")
        
    except Exception as e:
        logger.error(f"Failed to update embedding for conversation {conversation_id}: {e}")


async def delete_conversation_embeddings(conversation_id: UUID):
    """Delete conversation and message embeddings in background"""
    try:
        await embedding_service.delete_conversation_embedding(str(conversation_id))
        logger.info(f"Deleted embeddings for conversation {conversation_id}")
    except Exception as e:
        logger.error(f"Failed to delete embeddings for conversation {conversation_id}: {e}")