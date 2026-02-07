from sqlalchemy import Column, String, Integer, DateTime, Text, ARRAY, Boolean, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.core.database import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=True)
    started_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)
    total_messages = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    project_path = Column(Text, nullable=True)
    tags = Column(ARRAY(Text), default=[])
    summary = Column(Text, nullable=True)
    metadata = Column(JSONB, default={})
    created_at = Column(DateTime, default=func.now())
    updated_at_local = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")
    outgoing_links = relationship(
        "ConversationLink",
        foreign_keys="ConversationLink.from_conversation_id",
        back_populates="from_conversation",
        cascade="all, delete-orphan"
    )
    incoming_links = relationship(
        "ConversationLink",
        foreign_keys="ConversationLink.to_conversation_id",
        back_populates="to_conversation",
        cascade="all, delete-orphan"
    )
    cluster_memberships = relationship(
        "ConversationClusterMember",
        back_populates="conversation",
        cascade="all, delete-orphan"
    )
    topic_associations = relationship(
        "ConversationTopic",
        back_populates="conversation",
        cascade="all, delete-orphan"
    )
    annotations = relationship(
        "UserAnnotation",
        back_populates="conversation",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Conversation(id={self.id}, title={self.title}, started_at={self.started_at})>"


class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)  # 'user', 'assistant', 'system'
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime, nullable=False)
    tokens_used = Column(Integer, nullable=True)
    tool_calls = Column(JSONB, nullable=True)
    file_references = Column(ARRAY(Text), default=[])
    metadata = Column(JSONB, default={})
    created_at = Column(DateTime, default=func.now())

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")

    def __repr__(self):
        return f"<Message(id={self.id}, role={self.role}, conversation_id={self.conversation_id})>"


class ConversationLink(Base):
    __tablename__ = "conversation_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    to_conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    link_type = Column(String(50), nullable=False)  # 'related', 'continuation', 'manual', 'semantic', 'temporal'
    similarity_score = Column(Float, nullable=True)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())

    # Relationships
    from_conversation = relationship(
        "Conversation",
        foreign_keys=[from_conversation_id],
        back_populates="outgoing_links"
    )
    to_conversation = relationship(
        "Conversation",
        foreign_keys=[to_conversation_id],
        back_populates="incoming_links"
    )

    def __repr__(self):
        return f"<ConversationLink(from={self.from_conversation_id}, to={self.to_conversation_id}, type={self.link_type})>"


class ConversationCluster(Base):
    __tablename__ = "conversation_clusters"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    color = Column(String(7), default='#6366f1')  # hex color
    auto_generated = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    members = relationship("ConversationClusterMember", back_populates="cluster", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<ConversationCluster(id={self.id}, name={self.name})>"


class ConversationClusterMember(Base):
    __tablename__ = "conversation_cluster_members"

    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True)
    cluster_id = Column(UUID(as_uuid=True), ForeignKey("conversation_clusters.id", ondelete="CASCADE"), primary_key=True)
    confidence_score = Column(Float, nullable=True)
    assigned_at = Column(DateTime, default=func.now())

    # Relationships
    conversation = relationship("Conversation", back_populates="cluster_memberships")
    cluster = relationship("ConversationCluster", back_populates="members")

    def __repr__(self):
        return f"<ConversationClusterMember(conversation_id={self.conversation_id}, cluster_id={self.cluster_id})>"


class Topic(Base):
    __tablename__ = "topics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    parent_topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=True)
    frequency_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=func.now())

    # Self-referencing relationship for topic hierarchy
    parent_topic = relationship("Topic", remote_side=[id])
    
    # Relationships
    conversation_associations = relationship("ConversationTopic", back_populates="topic", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Topic(id={self.id}, name={self.name})>"


class ConversationTopic(Base):
    __tablename__ = "conversation_topics"

    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True)
    relevance_score = Column(Float, nullable=True)

    # Relationships
    conversation = relationship("Conversation", back_populates="topic_associations")
    topic = relationship("Topic", back_populates="conversation_associations")

    def __repr__(self):
        return f"<ConversationTopic(conversation_id={self.conversation_id}, topic_id={self.topic_id})>"


class UserAnnotation(Base):
    __tablename__ = "user_annotations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    annotation_type = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    user_id = Column(String(255), nullable=True)  # for multi-user support
    created_at = Column(DateTime, default=func.now())

    # Relationships
    conversation = relationship("Conversation", back_populates="annotations")

    def __repr__(self):
        return f"<UserAnnotation(id={self.id}, type={self.annotation_type})>"


class SearchQuery(Base):
    __tablename__ = "search_queries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query_text = Column(Text, nullable=False)
    query_type = Column(String(50), nullable=True)  # 'text', 'semantic', 'hybrid'
    results_count = Column(Integer, nullable=True)
    execution_time_ms = Column(Integer, nullable=True)
    user_id = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=func.now())

    def __repr__(self):
        return f"<SearchQuery(id={self.id}, query={self.query_text[:50]})>"