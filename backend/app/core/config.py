from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    # Database configuration
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/claude_history"
    
    # ChromaDB configuration
    CHROMA_URL: str = "http://localhost:8000"
    CHROMA_COLLECTION_NAME: str = "claude_conversations"
    CHROMA_MESSAGE_COLLECTION_NAME: str = "claude_messages"
    
    # Redis configuration
    REDIS_URL: str = "redis://localhost:6379"
    
    # OpenAI configuration (optional, falls back to sentence-transformers)
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "text-embedding-3-small"
    
    # Sentence transformers model (used as fallback)
    SENTENCE_TRANSFORMER_MODEL: str = "all-MiniLM-L6-v2"
    
    # API configuration
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Claude Code History API"
    PROJECT_VERSION: str = "1.0.0"
    
    # Search configuration
    MAX_SEARCH_RESULTS: int = 50
    SIMILARITY_THRESHOLD: float = 0.7
    
    # Clustering configuration
    AUTO_CLUSTER_THRESHOLD: float = 0.8
    MIN_CLUSTER_SIZE: int = 2
    
    # Embedding configuration
    EMBEDDING_BATCH_SIZE: int = 100
    EMBEDDING_DIMENSIONS: int = 384  # for sentence-transformers
    
    # Data paths
    DATA_DIR: str = "/app/data"
    EXPORT_DIR: str = "/app/data/exports"
    
    # Logging
    LOG_LEVEL: str = "INFO"
    
    # Security
    SECRET_KEY: str = "your-secret-key-here-change-in-production"
    ALLOWED_HOSTS: list[str] = ["*"]
    
    class Config:
        case_sensitive = True
        env_file = ".env"


# Global settings instance
settings = Settings()