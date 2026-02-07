import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
import asyncio
import uuid
from sqlalchemy.orm import Session

from app.models import Conversation, Message
from app.services.embedding_service import embedding_service
from app.core.config import settings


logger = logging.getLogger(__name__)


class ConversationImporter:
    def __init__(self, db: Session):
        self.db = db

    async def import_from_json(self, json_path: Path, project_path: Optional[str] = None) -> Dict[str, Any]:
        """Import a Claude Code conversation from JSON file"""
        try:
            logger.info(f"Importing conversation from {json_path}")
            
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Parse conversation metadata
            conversation_data = self._parse_conversation_metadata(data, project_path)
            
            # Check if conversation already exists
            existing_conv = self.db.query(Conversation).filter(
                Conversation.started_at == conversation_data['started_at'],
                Conversation.project_path == conversation_data.get('project_path')
            ).first()
            
            if existing_conv:
                logger.info(f"Conversation already exists: {existing_conv.id}")
                return {
                    'success': True,
                    'conversation_id': str(existing_conv.id),
                    'status': 'already_exists'
                }
            
            # Create new conversation
            conversation = Conversation(**conversation_data)
            self.db.add(conversation)
            self.db.flush()  # Get the ID
            
            # Parse and import messages
            messages_data = self._parse_messages(data, conversation.id)
            
            if messages_data:
                messages = [Message(**msg_data) for msg_data in messages_data]
                self.db.add_all(messages)
                
                # Update conversation statistics
                conversation.total_messages = len(messages)
                conversation.total_tokens = sum(msg.tokens_used or 0 for msg in messages)
            
            self.db.commit()
            
            # Generate embeddings asynchronously
            await self._generate_embeddings(conversation, messages_data if messages_data else [])
            
            logger.info(f"Successfully imported conversation {conversation.id} with {len(messages_data)} messages")
            
            return {
                'success': True,
                'conversation_id': str(conversation.id),
                'total_messages': len(messages_data),
                'status': 'imported'
            }
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to import conversation from {json_path}: {e}")
            raise

    def _parse_conversation_metadata(self, data: Dict[str, Any], project_path: Optional[str] = None) -> Dict[str, Any]:
        """Extract conversation metadata from JSON data"""
        
        # Different formats of Claude Code exports - handle various structures
        conversation_data = {}
        
        # Try to extract title
        title = None
        if 'title' in data:
            title = data['title']
        elif 'name' in data:
            title = data['name']
        elif 'messages' in data and data['messages']:
            # Generate title from first user message
            first_user_msg = next((msg for msg in data['messages'] if msg.get('role') == 'user'), None)
            if first_user_msg and 'content' in first_user_msg:
                title = first_user_msg['content'][:100] + "..." if len(first_user_msg['content']) > 100 else first_user_msg['content']
        
        # Extract timestamps
        started_at = None
        updated_at = None
        
        if 'created_at' in data:
            started_at = self._parse_timestamp(data['created_at'])
        elif 'timestamp' in data:
            started_at = self._parse_timestamp(data['timestamp'])
        elif 'messages' in data and data['messages']:
            # Use first message timestamp
            first_msg = data['messages'][0]
            if 'timestamp' in first_msg:
                started_at = self._parse_timestamp(first_msg['timestamp'])
        
        if 'updated_at' in data:
            updated_at = self._parse_timestamp(data['updated_at'])
        elif 'messages' in data and data['messages']:
            # Use last message timestamp
            last_msg = data['messages'][-1]
            if 'timestamp' in last_msg:
                updated_at = self._parse_timestamp(last_msg['timestamp'])
        
        # Default to now if no timestamps found
        if not started_at:
            started_at = datetime.utcnow()
        if not updated_at:
            updated_at = started_at
        
        conversation_data.update({
            'title': title,
            'started_at': started_at,
            'updated_at': updated_at,
            'project_path': project_path,
            'metadata': {
                'import_source': 'claude_code_json',
                'original_data': {
                    'export_version': data.get('version'),
                    'export_format': data.get('format'),
                }
            }
        })
        
        # Extract tags if present
        if 'tags' in data:
            conversation_data['tags'] = data['tags'] if isinstance(data['tags'], list) else [data['tags']]
        
        return conversation_data

    def _parse_messages(self, data: Dict[str, Any], conversation_id: uuid.UUID) -> List[Dict[str, Any]]:
        """Extract messages from JSON data"""
        messages = []
        
        if 'messages' not in data:
            logger.warning("No messages found in JSON data")
            return messages
        
        for msg_data in data['messages']:
            try:
                message_info = self._parse_single_message(msg_data, conversation_id)
                if message_info:
                    messages.append(message_info)
            except Exception as e:
                logger.error(f"Failed to parse message: {e}")
                continue
        
        return messages

    def _parse_single_message(self, msg_data: Dict[str, Any], conversation_id: uuid.UUID) -> Optional[Dict[str, Any]]:
        """Parse a single message from JSON data"""
        
        # Extract role
        role = msg_data.get('role', 'unknown')
        if role not in ['user', 'assistant', 'system']:
            logger.warning(f"Unknown message role: {role}")
            role = 'unknown'
        
        # Extract content
        content = msg_data.get('content', '')
        if isinstance(content, list):
            # Handle content that might be a list of content blocks
            content_parts = []
            for part in content:
                if isinstance(part, dict):
                    if 'text' in part:
                        content_parts.append(part['text'])
                    elif 'content' in part:
                        content_parts.append(str(part['content']))
                else:
                    content_parts.append(str(part))
            content = '\n'.join(content_parts)
        
        if not content:
            logger.warning("Empty message content, skipping")
            return None
        
        # Extract timestamp
        timestamp = None
        if 'timestamp' in msg_data:
            timestamp = self._parse_timestamp(msg_data['timestamp'])
        
        if not timestamp:
            timestamp = datetime.utcnow()
        
        # Extract tool calls if present
        tool_calls = None
        if 'tool_calls' in msg_data:
            tool_calls = msg_data['tool_calls']
        elif 'function_calls' in msg_data:
            tool_calls = msg_data['function_calls']
        
        # Extract file references
        file_references = []
        if 'file_references' in msg_data:
            file_references = msg_data['file_references']
        else:
            # Try to extract file paths from content
            file_references = self._extract_file_references(content)
        
        # Calculate token usage (rough estimate)
        tokens_used = msg_data.get('tokens_used')
        if not tokens_used:
            # Rough token estimation: ~4 characters per token
            tokens_used = max(1, len(content) // 4)
        
        return {
            'conversation_id': conversation_id,
            'role': role,
            'content': content,
            'timestamp': timestamp,
            'tokens_used': tokens_used,
            'tool_calls': tool_calls,
            'file_references': file_references,
            'metadata': {
                'import_source': 'claude_code_json',
                'original_message_id': msg_data.get('id'),
                'has_tool_calls': bool(tool_calls),
                'file_count': len(file_references)
            }
        }

    def _parse_timestamp(self, timestamp_str: str) -> Optional[datetime]:
        """Parse various timestamp formats"""
        if not timestamp_str:
            return None
        
        # List of common timestamp formats
        formats = [
            '%Y-%m-%dT%H:%M:%S.%fZ',  # ISO format with microseconds
            '%Y-%m-%dT%H:%M:%SZ',     # ISO format without microseconds
            '%Y-%m-%dT%H:%M:%S',      # ISO format without timezone
            '%Y-%m-%d %H:%M:%S',      # Standard datetime format
            '%Y-%m-%d %H:%M:%S.%f',   # Standard datetime with microseconds
            '%Y/%m/%d %H:%M:%S',      # Alternative date separator
        ]
        
        for fmt in formats:
            try:
                return datetime.strptime(timestamp_str, fmt)
            except ValueError:
                continue
        
        # If all formats fail, try to parse as timestamp (Unix epoch)
        try:
            timestamp_float = float(timestamp_str)
            return datetime.fromtimestamp(timestamp_float)
        except (ValueError, TypeError):
            pass
        
        logger.warning(f"Could not parse timestamp: {timestamp_str}")
        return None

    def _extract_file_references(self, content: str) -> List[str]:
        """Extract file paths mentioned in message content"""
        import re
        
        file_references = []
        
        # Patterns for common file path formats
        patterns = [
            r'/[^\s]*\.\w+',  # Unix-style paths
            r'[A-Z]:\\[^\s]*\.\w+',  # Windows-style paths
            r'\./[^\s]*\.\w+',  # Relative paths starting with ./
            r'[^\s]*\.(py|js|ts|jsx|tsx|json|md|txt|csv|xml|html|css|scss|sql|yaml|yml|toml|ini|env)',  # Common file extensions
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            file_references.extend(matches)
        
        # Remove duplicates and clean up
        file_references = list(set(file_references))
        file_references = [ref.strip() for ref in file_references if len(ref.strip()) > 0]
        
        return file_references

    async def _generate_embeddings(self, conversation: Conversation, messages_data: List[Dict[str, Any]]):
        """Generate embeddings for conversation and messages"""
        try:
            # Generate conversation summary for embedding
            conversation_text = self._create_conversation_summary(conversation, messages_data)
            
            # Store conversation embedding
            conversation_metadata = {
                'conversation_id': str(conversation.id),
                'title': conversation.title or '',
                'started_at': conversation.started_at.isoformat(),
                'project_path': conversation.project_path or '',
                'total_messages': conversation.total_messages,
                'tags': conversation.tags or []
            }
            
            await embedding_service.store_conversation_embedding(
                str(conversation.id),
                conversation_text,
                conversation_metadata
            )
            
            # Generate message embeddings in batches
            if messages_data:
                message_ids = [str(msg['id']) if 'id' in msg else str(uuid.uuid4()) for msg in messages_data]
                message_texts = [msg['content'] for msg in messages_data]
                message_metadatas = []
                
                for msg in messages_data:
                    metadata = {
                        'conversation_id': str(conversation.id),
                        'role': msg['role'],
                        'timestamp': msg['timestamp'].isoformat(),
                        'project_path': conversation.project_path or '',
                        'has_tool_calls': bool(msg.get('tool_calls')),
                        'file_references': msg.get('file_references', [])
                    }
                    message_metadatas.append(metadata)
                
                await embedding_service.store_message_embeddings(
                    message_ids,
                    message_texts,
                    message_metadatas
                )
            
        except Exception as e:
            logger.error(f"Failed to generate embeddings: {e}")
            # Don't raise here - embeddings are not critical for import success

    def _create_conversation_summary(self, conversation: Conversation, messages_data: List[Dict[str, Any]]) -> str:
        """Create a summary text for conversation embedding"""
        summary_parts = []
        
        # Add title if available
        if conversation.title:
            summary_parts.append(f"Title: {conversation.title}")
        
        # Add project context if available
        if conversation.project_path:
            summary_parts.append(f"Project: {conversation.project_path}")
        
        # Add first user message (often contains the main question/topic)
        first_user_message = next((msg for msg in messages_data if msg['role'] == 'user'), None)
        if first_user_message:
            content = first_user_message['content'][:500]  # Limit length
            summary_parts.append(f"Initial query: {content}")
        
        # Add assistant's first response (often contains the main topic/approach)
        first_assistant_message = next((msg for msg in messages_data if msg['role'] == 'assistant'), None)
        if first_assistant_message:
            content = first_assistant_message['content'][:300]  # Limit length
            summary_parts.append(f"Response approach: {content}")
        
        # Add file references if any
        all_files = []
        for msg in messages_data:
            all_files.extend(msg.get('file_references', []))
        if all_files:
            unique_files = list(set(all_files))[:10]  # Limit to first 10 unique files
            summary_parts.append(f"Files mentioned: {', '.join(unique_files)}")
        
        return ' | '.join(summary_parts)

    async def import_directory(self, directory_path: Path, file_pattern: str = "*.json") -> Dict[str, Any]:
        """Import multiple conversations from a directory"""
        results = {
            'total_files': 0,
            'successful_imports': 0,
            'failed_imports': 0,
            'already_existing': 0,
            'errors': []
        }
        
        json_files = list(directory_path.glob(file_pattern))
        results['total_files'] = len(json_files)
        
        logger.info(f"Found {len(json_files)} JSON files in {directory_path}")
        
        for json_file in json_files:
            try:
                result = await self.import_from_json(json_file, project_path=str(directory_path))
                
                if result['success']:
                    if result['status'] == 'imported':
                        results['successful_imports'] += 1
                    elif result['status'] == 'already_exists':
                        results['already_existing'] += 1
                else:
                    results['failed_imports'] += 1
                    
            except Exception as e:
                results['failed_imports'] += 1
                results['errors'].append(f"{json_file.name}: {str(e)}")
                logger.error(f"Failed to import {json_file}: {e}")
        
        return results