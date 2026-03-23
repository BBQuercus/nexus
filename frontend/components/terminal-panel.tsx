'use client';

import { useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import { TerminalSocket } from '@/lib/ws';

export default function TerminalPanel() {
  const sandboxId = useStore((s) => s.sandboxId);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<import('@xterm/xterm').Terminal | null>(null);
  const socketRef = useRef<TerminalSocket | null>(null);
  const fitAddonRef = useRef<import('@xterm/addon-fit').FitAddon | null>(null);
  const connectedSandboxRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || !sandboxId) return;
    // Don't reconnect if already connected to this sandbox
    if (connectedSandboxRef.current === sandboxId && socketRef.current?.isConnected) return;

    // Cleanup previous connection
    socketRef.current?.disconnect();
    if (terminalRef.current) {
      terminalRef.current.dispose();
      terminalRef.current = null;
    }

    connectedSandboxRef.current = sandboxId;

    let cancelled = false;

    (async () => {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      // @ts-expect-error CSS import
      await import('@xterm/xterm/css/xterm.css');

      if (cancelled || !containerRef.current) return;

      const terminal = new Terminal({
        theme: {
          background: '#0A0A0A',
          foreground: '#ECECEC',
          cursor: '#00E599',
          cursorAccent: '#0A0A0A',
          selectionBackground: '#00E59940',
          black: '#0A0A0A', red: '#FF5555', green: '#00E599', yellow: '#FFAA33',
          blue: '#5599FF', magenta: '#CC77FF', cyan: '#33CCCC', white: '#ECECEC',
          brightBlack: '#555555', brightRed: '#FF7777', brightGreen: '#00FFB2',
          brightYellow: '#FFCC66', brightBlue: '#77BBFF', brightMagenta: '#DD99FF',
          brightCyan: '#55DDDD', brightWhite: '#FFFFFF',
        },
        fontFamily: "'IBM Plex Mono', 'Fira Code', 'Consolas', monospace",
        fontSize: 13, lineHeight: 1.4, cursorBlink: true, cursorStyle: 'bar', scrollback: 10000,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);
      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      setTimeout(() => { try { fitAddon.fit(); } catch {} }, 100);

      const resizeObserver = new ResizeObserver(() => { try { fitAddon.fit(); } catch {} });
      resizeObserver.observe(containerRef.current);

      // Connect WebSocket — suppress disconnect messages on failed initial connects
      const socket = new TerminalSocket(sandboxId);
      socketRef.current = socket;

      socket.onConnect = () => {
        terminal.write('\x1b[32m Connected to sandbox \x1b[0m\r\n\r\n');
      };
      // Don't show disconnect — it's noisy. Just silently reconnect.
      socket.onDisconnect = () => {};
      socket.onStdout = (data) => terminal.write(data);
      socket.onStderr = (data) => terminal.write(`\x1b[31m${data}\x1b[0m`);

      terminal.onData((data) => socket.send(data));
      terminal.onResize(({ cols, rows }) => socket.resize(cols, rows));

      socket.connect();
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      connectedSandboxRef.current = null;
    };
  }, [sandboxId]);

  if (!sandboxId) {
    return (
      <div className="flex items-center justify-center h-full px-6 text-center text-text-tertiary text-xs font-mono">
        Terminal connects when a sandbox is active.
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
}
