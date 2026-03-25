import type { Conversation, Message, Artifact, AgentPersona, User, FileNode, ConversationTree, KnowledgeBase, KBDocument, Citation, Project, SearchResult } from './types';
import { getCsrfToken } from './auth';
import { toApiUrl } from './runtime';

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
      _toast = require('@/components/toast').toast; // dynamic require to avoid circular deps
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

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // Include CSRF token for state-changing requests (cookie-based auth)
  if (typeof document !== 'undefined') {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const response = await fetch(toApiUrl(path), {
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

    // 401 → redirect to login
    if (response.status === 401) {
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
      throw new ApiError(response.status, message, errorBody, requestId);
    }

    // Toast for all other API errors (except error reporting itself)
    if (!path.includes('/api/errors')) {
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
    projectId: (c.project_id as string) || (c.projectId as string) || undefined,
    messageCount: (c.message_count as number) || (c.messageCount as number) || undefined,
  };
}

export async function createConversation(params: {
  title?: string;
  model?: string;
  personaId?: string;
  [key: string]: unknown;
}): Promise<Conversation> {
  return apiFetch<Conversation>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function listConversations(search?: string, page?: number, projectId?: string): Promise<ConversationsListResponse> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (page) params.set('page', String(page));
  if (projectId) params.set('project_id', projectId);
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
  compareModels?: string[],
  temperature?: number,
  verbosity?: string,
  tone?: string,
  images?: { filename: string; dataUrl: string }[],
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const csrfToken = getCsrfToken();
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(toApiUrl(`/api/conversations/${conversationId}/messages`), {
    method: 'POST',
    headers,
    credentials: 'include',
    signal,
    body: JSON.stringify({
      content, attachments, model,
      parent_id: parentId,
      ...(numResponses && numResponses > 1 ? { num_responses: numResponses } : {}),
      ...(compareModels && compareModels.length > 1 ? { compare_models: compareModels } : {}),
      ...(contextIds && contextIds.length > 0 ? { context_conversation_ids: contextIds } : {}),
      ...(agentPersonaId ? { agent_persona_id: agentPersonaId } : {}),
      ...(knowledgeBaseIds !== undefined ? { knowledge_base_ids: knowledgeBaseIds } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(verbosity ? { verbosity } : {}),
      ...(tone ? { tone } : {}),
      ...(images && images.length > 0 ? { images: images.map((img) => ({ filename: img.filename, data_url: img.dataUrl })) } : {}),
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
  const headers: Record<string, string> = {};
  const csrfToken = getCsrfToken();
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  if (model) headers['Content-Type'] = 'application/json';
  const response = await fetch(toApiUrl(`/api/conversations/${conversationId}/messages/${messageId}/regenerate`), {
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

export async function generateConversationImage(
  conversationId: string,
  params: { prompt: string; model?: string; size?: string },
): Promise<{ user_message: Record<string, unknown>; assistant_message: Record<string, unknown>; active_leaf_id: string }> {
  return apiFetch(`/api/conversations/${conversationId}/images`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ── Branching ──

export async function getConversationTree(conversationId: string): Promise<ConversationTree> {
  return apiFetch<ConversationTree>(`/api/conversations/${conversationId}/tree`);
}

export async function getMessageSiblings(conversationId: string, messageId: string): Promise<Record<string, unknown>[]> {
  return apiFetch<Record<string, unknown>[]>(`/api/conversations/${conversationId}/messages/${messageId}/siblings`);
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
    llm: {
      status: string;
      error?: string;
      health_url?: string;
      affected_models?: string[];
      available_models?: string[];
    };
    daytona: { status: string; error?: string };
  };
  latency_ms: number;
}

export async function getHealth(): Promise<HealthCheck> {
  const resp = await fetch(toApiUrl('/health'));
  return resp.json();
}

export async function transcribeAudio(file: File, model = 'azure/whisper-1'): Promise<{ text: string; model: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', model);
  return apiFetch('/api/media/transcribe', {
    method: 'POST',
    body: formData,
  });
}

export async function synthesizeAudio(
  params: { text: string; model?: string; voice?: string; format?: string },
): Promise<Blob> {
  const headers: Record<string, string> = {};
  const csrfToken = getCsrfToken();
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(toApiUrl('/api/media/speak'), {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text().catch(() => null);
    }
    throw new ApiError(
      response.status,
      (errorBody as { detail?: string })?.detail || response.statusText,
      errorBody,
    );
  }
  return response.blob();
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
export async function updateAdminUser(userId: string, params: { role?: string }): Promise<void> {
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

export async function passwordLogin(email: string, password: string): Promise<void> {
  return apiFetch<void>('/auth/password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function registerAccount(email: string, password: string, name?: string): Promise<void> {
  return apiFetch<void>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
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

export interface KBChunk {
  id: string;
  chunkIndex: number;
  content: string;
  contextPrefix?: string;
  pageNumber?: number;
  sectionTitle?: string;
  tokenCount: number;
}

export async function getKBDocumentContent(kbId: string, docId: string): Promise<{
  id: string; filename: string; contentType: string; rawText: string;
}> {
  const raw = await apiFetch<Record<string, unknown>>(`/api/knowledge-bases/${kbId}/documents/${docId}/content`);
  return {
    id: (raw.id as string) || '',
    filename: (raw.filename as string) || '',
    contentType: (raw.content_type as string) || '',
    rawText: (raw.raw_text as string) || '',
  };
}

export async function getKBDocumentChunks(kbId: string, docId: string): Promise<KBChunk[]> {
  const raw = await apiFetch<Record<string, unknown>[]>(`/api/knowledge-bases/${kbId}/documents/${docId}/chunks`);
  return raw.map((c) => ({
    id: (c.id as string) || '',
    chunkIndex: (c.chunk_index as number) || 0,
    content: (c.content as string) || '',
    contextPrefix: (c.context_prefix as string) || undefined,
    pageNumber: (c.page_number as number) || undefined,
    sectionTitle: (c.section_title as string) || undefined,
    tokenCount: (c.token_count as number) || 0,
  }));
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

// ── Projects ──

function projectFromSnake(raw: Record<string, unknown>): Project {
  return {
    id: (raw.id as string) || '',
    name: (raw.name as string) || '',
    description: (raw.description as string) || undefined,
    icon: (raw.icon as string) || undefined,
    color: (raw.color as string) || undefined,
    default_model: (raw.default_model as string) || undefined,
    default_persona_id: (raw.default_persona_id as string) || undefined,
    knowledge_base_ids: (raw.knowledge_base_ids as string[]) || [],
    pinned_conversation_ids: (raw.pinned_conversation_ids as string[]) || [],
    settings: (raw.settings as Record<string, unknown>) || {},
    conversation_count: (raw.conversation_count as number) || 0,
    archived: (raw.archived as boolean) ?? false,
    created_at: (raw.created_at as string) || '',
    updated_at: (raw.updated_at as string) || '',
  };
}

export async function createProject(params: {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  default_model?: string;
}): Promise<Project> {
  const raw = await apiFetch<Record<string, unknown>>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return projectFromSnake(raw);
}

export async function listProjects(includeArchived = false): Promise<Project[]> {
  const qs = includeArchived ? '?include_archived=true' : '';
  const raw = await apiFetch<Record<string, unknown>[]>(`/api/projects${qs}`);
  return raw.map(projectFromSnake);
}

export async function getProject(id: string): Promise<Project> {
  const raw = await apiFetch<Record<string, unknown>>(`/api/projects/${id}`);
  return projectFromSnake(raw);
}

export async function updateProject(id: string, params: Partial<Project>): Promise<Project> {
  const raw = await apiFetch<Record<string, unknown>>(`/api/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(params),
  });
  return projectFromSnake(raw);
}

export async function deleteProject(id: string): Promise<void> {
  return apiFetch<void>(`/api/projects/${id}`, { method: 'DELETE' });
}

export async function moveConversationToProject(
  projectId: string,
  conversationId: string,
): Promise<void> {
  return apiFetch<void>(`/api/projects/${projectId}/conversations`, {
    method: 'POST',
    body: JSON.stringify({ conversation_id: conversationId }),
  });
}

export async function listProjectConversations(
  projectId: string,
  page = 1,
): Promise<ConversationsListResponse> {
  const raw = await apiFetch<{
    conversations: Record<string, unknown>[];
    total: number;
    page: number;
    page_size?: number;
  }>(`/api/projects/${projectId}/conversations?page=${page}`);
  return {
    conversations: (raw.conversations || []).map(mapConversation),
    total: raw.total,
    page: raw.page,
    pageSize: raw.page_size || 50,
  };
}

// ── Search ──

export async function searchAll(
  query: string,
  scope: 'all' | 'conversations' | 'messages' | 'artifacts' = 'all',
  limit = 20,
): Promise<SearchResult> {
  const params = new URLSearchParams({ q: query, scope, limit: String(limit) });
  return apiFetch<SearchResult>(`/api/search?${params.toString()}`);
}

// ── Memory API ──

import type { Memory } from './types';

function memoryFromSnake(raw: Record<string, unknown>): Memory {
  return {
    id: raw.id as string,
    scope: raw.scope as Memory['scope'],
    category: raw.category as Memory['category'],
    content: raw.content as string,
    project_id: raw.project_id as string | undefined,
    source_conversation_id: raw.source_conversation_id as string | undefined,
    source_message_id: raw.source_message_id as string | undefined,
    relevance_count: raw.relevance_count as number,
    active: raw.active as boolean,
    created_at: raw.created_at as string,
    updated_at: raw.updated_at as string,
  };
}

export async function createMemory(params: {
  content: string;
  scope?: string;
  category?: string;
  project_id?: string;
}): Promise<Memory> {
  const raw = await apiFetch<Record<string, unknown>>('/api/memory', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return memoryFromSnake(raw);
}

export async function listMemories(params?: {
  scope?: string;
  category?: string;
  project_id?: string;
  active?: boolean;
}): Promise<Memory[]> {
  const qs = new URLSearchParams();
  if (params?.scope) qs.set('scope', params.scope);
  if (params?.category) qs.set('category', params.category);
  if (params?.project_id) qs.set('project_id', params.project_id);
  if (params?.active !== undefined) qs.set('active', String(params.active));
  const q = qs.toString();
  const raw = await apiFetch<Record<string, unknown>[]>(`/api/memory${q ? `?${q}` : ''}`);
  return raw.map(memoryFromSnake);
}

export async function updateMemory(id: string, params: {
  content?: string;
  scope?: string;
  category?: string;
  active?: boolean;
  project_id?: string;
}): Promise<Memory> {
  const raw = await apiFetch<Record<string, unknown>>(`/api/memory/${id}`, {
    method: 'PUT',
    body: JSON.stringify(params),
  });
  return memoryFromSnake(raw);
}

export async function deleteMemory(id: string): Promise<void> {
  return apiFetch<void>(`/api/memory/${id}`, { method: 'DELETE' });
}
