import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  ArrowLeftIcon,
  ChatBubbleLeftIcon,
  ChatBubbleLeftEllipsisIcon,
  CalendarIcon,
  FolderIcon,
  TagIcon,
  DocumentTextIcon,
  WrenchScrewdriverIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';

import { ConversationHistoryAPI, ConversationWithMessages, Message } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

const ConversationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  const {
    data: conversation,
    isLoading,
    isError,
    error,
  } = useQuery(
    ['conversation', id],
    () => ConversationHistoryAPI.getConversation(id!, true),
    {
      enabled: !!id,
    }
  );

  const {
    data: similarConversations,
    isLoading: similarLoading,
  } = useQuery(
    ['similar-conversations', id],
    () => ConversationHistoryAPI.getSimilarConversations(id!, { limit: 5, threshold: 0.7 }),
    {
      enabled: !!id,
    }
  );

  if (isLoading) {
    return <LoadingSpinner message="Loading conversation..." />;
  }

  if (isError || !conversation) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-red-800 mb-2">
            Error Loading Conversation
          </h3>
          <p className="text-red-700 mb-4">
            {error instanceof Error ? error.message : 'Conversation not found'}
          </p>
          <Link to="/conversations" className="btn-primary">
            Back to Conversations
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center mb-4">
          <Link
            to="/conversations"
            className="flex items-center text-gray-500 hover:text-gray-700 mr-4"
          >
            <ArrowLeftIcon className="h-5 w-5 mr-1" />
            Back to Conversations
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {conversation.title || 'Untitled Conversation'}
          </h1>

          {/* Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <CalendarIcon className="h-4 w-4" />
              <span>{format(new Date(conversation.started_at), 'PPP')}</span>
            </div>

            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <ChatBubbleLeftIcon className="h-4 w-4" />
              <span>{conversation.total_messages} messages</span>
            </div>

            {conversation.project_path && (
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <FolderIcon className="h-4 w-4" />
                <span className="truncate" title={conversation.project_path}>
                  {conversation.project_path}
                </span>
              </div>
            )}

            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <DocumentTextIcon className="h-4 w-4" />
              <span>{conversation.total_tokens.toLocaleString()} tokens</span>
            </div>
          </div>

          {/* Summary */}
          {conversation.summary && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Summary</h3>
              <p className="text-gray-600">{conversation.summary}</p>
            </div>
          )}

          {/* Tags */}
          {conversation.tags.length > 0 && (
            <div className="flex items-center space-x-2">
              <TagIcon className="h-4 w-4 text-gray-400" />
              <div className="flex flex-wrap gap-2">
                {conversation.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Messages */}
        <div className="lg:col-span-3">
          <div className="space-y-6">
            {conversation.messages.map((message, index) => (
              <MessageCard
                key={message.id}
                message={message}
                index={index}
                isSelected={selectedMessageId === message.id}
                onClick={() => setSelectedMessageId(
                  selectedMessageId === message.id ? null : message.id
                )}
              />
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="space-y-6">
            {/* Similar Conversations */}
            {similarConversations && similarConversations.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <LinkIcon className="h-5 w-5 mr-2" />
                  Similar Conversations
                </h3>
                <div className="space-y-3">
                  {similarConversations.map((conv) => (
                    <Link
                      key={conv.id}
                      to={`/conversations/${conv.id}`}
                      className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <h4 className="font-medium text-sm text-gray-900 truncate">
                        {conv.title || 'Untitled'}
                      </h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {format(new Date(conv.started_at), 'MMM d, yyyy')}
                      </p>
                      {conv.similarity && (
                        <p className="text-xs text-blue-600 mt-1">
                          {Math.round(conv.similarity * 100)}% similar
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Message Stats */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Message Statistics
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">User messages:</span>
                  <span className="font-medium">
                    {conversation.messages.filter(m => m.role === 'user').length}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Assistant messages:</span>
                  <span className="font-medium">
                    {conversation.messages.filter(m => m.role === 'assistant').length}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">With tool calls:</span>
                  <span className="font-medium">
                    {conversation.messages.filter(m => m.tool_calls && Object.keys(m.tool_calls).length > 0).length}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">With file refs:</span>
                  <span className="font-medium">
                    {conversation.messages.filter(m => m.file_references.length > 0).length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface MessageCardProps {
  message: Message;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}

const MessageCard: React.FC<MessageCardProps> = ({
  message,
  index,
  isSelected,
  onClick,
}) => {
  const isUser = message.role === 'user';
  const hasToolCalls = message.tool_calls && Object.keys(message.tool_calls).length > 0;
  const hasFileRefs = message.file_references.length > 0;

  return (
    <div
      className={`relative bg-white rounded-lg border transition-all duration-200 ${
        isSelected
          ? 'border-primary-300 shadow-md'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isUser
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-purple-100 text-purple-600'
              }`}
            >
              {isUser ? (
                <ChatBubbleLeftIcon className="h-5 w-5" />
              ) : (
                <ChatBubbleLeftEllipsisIcon className="h-5 w-5" />
              )}
            </div>
            <div>
              <h4 className="font-medium text-gray-900 capitalize">
                {message.role}
              </h4>
              <p className="text-sm text-gray-500">
                {format(new Date(message.timestamp), 'PPp')}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {hasToolCalls && (
              <div className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                <WrenchScrewdriverIcon className="h-3 w-3 mr-1" />
                Tool calls
              </div>
            )}
            {hasFileRefs && (
              <div className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                <DocumentTextIcon className="h-3 w-3 mr-1" />
                Files
              </div>
            )}
            <span className="text-xs text-gray-500">
              #{index + 1}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="message-content prose prose-sm max-w-none">
          <ReactMarkdown
            components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                return !inline && match ? (
                  <SyntaxHighlighter
                    style={tomorrow}
                    language={match[1]}
                    PreTag="div"
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Expandable details */}
        {(hasToolCalls || hasFileRefs || message.tokens_used) && (
          <div className="mt-4">
            <button
              onClick={onClick}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center"
            >
              {isSelected ? 'Hide details' : 'Show details'}
            </button>
            
            {isSelected && (
              <div className="mt-4 space-y-3">
                {/* Token usage */}
                {message.tokens_used && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Token Usage</h5>
                    <p className="text-sm text-gray-600">
                      {message.tokens_used.toLocaleString()} tokens
                    </p>
                  </div>
                )}

                {/* File references */}
                {hasFileRefs && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">File References</h5>
                    <ul className="text-sm text-gray-600 mt-1 space-y-1">
                      {message.file_references.map((file, idx) => (
                        <li key={idx} className="font-mono text-xs bg-gray-50 px-2 py-1 rounded">
                          {file}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Tool calls */}
                {hasToolCalls && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Tool Calls</h5>
                    <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-x-auto mt-1">
                      {JSON.stringify(message.tool_calls, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationDetail;