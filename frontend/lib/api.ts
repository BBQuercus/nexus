import type { Conversation, Message, Artifact, AgentPersona, User, FileNode, ConversationTree } from './types';
import { getToken } from './auth';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
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
    const message = (errorBody as { detail?: string })?.detail || response.statusText;
    throw new ApiError(response.status, message, errorBody);
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
    mode: (c.agent_mode as Conversation['mode']) || (c.mode as Conversation['mode']) || undefined,
    sandboxId: (c.sandbox_id as string) || (c.sandboxId as string) || undefined,
    personaId: (c.persona_id as string) || (c.personaId as string) || undefined,
    messageCount: (c.message_count as number) || (c.messageCount as number) || undefined,
  };
}

export async function createConversation(params: {
  title?: string;
  model?: string;
  mode?: string;
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
  mode?: string,
  parentId?: string,
): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${SSE_BASE}/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ content, attachments, model, mode, parent_id: parentId }),
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
    body: JSON.stringify({ feedback }),
  });
}

export async function regenerateMessage(conversationId: string, messageId: string): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${SSE_BASE}/api/conversations/${conversationId}/messages/${messageId}/regenerate`, {
    method: 'POST',
    headers,
    credentials: 'include',
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

export async function createAgent(params: Partial<AgentPersona>): Promise<AgentPersona> {
  return apiFetch<AgentPersona>('/api/agents', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function listAgents(): Promise<AgentPersona[]> {
  return apiFetch<AgentPersona[]>('/api/agents');
}

export async function getAgent(id: string): Promise<AgentPersona> {
  return apiFetch<AgentPersona>(`/api/agents/${id}`);
}

export async function updateAgent(id: string, params: Partial<AgentPersona>): Promise<AgentPersona> {
  return apiFetch<AgentPersona>(`/api/agents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(params),
  });
}

export async function deleteAgent(id: string): Promise<void> {
  return apiFetch<void>(`/api/agents/${id}`, { method: 'DELETE' });
}

export async function duplicateAgent(id: string): Promise<AgentPersona> {
  return apiFetch<AgentPersona>(`/api/agents/${id}/duplicate`, { method: 'POST' });
}

// ── User ──

export async function getCurrentUser(): Promise<User> {
  return apiFetch<User>('/auth/me');
}

export async function logout(): Promise<void> {
  return apiFetch<void>('/auth/logout', { method: 'POST' });
}
