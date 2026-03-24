export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  isAdmin?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model?: string;
  personaId?: string;
  sandboxId?: string;
  messageCount?: number;
  pinned?: boolean;
  preview?: string;
}

export interface MessageAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  language?: string;
  code?: string;
  output?: string;
  stderr?: string;
  exitCode?: number;
  duration?: number;
  isRunning?: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  attachments?: MessageAttachment[];
  toolCalls?: ToolCall[];
  reasoning?: string;
  reasoningTokens?: number;
  cost?: CostData;
  feedback?: 'up' | 'down' | null;
  model?: string;
  images?: { filename: string; url: string }[];
  files?: { filename: string; fileType: string; sandboxId?: string }[];
  citations?: Citation[];
  contexts?: { id: string; title: string }[];
  parentId?: string | null;
  branchIndex?: number;
}

export interface TreeNode {
  id: string;
  parentId: string | null;
  role: 'user' | 'assistant';
  branchIndex: number;
  preview: string;
  childCount: number;
  createdAt: string;
}

export interface ConversationTree {
  nodes: TreeNode[];
  activeLeafId: string;
}

export interface CostData {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  model: string;
  duration: number;
}

export interface Artifact {
  id: string;
  conversationId: string;
  type: 'code' | 'image' | 'chart' | 'table' | 'document' | 'diagram';
  label: string;
  content?: string;
  url?: string;
  metadata?: Record<string, unknown>;
  pinned?: boolean;
  createdAt: string;
}

export interface AgentPersona {
  id: string;
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
  defaultModel?: string;
  tools?: string[];
  isPublic?: boolean;
  authorId?: string;
  createdAt?: string;
}

// ── RAG Types ──

export interface Citation {
  chunkId: string;
  documentId: string;
  filename: string;
  page?: number;
  section?: string;
  score: number;
  snippet: string;
}

export interface RetrievalResult {
  query: string;
  confidence: number;
  sources: Citation[];
}

export interface KnowledgeBase {
  id: string;
  userId: string;
  name: string;
  description?: string;
  embeddingModel: string;
  chunkStrategy: string;
  documentCount: number;
  chunkCount: number;
  status: 'ready' | 'processing' | 'error';
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KBDocument {
  id: string;
  filename: string;
  contentType: string;
  fileSizeBytes: number;
  pageCount?: number;
  status: 'processing' | 'ready' | 'error';
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedAt?: string;
  children?: FileNode[];
}

export type ModelProvider = 'anthropic' | 'openai' | 'meta';

export interface ModelOption {
  name: string;
  id: string;
  provider: ModelProvider;
}

export const MODELS: ModelOption[] = [
  { name: 'Claude Sonnet 4.5', id: 'azure_ai/claude-sonnet-4-5-swc', provider: 'anthropic' },
  { name: 'Claude Opus 4.5', id: 'azure_ai/claude-opus-4-5-swc', provider: 'anthropic' },
  { name: 'GPT-5', id: 'gpt-5-gwc', provider: 'openai' },
  { name: 'GPT-5 Mini', id: 'gpt-5-mini-gwc', provider: 'openai' },
  { name: 'GPT-4.1', id: 'gpt-4.1-chn', provider: 'openai' },
  { name: 'GPT-4o', id: 'gpt-4o-swc', provider: 'openai' },
  { name: 'Llama 3.3 70B', id: 'Llama-3.3-70B-Instruct', provider: 'meta' },
];
