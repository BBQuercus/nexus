import type { Conversation, Message, Artifact, AgentPersona, User, FileNode, ConversationTree, KnowledgeBase, KBDocument, Citation } from './types';
import { clearToken, getCsrfToken, getToken } from './auth';

export class ApiError extends Error {
  status: number;
  body: unknown;
  requestId?: string;
  constructor(status: number, message: string, body?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.requestId = requestId;
  }
}

// Lazy-import toast to avoid circular deps at module load time
let _toast: typeof import('@/components/toast').toast | null = null;
function getToast() {
  if (!_toast) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _toast = require('@/components/toast').toast;
    } catch {
      return null;
    }
  }
  return _toast;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // Include CSRF token for state-changing requests when using cookie auth
  if (!token && typeof document !== 'undefined') {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text().catch(() => null);
    }
    const message = (errorBody as { detail?: string })?.detail
      || (errorBody as { message?: string })?.message
      || response.statusText;
    const requestId = response.headers.get('X-Request-Id') || undefined;

    // Handle 401 — clear stale token but don't redirect (let callers handle it)
    if (response.status === 401) {
      clearToken();
    }

    // Toast for all other API errors (except error reporting itself)
    if (response.status !== 401 && !path.includes('/api/errors')) {
      getToast()?.error(message || 'Something went wrong');
    }

    throw new ApiError(response.status, message, errorBody, requestId);
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  return undefined as T;
}

// ── Conversations ──

export interface ConversationsListResponse {
  conversations: Conversation[];
  total: number;
  page: number;
  pageSize: number;
}

function mapConversation(c: Record<string, unknown>): Conversation {
  return {
    id: (c.id as string) || '',
    title: (c.title as string) || '',
    createdAt: (c.created_at as string) || (c.createdAt as string) || '',
    updatedAt: (c.updated_at as string) || (c.updatedAt as string) || '',
    model: (c.model as string) || undefined,
    sandboxId: (c.sandbox_id as string) || (c.sandboxId as string) || undefined,
    personaId: (c.persona_id as string) || (c.personaId as string) || undefined,
    messageCount: (c.message_count as number) || (c.messageCount as number) || undefined,
  };
}

export async function createConversation(params: {
  title?: string;
  model?: string;
  personaId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}): Promise<Conversation> {
  return apiFetch<Conversation>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function listConversations(search?: string, page?: number): Promise<ConversationsListResponse> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (page) params.set('page', String(page));
  const qs = params.toString();
  const raw = await apiFetch<{
    conversations: Record<string, unknown>[];
    total: number;
    page: number;
    page_size?: number;
    pageSize?: number;
  }>(`/api/conversations${qs ? `?${qs}` : ''}`);
  return {
    conversations: (raw.conversations || []).map(mapConversation),
    total: raw.total,
    page: raw.page,
    pageSize: raw.pageSize || raw.page_size || 20,
  };
}

export async function getConversation(id: string): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>(`/api/conversations/${id}`);
}

export async function updateConversation(id: string, params: Record<string, unknown>): Promise<Conversation> {
  return apiFetch<Conversation>(`/api/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(params),
  });
}

export async function deleteConversation(id: string): Promise<void> {
  return apiFetch<void>(`/api/conversations/${id}`, { method: 'DELETE' });
}

// ── Messages ──

// SSE endpoints must bypass Next.js rewrite (which buffers responses).
// In dev, hit the backend directly. In production, use same-origin.
const SSE_BASE = typeof window !== 'undefined' && window.location.port === '5173'
  ? 'http://localhost:8000'
  : '';

export async function sendMessage(
  conversationId: string,
  content: string,
  attachments?: string[],
  model?: string,
  parentId?: string,
  numResponses?: number,
  signal?: AbortSignal,
  contextIds?: string[],
  agentPersonaId?: string,
  knowledgeBaseIds?: string[],
): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!token) {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }
  const response = await fetch(`${SSE_BASE}/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers,
    credentials: 'include',
    signal,
    body: JSON.stringify({
      content, attachments, model,
      parent_id: parentId,
      ...(numResponses && numResponses > 1 ? { num_responses: numResponses } : {}),
      ...(contextIds && contextIds.length > 0 ? { context_conversation_ids: contextIds } : {}),
      ...(agentPersonaId ? { agent_persona_id: agentPersonaId } : {}),
      ...(knowledgeBaseIds && knowledgeBaseIds.length > 0 ? { knowledge_base_ids: knowledgeBaseIds } : {}),
    }),
  });
  if (!response.ok) {
    let errorBody: unknown;
    try { errorBody = await response.json(); } catch { errorBody = null; }
    throw new ApiError(
      response.status,
      (errorBody as { detail?: string })?.detail || response.statusText,
      errorBody,
    );
  }
  return response;
}

export async function forkMessage(conversationId: string, messageId: string): Promise<Conversation> {
  return apiFetch<Conversation>(`/api/conversations/${conversationId}/messages/${messageId}/fork`, {
    method: 'POST',
  });
}

export async function submitFeedback(
  conversationId: string,
  messageId: string,
  feedback: 'up' | 'down' | null,
): Promise<void> {
  return apiFetch<void>(`/api/conversations/${conversationId}/messages/${messageId}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ rating: feedback || 'up' }),
  });
}

export async function regenerateMessage(conversationId: string, messageId: string, signal?: AbortSignal, model?: string): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!token) {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }
  if (model) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${SSE_BASE}/api/conversations/${conversationId}/messages/${messageId}/regenerate`, {
    method: 'POST',
    headers,
    credentials: 'include',
    signal,
    ...(model ? { body: JSON.stringify({ model }) } : {}),
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response;
}

// ── Branching ──

export async function getConversationTree(conversationId: string): Promise<ConversationTree> {
  return apiFetch<ConversationTree>(`/api/conversations/${conversationId}/tree`);
}

export async function switchBranch(conversationId: string, leafId: string): Promise<{
  active_leaf_id: string;
  messages: Record<string, unknown>[];
}> {
  return apiFetch(`/api/conversations/${conversationId}/switch-branch`, {
    method: 'POST',
    body: JSON.stringify({ leaf_id: leafId }),
  });
}

// ── Artifacts ──

export async function getArtifacts(conversationId: string): Promise<Artifact[]> {
  return apiFetch<Artifact[]>(`/api/conversations/${conversationId}/artifacts`);
}

export async function deleteArtifact(id: string): Promise<void> {
  return apiFetch<void>(`/api/artifacts/${id}`, { method: 'DELETE' });
}

export async function updateArtifact(id: string, params: Partial<Artifact>): Promise<Artifact> {
  return apiFetch<Artifact>(`/api/artifacts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(params),
  });
}

// ── Sandbox ──

export interface SandboxInfo {
  id: string;
  status: 'creating' | 'running' | 'stopped';
  template?: string;
  createdAt: string;
}

export async function createSandbox(params: { template?: string; language?: string }): Promise<SandboxInfo> {
  return apiFetch<SandboxInfo>('/api/sandboxes', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function getSandbox(id: string): Promise<SandboxInfo> {
  return apiFetch<SandboxInfo>(`/api/sandboxes/${id}`);
}

export async function executeSandbox(id: string, language: string, code: string) {
  return apiFetch<{ stdout: string; stderr: string; exitCode: number; duration: number }>(
    `/api/sandboxes/${id}/execute`,
    { method: 'POST', body: JSON.stringify({ language, code }) },
  );
}

export async function listSandboxFiles(id: string, path?: string): Promise<FileNode[]> {
  const params = new URLSearchParams();
  if (path) params.set('path', path);
  const qs = params.toString();
  return apiFetch<FileNode[]>(`/api/sandboxes/${id}/files${qs ? `?${qs}` : ''}`);
}

export async function readSandboxFile(id: string, path: string): Promise<{ content: string; language: string }> {
  return apiFetch<{ content: string; language: string }>(
    `/api/sandboxes/${id}/files/read?path=${encodeURIComponent(path)}`,
  );
}

export async function writeSandboxFile(id: string, path: string, content: string): Promise<void> {
  return apiFetch<void>(`/api/sandboxes/${id}/files/write`, {
    method: 'POST',
    body: JSON.stringify({ path, content }),
  });
}

export async function uploadSandboxFiles(id: string, files: File[]): Promise<{ ids: string[] }> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  return apiFetch<{ ids: string[] }>(`/api/sandboxes/${id}/files/upload`, {
    method: 'POST',
    body: formData,
  });
}

export async function stopSandbox(id: string): Promise<void> {
  return apiFetch<void>(`/api/sandboxes/${id}/stop`, { method: 'POST' });
}

export async function startSandbox(id: string): Promise<void> {
  return apiFetch<void>(`/api/sandboxes/${id}/start`, { method: 'POST' });
}

export async function deleteSandbox(id: string): Promise<void> {
  return apiFetch<void>(`/api/sandboxes/${id}`, { method: 'DELETE' });
}

// ── Agents ──

function agentToSnake(params: Partial<AgentPersona>) {
  return {
    name: params.name,
    description: params.description,
    system_prompt: params.systemPrompt,
    default_model: params.defaultModel,
    icon: params.icon,
    is_public: params.isPublic,
  };
}

function agentFromSnake(raw: Record<string, unknown>): AgentPersona {
  return {
    id: (raw.id as string) || '',
    name: (raw.name as string) || '',
    icon: (raw.icon as string) || 'Bot',
    description: (raw.description as string) || '',
    systemPrompt: (raw.system_prompt as string) || (raw.systemPrompt as string) || '',
    defaultModel: (raw.default_model as string) || (raw.defaultModel as string) || undefined,
    tools: (raw.tools_enabled as string[]) || (raw.tools as string[]) || undefined,
    isPublic: (raw.is_public as boolean) ?? (raw.isPublic as boolean) ?? false,
    authorId: (raw.user_id as string) || (raw.authorId as string) || undefined,
    createdAt: (raw.created_at as string) || (raw.createdAt as string) || undefined,
  };
}

export async function createAgent(params: Partial<AgentPersona>): Promise<AgentPersona> {
  const raw = await apiFetch<Record<string, unknown>>('/api/agents', {
    method: 'POST',
    body: JSON.stringify(agentToSnake(params)),
  });
  return agentFromSnake(raw);
}

export async function listAgents(): Promise<AgentPersona[]> {
  const raw = await apiFetch<Record<string, unknown>[]>('/api/agents');
  return raw.map(agentFromSnake);
}

export async function getAgent(id: string): Promise<AgentPersona> {
  const raw = await apiFetch<Record<string, unknown>>(`/api/agents/${id}`);
  return agentFromSnake(raw);
}

export async function updateAgent(id: string, params: Partial<AgentPersona>): Promise<AgentPersona> {
  const raw = await apiFetch<Record<string, unknown>>(`/api/agents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(agentToSnake(params)),
  });
  return agentFromSnake(raw);
}

export async function deleteAgent(id: string): Promise<void> {
  return apiFetch<void>(`/api/agents/${id}`, { method: 'DELETE' });
}

export async function duplicateAgent(id: string): Promise<AgentPersona> {
  return apiFetch<AgentPersona>(`/api/agents/${id}/duplicate`, { method: 'POST' });
}

// ── Error Reporting ──

export async function reportError(params: {
  message: string;
  stack?: string;
  url?: string;
  component?: string;
  request_id?: string;
  extra?: Record<string, unknown>;
}): Promise<void> {
  try {
    await apiFetch<void>('/api/errors', {
      method: 'POST',
      body: JSON.stringify({
        ...params,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      }),
    });
  } catch {
    // Don't throw if error reporting itself fails
  }
}

// ── Health ──

export interface HealthCheck {
  status: 'ok' | 'degraded';
  checks: {
    db: { status: string; error?: string };
    llm: { status: string; error?: string };
    daytona: { status: string; error?: string };
  };
  latency_ms: number;
}

export async function getHealth(): Promise<HealthCheck> {
  // Hit backend directly (bypass Next.js rewrite)
  const base = typeof window !== 'undefined' && window.location.port === '5173'
    ? 'http://localhost:8000'
    : '';
  const resp = await fetch(`${base}/health`);
  return resp.json();
}

// ── Feedback ──
export async function submitEnhancedFeedback(
  conversationId: string, messageId: string,
  params: { rating: 'up' | 'down'; tags?: string[]; comment?: string }
): Promise<void> {
  return apiFetch<void>(`/api/conversations/${conversationId}/messages/${messageId}/feedback`, {
    method: 'POST', body: JSON.stringify(params),
  });
}

// ── Analytics ──
export async function trackEvent(eventType: string, eventData?: Record<string, unknown>): Promise<void> {
  try {
    await apiFetch<void>('/api/analytics/events', {
      method: 'POST', body: JSON.stringify({ event_type: eventType, event_data: eventData }),
    });
  } catch {} // Fire and forget
}

export async function getMyUsage(): Promise<{
  conversations_this_week: number; tokens_this_month: number;
  cost_this_month: number; favorite_model: string | null;
}> {
  return apiFetch('/api/analytics/me');
}

// ── Admin ──
export async function getAdminOverview(): Promise<Record<string, unknown>> {
  return apiFetch('/api/admin/overview');
}
export async function getAdminFeedback(params?: { page?: number; rating?: string; model?: string }): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.rating) qs.set('rating', params.rating);
  if (params?.model) qs.set('model', params.model);
  const q = qs.toString();
  return apiFetch(`/api/admin/feedback${q ? `?${q}` : ''}`);
}
export async function getAdminFeedbackStats(): Promise<Record<string, unknown>> {
  return apiFetch('/api/admin/feedback/stats');
}
export async function getAdminUsage(): Promise<Record<string, unknown>> {
  return apiFetch('/api/admin/usage');
}
export async function getAdminUsers(): Promise<Record<string, unknown>[]> {
  return apiFetch('/api/admin/users');
}
export async function updateAdminUser(userId: string, params: { is_admin?: boolean }): Promise<void> {
  return apiFetch(`/api/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(params) });
}
export async function getAdminModels(): Promise<Record<string, unknown>[]> {
  return apiFetch('/api/admin/models');
}
export async function getAdminErrors(page?: number): Promise<Record<string, unknown>> {
  const qs = page ? `?page=${page}` : '';
  return apiFetch(`/api/admin/errors${qs}`);
}

// ── User ──

export async function getCurrentUser(): Promise<User> {
  return apiFetch<User>('/auth/me');
}

export async function logout(): Promise<void> {
  return apiFetch<void>('/auth/logout', { method: 'POST' });
}

// ── Knowledge Bases ──

function kbFromSnake(raw: Record<string, unknown>): KnowledgeBase {
  return {
    id: (raw.id as string) || '',
    userId: (raw.user_id as string) || '',
    name: (raw.name as string) || '',
    description: (raw.description as string) || undefined,
    embeddingModel: (raw.embedding_model as string) || 'text-embedding-3-small',
    chunkStrategy: (raw.chunk_strategy as string) || 'contextual',
    documentCount: (raw.document_count as number) || 0,
    chunkCount: (raw.chunk_count as number) || 0,
    status: (raw.status as KnowledgeBase['status']) || 'ready',
    isPublic: (raw.is_public as boolean) ?? false,
    createdAt: (raw.created_at as string) || '',
    updatedAt: (raw.updated_at as string) || '',
  };
}

function kbDocFromSnake(raw: Record<string, unknown>): KBDocument {
  return {
    id: (raw.id as string) || '',
    filename: (raw.filename as string) || '',
    contentType: (raw.content_type as string) || '',
    fileSizeBytes: (raw.file_size_bytes as number) || 0,
    pageCount: (raw.page_count as number) || undefined,
    status: (raw.status as KBDocument['status']) || 'processing',
    errorMessage: (raw.error_message as string) || undefined,
    metadata: raw.metadata as Record<string, unknown> | undefined,
    createdAt: (raw.created_at as string) || '',
  };
}

export async function createKnowledgeBase(params: { name: string; description?: string; isPublic?: boolean }): Promise<KnowledgeBase> {
  const raw = await apiFetch<Record<string, unknown>>('/api/knowledge-bases', {
    method: 'POST',
    body: JSON.stringify({ name: params.name, description: params.description, is_public: params.isPublic }),
  });
  return kbFromSnake(raw);
}

export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  const raw = await apiFetch<Record<string, unknown>[]>('/api/knowledge-bases');
  return raw.map(kbFromSnake);
}

export async function getKnowledgeBase(id: string): Promise<KnowledgeBase> {
  const raw = await apiFetch<Record<string, unknown>>(`/api/knowledge-bases/${id}`);
  return kbFromSnake(raw);
}

export async function updateKnowledgeBase(id: string, params: { name?: string; description?: string; isPublic?: boolean }): Promise<KnowledgeBase> {
  const raw = await apiFetch<Record<string, unknown>>(`/api/knowledge-bases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: params.name, description: params.description, is_public: params.isPublic }),
  });
  return kbFromSnake(raw);
}

export async function deleteKnowledgeBase(id: string): Promise<void> {
  return apiFetch<void>(`/api/knowledge-bases/${id}`, { method: 'DELETE' });
}

export async function uploadKBDocuments(kbId: string, files: File[]): Promise<{ documents: KBDocument[] }> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  const raw = await apiFetch<{ documents: Record<string, unknown>[] }>(`/api/knowledge-bases/${kbId}/documents`, {
    method: 'POST',
    body: formData,
  });
  return { documents: raw.documents.map(kbDocFromSnake) };
}

export async function listKBDocuments(kbId: string): Promise<KBDocument[]> {
  const raw = await apiFetch<Record<string, unknown>[]>(`/api/knowledge-bases/${kbId}/documents`);
  return raw.map(kbDocFromSnake);
}

export async function deleteKBDocument(kbId: string, docId: string): Promise<void> {
  return apiFetch<void>(`/api/knowledge-bases/${kbId}/documents/${docId}`, { method: 'DELETE' });
}

export async function searchKnowledgeBase(kbId: string, query: string, topK?: number): Promise<{
  query: string; confidence: number; totalCandidates: number; results: Array<{
    chunkId: string; documentId: string; filename: string; page?: number;
    section?: string; score: number; content: string; contextPrefix?: string;
  }>;
}> {
  return apiFetch(`/api/knowledge-bases/${kbId}/search`, {
    method: 'POST',
    body: JSON.stringify({ query, top_k: topK }),
  });
}

export async function uploadConversationDocuments(convId: string, files: File[]): Promise<{ documents: KBDocument[] }> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  const raw = await apiFetch<{ documents: Record<string, unknown>[] }>(`/api/conversations/${convId}/documents`, {
    method: 'POST',
    body: formData,
  });
  return { documents: raw.documents.map(kbDocFromSnake) };
}

export async function listConversationDocuments(convId: string): Promise<KBDocument[]> {
  const raw = await apiFetch<Record<string, unknown>[]>(`/api/conversations/${convId}/documents`);
  return raw.map(kbDocFromSnake);
}

export async function getRetrievalLog(messageId: string): Promise<Record<string, unknown>> {
  return apiFetch(`/api/messages/${messageId}/retrieval`);
}
