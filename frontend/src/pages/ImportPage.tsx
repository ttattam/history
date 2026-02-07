import React, { useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-hot-toast';
import {
  ArrowUpTrayIcon,
  DocumentIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';

import { ConversationHistoryAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

const ImportPage: React.FC = () => {
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [projectPath, setProjectPath] = useState('');
  const queryClient = useQueryClient();

  const uploadMutation = useMutation(
    async (data: { files: File[]; projectPath?: string }) => {
      if (data.files.length === 1) {
        return await ConversationHistoryAPI.uploadConversation(data.files[0], data.projectPath);
      } else {
        return await ConversationHistoryAPI.uploadMultipleConversations(data.files, data.projectPath);
      }
    },
    {
      onSuccess: (result) => {
        if (result.success || result.successful_imports > 0) {
          toast.success(
            files.length === 1 
              ? 'Conversation imported successfully!'
              : `Imported ${result.successful_imports} conversations successfully!`
          );
          queryClient.invalidateQueries(['conversations']);
          setFiles([]);
          setProjectPath('');
        } else {
          toast.error('Failed to import conversations');
        }
      },
      onError: (error) => {
        toast.error('Import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
      },
    }
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(file => 
      file.type === 'application/json' || file.name.endsWith('.json')
    );
    
    if (droppedFiles.length > 0) {
      setFiles(prev => [...prev, ...droppedFiles]);
    } else {
      toast.error('Please drop only JSON files');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...selectedFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleImport = () => {
    if (files.length === 0) return;
    
    uploadMutation.mutate({
      files,
      projectPath: projectPath || undefined,
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Import Conversations
        </h1>
        <p className="text-gray-600">
          Upload Claude Code conversation history JSON files to add them to your searchable archive.
        </p>
      </div>

      {/* Import area */}
      <div className="space-y-6">
        {/* File upload area */}
        <div
          className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragOver
              ? 'border-primary-300 bg-primary-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <ArrowUpTrayIcon className="mx-auto h-12 w-12 text-gray-400" />
          <div className="mt-4">
            <h3 className="text-lg font-medium text-gray-900">
              Upload conversation files
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Drag and drop JSON files here, or click to select files
            </p>
          </div>
          
          <div className="mt-6">
            <input
              type="file"
              multiple
              accept=".json"
              onChange={handleFileSelect}
              className="sr-only"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 hover:bg-gray-50 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500"
            >
              Select files
            </label>
          </div>
        </div>

        {/* Project path input */}
        <div>
          <label htmlFor="project-path" className="block text-sm font-medium text-gray-700 mb-2">
            Project Path (Optional)
          </label>
          <input
            type="text"
            id="project-path"
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            placeholder="e.g., /Users/username/projects/my-app"
            className="input-primary"
          />
          <p className="mt-1 text-sm text-gray-500">
            Associate imported conversations with a specific project path for better organization.
          </p>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Selected Files ({files.length})
            </h3>
            <div className="space-y-2">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3"
                >
                  <div className="flex items-center space-x-3">
                    <DocumentIcon className="h-8 w-8 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFile(index)}
                    className="text-red-400 hover:text-red-600"
                    disabled={uploadMutation.isLoading}
                  >
                    <XCircleIcon className="h-5 w-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Import button */}
        <div className="flex justify-end space-x-4">
          {files.length > 0 && (
            <button
              onClick={() => {
                setFiles([]);
                setProjectPath('');
              }}
              className="btn-secondary"
              disabled={uploadMutation.isLoading}
            >
              Clear All
            </button>
          )}
          <button
            onClick={handleImport}
            disabled={files.length === 0 || uploadMutation.isLoading}
            className="btn-primary flex items-center space-x-2"
          >
            {uploadMutation.isLoading ? (
              <>
                <LoadingSpinner size="sm" />
                <span>Importing...</span>
              </>
            ) : (
              <>
                <CheckCircleIcon className="h-5 w-5" />
                <span>Import {files.length} file{files.length !== 1 ? 's' : ''}</span>
              </>
            )}
          </button>
        </div>

        {/* Format information */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Supported Format
          </h3>
          <div className="text-sm text-gray-600 space-y-2">
            <p>
              <strong>Claude Code JSON:</strong> Native conversation export format from Claude Code.
            </p>
            <p>
              Files should contain a <code className="bg-gray-200 px-1 rounded">messages</code> array with conversation history.
            </p>
            <p>
              Optional fields include <code className="bg-gray-200 px-1 rounded">title</code>, 
              <code className="bg-gray-200 px-1 rounded">tags</code>, and 
              <code className="bg-gray-200 px-1 rounded">metadata</code>.
            </p>
          </div>
        </div>

        {/* Import status */}
        {uploadMutation.isError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <XCircleIcon className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Import Failed
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  {uploadMutation.error instanceof Error
                    ? uploadMutation.error.message
                    : 'An unknown error occurred'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportPage;