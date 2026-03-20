// ============================================================
// SSE Stream Consumer
// ============================================================

export interface TokenEvent {
  type: 'token';
  content: string;
}

export interface ReasoningEvent {
  type: 'reasoning';
  content: string;
  tokenCount?: number;
}

export interface ToolStartEvent {
  type: 'tool_start';
  toolCallId: string;
  name: string;
  language?: string;
  code?: string;
}

export interface ToolOutputEvent {
  type: 'tool_output';
  toolCallId: string;
  stream: 'stdout' | 'stderr';
  content: string;
}

export interface ToolEndEvent {
  type: 'tool_end';
  toolCallId: string;
  exitCode: number;
  duration: number;
}

export interface ImageOutputEvent {
  type: 'image_output';
  url: string;
  filename: string;
  format: string;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
}

export interface TableOutputEvent {
  type: 'table_output';
  headers: string[];
  rows: (string | number)[][];
  totalRows: number;
  source?: string;
}

export interface PreviewEvent {
  type: 'preview';
  url: string;
  title?: string;
}

export interface SearchResultsEvent {
  type: 'search_results';
  query: string;
  results: {
    title: string;
    url: string;
    snippet: string;
  }[];
}

export interface DoneEvent {
  type: 'done';
  messageId: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  model: string;
  duration: number;
  reasoningTokens?: number;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
  code?: string;
}

export type SSEEvent =
  | TokenEvent
  | ReasoningEvent
  | ToolStartEvent
  | ToolOutputEvent
  | ToolEndEvent
  | ImageOutputEvent
  | TableOutputEvent
  | PreviewEvent
  | SearchResultsEvent
  | DoneEvent
  | ErrorEvent;

export async function* streamSSE(response: Response): AsyncGenerator<SSEEvent> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events
      const lines = buffer.split('\n');
      buffer = '';

      let currentData = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // If last line doesn't end with \n, it's incomplete — put back
        if (i === lines.length - 1 && !buffer.endsWith('\n') && line !== '') {
          buffer = line;
          continue;
        }

        if (line.startsWith('data: ')) {
          currentData += line.slice(6);
        } else if (line === '' && currentData) {
          // Empty line = end of event
          try {
            const parsed = JSON.parse(currentData) as SSEEvent;
            yield parsed;
          } catch (e) {
            console.warn('Failed to parse SSE event:', currentData, e);
          }
          currentData = '';
        }
      }

      // If there's remaining data without a terminating blank line,
      // keep it for the next chunk
      if (currentData) {
        buffer = `data: ${currentData}\n${buffer}`;
      }
    }

    // Process any remaining data
    if (buffer.trim()) {
      const remaining = buffer.trim();
      if (remaining.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(remaining.slice(6)) as SSEEvent;
          yield parsed;
        } catch {
          // Ignore incomplete final event
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
