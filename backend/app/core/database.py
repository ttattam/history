from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import redis
import chromadb
from chromadb.config import Settings as ChromaSettings
from typing import Generator

from .config import settings


# PostgreSQL database setup
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    echo=settings.LOG_LEVEL == "DEBUG"
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator:
    """Database session dependency"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Redis setup
redis_client = redis.from_url(
    settings.REDIS_URL,
    encoding="utf-8",
    decode_responses=True
)


def get_redis() -> redis.Redis:
    """Redis client dependency"""
    return redis_client


# ChromaDB setup
def get_chroma_client():
    """Get ChromaDB client"""
    if settings.CHROMA_URL.startswith("http"):
        # Remote ChromaDB instance
        return chromadb.HttpClient(
            host=settings.CHROMA_URL.split("://")[1].split(":")[0],
            port=int(settings.CHROMA_URL.split(":")[-1])
        )
    else:
        # Local ChromaDB instance
        return chromadb.PersistentClient(
            path=settings.CHROMA_URL,
            settings=ChromaSettings(anonymized_telemetry=False)
        )


# Global ChromaDB client
chroma_client = get_chroma_client()


def get_conversation_collection():
    """Get or create conversation collection in ChromaDB"""
    return chroma_client.get_or_create_collection(
        name=settings.CHROMA_COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"}
    )


def get_message_collection():
    """Get or create message collection in ChromaDB"""
    return chroma_client.get_or_create_collection(
        name=settings.CHROMA_MESSAGE_COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"}
    )