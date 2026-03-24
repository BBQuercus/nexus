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
  tables?: { rows: string[][]; label?: string }[];
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

export interface StreamingTable {
  rows: string[][];
  label?: string;
}

export interface StreamingChart {
  spec: Record<string, unknown>;
  title?: string;
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
  knowledgeBaseId?: string;
  filename: string;
  chunkIndex?: number;
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

export type ModelProvider = 'anthropic' | 'openai' | 'meta' | 'microsoft' | 'xai' | 'moonshot' | 'deepseek';

export interface ModelOption {
  name: string;
  id: string;
  provider: ModelProvider;
  legacy?: boolean;
}

export const DEFAULT_MODEL_ID = 'azure_ai/model_router';

export const MODELS: ModelOption[] = [
  { name: 'Claude Sonnet 4.5', id: 'azure_ai/claude-sonnet-4-5-swc', provider: 'anthropic' },
  { name: 'Claude Opus 4.5', id: 'azure_ai/claude-opus-4-5-swc', provider: 'anthropic' },
  { name: 'Claude Haiku 4.5', id: 'azure_ai/claude-haiku-4-5-swc', provider: 'anthropic' },
  { name: 'Model Router', id: 'azure_ai/model_router', provider: 'openai' },
  { name: 'GPT-5.4 Mini', id: 'azure_ai/gpt-5.4-mini', provider: 'openai' },
  { name: 'GPT-5.3 Chat', id: 'azure_ai/gpt-5.3-chat', provider: 'openai' },
  { name: 'GPT-5.2', id: 'gpt-5.2-use2', provider: 'openai' },
  { name: 'GPT-5.1', id: 'gpt-5.1-use2', provider: 'openai' },
  { name: 'GPT-OSS 120B', id: 'azure_ai/gpt-oss-120b', provider: 'openai' },
  { name: 'Llama 4 Maverick 17B', id: 'azure_ai/Llama-4-Maverick-17B-128E-Instruct-FP8', provider: 'meta' },
  { name: 'Kimi K2.5', id: 'azure_ai/kimi-k2.5', provider: 'moonshot' },
  { name: 'DeepSeek V3.2', id: 'azure_ai/deepseek-v3.2', provider: 'deepseek' },
  { name: 'Grok 4 Fast Reasoning', id: 'azure_ai/grok-4-fast-reasoning', provider: 'xai' },
  { name: 'Claude Opus 4.1', id: 'azure_ai/claude-opus-4-1-swc', provider: 'anthropic', legacy: true },
  { name: 'GPT-5', id: 'gpt-5-gwc', provider: 'openai', legacy: true },
  { name: 'GPT-5 Mini', id: 'gpt-5-mini-gwc', provider: 'openai', legacy: true },
  { name: 'GPT-5 Nano', id: 'gpt-5-nano-gwc', provider: 'openai', legacy: true },
  { name: 'GPT-4.1', id: 'gpt-4.1-chn', provider: 'openai', legacy: true },
  { name: 'GPT-4.1 Mini', id: 'gpt-4.1-mini-chn', provider: 'openai', legacy: true },
  { name: 'GPT-4.1 Nano', id: 'gpt-4.1-nano-swc', provider: 'openai', legacy: true },
  { name: 'GPT-4o', id: 'gpt-4o-swc', provider: 'openai', legacy: true },
  { name: 'GPT-4o Mini', id: 'gpt-4o-mini-swc', provider: 'openai', legacy: true },
  { name: 'o1', id: 'o1-gwc', provider: 'openai', legacy: true },
  { name: 'Llama 3.3 70B', id: 'Llama-3.3-70B-Instruct', provider: 'meta', legacy: true },
];

export const IMAGE_MODELS: ModelOption[] = [
  { name: 'GPT Image 1.5', id: 'gpt-image-1.5-swc', provider: 'openai' },
  { name: 'FLUX.2 Pro', id: 'azure_ai/flux.2-pro', provider: 'microsoft' },
];

export const AUDIO_MODELS: ModelOption[] = [
  { name: 'GPT Audio 1.5', id: 'azure_ai/gpt-audio-1.5', provider: 'openai' },
];
