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
  tool: string;
  arguments?: Record<string, unknown>;
  tool_call_id?: string;
}

export interface ToolOutputEvent {
  type: 'tool_output';
  tool: string;
  output: string;
  tool_call_id?: string;
}

export interface ToolEndEvent {
  type: 'tool_end';
  tool: string;
  tool_call_id?: string;
}

export interface ImageOutputEvent {
  type: 'image_output';
  filename: string;
  sandbox_id?: string;
}

export interface TableOutputEvent {
  type: 'table_output';
  rows: string[][];
}

export interface PreviewEvent {
  type: 'preview';
  url: string;
  port?: number;
}

export interface SearchResultsEvent {
  type: 'search_results';
  results: { title: string; url: string; snippet: string }[];
  tool_call_id?: string;
}

export interface DoneEvent {
  type: 'done';
  message_id?: string;
  input_tokens?: number;
  output_tokens?: number;
  artifacts?: { id: string; type: string; label: string }[];
}

export interface TitleEvent {
  type: 'title';
  title: string;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
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
  | TitleEvent
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

      // Process complete SSE events (terminated by double newline)
      while (true) {
        const eventEnd = buffer.indexOf('\n\n');
        if (eventEnd === -1) break;

        const rawEvent = buffer.slice(0, eventEnd);
        buffer = buffer.slice(eventEnd + 2);

        let eventType = '';
        let eventData = '';

        for (const line of rawEvent.split('\n')) {
          if (line.startsWith('event: ') || line.startsWith('event:')) {
            eventType = line.slice(line.indexOf(':') + 1).trim();
          } else if (line.startsWith('data: ') || line.startsWith('data:')) {
            eventData += line.slice(line.indexOf(':') + 1).trim();
          }
        }

        if (!eventData) continue;

        try {
          const data = JSON.parse(eventData);
          // Attach the event type so consumers can switch on it
          data.type = eventType || data.type || 'unknown';
          yield data as SSEEvent;
        } catch {
          console.warn('Failed to parse SSE data:', eventData);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
