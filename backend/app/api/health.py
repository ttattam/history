from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from app.core.database import get_db, get_redis, chroma_client
from app.api.schemas import HealthCheck
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=HealthCheck)
async def health_check(db: Session = Depends(get_db)):
    """Comprehensive health check for all services"""
    
    health_status = {
        'status': 'healthy',
        'version': settings.PROJECT_VERSION,
        'database': 'unknown',
        'chromadb': 'unknown',
        'redis': 'unknown'
    }
    
    # Check PostgreSQL
    try:
        db.execute(text("SELECT 1"))
        health_status['database'] = 'healthy'
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        health_status['database'] = 'unhealthy'
        health_status['status'] = 'unhealthy'
    
    # Check ChromaDB
    try:
        chroma_client.heartbeat()
        health_status['chromadb'] = 'healthy'
    except Exception as e:
        logger.error(f"ChromaDB health check failed: {e}")
        health_status['chromadb'] = 'unhealthy'
        health_status['status'] = 'degraded' if health_status['status'] == 'healthy' else 'unhealthy'
    
    # Check Redis
    try:
        redis_client = get_redis()
        redis_client.ping()
        health_status['redis'] = 'healthy'
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        health_status['redis'] = 'unhealthy'
        health_status['status'] = 'degraded' if health_status['status'] == 'healthy' else 'unhealthy'
    
    return HealthCheck(**health_status)


@router.get("/database")
async def database_health(db: Session = Depends(get_db)):
    """Detailed database health information"""
    try:
        # Basic connectivity
        db.execute(text("SELECT 1"))
        
        # Get database statistics
        stats_query = text("""
            SELECT 
                schemaname,
                tablename,
                n_tup_ins as inserts,
                n_tup_upd as updates,
                n_tup_del as deletes
            FROM pg_stat_user_tables
            WHERE schemaname = 'public'
            ORDER BY tablename
        """)
        
        table_stats = db.execute(stats_query).fetchall()
        
        # Get conversation count
        conv_count_query = text("SELECT COUNT(*) FROM conversations")
        conversation_count = db.execute(conv_count_query).scalar()
        
        # Get message count
        msg_count_query = text("SELECT COUNT(*) FROM messages")
        message_count = db.execute(msg_count_query).scalar()
        
        # Get recent activity
        recent_query = text("""
            SELECT COUNT(*) FROM conversations 
            WHERE created_at >= NOW() - INTERVAL '7 days'
        """)
        recent_conversations = db.execute(recent_query).scalar()
        
        return {
            'status': 'healthy',
            'connection': 'active',
            'statistics': {
                'total_conversations': conversation_count,
                'total_messages': message_count,
                'recent_conversations_7d': recent_conversations,
                'table_stats': [
                    {
                        'schema': row.schemaname,
                        'table': row.tablename,
                        'inserts': row.inserts,
                        'updates': row.updates,
                        'deletes': row.deletes
                    }
                    for row in table_stats
                ]
            }
        }
        
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        raise HTTPException(status_code=503, detail=f"Database unhealthy: {str(e)}")


@router.get("/chromadb")
async def chromadb_health():
    """Detailed ChromaDB health information"""
    try:
        # Basic connectivity
        heartbeat = chroma_client.heartbeat()
        
        # Get collection information
        collections = chroma_client.list_collections()
        
        collection_info = []
        for collection in collections:
            try:
                count = collection.count()
                collection_info.append({
                    'name': collection.name,
                    'document_count': count,
                    'metadata': collection.metadata or {}
                })
            except Exception as e:
                collection_info.append({
                    'name': collection.name,
                    'error': str(e)
                })
        
        return {
            'status': 'healthy',
            'heartbeat': heartbeat,
            'collections': collection_info,
            'total_collections': len(collections)
        }
        
    except Exception as e:
        logger.error(f"ChromaDB health check failed: {e}")
        raise HTTPException(status_code=503, detail=f"ChromaDB unhealthy: {str(e)}")


@router.get("/redis")
async def redis_health():
    """Detailed Redis health information"""
    try:
        redis_client = get_redis()
        
        # Basic connectivity
        ping_result = redis_client.ping()
        
        # Get Redis info
        info = redis_client.info()
        
        # Get memory usage
        memory_info = redis_client.info('memory')
        
        # Get keyspace info
        keyspace_info = redis_client.info('keyspace')
        
        return {
            'status': 'healthy',
            'ping': ping_result,
            'server_info': {
                'version': info.get('redis_version'),
                'mode': info.get('redis_mode'),
                'uptime_seconds': info.get('uptime_in_seconds'),
                'connected_clients': info.get('connected_clients')
            },
            'memory': {
                'used_memory': memory_info.get('used_memory'),
                'used_memory_human': memory_info.get('used_memory_human'),
                'used_memory_peak': memory_info.get('used_memory_peak'),
                'used_memory_peak_human': memory_info.get('used_memory_peak_human')
            },
            'keyspace': keyspace_info
        }
        
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        raise HTTPException(status_code=503, detail=f"Redis unhealthy: {str(e)}")


@router.get("/system")
async def system_health():
    """System-level health information"""
    import psutil
    import os
    
    try:
        # CPU usage
        cpu_percent = psutil.cpu_percent(interval=1)
        
        # Memory usage
        memory = psutil.virtual_memory()
        
        # Disk usage
        disk = psutil.disk_usage('/')
        
        # Process info
        process = psutil.Process()
        process_info = {
            'pid': os.getpid(),
            'cpu_percent': process.cpu_percent(),
            'memory_percent': process.memory_percent(),
            'memory_info': process.memory_info()._asdict(),
            'create_time': process.create_time(),
            'num_threads': process.num_threads()
        }
        
        return {
            'status': 'healthy',
            'system': {
                'cpu_percent': cpu_percent,
                'memory': {
                    'total': memory.total,
                    'available': memory.available,
                    'percent': memory.percent,
                    'used': memory.used,
                    'free': memory.free
                },
                'disk': {
                    'total': disk.total,
                    'used': disk.used,
                    'free': disk.free,
                    'percent': (disk.used / disk.total) * 100
                }
            },
            'process': process_info
        }
        
    except Exception as e:
        logger.error(f"System health check failed: {e}")
        return {
            'status': 'error',
            'error': str(e)
        }