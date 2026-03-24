import { getToken } from './auth';

export type TerminalEventHandler = (data: string) => void;
export type ConnectionEventHandler = () => void;

// WebSocket must bypass Next.js (no WS proxy support in dev)
const WS_BASE = typeof window !== 'undefined'
  ? (window.location.port === '5173' ? 'localhost:8000' : window.location.host)
  : '';

export class TerminalSocket {
  private ws: WebSocket | null = null;
  private sandboxId: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;

  onStdout: TerminalEventHandler | null = null;
  onStderr: TerminalEventHandler | null = null;
  onExit: ((code: number) => void) | null = null;
  onConnect: ConnectionEventHandler | null = null;
  onDisconnect: ConnectionEventHandler | null = null;
  onReconnecting: ((attempt: number, maxAttempts: number) => void) | null = null;

  constructor(sandboxId: string) {
    this.sandboxId = sandboxId;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.shouldReconnect = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = getToken();
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    const url = `${protocol}//${WS_BASE}/ws/sandbox/${this.sandboxId}/terminal${tokenParam}`;

    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      console.error('WebSocket connection failed:', e);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.onConnect?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type: 'stdout' | 'stderr' | 'exit';
          data?: string;
          code?: number;
        };
        switch (data.type) {
          case 'stdout': this.onStdout?.(data.data || ''); break;
          case 'stderr': this.onStderr?.(data.data || ''); break;
          case 'exit': this.onExit?.(data.code ?? 1); break;
        }
      } catch {
        this.onStdout?.(event.data);
      }
    };

    this.ws.onclose = () => {
      this.onDisconnect?.();
      if (this.shouldReconnect) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'input', data }));
    }
  }

  resize(cols: number, rows: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.onReconnecting?.(this.reconnectAttempts, this.maxReconnectAttempts);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
