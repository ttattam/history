import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { format, formatDistanceToNow } from 'date-fns';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ChatBubbleLeftRightIcon,
  CalendarIcon,
  FolderIcon,
  TagIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { ConversationHistoryAPI, Conversation } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import EmptyState from '../components/EmptyState';

const ConversationList: React.FC = () => {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const pageSize = 20;

  const {
    data: conversationsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery(
    ['conversations', page, searchQuery, projectFilter, tagFilter],
    () =>
      ConversationHistoryAPI.getConversations({
        page,
        size: pageSize,
        search_query: searchQuery || undefined,
        project_path: projectFilter || undefined,
        tags: tagFilter || undefined,
      }),
    {
      keepPreviousData: true,
    }
  );

  // Extract unique projects and tags for filters
  const uniqueProjects = useMemo(() => {
    if (!conversationsData?.items) return [];
    const projects = conversationsData.items
      .map(conv => conv.project_path)
      .filter((path): path is string => Boolean(path));
    return [...new Set(projects)].sort();
  }, [conversationsData]);

  const uniqueTags = useMemo(() => {
    if (!conversationsData?.items) return [];
    const tags = conversationsData.items
      .flatMap(conv => conv.tags)
      .filter(Boolean);
    return [...new Set(tags)].sort();
  }, [conversationsData]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  const handleFilterChange = (type: 'project' | 'tag', value: string) => {
    if (type === 'project') {
      setProjectFilter(value);
    } else {
      setTagFilter(value);
    }
    setPage(1);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setProjectFilter('');
    setTagFilter('');
    setPage(1);
  };

  if (isLoading && !conversationsData) {
    return <LoadingSpinner />;
  }

  if (isError) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-red-800 mb-2">
            Error Loading Conversations
          </h3>
          <p className="text-red-700 mb-4">
            {error instanceof Error ? error.message : 'An unknown error occurred'}
          </p>
          <button
            onClick={() => refetch()}
            className="btn-primary"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const conversations = conversationsData?.items || [];
  const hasFilters = searchQuery || projectFilter || tagFilter;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Conversation History
        </h1>
        
        {/* Search and filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {/* Search input */}
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="input-primary pl-10"
              />
            </div>
          </div>
          
          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn-secondary flex items-center space-x-2 ${
              hasFilters ? 'ring-2 ring-primary-500' : ''
            }`}
          >
            <FunnelIcon className="h-5 w-5" />
            <span>Filters</span>
            {hasFilters && (
              <span className="bg-primary-500 text-white text-xs rounded-full px-2 py-1">
                {[searchQuery, projectFilter, tagFilter].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Project filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project
                </label>
                <select
                  value={projectFilter}
                  onChange={(e) => handleFilterChange('project', e.target.value)}
                  className="input-primary"
                >
                  <option value="">All projects</option>
                  {uniqueProjects.map(project => (
                    <option key={project} value={project}>
                      {project}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tag filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tag
                </label>
                <select
                  value={tagFilter}
                  onChange={(e) => handleFilterChange('tag', e.target.value)}
                  className="input-primary"
                >
                  <option value="">All tags</option>
                  {uniqueTags.map(tag => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>

              {/* Clear filters */}
              <div className="flex items-end">
                <button
                  onClick={clearFilters}
                  className="btn-secondary w-full"
                  disabled={!hasFilters}
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Results summary */}
        <div className="text-sm text-gray-600">
          {conversationsData && (
            <>
              Showing {conversations.length} of {conversationsData.total} conversations
              {hasFilters && ' (filtered)'}
            </>
          )}
        </div>
      </div>

      {/* Conversation list */}
      {conversations.length === 0 ? (
        <EmptyState
          icon={ChatBubbleLeftRightIcon}
          title={hasFilters ? 'No conversations found' : 'No conversations yet'}
          description={
            hasFilters
              ? 'Try adjusting your search or filters'
              : 'Import your Claude Code conversation history to get started'
          }
          action={
            hasFilters ? undefined : {
              label: 'Import Conversations',
              href: '/import',
            }
          }
        />
      ) : (
        <>
          <div className="space-y-4 mb-8">
            {conversations.map((conversation) => (
              <ConversationCard key={conversation.id} conversation={conversation} />
            ))}
          </div>

          {/* Pagination */}
          {conversationsData && conversationsData.pages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={conversationsData.pages}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
};

interface ConversationCardProps {
  conversation: Conversation;
}

const ConversationCard: React.FC<ConversationCardProps> = ({ conversation }) => {
  const timeAgo = formatDistanceToNow(new Date(conversation.started_at), { addSuffix: true });
  const startedDate = format(new Date(conversation.started_at), 'MMM d, yyyy');

  return (
    <Link
      to={`/conversations/${conversation.id}`}
      className="block bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow duration-200 group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h3 className="text-lg font-semibold text-gray-900 truncate group-hover:text-primary-600 transition-colors">
            {conversation.title || 'Untitled Conversation'}
          </h3>

          {/* Summary */}
          {conversation.summary && (
            <p className="mt-1 text-gray-600 line-clamp-2">
              {conversation.summary}
            </p>
          )}

          {/* Metadata */}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center space-x-1">
              <CalendarIcon className="h-4 w-4" />
              <span>{startedDate}</span>
              <span>({timeAgo})</span>
            </div>

            <div className="flex items-center space-x-1">
              <ChatBubbleLeftRightIcon className="h-4 w-4" />
              <span>{conversation.total_messages} messages</span>
            </div>

            {conversation.project_path && (
              <div className="flex items-center space-x-1">
                <FolderIcon className="h-4 w-4" />
                <span className="truncate max-w-xs" title={conversation.project_path}>
                  {conversation.project_path}
                </span>
              </div>
            )}
          </div>

          {/* Tags */}
          {conversation.tags.length > 0 && (
            <div className="mt-3 flex items-center space-x-2">
              <TagIcon className="h-4 w-4 text-gray-400" />
              <div className="flex flex-wrap gap-1">
                {conversation.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                  >
                    {tag}
                  </span>
                ))}
                {conversation.tags.length > 3 && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    +{conversation.tags.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <ChevronRightIcon className="ml-4 h-5 w-5 text-gray-400 group-hover:text-gray-600" />
      </div>
    </Link>
  );
};

export default ConversationList;