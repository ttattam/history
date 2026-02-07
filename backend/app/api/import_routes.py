from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from sqlalchemy.orm import Session
from pathlib import Path
import tempfile
import json
import logging

from app.core.database import get_db
from app.api.schemas import (
    ImportRequest,
    ImportDirectoryRequest,
    ImportResult,
    ImportDirectoryResult,
    APIResponse
)
from app.services.conversation_importer import ConversationImporter
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/conversation", response_model=ImportResult)
async def import_conversation_file(
    import_request: ImportRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Import a single conversation from JSON file"""
    try:
        file_path = Path(import_request.file_path)
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        if not file_path.suffix.lower() == '.json':
            raise HTTPException(status_code=400, detail="File must be a JSON file")
        
        importer = ConversationImporter(db)
        
        result = await importer.import_from_json(
            file_path,
            project_path=import_request.project_path
        )
        
        if result['success']:
            return ImportResult(
                success=True,
                conversation_id=result['conversation_id'],
                total_messages=result.get('total_messages'),
                status=result['status']
            )
        else:
            return ImportResult(
                success=False,
                status='failed',
                error=result.get('error', 'Unknown error')
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to import conversation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/directory", response_model=ImportDirectoryResult)
async def import_conversation_directory(
    import_request: ImportDirectoryRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Import multiple conversations from a directory"""
    try:
        directory_path = Path(import_request.directory_path)
        
        if not directory_path.exists():
            raise HTTPException(status_code=404, detail="Directory not found")
        
        if not directory_path.is_dir():
            raise HTTPException(status_code=400, detail="Path is not a directory")
        
        importer = ConversationImporter(db)
        
        result = await importer.import_directory(
            directory_path,
            file_pattern=import_request.file_pattern
        )
        
        return ImportDirectoryResult(**result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to import directory: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload", response_model=ImportResult)
async def upload_and_import_conversation(
    file: UploadFile = File(...),
    project_path: str = None,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    """Upload and import a conversation JSON file"""
    try:
        # Validate file type
        if not file.filename.endswith('.json'):
            raise HTTPException(status_code=400, detail="File must be a JSON file")
        
        # Save uploaded file to temporary location
        with tempfile.NamedTemporaryFile(delete=False, suffix='.json') as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_path = Path(temp_file.name)
        
        try:
            # Validate JSON content
            with open(temp_path, 'r', encoding='utf-8') as f:
                json.load(f)  # Just validate it's valid JSON
            
            # Import the conversation
            importer = ConversationImporter(db)
            result = await importer.import_from_json(temp_path, project_path=project_path)
            
            if result['success']:
                return ImportResult(
                    success=True,
                    conversation_id=result['conversation_id'],
                    total_messages=result.get('total_messages'),
                    status=result['status']
                )
            else:
                return ImportResult(
                    success=False,
                    status='failed',
                    error=result.get('error', 'Unknown error')
                )
                
        finally:
            # Clean up temporary file
            temp_path.unlink(missing_ok=True)
        
    except HTTPException:
        raise
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")
    except Exception as e:
        logger.error(f"Failed to upload and import conversation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch-upload", response_model=ImportDirectoryResult)
async def upload_and_import_multiple_conversations(
    files: list[UploadFile] = File(...),
    project_path: str = None,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    """Upload and import multiple conversation JSON files"""
    try:
        results = {
            'total_files': len(files),
            'successful_imports': 0,
            'failed_imports': 0,
            'already_existing': 0,
            'errors': []
        }
        
        # Create temporary directory
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            
            # Save all files first
            saved_files = []
            for file in files:
                if not file.filename.endswith('.json'):
                    results['errors'].append(f"{file.filename}: Not a JSON file")
                    results['failed_imports'] += 1
                    continue
                
                try:
                    content = await file.read()
                    file_path = temp_path / file.filename
                    
                    with open(file_path, 'wb') as f:
                        f.write(content)
                    
                    # Validate JSON
                    with open(file_path, 'r', encoding='utf-8') as f:
                        json.load(f)
                    
                    saved_files.append(file_path)
                    
                except json.JSONDecodeError:
                    results['errors'].append(f"{file.filename}: Invalid JSON")
                    results['failed_imports'] += 1
                except Exception as e:
                    results['errors'].append(f"{file.filename}: {str(e)}")
                    results['failed_imports'] += 1
            
            # Import all valid files
            importer = ConversationImporter(db)
            
            for file_path in saved_files:
                try:
                    result = await importer.import_from_json(file_path, project_path=project_path)
                    
                    if result['success']:
                        if result['status'] == 'imported':
                            results['successful_imports'] += 1
                        elif result['status'] == 'already_exists':
                            results['already_existing'] += 1
                    else:
                        results['failed_imports'] += 1
                        results['errors'].append(f"{file_path.name}: {result.get('error', 'Unknown error')}")
                        
                except Exception as e:
                    results['failed_imports'] += 1
                    results['errors'].append(f"{file_path.name}: {str(e)}")
        
        return ImportDirectoryResult(**results)
        
    except Exception as e:
        logger.error(f"Failed to batch upload conversations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/formats/supported")
async def get_supported_formats():
    """Get information about supported import formats"""
    return {
        'formats': [
            {
                'name': 'Claude Code JSON',
                'extension': '.json',
                'description': 'Native Claude Code conversation export format',
                'required_fields': ['messages'],
                'optional_fields': ['title', 'created_at', 'updated_at', 'tags', 'metadata']
            }
        ],
        'examples': {
            'claude_code_json': {
                'title': 'Example Conversation',
                'created_at': '2025-01-15T10:00:00Z',
                'messages': [
                    {
                        'role': 'user',
                        'content': 'Hello, can you help me with Python?',
                        'timestamp': '2025-01-15T10:00:00Z'
                    },
                    {
                        'role': 'assistant',
                        'content': 'Of course! I\'d be happy to help you with Python...',
                        'timestamp': '2025-01-15T10:00:30Z',
                        'tool_calls': []
                    }
                ],
                'tags': ['python', 'help'],
                'metadata': {
                    'export_version': '1.0'
                }
            }
        }
    }


@router.post("/validate", response_model=APIResponse)
async def validate_import_file(
    file: UploadFile = File(...)
):
    """Validate a conversation file before importing"""
    try:
        if not file.filename.endswith('.json'):
            raise HTTPException(status_code=400, detail="File must be a JSON file")
        
        content = await file.read()
        
        try:
            data = json.loads(content.decode('utf-8'))
        except json.JSONDecodeError as e:
            return APIResponse(
                success=False,
                error=f"Invalid JSON: {str(e)}"
            )
        
        # Validate structure
        validation_errors = []
        
        # Check for required fields
        if 'messages' not in data:
            validation_errors.append("Missing required field: 'messages'")
        elif not isinstance(data['messages'], list):
            validation_errors.append("'messages' must be an array")
        elif len(data['messages']) == 0:
            validation_errors.append("'messages' array cannot be empty")
        else:
            # Validate message structure
            for i, msg in enumerate(data['messages']):
                if not isinstance(msg, dict):
                    validation_errors.append(f"Message {i} must be an object")
                    continue
                
                if 'role' not in msg:
                    validation_errors.append(f"Message {i}: missing 'role'")
                elif msg['role'] not in ['user', 'assistant', 'system']:
                    validation_errors.append(f"Message {i}: invalid role '{msg['role']}'")
                
                if 'content' not in msg:
                    validation_errors.append(f"Message {i}: missing 'content'")
                elif not isinstance(msg['content'], str):
                    validation_errors.append(f"Message {i}: 'content' must be a string")
        
        # Check optional fields
        if 'title' in data and not isinstance(data['title'], str):
            validation_errors.append("'title' must be a string")
        
        if 'tags' in data and not isinstance(data['tags'], list):
            validation_errors.append("'tags' must be an array")
        
        if validation_errors:
            return APIResponse(
                success=False,
                error="Validation failed",
                data={'errors': validation_errors}
            )
        
        # Success response with file info
        message_count = len(data['messages'])
        user_messages = len([m for m in data['messages'] if m.get('role') == 'user'])
        assistant_messages = len([m for m in data['messages'] if m.get('role') == 'assistant'])
        
        return APIResponse(
            success=True,
            message="File validation successful",
            data={
                'file_info': {
                    'filename': file.filename,
                    'title': data.get('title', 'Untitled'),
                    'total_messages': message_count,
                    'user_messages': user_messages,
                    'assistant_messages': assistant_messages,
                    'tags': data.get('tags', []),
                    'has_timestamps': any('timestamp' in m for m in data['messages']),
                    'has_tool_calls': any('tool_calls' in m for m in data['messages'])
                }
            }
        )
        
    except Exception as e:
        logger.error(f"Failed to validate import file: {e}")
        raise HTTPException(status_code=500, detail=str(e))