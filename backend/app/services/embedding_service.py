import asyncio
import logging
from typing import List, Dict, Optional, Any, Tuple
import numpy as np
from sentence_transformers import SentenceTransformer
import openai
from openai import OpenAI

from app.core.config import settings
from app.core.database import get_conversation_collection, get_message_collection


logger = logging.getLogger(__name__)


class EmbeddingService:
    def __init__(self):
        self.conversation_collection = get_conversation_collection()
        self.message_collection = get_message_collection()
        
        # Initialize embedding model
        if settings.OPENAI_API_KEY:
            self.openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
            self.use_openai = True
            logger.info("Using OpenAI embeddings")
        else:
            self.sentence_model = SentenceTransformer(settings.SENTENCE_TRANSFORMER_MODEL)
            self.use_openai = False
            logger.info(f"Using SentenceTransformer model: {settings.SENTENCE_TRANSFORMER_MODEL}")

    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for a single text"""
        if self.use_openai:
            return await self._generate_openai_embedding(text)
        else:
            return await self._generate_sentence_transformer_embedding(text)

    async def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts"""
        if self.use_openai:
            return await self._generate_openai_embeddings_batch(texts)
        else:
            return await self._generate_sentence_transformer_embeddings_batch(texts)

    async def _generate_openai_embedding(self, text: str) -> List[float]:
        """Generate single embedding using OpenAI"""
        try:
            response = self.openai_client.embeddings.create(
                input=text,
                model=settings.OPENAI_MODEL
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Failed to generate OpenAI embedding: {e}")
            raise

    async def _generate_openai_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings batch using OpenAI"""
        try:
            # OpenAI has limits, so we batch the requests
            batch_size = 100  # Adjust based on API limits
            embeddings = []
            
            for i in range(0, len(texts), batch_size):
                batch = texts[i:i + batch_size]
                response = self.openai_client.embeddings.create(
                    input=batch,
                    model=settings.OPENAI_MODEL
                )
                batch_embeddings = [item.embedding for item in response.data]
                embeddings.extend(batch_embeddings)
                
            return embeddings
        except Exception as e:
            logger.error(f"Failed to generate OpenAI embeddings batch: {e}")
            raise

    async def _generate_sentence_transformer_embedding(self, text: str) -> List[float]:
        """Generate single embedding using SentenceTransformer"""
        try:
            # Run in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            embedding = await loop.run_in_executor(
                None,
                lambda: self.sentence_model.encode(text).tolist()
            )
            return embedding
        except Exception as e:
            logger.error(f"Failed to generate SentenceTransformer embedding: {e}")
            raise

    async def _generate_sentence_transformer_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings batch using SentenceTransformer"""
        try:
            loop = asyncio.get_event_loop()
            embeddings = await loop.run_in_executor(
                None,
                lambda: self.sentence_model.encode(texts, batch_size=settings.EMBEDDING_BATCH_SIZE).tolist()
            )
            return embeddings
        except Exception as e:
            logger.error(f"Failed to generate SentenceTransformer embeddings batch: {e}")
            raise

    async def store_conversation_embedding(
        self,
        conversation_id: str,
        text: str,
        metadata: Dict[str, Any]
    ) -> None:
        """Store conversation embedding in ChromaDB"""
        try:
            embedding = await self.generate_embedding(text)
            
            self.conversation_collection.add(
                ids=[conversation_id],
                embeddings=[embedding],
                documents=[text],
                metadatas=[metadata]
            )
            
            logger.info(f"Stored embedding for conversation {conversation_id}")
        except Exception as e:
            logger.error(f"Failed to store conversation embedding: {e}")
            raise

    async def store_message_embeddings(
        self,
        message_ids: List[str],
        texts: List[str],
        metadatas: List[Dict[str, Any]]
    ) -> None:
        """Store multiple message embeddings in ChromaDB"""
        try:
            embeddings = await self.generate_embeddings(texts)
            
            self.message_collection.add(
                ids=message_ids,
                embeddings=embeddings,
                documents=texts,
                metadatas=metadatas
            )
            
            logger.info(f"Stored embeddings for {len(message_ids)} messages")
        except Exception as e:
            logger.error(f"Failed to store message embeddings: {e}")
            raise

    async def search_conversations(
        self,
        query: str,
        limit: int = 10,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Search conversations using semantic similarity"""
        try:
            query_embedding = await self.generate_embedding(query)
            
            # Build where clause for filtering
            where_clause = {}
            if filters:
                for key, value in filters.items():
                    if value is not None:
                        where_clause[key] = value

            results = self.conversation_collection.query(
                query_embeddings=[query_embedding],
                n_results=limit,
                where=where_clause if where_clause else None
            )
            
            # Format results
            conversations = []
            if results['ids'] and len(results['ids'][0]) > 0:
                for i in range(len(results['ids'][0])):
                    conversations.append({
                        'id': results['ids'][0][i],
                        'document': results['documents'][0][i],
                        'metadata': results['metadatas'][0][i],
                        'similarity': 1 - results['distances'][0][i] if results['distances'] else None
                    })
            
            return conversations
        except Exception as e:
            logger.error(f"Failed to search conversations: {e}")
            raise

    async def search_messages(
        self,
        query: str,
        limit: int = 20,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Search messages using semantic similarity"""
        try:
            query_embedding = await self.generate_embedding(query)
            
            where_clause = {}
            if filters:
                for key, value in filters.items():
                    if value is not None:
                        where_clause[key] = value

            results = self.message_collection.query(
                query_embeddings=[query_embedding],
                n_results=limit,
                where=where_clause if where_clause else None
            )
            
            # Format results
            messages = []
            if results['ids'] and len(results['ids'][0]) > 0:
                for i in range(len(results['ids'][0])):
                    messages.append({
                        'id': results['ids'][0][i],
                        'document': results['documents'][0][i],
                        'metadata': results['metadatas'][0][i],
                        'similarity': 1 - results['distances'][0][i] if results['distances'] else None
                    })
            
            return messages
        except Exception as e:
            logger.error(f"Failed to search messages: {e}")
            raise

    async def find_similar_conversations(
        self,
        conversation_id: str,
        limit: int = 5,
        threshold: float = 0.7
    ) -> List[Dict[str, Any]]:
        """Find conversations similar to the given conversation"""
        try:
            # Get the conversation's embedding
            result = self.conversation_collection.get(
                ids=[conversation_id],
                include=['embeddings', 'metadatas', 'documents']
            )
            
            if not result['embeddings']:
                logger.warning(f"No embedding found for conversation {conversation_id}")
                return []
            
            embedding = result['embeddings'][0]
            
            # Search for similar conversations (excluding the original)
            results = self.conversation_collection.query(
                query_embeddings=[embedding],
                n_results=limit + 1,  # +1 because the query will return itself
                include=['metadatas', 'documents', 'distances']
            )
            
            # Filter out the original conversation and apply threshold
            similar_conversations = []
            if results['ids'] and len(results['ids'][0]) > 0:
                for i, conv_id in enumerate(results['ids'][0]):
                    if conv_id != conversation_id:
                        similarity = 1 - results['distances'][0][i] if results['distances'] else 0
                        if similarity >= threshold:
                            similar_conversations.append({
                                'id': conv_id,
                                'document': results['documents'][0][i],
                                'metadata': results['metadatas'][0][i],
                                'similarity': similarity
                            })
            
            return similar_conversations[:limit]
        except Exception as e:
            logger.error(f"Failed to find similar conversations: {e}")
            raise

    async def get_conversation_embedding(self, conversation_id: str) -> Optional[List[float]]:
        """Get embedding for a specific conversation"""
        try:
            result = self.conversation_collection.get(
                ids=[conversation_id],
                include=['embeddings']
            )
            
            if result['embeddings']:
                return result['embeddings'][0]
            return None
        except Exception as e:
            logger.error(f"Failed to get conversation embedding: {e}")
            return None

    async def delete_conversation_embedding(self, conversation_id: str) -> None:
        """Delete conversation embedding from ChromaDB"""
        try:
            self.conversation_collection.delete(ids=[conversation_id])
            logger.info(f"Deleted embedding for conversation {conversation_id}")
        except Exception as e:
            logger.error(f"Failed to delete conversation embedding: {e}")
            raise

    async def delete_message_embeddings(self, message_ids: List[str]) -> None:
        """Delete message embeddings from ChromaDB"""
        try:
            self.message_collection.delete(ids=message_ids)
            logger.info(f"Deleted embeddings for {len(message_ids)} messages")
        except Exception as e:
            logger.error(f"Failed to delete message embeddings: {e}")
            raise

    async def calculate_similarity_matrix(
        self, 
        conversation_ids: List[str]
    ) -> np.ndarray:
        """Calculate similarity matrix for a list of conversations"""
        try:
            # Get embeddings for all conversations
            results = self.conversation_collection.get(
                ids=conversation_ids,
                include=['embeddings']
            )
            
            embeddings = np.array(results['embeddings'])
            
            # Calculate cosine similarity matrix
            normalized_embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)
            similarity_matrix = np.dot(normalized_embeddings, normalized_embeddings.T)
            
            return similarity_matrix
        except Exception as e:
            logger.error(f"Failed to calculate similarity matrix: {e}")
            raise


# Global embedding service instance
embedding_service = EmbeddingService()