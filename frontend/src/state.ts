// ============================================================
// Global State Store
// ============================================================

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model?: string;
  mode?: 'chat' | 'code' | 'architect';
  personaId?: string;
  sandboxId?: string;
  messageCount?: number;
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
  defaultMode?: 'chat' | 'code' | 'architect';
  tools?: string[];
  isPublic?: boolean;
  authorId?: string;
  createdAt?: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedAt?: string;
  children?: FileNode[];
}

export interface AppState {
  user: User | null;
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  activeModel: string;
  activeMode: 'chat' | 'code' | 'architect';
  activePersona: AgentPersona | null;
  sandboxStatus: 'none' | 'creating' | 'running' | 'stopped';
  sandboxId: string | null;
  rightPanelTab: 'terminal' | 'files' | 'preview' | 'artifacts';
  commandPaletteOpen: boolean;
  isStreaming: boolean;
  artifacts: Artifact[];
  rightPanelOpen: boolean;
  previewUrl: string | null;
}

type Listener = () => void;
type Selector<T> = (state: AppState) => T;
type SelectorCallback<T> = (value: T) => void;

const initialState: AppState = {
  user: null,
  conversations: [],
  activeConversationId: null,
  messages: [],
  activeModel: 'azure_ai/claude-sonnet-4-5-swc',
  activeMode: 'chat',
  activePersona: null,
  sandboxStatus: 'none',
  sandboxId: null,
  rightPanelTab: 'terminal',
  commandPaletteOpen: false,
  isStreaming: false,
  artifacts: [],
  rightPanelOpen: true,
  previewUrl: null,
};

let state: AppState = { ...initialState };
const listeners: Set<Listener> = new Set();
const selectorListeners: Map<number, { selector: Selector<unknown>; callback: SelectorCallback<unknown>; lastValue: unknown }> = new Map();
let selectorId = 0;

export function getState(): Readonly<AppState> {
  return state;
}

export function setState(partial: Partial<AppState>): void {
  const prev = state;
  state = { ...state, ...partial };

  // Notify all raw listeners
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('State listener error:', e);
    }
  });

  // Notify selector listeners if their selected value changed
  selectorListeners.forEach((entry) => {
    try {
      const newValue = entry.selector(state);
      const oldValue = entry.selector(prev);
      if (newValue !== oldValue) {
        entry.lastValue = newValue;
        entry.callback(newValue);
      }
    } catch (e) {
      console.error('Selector listener error:', e);
    }
  });
}

export function subscribe(callback: Listener): () => void;
export function subscribe<T>(selector: Selector<T>, callback: SelectorCallback<T>): () => void;
export function subscribe<T>(
  selectorOrCallback: Selector<T> | Listener,
  callback?: SelectorCallback<T>
): () => void {
  if (callback) {
    // Selector-based subscription
    const selector = selectorOrCallback as Selector<T>;
    const id = selectorId++;
    const lastValue = selector(state);
    selectorListeners.set(id, {
      selector: selector as Selector<unknown>,
      callback: callback as SelectorCallback<unknown>,
      lastValue,
    });
    return () => {
      selectorListeners.delete(id);
    };
  } else {
    // Raw listener
    const listener = selectorOrCallback as Listener;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
}

export function resetState(): void {
  state = { ...initialState };
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('State listener error:', e);
    }
  });
}
