import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import {
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon,
  ChatBubbleLeftRightIcon,
  ChatBubbleLeftIcon,
  CalendarIcon,
  FolderIcon,
  TagIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

import { ConversationHistoryAPI, SearchRequest, Conversation, Message } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

const SearchPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'text' | 'semantic' | 'hybrid'>('hybrid');
  const [activeTab, setActiveTab] = useState<'conversations' | 'messages' | 'both'>('both');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filters, setFilters] = useState({
    project_path: '',
    role: '',
    date_from: '',
    date_to: '',
    has_file_references: undefined as boolean | undefined,
  });
  
  const [searchExecuted, setSearchExecuted] = useState(false);
  const [searchRequest, setSearchRequest] = useState<SearchRequest | null>(null);

  // Search suggestions
  const { data: suggestions, isLoading: suggestionsLoading } = useQuery(
    ['search-suggestions', query],
    () => ConversationHistoryAPI.getSearchSuggestions(query, 10),
    {
      enabled: query.length >= 2 && !searchExecuted,
    }
  );

  // Search results
  const {
    data: searchResults,
    isLoading: searchLoading,
    isError,
    error,
  } = useQuery(
    ['search-results', searchRequest],
    async () => {
      if (!searchRequest) return null;

      if (activeTab === 'conversations') {
        return await ConversationHistoryAPI.searchConversations(searchRequest);
      } else if (activeTab === 'messages') {
        return await ConversationHistoryAPI.searchMessages(searchRequest);
      } else {
        return await ConversationHistoryAPI.hybridSearch(searchRequest);
      }
    },
    {
      enabled: !!searchRequest && !!query.trim(),
    }
  );

  const executeSearch = () => {
    if (!query.trim()) return;

    const request: SearchRequest = {
      query: query.trim(),
      search_type: searchType,
      limit: 20,
      filters: Object.fromEntries(
        Object.entries(filters).filter(([_, value]) => value !== '' && value !== undefined)
      ),
    };

    setSearchRequest(request);
    setSearchExecuted(true);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeSearch();
    }
  };

  const clearSearch = () => {
    setQuery('');
    setSearchRequest(null);
    setSearchExecuted(false);
  };

  const clearFilters = () => {
    setFilters({
      project_path: '',
      role: '',
      date_from: '',
      date_to: '',
      has_file_references: undefined,
    });
  };

  // Show suggestions when typing
  const showSuggestions = query.length >= 2 && !searchExecuted && suggestions?.suggestions.length > 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Search Conversations & Messages
        </h1>
        
        {/* Search input */}
        <div className="relative">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-6 w-6 text-gray-400" />
            <input
              type="text"
              placeholder="Search for conversations, code, topics, or files..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchExecuted(false);
              }}
              onKeyPress={handleKeyPress}
              className="w-full pl-12 pr-24 py-4 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex space-x-2">
              {query && (
                <button
                  onClick={clearSearch}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
              <button
                onClick={executeSearch}
                disabled={!query.trim()}
                className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Search
              </button>
            </div>
          </div>
          
          {/* Suggestions dropdown */}
          {showSuggestions && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {suggestions.suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setQuery(suggestion);
                    setSearchExecuted(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg"
                >
                  <span className="text-gray-700">{suggestion}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search options */}
        <div className="flex flex-wrap items-center gap-4 mt-4">
          {/* Search type */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Type:</span>
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as typeof searchType)}
              className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="hybrid">Hybrid (Text + Semantic)</option>
              <option value="text">Text Search</option>
              <option value="semantic">Semantic Search</option>
            </select>
          </div>

          {/* Result type tabs */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Show:</span>
            <div className="flex border border-gray-300 rounded-lg overflow-hidden">
              {[
                { key: 'both', label: 'Both' },
                { key: 'conversations', label: 'Conversations' },
                { key: 'messages', label: 'Messages' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key as typeof activeTab)}
                  className={`px-3 py-1 text-sm ${
                    activeTab === key
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced filters toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-800"
          >
            <AdjustmentsHorizontalIcon className="h-4 w-4" />
            <span>Advanced</span>
          </button>
        </div>

        {/* Advanced filters */}
        {showAdvanced && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Path
                </label>
                <input
                  type="text"
                  value={filters.project_path}
                  onChange={(e) => setFilters(prev => ({ ...prev, project_path: e.target.value }))}
                  className="input-primary text-sm"
                  placeholder="Filter by project..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message Role
                </label>
                <select
                  value={filters.role}
                  onChange={(e) => setFilters(prev => ({ ...prev, role: e.target.value }))}
                  className="input-primary text-sm"
                >
                  <option value="">All roles</option>
                  <option value="user">User</option>
                  <option value="assistant">Assistant</option>
                  <option value="system">System</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  File References
                </label>
                <select
                  value={filters.has_file_references?.toString() || ''}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    has_file_references: e.target.value === '' ? undefined : e.target.value === 'true'
                  }))}
                  className="input-primary text-sm"
                >
                  <option value="">All messages</option>
                  <option value="true">With file references</option>
                  <option value="false">Without file references</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={filters.date_from}
                  onChange={(e) => setFilters(prev => ({ ...prev, date_from: e.target.value }))}
                  className="input-primary text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={filters.date_to}
                  onChange={(e) => setFilters(prev => ({ ...prev, date_to: e.target.value }))}
                  className="input-primary text-sm"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={clearFilters}
                  className="btn-secondary text-sm w-full"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Search results */}
      <div>
        {searchLoading && <LoadingSpinner message="Searching..." />}
        
        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h3 className="text-lg font-medium text-red-800 mb-2">
              Search Error
            </h3>
            <p className="text-red-700">
              {error instanceof Error ? error.message : 'An error occurred while searching'}
            </p>
          </div>
        )}

        {searchResults && !searchLoading && (
          <SearchResults results={searchResults} activeTab={activeTab} />
        )}

        {!searchExecuted && !searchLoading && (
          <EmptyState
            icon={MagnifyingGlassIcon}
            title="Ready to search"
            description="Enter your search terms above to find conversations and messages. Use semantic search to find conceptually similar content."
          />
        )}

        {searchExecuted && !searchLoading && searchResults && (
          searchResults.conversations?.length === 0 && searchResults.messages?.length === 0
        ) && (
          <EmptyState
            icon={MagnifyingGlassIcon}
            title="No results found"
            description="Try different search terms or adjust your filters to find what you're looking for."
          />
        )}
      </div>
    </div>
  );
};

interface SearchResultsProps {
  results: any;
  activeTab: 'conversations' | 'messages' | 'both';
}

const SearchResults: React.FC<SearchResultsProps> = ({ results, activeTab }) => {
  const conversations = results.conversations || [];
  const messages = results.messages || [];
  const queryInfo = results.query_info || {};

  return (
    <div>
      {/* Results summary */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-blue-800">
              Found {conversations.length} conversations and {messages.length} messages
              {queryInfo.execution_time_ms && (
                <> in {queryInfo.execution_time_ms}ms</>
              )}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Search type: {queryInfo.search_type} • Query: "{queryInfo.query}"
            </p>
          </div>
        </div>
      </div>

      {/* Conversations */}
      {(activeTab === 'conversations' || activeTab === 'both') && conversations.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <ChatBubbleLeftRightIcon className="h-5 w-5 mr-2" />
            Conversations ({conversations.length})
          </h2>
          <div className="space-y-4">
            {conversations.map((conversation: Conversation) => (
              <ConversationSearchResult key={conversation.id} conversation={conversation} />
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {(activeTab === 'messages' || activeTab === 'both') && messages.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <ChatBubbleLeftIcon className="h-5 w-5 mr-2" />
            Messages ({messages.length})
          </h2>
          <div className="space-y-4">
            {messages.map((message: Message) => (
              <MessageSearchResult key={message.id} message={message} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface ConversationSearchResultProps {
  conversation: Conversation;
}

const ConversationSearchResult: React.FC<ConversationSearchResultProps> = ({ conversation }) => {
  return (
    <Link
      to={`/conversations/${conversation.id}`}
      className="block bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow duration-200"
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-medium text-gray-900 truncate">
            {conversation.title || 'Untitled Conversation'}
          </h3>
          
          {conversation.summary && (
            <p className="mt-1 text-gray-600 line-clamp-2">
              {conversation.summary}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center space-x-1">
              <CalendarIcon className="h-4 w-4" />
              <span>{format(new Date(conversation.started_at), 'MMM d, yyyy')}</span>
            </div>

            <div className="flex items-center space-x-1">
              <ChatBubbleLeftRightIcon className="h-4 w-4" />
              <span>{conversation.total_messages} messages</span>
            </div>

            {conversation.project_path && (
              <div className="flex items-center space-x-1">
                <FolderIcon className="h-4 w-4" />
                <span className="truncate max-w-xs">{conversation.project_path}</span>
              </div>
            )}
          </div>

          {conversation.tags.length > 0 && (
            <div className="mt-2 flex items-center space-x-2">
              <TagIcon className="h-4 w-4 text-gray-400" />
              <div className="flex flex-wrap gap-1">
                {conversation.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                  >
                    {tag}
                  </span>
                ))}
                {conversation.tags.length > 3 && (
                  <span className="text-xs text-gray-500">+{conversation.tags.length - 3} more</span>
                )}
              </div>
            </div>
          )}
        </div>

        {conversation.similarity && (
          <div className="ml-4 text-right">
            <div className="text-sm font-medium text-blue-600">
              {Math.round(conversation.similarity * 100)}% match
            </div>
          </div>
        )}
      </div>
    </Link>
  );
};

interface MessageSearchResultProps {
  message: Message;
}

const MessageSearchResult: React.FC<MessageSearchResultProps> = ({ message }) => {
  return (
    <Link
      to={`/conversations/${message.conversation_id}`}
      className="block bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow duration-200"
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-2">
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              message.role === 'user' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
            }`}>
              {message.role}
            </span>
            <span className="text-sm text-gray-500">
              {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
            </span>
          </div>

          <p className="text-gray-800 line-clamp-3">
            {message.content.length > 300 
              ? `${message.content.substring(0, 300)}...` 
              : message.content
            }
          </p>

          {message.file_references.length > 0 && (
            <div className="mt-2 flex items-center space-x-1 text-sm text-gray-500">
              <DocumentTextIcon className="h-4 w-4" />
              <span>{message.file_references.length} file references</span>
            </div>
          )}
        </div>

        {message.similarity && (
          <div className="ml-4 text-right">
            <div className="text-sm font-medium text-blue-600">
              {Math.round(message.similarity * 100)}% match
            </div>
          </div>
        )}
      </div>
    </Link>
  );
};

export default SearchPage;