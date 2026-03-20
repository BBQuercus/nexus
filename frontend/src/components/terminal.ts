// ============================================================
// Terminal Component (xterm.js)
// ============================================================

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { TerminalSocket } from '../services/ws';

let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let socket: TerminalSocket | null = null;
let resizeObserver: ResizeObserver | null = null;

const THEME = {
  background: '#0A0A0A',
  foreground: '#ECECEC',
  cursor: '#00E599',
  cursorAccent: '#0A0A0A',
  selectionBackground: '#00E59940',
  selectionForeground: '#ECECEC',
  black: '#0A0A0A',
  red: '#FF5555',
  green: '#00E599',
  yellow: '#FFAA33',
  blue: '#5599FF',
  magenta: '#CC77FF',
  cyan: '#33CCCC',
  white: '#ECECEC',
  brightBlack: '#555555',
  brightRed: '#FF7777',
  brightGreen: '#00FFB2',
  brightYellow: '#FFCC66',
  brightBlue: '#77BBFF',
  brightMagenta: '#DD99FF',
  brightCyan: '#55DDDD',
  brightWhite: '#FFFFFF',
};

export function initTerminal(container: HTMLElement): Terminal {
  if (terminal) {
    terminal.dispose();
  }

  terminal = new Terminal({
    theme: THEME,
    fontFamily: "'IBM Plex Mono', 'Fira Code', 'Consolas', monospace",
    fontSize: 13,
    lineHeight: 1.4,
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 10000,
    allowProposedApi: true,
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  terminal.open(container);

  // Fit after a short delay to ensure container is sized
  setTimeout(() => {
    try {
      fitAddon?.fit();
    } catch {
      // Ignore fit errors
    }
  }, 100);

  // Observe container resizes
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  resizeObserver = new ResizeObserver(() => {
    try {
      fitAddon?.fit();
    } catch {
      // Ignore
    }
  });
  resizeObserver.observe(container);

  return terminal;
}

export function connectToSandbox(sandboxId: string): void {
  if (socket) {
    socket.disconnect();
  }

  socket = new TerminalSocket(sandboxId);

  socket.onConnect = () => {
    writeOutput('\r\n\x1b[32mConnected to sandbox\x1b[0m\r\n\r\n', 'stdout');
  };

  socket.onDisconnect = () => {
    writeOutput('\r\n\x1b[33mDisconnected from sandbox\x1b[0m\r\n', 'stdout');
  };

  socket.onStdout = (data: string) => {
    terminal?.write(data);
  };

  socket.onStderr = (data: string) => {
    terminal?.write(`\x1b[31m${data}\x1b[0m`);
  };

  socket.onExit = (code: number) => {
    const color = code === 0 ? '32' : '31';
    terminal?.write(`\r\n\x1b[${color}mProcess exited with code ${code}\x1b[0m\r\n`);
  };

  // Send terminal input to socket
  terminal?.onData((data) => {
    socket?.send(data);
  });

  // Send resize events
  terminal?.onResize(({ cols, rows }) => {
    socket?.resize(cols, rows);
  });

  socket.connect();
}

export function writeOutput(data: string, stream: 'stdout' | 'stderr' = 'stdout'): void {
  if (!terminal) return;

  if (stream === 'stderr') {
    terminal.write(`\x1b[31m${data}\x1b[0m`);
  } else {
    terminal.write(data);
  }
}

export function clearTerminal(): void {
  terminal?.clear();
  terminal?.write('\x1b[2J\x1b[H');
}

export function disposeTerminal(): void {
  socket?.disconnect();
  socket = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
  terminal?.dispose();
  terminal = null;
  fitAddon = null;
}

export function getTerminal(): Terminal | null {
  return terminal;
}
