// ── User Settings ──

export interface UserSettings {
  theme?: 'dark' | 'light' | 'system';
  fontSize?: 'sm' | 'md' | 'lg';
  reduceAnimations?: boolean;
}

// ── Multi-Org Types ──

export interface Organization {
  id: string;
  name: string;
  slug: string;
  systemPrompt?: string;
  settings: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrgMembership {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: 'viewer' | 'editor' | 'admin' | 'owner';
  joinedAt?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  isSuperadmin?: boolean;
  role: 'viewer' | 'editor' | 'admin' | 'owner';
  currentOrg?: Organization;
  memberships?: OrgMembership[];
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model?: string;
  personaId?: string;
  sandboxId?: string;
  projectId?: string;
  messageCount?: number;
  pinned?: boolean;
  preview?: string;
}

// ── Projects / Workspaces ──

export interface Project {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  default_model?: string;
  default_persona_id?: string;
  knowledge_base_ids: string[];
  pinned_conversation_ids: string[];
  settings: Record<string, any>;
  conversation_count?: number;
  archived?: boolean;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  conversations: SearchHit[];
  messages: SearchHit[];
  artifacts: SearchHit[];
  total: number;
}

export interface SearchHit {
  id: string;
  type: 'conversation' | 'message' | 'artifact';
  title: string;
  snippet: string;
  conversation_id?: string;
  project_id?: string;
  created_at: string;
  score?: number;
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
  charts?: { spec: Record<string, unknown>; title?: string }[];
  forms?: FormSpec[];
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
  totalTokens?: number;
  totalCost: number;
  model: string;
  duration: number;
}

export interface Artifact {
  id: string;
  conversationId: string;
  messageId?: string;
  type: 'code' | 'image' | 'video' | 'chart' | 'table' | 'document' | 'diagram' | 'form';
  label: string;
  content?: string;
  url?: string;
  metadata?: Record<string, unknown>;
  pinned?: boolean;
  createdAt: string;
}

export interface FormSpec {
  title: string
  description?: string
  fields: FormField[]
  submit_label?: string
  allow_multiple?: boolean
  tool_call_id?: string
}

export interface FormField {
  id: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'multiselect' | 'checkbox' | 'radio' | 'date' | 'slider' | 'rating'
  label: string
  placeholder?: string
  required?: boolean
  default?: any
  options?: string[]
  validation?: {
    min?: number
    max?: number
    pattern?: string
    message?: string
  }
  condition?: {
    field: string
    equals: any
  }
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
  category?: string;
  installedFrom?: string;
  authorId?: string;
  approvalConfig?: Record<string, boolean>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  currentVersion?: number;
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
  installedFromId?: string;
  accessMode?: 'extensible' | 'fixed';
  createdAt: string;
  updatedAt: string;
}

// ── Memory Types ──

export interface Memory {
  id: string;
  scope: 'global' | 'project' | 'conversation';
  category: 'preference' | 'fact' | 'decision' | 'instruction';
  content: string;
  project_id?: string;
  source_conversation_id?: string;
  source_message_id?: string;
  relevance_count: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface KBDocument {
  id: string;
  filename: string;
  contentType: string;
  fileSizeBytes: number;
  pageCount?: number;
  status: 'processing' | 'ready' | 'error';
  processingStage?: 'splitting' | 'contextualizing' | 'encoding' | 'storing';
  chunksTotal?: number;
  chunksDone?: number;
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

export type ModelProvider = 'anthropic' | 'openai' | 'meta' | 'microsoft' | 'xai' | 'moonshot' | 'deepseek' | 'mistral';

export interface ModelOption {
  name: string;
  id: string;
  provider: ModelProvider;
  legacy?: boolean;
  modelType?: 'image' | 'video';
}

export const DEFAULT_MODEL_ID = 'gpt-5.4';

export const MODELS: ModelOption[] = [
  { name: 'Claude Sonnet 4.5', id: 'azure_ai/claude-sonnet-4-5-swc', provider: 'anthropic' },
  { name: 'Claude Opus 4.5', id: 'azure_ai/claude-opus-4-5-swc', provider: 'anthropic' },
  { name: 'Claude Haiku 4.5', id: 'azure_ai/claude-haiku-4-5-swc', provider: 'anthropic' },
  { name: 'Model Router', id: 'azure_ai/model_router', provider: 'microsoft' },
  { name: 'o3 Pro', id: 'o3-pro', provider: 'openai' },
  { name: 'GPT-5.4 Pro', id: 'gpt-5.4-pro', provider: 'openai' },
  { name: 'GPT-5.4', id: 'gpt-5.4', provider: 'openai' },
  { name: 'GPT-5.4 Mini', id: 'azure_ai/gpt-5.4-mini', provider: 'openai' },
  { name: 'GPT-5.3 Chat', id: 'azure_ai/gpt-5.3-chat', provider: 'openai' },
  { name: 'GPT-OSS 120B', id: 'azure_ai/gpt-oss-120b', provider: 'openai' },
  { name: 'Llama 4 Maverick 17B', id: 'azure_ai/Llama-4-Maverick-17B-128E-Instruct-FP8', provider: 'meta' },
  { name: 'Kimi K2.5', id: 'azure_ai/kimi-k2.5', provider: 'moonshot' },
  { name: 'DeepSeek V3.2', id: 'azure_ai/deepseek-v3.2', provider: 'deepseek' },
  { name: 'Grok 4 Fast Reasoning', id: 'azure_ai/grok-4-fast-reasoning', provider: 'xai' },
  { name: 'Phi-4', id: 'azure_ai/Phi-4', provider: 'microsoft' },
  { name: 'Mistral Large 3', id: 'azure_ai/mistral-large-3', provider: 'mistral' },
  { name: 'Claude Opus 4.1', id: 'azure_ai/claude-opus-4-1-swc', provider: 'anthropic', legacy: true },
  { name: 'GPT-5.2', id: 'gpt-5.2-use2', provider: 'openai', legacy: true },
  { name: 'GPT-5.1', id: 'gpt-5.1-use2', provider: 'openai', legacy: true },
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
  { name: 'Sora 2', id: 'sora-2', provider: 'openai', modelType: 'video' },
  { name: 'FLUX.2 Pro', id: 'azure_ai/flux.2-pro', provider: 'microsoft' },
];

export const AUDIO_MODELS: ModelOption[] = [
  { name: 'GPT Audio 1.5', id: 'azure_ai/gpt-audio-1.5', provider: 'openai' },
  { name: 'TTS HD', id: 'tts-hd', provider: 'openai' },
];

// ── Multi-Agent Types ──

export type AgentStrategy = 'parallel' | 'sequential' | 'best_of_n' | 'debate';

export interface AgentRunSummary {
  id: string;
  model: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tokens: number;
  cost: number;
  durationMs: number;
  score: number | null;
  resultLength: number;
  selected: boolean;
}

export interface MultiAgentWorkflowSummary {
  workflowId: string;
  strategy: AgentStrategy;
  runs: AgentRunSummary[];
}

// ── Phase 1: Approval Gates & Agent Workflows ──

export interface ApprovalGate {
  id: string;
  agentRunId: string;
  conversationId: string;
  toolName: string;
  toolArguments?: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'edited';
  decidedBy?: string;
  decidedAt?: string;
  editedArguments?: Record<string, unknown>;
  createdAt: string;
}

export interface PromptTemplate {
  id: string;
  userId: string;
  agentPersonaId?: string;
  name: string;
  description?: string;
  template: string;
  variables?: TemplateVariable[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default?: string;
  required?: boolean;
  options?: string[];
  description?: string;
}

export interface AgentRunRecord {
  id: string;
  userId: string;
  agentPersonaId?: string;
  conversationId?: string;
  templateId?: string;
  status: 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
  inputText: string;
  inputVariables?: Record<string, unknown>;
  outputText?: string;
  model?: string;
  toolCalls?: Record<string, unknown>[];
  totalInputTokens: number;
  totalOutputTokens: number;
  costUsd?: number;
  durationMs?: number;
  error?: string;
  trigger: 'manual' | 'schedule' | 'api' | 'rerun';
  parentRunId?: string;
  createdAt: string;
  completedAt?: string;
  steps?: AgentRunStep[];
}

export interface AgentRunStep {
  id: string;
  agentRunId: string;
  stepIndex: number;
  stepType: 'llm_call' | 'tool_call' | 'approval_wait';
  toolName?: string;
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  durationMs?: number;
  tokensUsed?: number;
  status: 'completed' | 'failed' | 'skipped';
  error?: string;
  createdAt: string;
}

export interface AgentSchedule {
  id: string;
  userId: string;
  agentPersonaId: string;
  templateId?: string;
  name: string;
  cronExpression: string;
  inputText?: string;
  inputVariables?: Record<string, unknown>;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Phase 3: Action Layer ──

export interface ExternalAction {
  id: string;
  userId: string;
  agentRunId?: string;
  actionType: 'email' | 'slack' | 'teams';
  status: 'pending' | 'approved' | 'sent' | 'failed' | 'rejected';
  preview: Record<string, unknown>;
  result?: Record<string, unknown>;
  approvedBy?: string;
  approvedAt?: string;
  sentAt?: string;
  createdAt: string;
}

// ── Phase 4: Testing ──

export interface TestCase {
  id: string;
  agentPersonaId: string;
  name: string;
  inputText: string;
  inputVariables?: Record<string, unknown>;
  expectedOutput?: string;
  expectedToolCalls?: Record<string, unknown>[];
  evaluationCriteria?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestRun {
  id: string;
  agentPersonaId: string;
  triggeredBy: string;
  status: 'running' | 'completed' | 'failed';
  totalCases: number;
  passed: number;
  failed: number;
  results?: TestCaseResult[];
  durationMs?: number;
  createdAt: string;
  completedAt?: string;
}

export interface TestCaseResult {
  testCaseId: string;
  testCaseName?: string;
  passed: boolean;
  actualOutput?: string;
  expectedOutput?: string;
  score?: number;
  error?: string;
}

// ── Phase 6: Agent Marketplace ──

export interface MarketplaceListing {
  id: string;
  listingType: 'agent' | 'knowledge_base';
  agentPersonaId?: string;
  knowledgeBaseId?: string;
  publisherId: string;
  publisherName?: string;
  visibility: 'public' | 'private' | 'org';
  status: 'pending' | 'approved' | 'rejected' | 'published';
  category?: string;
  tags?: string[];
  version: string;
  installCount: number;
  avgRating?: number;
  ratingCount: number;
  featured: boolean;
  accessMode?: 'extensible' | 'fixed';
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  agent?: AgentPersona;
  knowledgeBase?: KnowledgeBase;
}

export interface AgentRatingRecord {
  id: string;
  marketplaceListingId: string;
  userId: string;
  rating: number;
  review?: string;
  createdAt: string;
  updatedAt: string;
}
