import axios, { AxiosResponse } from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add any auth headers or other request modifications here
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Types
export interface Conversation {
  id: string;
  title?: string;
  started_at: string;
  updated_at: string;
  total_messages: number;
  total_tokens: number;
  project_path?: string;
  tags: string[];
  summary?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at_local: string;
  similarity?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  tokens_used?: number;
  tool_calls?: Record<string, any>;
  file_references: string[];
  metadata: Record<string, any>;
  created_at: string;
  similarity?: number;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

export interface Cluster {
  id: string;
  name: string;
  description?: string;
  color: string;
  auto_generated: boolean;
  created_at: string;
  updated_at: string;
  conversations?: Conversation[];
  conversation_count?: number;
}

export interface SearchRequest {
  query: string;
  search_type: 'text' | 'semantic' | 'hybrid';
  limit: number;
  filters: Record<string, any>;
}

export interface SearchResult<T> {
  items?: T[];
  conversations?: Conversation[];
  messages?: Message[];
  total_count: number;
  query_info: Record<string, any>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface ImportResult {
  success: boolean;
  conversation_id?: string;
  total_messages?: number;
  status: string;
  error?: string;
}

export interface HealthCheck {
  status: string;
  version: string;
  database: string;
  chromadb: string;
  redis: string;
}

// API Service Class
export class ConversationHistoryAPI {
  // Conversations
  static async getConversations(params: {
    page?: number;
    size?: number;
    project_path?: string;
    tags?: string;
    search_query?: string;
  } = {}): Promise<PaginatedResponse<Conversation>> {
    const response = await api.get('/api/v1/conversations', { params });
    return response.data;
  }

  static async getConversation(id: string, includeMessages = true): Promise<ConversationWithMessages> {
    const response = await api.get(`/api/v1/conversations/${id}`, {
      params: { include_messages: includeMessages }
    });
    return response.data;
  }

  static async updateConversation(id: string, data: Partial<Conversation>): Promise<Conversation> {
    const response = await api.put(`/api/v1/conversations/${id}`, data);
    return response.data;
  }

  static async deleteConversation(id: string): Promise<void> {
    await api.delete(`/api/v1/conversations/${id}`);
  }

  static async getConversationMessages(
    id: string,
    params: { page?: number; size?: number; role?: string } = {}
  ): Promise<Message[]> {
    const response = await api.get(`/api/v1/conversations/${id}/messages`, { params });
    return response.data;
  }

  static async getSimilarConversations(
    id: string,
    params: { limit?: number; threshold?: number } = {}
  ): Promise<Conversation[]> {
    const response = await api.get(`/api/v1/conversations/${id}/similar`, { params });
    return response.data;
  }

  // Search
  static async searchConversations(request: SearchRequest): Promise<SearchResult<Conversation>> {
    const response = await api.post('/api/v1/search/conversations', request);
    return response.data;
  }

  static async searchMessages(request: SearchRequest): Promise<SearchResult<Message>> {
    const response = await api.post('/api/v1/search/messages', request);
    return response.data;
  }

  static async hybridSearch(request: SearchRequest): Promise<SearchResult<any>> {
    const response = await api.post('/api/v1/search/hybrid', request);
    return response.data;
  }

  static async getSearchSuggestions(query: string, limit = 10): Promise<{ suggestions: string[]; query: string }> {
    const response = await api.get('/api/v1/search/suggestions', {
      params: { query, limit }
    });
    return response.data;
  }

  static async getRecentSearches(limit = 10): Promise<{ recent_searches: any[] }> {
    const response = await api.get('/api/v1/search/recent', {
      params: { limit }
    });
    return response.data;
  }

  // Clusters
  static async getClusters(includeConversations = true): Promise<Cluster[]> {
    const response = await api.get('/api/v1/clusters', {
      params: { include_conversations: includeConversations }
    });
    return response.data;
  }

  static async getCluster(id: string): Promise<Cluster> {
    const response = await api.get(`/api/v1/clusters/${id}`);
    return response.data;
  }

  static async createCluster(data: { name: string; description?: string; color?: string }): Promise<Cluster> {
    const response = await api.post('/api/v1/clusters', data);
    return response.data;
  }

  static async updateCluster(id: string, data: Partial<Cluster>): Promise<Cluster> {
    const response = await api.put(`/api/v1/clusters/${id}`, data);
    return response.data;
  }

  static async deleteCluster(id: string): Promise<void> {
    await api.delete(`/api/v1/clusters/${id}`);
  }

  static async addConversationToCluster(clusterId: string, conversationId: string, confidenceScore = 1.0): Promise<void> {
    await api.post(`/api/v1/clusters/${clusterId}/conversations/${conversationId}`, {
      confidence_score: confidenceScore
    });
  }

  static async removeConversationFromCluster(clusterId: string, conversationId: string): Promise<void> {
    await api.delete(`/api/v1/clusters/${clusterId}/conversations/${conversationId}`);
  }

  static async autoGenerateClusters(params: {
    min_cluster_size?: number;
    max_clusters?: number;
    similarity_threshold?: number;
  } = {}): Promise<any> {
    const response = await api.post('/api/v1/clusters/auto-generate', null, { params });
    return response.data;
  }

  static async getClusterAnalytics(): Promise<any> {
    const response = await api.get('/api/v1/clusters/analytics/stats');
    return response.data;
  }

  // Import
  static async importConversation(data: { file_path: string; project_path?: string }): Promise<ImportResult> {
    const response = await api.post('/api/v1/import/conversation', data);
    return response.data;
  }

  static async importDirectory(data: { directory_path: string; file_pattern?: string }): Promise<any> {
    const response = await api.post('/api/v1/import/directory', data);
    return response.data;
  }

  static async uploadConversation(file: File, projectPath?: string): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    if (projectPath) {
      formData.append('project_path', projectPath);
    }

    const response = await api.post('/api/v1/import/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  static async uploadMultipleConversations(files: File[], projectPath?: string): Promise<any> {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    if (projectPath) {
      formData.append('project_path', projectPath);
    }

    const response = await api.post('/api/v1/import/batch-upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  static async validateImportFile(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/api/v1/import/validate', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  static async getSupportedFormats(): Promise<any> {
    const response = await api.get('/api/v1/import/formats/supported');
    return response.data;
  }

  // Health
  static async healthCheck(): Promise<HealthCheck> {
    const response = await api.get('/health');
    return response.data;
  }

  static async getDatabaseHealth(): Promise<any> {
    const response = await api.get('/health/database');
    return response.data;
  }

  static async getChromaDBHealth(): Promise<any> {
    const response = await api.get('/health/chromadb');
    return response.data;
  }

  static async getRedisHealth(): Promise<any> {
    const response = await api.get('/health/redis');
    return response.data;
  }

  static async getSystemHealth(): Promise<any> {
    const response = await api.get('/health/system');
    return response.data;
  }
}

export default api;