'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';
import { TerminalSocket } from '@/lib/ws';

export default function TerminalPanel() {
  const t = useTranslations('terminalPanel');
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
      await import('@xterm/xterm/css/xterm.css');

      if (cancelled || !containerRef.current) return;

      const terminal = new Terminal({
        theme: {
          background: '#121214',
          foreground: '#F0F0F2',
          cursor: '#00E599',
          cursorAccent: '#121214',
          selectionBackground: '#00E59940',
          black: '#121214', red: '#FF5555', green: '#00E599', yellow: '#FFAA33',
          blue: '#5599FF', magenta: '#CC77FF', cyan: '#33CCCC', white: '#F0F0F2',
          brightBlack: '#636369', brightRed: '#FF7777', brightGreen: '#00FFB2',
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

      const connectedMsg = t('connected');
      const disconnectedMsg = t('disconnected');

      socket.onConnect = () => {
        terminal.write(`\x1b[32m ${connectedMsg} \x1b[0m\r\n\r\n`);
      };
      socket.onDisconnect = () => {
        terminal.write(`\r\n\x1b[33m ${disconnectedMsg}\x1b[0m\r\n`);
      };
      socket.onReconnecting = (attempt, max) => {
        const reconnectingMsg = t('reconnecting', { attempt, max });
        terminal.write(`\x1b[33m ${reconnectingMsg}\x1b[0m\r\n`);
      };
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
  }, [sandboxId, t]);

  if (!sandboxId) {
    return (
      <div className="flex items-center justify-center h-full px-6 text-center text-text-tertiary text-xs font-mono">
        {t('noSandbox')}
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
}
