'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '@/lib/store';
import { useIsMobile, useIsDesktop } from '@/lib/useMediaQuery';
import { initMarkdown } from '@/lib/markdown';
import { initErrorReporter } from '@/lib/error-reporter';
import { startTokenRefreshTimer, stopTokenRefreshTimer } from '@/lib/auth';
import { toast } from '@/components/toast';
import Sidebar from './sidebar';
import TopBar from './top-bar';
import ChatMessages from './chat-messages';
import ChatInput from './chat-input';
import EmptyState from './empty-state';
import RightPanel from './right-panel';
import CommandPalette from './command-palette';
import ConfirmDialog from './confirm-dialog';
import ToastContainer from './toast';
import ErrorBoundary from './error-boundary';
import KeyboardShortcuts from './keyboard-shortcuts';
import HealthBanner from './health-banner';
import * as api from '@/lib/api';
import { MODELS } from '@/lib/types';

export default function Workspace() {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const focusModeRef = useRef(false);
  focusModeRef.current = focusMode;
  const activeConversationId = useStore((s) => s.activeConversationId);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const commandPaletteOpen = useStore((s) => s.commandPaletteOpen);
  const confirmDialog = useStore((s) => s.confirmDialog);
  const resolveConfirm = useStore((s) => s.resolveConfirm);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const setRightPanelOpen = useStore((s) => s.setRightPanelOpen);

  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();

  useEffect(() => {
    initMarkdown();
    initErrorReporter();
    startTokenRefreshTimer(() => {
      toast.warning('Session expiring soon. Please save your work.');
    });
    return () => stopTokenRefreshTimer();
  }, []);

  // Listen for open-shortcuts event from slash commands / command palette
  useEffect(() => {
    const handler = () => setShortcutsOpen(true);
    window.addEventListener('nexus:open-shortcuts', handler);
    return () => window.removeEventListener('nexus:open-shortcuts', handler);
  }, []);

  // Auto-close sidebar on mobile when selecting a conversation
  useEffect(() => {
    if (isMobile && activeConversationId && sidebarOpen) {
      setSidebarOpen(false);
    }
  }, [activeConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close sidebar by default on mobile mount
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey;
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    if (meta && e.shiftKey && e.key === 'f') {
      e.preventDefault();
      setFocusMode((prev) => !prev);
      return;
    }
    if (meta && e.key === 'k') {
      e.preventDefault();
      useStore.getState().setCommandPaletteOpen(!useStore.getState().commandPaletteOpen);
      return;
    }
    if (e.key === 'Escape') {
      if (focusModeRef.current) {
        setFocusMode(false);
        return;
      }
      if (useStore.getState().commandPaletteOpen) {
        useStore.getState().setCommandPaletteOpen(false);
      } else if (useStore.getState().sidebarOpen && !useStore.getState().commandPaletteOpen) {
        // On mobile/tablet, Escape closes sidebar overlay
        const w = window.innerWidth;
        if (w < 1024) useStore.getState().setSidebarOpen(false);
        else if (isInput) (target as HTMLElement).blur();
      } else if (isInput) {
        (target as HTMLElement).blur();
      }
      return;
    }
    if (meta && e.key === 'b' && !e.shiftKey) {
      e.preventDefault();
      useStore.getState().setSidebarOpen(!useStore.getState().sidebarOpen);
      return;
    }
    if (meta && e.key === 'n') {
      e.preventDefault();
      (async () => {
        try {
          const conv = await api.createConversation({
            model: useStore.getState().activeModel,
            agent_mode: useStore.getState().activeMode,
          });
          useStore.getState().setActiveConversationId(conv.id);
          useStore.getState().setMessages([]);
          const result = await api.listConversations();
          useStore.getState().setConversations(result.conversations);
        } catch (err) {
          console.error('Failed to create conversation:', err);
        }
      })();
      return;
    }
    if (meta && e.key === 'p' && e.shiftKey) {
      e.preventDefault();
      useStore.getState().setCommandPaletteOpen(!useStore.getState().commandPaletteOpen);
      return;
    }
    if (meta && e.key === 'j') {
      e.preventDefault();
      const textarea = document.querySelector('textarea');
      if (textarea) { textarea.focus(); textarea.select(); }
      return;
    }
    if (meta && e.key === 'Backspace' && e.shiftKey) {
      e.preventDefault();
      const convId = useStore.getState().activeConversationId;
      if (!convId) return;
      (async () => {
        const confirmed = await useStore.getState().showConfirm({
          title: 'Delete this conversation?',
          message: 'This action cannot be undone.',
          confirmLabel: 'Delete',
          variant: 'danger',
        });
        if (!confirmed) return;
        try {
          await api.deleteConversation(convId);
          useStore.getState().setActiveConversationId(null);
          useStore.getState().setMessages([]);
          const result = await api.listConversations();
          useStore.getState().setConversations(result.conversations);
        } catch (err) {
          console.error('Failed to delete:', err);
        }
      })();
      return;
    }
    if (e.ctrlKey && !e.metaKey && e.key >= '1' && e.key <= '9' && !e.shiftKey) {
      const idx = parseInt(e.key) - 1;
      if (idx < MODELS.length) {
        e.preventDefault();
        useStore.getState().setActiveModel(MODELS[idx].id);
        return;
      }
    }
    if (e.key === '?' && !isInput && !useStore.getState().commandPaletteOpen) {
      e.preventDefault();
      setShortcutsOpen((prev) => !prev);
      return;
    }
    if (e.key === '/' && !isInput && !useStore.getState().commandPaletteOpen) {
      e.preventDefault();
      const textarea = document.querySelector('textarea');
      textarea?.focus();
      return;
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  const hasConversation = !!activeConversationId;

  // On mobile/tablet, sidebar and right panel are overlays
  const sidebarIsOverlay = !isDesktop;
  const rightPanelIsOverlay = !isDesktop;

  return (
    <div className="relative flex flex-col h-screen w-screen bg-bg overflow-hidden noise-overlay">
      {!focusMode && <HealthBanner />}
      {!focusMode && <TopBar />}
      <div className="flex flex-1 min-h-0 relative">
        {/* Sidebar — inline on desktop, overlay on mobile/tablet */}
        {!focusMode && sidebarOpen && (
          <>
            {sidebarIsOverlay && (
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <div className={
              sidebarIsOverlay
                ? 'fixed left-0 top-11 bottom-0 z-40 animate-slide-in-left'
                : ''
            }>
              <ErrorBoundary fallbackMessage="Sidebar crashed">
                <Sidebar />
              </ErrorBoundary>
            </div>
          </>
        )}

        {/* Main chat area */}
        <div className="relative flex flex-col flex-1 min-w-0">
          <div className="absolute inset-0 dot-texture opacity-40 pointer-events-none" />
          <div className="relative flex flex-col flex-1 min-h-0">
            <ErrorBoundary fallbackMessage="Chat failed to render">
              {hasConversation ? <ChatMessages /> : <EmptyState />}
            </ErrorBoundary>
            <ChatInput />
          </div>
        </div>

        {/* Right panel — inline on desktop, overlay on mobile/tablet */}
        {!focusMode && rightPanelOpen && (
          <>
            {rightPanelIsOverlay && (
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
                onClick={() => setRightPanelOpen(false)}
              />
            )}
            <div className={
              rightPanelIsOverlay
                ? (isMobile
                    ? 'fixed left-0 right-0 bottom-0 top-[35%] z-40 animate-slide-up rounded-t-xl overflow-hidden'
                    : 'fixed right-0 top-11 bottom-0 z-40 animate-slide-in-right')
                : ''
            }>
              <ErrorBoundary fallbackMessage="Panel crashed">
                <RightPanel />
              </ErrorBoundary>
            </div>
          </>
        )}
      </div>

      {/* Focus mode hint */}
      {focusMode && (
        <div className="fixed top-3 right-3 z-50 animate-focus-fade-in">
          <div className="px-2.5 py-1 bg-surface-1/80 backdrop-blur-sm border border-border-default rounded-md text-[10px] text-text-tertiary font-mono">
            ESC to exit focus
          </div>
        </div>
      )}

      {commandPaletteOpen && <CommandPalette />}
      {shortcutsOpen && <KeyboardShortcuts onClose={() => setShortcutsOpen(false)} />}
      <ToastContainer />
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={() => resolveConfirm(true)}
        onCancel={() => resolveConfirm(false)}
      />
    </div>
  );
}
