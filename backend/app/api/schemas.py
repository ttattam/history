from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from uuid import UUID


# Base schemas
class ConversationBase(BaseModel):
    title: Optional[str] = None
    project_path: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    summary: Optional[str] = None


class ConversationCreate(ConversationBase):
    started_at: datetime
    updated_at: datetime
    total_messages: int = 0
    total_tokens: int = 0
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    tags: Optional[List[str]] = None
    summary: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class Conversation(ConversationBase):
    id: UUID
    started_at: datetime
    updated_at: datetime
    total_messages: int
    total_tokens: int
    metadata: Dict[str, Any]
    created_at: datetime
    updated_at_local: datetime

    class Config:
        from_attributes = True


class ConversationWithMessages(Conversation):
    messages: List['Message'] = Field(default_factory=list)


class ConversationSummary(BaseModel):
    id: UUID
    title: Optional[str]
    started_at: datetime
    total_messages: int
    project_path: Optional[str]
    tags: List[str]
    similarity: Optional[float] = None

    class Config:
        from_attributes = True


# Message schemas
class MessageBase(BaseModel):
    role: str = Field(..., regex="^(user|assistant|system)$")
    content: str
    file_references: List[str] = Field(default_factory=list)


class MessageCreate(MessageBase):
    conversation_id: UUID
    timestamp: datetime
    tokens_used: Optional[int] = None
    tool_calls: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class Message(MessageBase):
    id: UUID
    conversation_id: UUID
    timestamp: datetime
    tokens_used: Optional[int]
    tool_calls: Optional[Dict[str, Any]]
    metadata: Dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True


class MessageWithSimilarity(Message):
    similarity: Optional[float] = None


# Link schemas
class ConversationLinkBase(BaseModel):
    link_type: str = Field(..., regex="^(related|continuation|manual|semantic|temporal)$")
    reason: Optional[str] = None


class ConversationLinkCreate(ConversationLinkBase):
    from_conversation_id: UUID
    to_conversation_id: UUID
    similarity_score: Optional[float] = None


class ConversationLink(ConversationLinkBase):
    id: UUID
    from_conversation_id: UUID
    to_conversation_id: UUID
    similarity_score: Optional[float]
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationLinkWithDetails(ConversationLink):
    from_conversation: ConversationSummary
    to_conversation: ConversationSummary


# Cluster schemas
class ClusterBase(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = Field(default="#6366f1", regex="^#[0-9a-fA-F]{6}$")


class ClusterCreate(ClusterBase):
    auto_generated: bool = False


class ClusterUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = Field(None, regex="^#[0-9a-fA-F]{6}$")


class Cluster(ClusterBase):
    id: UUID
    auto_generated: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ClusterWithConversations(Cluster):
    conversations: List[ConversationSummary] = Field(default_factory=list)
    conversation_count: int = 0


class ClusterMembership(BaseModel):
    conversation_id: UUID
    cluster_id: UUID
    confidence_score: Optional[float]
    assigned_at: datetime

    class Config:
        from_attributes = True


# Topic schemas
class TopicBase(BaseModel):
    name: str
    description: Optional[str] = None


class TopicCreate(TopicBase):
    parent_topic_id: Optional[UUID] = None


class Topic(TopicBase):
    id: UUID
    parent_topic_id: Optional[UUID]
    frequency_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class TopicWithHierarchy(Topic):
    parent_topic: Optional['Topic'] = None
    child_topics: List['Topic'] = Field(default_factory=list)


# Search schemas
class SearchQuery(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    search_type: str = Field(default="hybrid", regex="^(text|semantic|hybrid)$")
    limit: int = Field(default=10, ge=1, le=100)
    filters: Dict[str, Any] = Field(default_factory=dict)


class SearchFilters(BaseModel):
    project_path: Optional[str] = None
    tags: Optional[List[str]] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    role: Optional[str] = None
    has_file_references: Optional[bool] = None
    min_similarity: Optional[float] = Field(None, ge=0.0, le=1.0)


class ConversationSearchResult(BaseModel):
    conversations: List[ConversationSummary]
    total_count: int
    query_info: Dict[str, Any]


class MessageSearchResult(BaseModel):
    messages: List[MessageWithSimilarity]
    total_count: int
    query_info: Dict[str, Any]


class HybridSearchResult(BaseModel):
    conversations: List[ConversationSummary]
    messages: List[MessageWithSimilarity]
    query_info: Dict[str, Any]


# Import schemas
class ImportRequest(BaseModel):
    file_path: str
    project_path: Optional[str] = None


class ImportDirectoryRequest(BaseModel):
    directory_path: str
    file_pattern: str = "*.json"


class ImportResult(BaseModel):
    success: bool
    conversation_id: Optional[UUID] = None
    total_messages: Optional[int] = None
    status: str
    error: Optional[str] = None


class ImportDirectoryResult(BaseModel):
    total_files: int
    successful_imports: int
    failed_imports: int
    already_existing: int
    errors: List[str] = Field(default_factory=list)


# Analytics schemas
class ConversationStats(BaseModel):
    total_conversations: int
    total_messages: int
    total_tokens: int
    conversations_by_month: Dict[str, int]
    most_common_tags: List[Dict[str, Union[str, int]]]
    top_projects: List[Dict[str, Union[str, int]]]


class TopicStats(BaseModel):
    topic: Topic
    conversation_count: int
    relevance_scores: List[float]
    avg_relevance: float


# Annotation schemas
class AnnotationBase(BaseModel):
    annotation_type: str
    content: str


class AnnotationCreate(AnnotationBase):
    conversation_id: UUID
    user_id: Optional[str] = None


class Annotation(AnnotationBase):
    id: UUID
    conversation_id: UUID
    user_id: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# Response schemas
class APIResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    data: Optional[Any] = None
    error: Optional[str] = None


class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    size: int
    pages: int


# Health check schema
class HealthCheck(BaseModel):
    status: str
    version: str
    database: str
    chromadb: str
    redis: str


# Update forward references
ConversationWithMessages.model_rebuild()
TopicWithHierarchy.model_rebuild()