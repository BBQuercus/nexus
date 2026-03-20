// ============================================================
// API Service — Typed fetch wrapper
// ============================================================

import type { Conversation, Message, Artifact, AgentPersona, User, FileNode } from '../state';

// In production, API_BASE points to the backend service directly.
// In dev, Vite proxies /api to localhost:8000 so we use ''.
const API_BASE = import.meta.env.VITE_API_BASE || '';

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
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  // Add auth token from localStorage
  const { getToken } = await import('../auth');
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Add JSON content-type for non-FormData bodies
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
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

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  return undefined as T;
}

// ── Conversations ──────────────────────────────────────────

export interface CreateConversationParams {
  title?: string;
  model?: string;
  mode?: 'chat' | 'code' | 'architect';
  personaId?: string;
}

export interface UpdateConversationParams {
  title?: string;
  model?: string;
  mode?: string;
}

export interface ConversationsListResponse {
  conversations: Conversation[];
  total: number;
  page: number;
  pageSize: number;
}

export async function createConversation(params: CreateConversationParams): Promise<Conversation> {
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
  const raw = await apiFetch<{ conversations: Record<string, unknown>[]; total: number; page: number; page_size?: number; pageSize?: number }>(
    `/api/conversations${qs ? `?${qs}` : ''}`
  );
  return {
    conversations: (raw.conversations || []).map(mapConversation),
    total: raw.total,
    page: raw.page,
    pageSize: raw.pageSize || raw.page_size || 20,
  };
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

export async function getConversation(id: string): Promise<Conversation> {
  return apiFetch<Conversation>(`/api/conversations/${id}`);
}

export async function updateConversation(id: string, params: UpdateConversationParams): Promise<Conversation> {
  return apiFetch<Conversation>(`/api/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(params),
  });
}

export async function deleteConversation(id: string): Promise<void> {
  return apiFetch<void>(`/api/conversations/${id}`, { method: 'DELETE' });
}

// ── Messages ───────────────────────────────────────────────

export interface SendMessageParams {
  content: string;
  attachments?: string[];  // attachment IDs
}

export async function sendMessage(
  conversationId: string,
  content: string,
  attachments?: string[],
  model?: string,
  mode?: string,
): Promise<Response> {
  const url = `${API_BASE}/api/conversations/${conversationId}/messages`;
  const { getToken } = await import('../auth');
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ content, attachments, model, mode }),
  });
  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = null;
    }
    throw new ApiError(
      response.status,
      (errorBody as { detail?: string })?.detail || response.statusText,
      errorBody
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
  feedback: 'up' | 'down' | null
): Promise<void> {
  return apiFetch<void>(`/api/conversations/${conversationId}/messages/${messageId}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ feedback }),
  });
}

export async function regenerateMessage(conversationId: string, messageId: string): Promise<Response> {
  const url = `${API_BASE}/api/conversations/${conversationId}/messages/${messageId}/regenerate`;
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response;
}

// ── Artifacts ──────────────────────────────────────────────

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

// ── Sandbox ────────────────────────────────────────────────

export interface CreateSandboxParams {
  template?: string;
  language?: string;
}

export interface SandboxInfo {
  id: string;
  status: 'creating' | 'running' | 'stopped';
  template?: string;
  createdAt: string;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export async function createSandbox(params: CreateSandboxParams): Promise<SandboxInfo> {
  return apiFetch<SandboxInfo>('/api/sandboxes', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function getSandbox(id: string): Promise<SandboxInfo> {
  return apiFetch<SandboxInfo>(`/api/sandboxes/${id}`);
}

export async function executeSandbox(id: string, language: string, code: string): Promise<ExecutionResult> {
  return apiFetch<ExecutionResult>(`/api/sandboxes/${id}/execute`, {
    method: 'POST',
    body: JSON.stringify({ language, code }),
  });
}

export async function listSandboxFiles(id: string, path?: string): Promise<FileNode[]> {
  const params = new URLSearchParams();
  if (path) params.set('path', path);
  const qs = params.toString();
  return apiFetch<FileNode[]>(`/api/sandboxes/${id}/files${qs ? `?${qs}` : ''}`);
}

export async function readSandboxFile(id: string, path: string): Promise<{ content: string; language: string }> {
  return apiFetch<{ content: string; language: string }>(
    `/api/sandboxes/${id}/files/read?path=${encodeURIComponent(path)}`
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

export async function listOutputFiles(id: string): Promise<{ filename: string; size: number; url: string }[]> {
  return apiFetch<{ filename: string; size: number; url: string }[]>(`/api/sandboxes/${id}/outputs`);
}

export async function getOutputFileUrl(id: string, filename: string): Promise<string> {
  const result = await apiFetch<{ url: string }>(
    `/api/sandboxes/${id}/outputs/${encodeURIComponent(filename)}/url`
  );
  return result.url;
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

// ── Agents / Personas ──────────────────────────────────────

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

export async function listPublicAgents(): Promise<AgentPersona[]> {
  return apiFetch<AgentPersona[]>('/api/agents/public');
}

export async function duplicateAgent(id: string): Promise<AgentPersona> {
  return apiFetch<AgentPersona>(`/api/agents/${id}/duplicate`, { method: 'POST' });
}

// ── User ───────────────────────────────────────────────────

export interface UsageData {
  totalCost: number;
  totalTokens: number;
  conversationCount: number;
  period: string;
}

export interface UsageHistoryEntry {
  date: string;
  cost: number;
  tokens: number;
  messages: number;
}

export async function getCurrentUser(): Promise<User> {
  return apiFetch<User>('/auth/me');
}

export async function getUsage(): Promise<UsageData> {
  return apiFetch<UsageData>('/api/usage');
}

export async function getUsageHistory(): Promise<UsageHistoryEntry[]> {
  return apiFetch<UsageHistoryEntry[]>('/api/usage/history');
}

export async function logout(): Promise<void> {
  return apiFetch<void>('/auth/logout', { method: 'POST' });
}

// ── Text to Speech ─────────────────────────────────────────

export async function textToSpeech(text: string, voice?: string): Promise<Blob> {
  const url = `${API_BASE}/api/tts`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ text, voice }),
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.blob();
}
