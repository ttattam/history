from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from typing import List
from uuid import UUID
import logging
import numpy as np
from sklearn.cluster import HDBSCAN
import asyncio

from app.core.database import get_db
from app.models import (
    ConversationCluster,
    ConversationClusterMember,
    Conversation
)
from app.api.schemas import (
    Cluster,
    ClusterCreate,
    ClusterUpdate,
    ClusterWithConversations,
    ConversationSummary,
    ClusterMembership,
    APIResponse
)
from app.services.embedding_service import embedding_service
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=List[ClusterWithConversations])
async def list_clusters(
    include_conversations: bool = True,
    db: Session = Depends(get_db)
):
    """List all conversation clusters"""
    try:
        query = db.query(ConversationCluster)
        
        if include_conversations:
            query = query.options(
                joinedload(ConversationCluster.members)
                .joinedload(ConversationClusterMember.conversation)
            )
        
        clusters = query.order_by(ConversationCluster.created_at.desc()).all()
        
        result = []
        for cluster in clusters:
            cluster_dict = ClusterWithConversations.model_validate(cluster).model_dump()
            
            if include_conversations:
                conversations = []
                for member in cluster.members:
                    if member.conversation:
                        conv_summary = ConversationSummary.model_validate(member.conversation)
                        conversations.append(conv_summary)
                
                cluster_dict['conversations'] = conversations
                cluster_dict['conversation_count'] = len(conversations)
            
            result.append(ClusterWithConversations(**cluster_dict))
        
        return result
        
    except Exception as e:
        logger.error(f"Failed to list clusters: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=Cluster)
async def create_cluster(
    cluster_data: ClusterCreate,
    db: Session = Depends(get_db)
):
    """Create a new conversation cluster"""
    try:
        # Check if cluster name already exists
        existing = db.query(ConversationCluster).filter(
            ConversationCluster.name == cluster_data.name
        ).first()
        
        if existing:
            raise HTTPException(status_code=400, detail="Cluster name already exists")
        
        cluster = ConversationCluster(**cluster_data.model_dump())
        db.add(cluster)
        db.commit()
        db.refresh(cluster)
        
        return Cluster.model_validate(cluster)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create cluster: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{cluster_id}", response_model=ClusterWithConversations)
async def get_cluster(
    cluster_id: UUID,
    db: Session = Depends(get_db)
):
    """Get a specific cluster with its conversations"""
    try:
        cluster = db.query(ConversationCluster).options(
            joinedload(ConversationCluster.members)
            .joinedload(ConversationClusterMember.conversation)
        ).filter(ConversationCluster.id == cluster_id).first()
        
        if not cluster:
            raise HTTPException(status_code=404, detail="Cluster not found")
        
        cluster_dict = ClusterWithConversations.model_validate(cluster).model_dump()
        
        conversations = []
        for member in cluster.members:
            if member.conversation:
                conv_summary = ConversationSummary.model_validate(member.conversation)
                conversations.append(conv_summary)
        
        cluster_dict['conversations'] = conversations
        cluster_dict['conversation_count'] = len(conversations)
        
        return ClusterWithConversations(**cluster_dict)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get cluster {cluster_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{cluster_id}", response_model=Cluster)
async def update_cluster(
    cluster_id: UUID,
    update_data: ClusterUpdate,
    db: Session = Depends(get_db)
):
    """Update cluster information"""
    try:
        cluster = db.query(ConversationCluster).filter(
            ConversationCluster.id == cluster_id
        ).first()
        
        if not cluster:
            raise HTTPException(status_code=404, detail="Cluster not found")
        
        # Update fields
        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(cluster, field, value)
        
        db.commit()
        db.refresh(cluster)
        
        return Cluster.model_validate(cluster)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update cluster {cluster_id}: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{cluster_id}", response_model=APIResponse)
async def delete_cluster(
    cluster_id: UUID,
    db: Session = Depends(get_db)
):
    """Delete a cluster (conversations remain but are unclustered)"""
    try:
        cluster = db.query(ConversationCluster).filter(
            ConversationCluster.id == cluster_id
        ).first()
        
        if not cluster:
            raise HTTPException(status_code=404, detail="Cluster not found")
        
        db.delete(cluster)
        db.commit()
        
        return APIResponse(
            success=True,
            message=f"Cluster {cluster_id} deleted successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete cluster {cluster_id}: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{cluster_id}/conversations/{conversation_id}", response_model=APIResponse)
async def add_conversation_to_cluster(
    cluster_id: UUID,
    conversation_id: UUID,
    confidence_score: float = 1.0,
    db: Session = Depends(get_db)
):
    """Manually add a conversation to a cluster"""
    try:
        # Verify cluster exists
        cluster = db.query(ConversationCluster).filter(
            ConversationCluster.id == cluster_id
        ).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="Cluster not found")
        
        # Verify conversation exists
        conversation = db.query(Conversation).filter(
            Conversation.id == conversation_id
        ).first()
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Check if already in cluster
        existing = db.query(ConversationClusterMember).filter(
            ConversationClusterMember.conversation_id == conversation_id,
            ConversationClusterMember.cluster_id == cluster_id
        ).first()
        
        if existing:
            return APIResponse(
                success=True,
                message="Conversation already in cluster"
            )
        
        # Add to cluster
        membership = ConversationClusterMember(
            conversation_id=conversation_id,
            cluster_id=cluster_id,
            confidence_score=confidence_score
        )
        db.add(membership)
        db.commit()
        
        return APIResponse(
            success=True,
            message="Conversation added to cluster successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to add conversation to cluster: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{cluster_id}/conversations/{conversation_id}", response_model=APIResponse)
async def remove_conversation_from_cluster(
    cluster_id: UUID,
    conversation_id: UUID,
    db: Session = Depends(get_db)
):
    """Remove a conversation from a cluster"""
    try:
        membership = db.query(ConversationClusterMember).filter(
            ConversationClusterMember.conversation_id == conversation_id,
            ConversationClusterMember.cluster_id == cluster_id
        ).first()
        
        if not membership:
            raise HTTPException(status_code=404, detail="Conversation not found in cluster")
        
        db.delete(membership)
        db.commit()
        
        return APIResponse(
            success=True,
            message="Conversation removed from cluster successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to remove conversation from cluster: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auto-generate", response_model=APIResponse)
async def auto_generate_clusters(
    min_cluster_size: int = 3,
    max_clusters: int = 20,
    similarity_threshold: float = 0.8,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    """Automatically generate clusters based on conversation similarity"""
    try:
        # Run clustering in background if requested
        if background_tasks:
            background_tasks.add_task(
                _perform_auto_clustering,
                db,
                min_cluster_size,
                max_clusters,
                similarity_threshold
            )
            
            return APIResponse(
                success=True,
                message="Auto-clustering started in background"
            )
        else:
            # Run synchronously
            result = await _perform_auto_clustering(
                db, min_cluster_size, max_clusters, similarity_threshold
            )
            
            return APIResponse(
                success=True,
                message=f"Generated {result['clusters_created']} clusters with {result['conversations_clustered']} conversations",
                data=result
            )
        
    except Exception as e:
        logger.error(f"Failed to generate clusters: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/stats")
async def get_cluster_analytics(db: Session = Depends(get_db)):
    """Get clustering analytics and statistics"""
    try:
        # Get cluster statistics
        total_clusters = db.query(ConversationCluster).count()
        auto_clusters = db.query(ConversationCluster).filter(
            ConversationCluster.auto_generated == True
        ).count()
        manual_clusters = total_clusters - auto_clusters
        
        # Get conversation clustering statistics
        total_conversations = db.query(Conversation).count()
        clustered_conversations = db.query(ConversationClusterMember.conversation_id).distinct().count()
        unclustered_conversations = total_conversations - clustered_conversations
        
        # Get cluster size distribution
        from sqlalchemy import func
        cluster_sizes = db.query(
            ConversationCluster.id,
            ConversationCluster.name,
            func.count(ConversationClusterMember.conversation_id).label('size')
        ).outerjoin(ConversationClusterMember).group_by(
            ConversationCluster.id,
            ConversationCluster.name
        ).all()
        
        return {
            'total_clusters': total_clusters,
            'auto_generated_clusters': auto_clusters,
            'manual_clusters': manual_clusters,
            'total_conversations': total_conversations,
            'clustered_conversations': clustered_conversations,
            'unclustered_conversations': unclustered_conversations,
            'clustering_percentage': round((clustered_conversations / total_conversations * 100) if total_conversations > 0 else 0, 2),
            'cluster_sizes': [
                {
                    'cluster_id': str(cluster_id),
                    'cluster_name': name,
                    'size': size
                }
                for cluster_id, name, size in cluster_sizes
            ]
        }
        
    except Exception as e:
        logger.error(f"Failed to get cluster analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _perform_auto_clustering(
    db: Session,
    min_cluster_size: int,
    max_clusters: int,
    similarity_threshold: float
) -> dict:
    """Perform automatic clustering of conversations"""
    try:
        logger.info("Starting automatic clustering...")
        
        # Get all conversations
        conversations = db.query(Conversation).all()
        
        if len(conversations) < min_cluster_size:
            logger.warning("Not enough conversations for clustering")
            return {
                'clusters_created': 0,
                'conversations_clustered': 0,
                'message': 'Not enough conversations for clustering'
            }
        
        # Get conversation IDs
        conv_ids = [str(conv.id) for conv in conversations]
        
        # Calculate similarity matrix using embeddings
        similarity_matrix = await embedding_service.calculate_similarity_matrix(conv_ids)
        
        # Convert similarity to distance for clustering
        distance_matrix = 1 - similarity_matrix
        
        # Perform HDBSCAN clustering
        clusterer = HDBSCAN(
            metric='precomputed',
            min_cluster_size=min_cluster_size,
            cluster_selection_epsilon=1 - similarity_threshold
        )
        
        cluster_labels = clusterer.fit_predict(distance_matrix)
        
        # Create clusters
        clusters_created = 0
        conversations_clustered = 0
        
        unique_labels = set(cluster_labels)
        unique_labels.discard(-1)  # Remove noise label
        
        for label in unique_labels:
            if clusters_created >= max_clusters:
                break
            
            # Get conversations in this cluster
            cluster_conv_indices = np.where(cluster_labels == label)[0]
            cluster_conversations = [conversations[i] for i in cluster_conv_indices]
            
            if len(cluster_conversations) < min_cluster_size:
                continue
            
            # Generate cluster name and description
            cluster_name, cluster_description = _generate_cluster_info(cluster_conversations)
            
            # Create cluster
            cluster = ConversationCluster(
                name=f"Auto-Cluster {clusters_created + 1}: {cluster_name}",
                description=cluster_description,
                auto_generated=True,
                color=_generate_cluster_color(clusters_created)
            )
            db.add(cluster)
            db.flush()
            
            # Add conversations to cluster
            for conv in cluster_conversations:
                membership = ConversationClusterMember(
                    conversation_id=conv.id,
                    cluster_id=cluster.id,
                    confidence_score=float(clusterer.probabilities_[cluster_conv_indices[0]] if hasattr(clusterer, 'probabilities_') else 0.8)
                )
                db.add(membership)
                conversations_clustered += 1
            
            clusters_created += 1
        
        db.commit()
        
        logger.info(f"Auto-clustering complete: {clusters_created} clusters, {conversations_clustered} conversations")
        
        return {
            'clusters_created': clusters_created,
            'conversations_clustered': conversations_clustered,
            'total_conversations': len(conversations),
            'clustering_percentage': round((conversations_clustered / len(conversations)) * 100, 2)
        }
        
    except Exception as e:
        logger.error(f"Auto-clustering failed: {e}")
        db.rollback()
        raise


def _generate_cluster_info(conversations: List[Conversation]) -> tuple[str, str]:
    """Generate name and description for a cluster based on its conversations"""
    # Extract common themes from titles and summaries
    titles = [conv.title for conv in conversations if conv.title]
    summaries = [conv.summary for conv in conversations if conv.summary]
    
    # Simple keyword extraction (in production, use more sophisticated NLP)
    all_text = ' '.join(titles + summaries).lower()
    
    # Common programming/project keywords to look for
    keywords = [
        'react', 'python', 'javascript', 'api', 'database', 'frontend', 'backend',
        'bug', 'feature', 'testing', 'deployment', 'authentication', 'security',
        'performance', 'ui', 'ux', 'design', 'mobile', 'web', 'data', 'machine learning'
    ]
    
    found_keywords = [kw for kw in keywords if kw in all_text]
    
    # Generate name
    if found_keywords:
        name = ', '.join(found_keywords[:3]).title()
    else:
        # Fallback to project path commonalities
        projects = [conv.project_path for conv in conversations if conv.project_path]
        if projects:
            # Find common path segments
            common_segments = []
            if projects:
                first_segments = projects[0].split('/')
                for segment in first_segments:
                    if all(segment in project for project in projects):
                        common_segments.append(segment)
                name = '/'.join(common_segments[-2:]) if len(common_segments) >= 2 else 'Project Discussions'
        else:
            name = 'Mixed Topics'
    
    # Generate description
    description = f"Automatically generated cluster containing {len(conversations)} related conversations"
    if found_keywords:
        description += f" focused on {', '.join(found_keywords[:5])}"
    
    return name, description


def _generate_cluster_color(index: int) -> str:
    """Generate a color for a cluster based on its index"""
    colors = [
        '#6366f1',  # Indigo
        '#8b5cf6',  # Violet  
        '#06b6d4',  # Cyan
        '#10b981',  # Emerald
        '#f59e0b',  # Amber
        '#ef4444',  # Red
        '#f97316',  # Orange
        '#84cc16',  # Lime
        '#ec4899',  # Pink
        '#6b7280'   # Gray
    ]
    
    return colors[index % len(colors)]