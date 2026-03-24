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
import DiffViewer from './diff-viewer';
import { Upload } from 'lucide-react';
import * as api from '@/lib/api';
import { MODELS } from '@/lib/types';

export default function Workspace() {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
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

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only show overlay if files are being dragged (not text selections etc.)
    if (e.dataTransfer.types.includes('Files')) {
      dragCounterRef.current++;
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      window.dispatchEvent(new CustomEvent('nexus:drop-files', {
        detail: { files: Array.from(e.dataTransfer.files) },
      }));
    }
  }, []);

  return (
    <div
      className="relative flex flex-col h-dvh w-screen bg-bg overflow-hidden noise-overlay"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {!focusMode && <HealthBanner />}
      {!focusMode && <TopBar />}
      <div className="flex flex-1 min-h-0 relative">
        {/* Sidebar — slides on desktop, overlay on mobile/tablet */}
        {!focusMode && (
          sidebarIsOverlay ? (
            // Mobile/tablet: overlay with backdrop
            sidebarOpen && (
              <>
                <div
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
                  onClick={() => setSidebarOpen(false)}
                />
                <div className="fixed left-0 top-12 bottom-0 z-40 animate-slide-in-left">
                  <ErrorBoundary fallbackMessage="Sidebar crashed">
                    <Sidebar />
                  </ErrorBoundary>
                </div>
              </>
            )
          ) : (
            // Desktop: always mounted, animate width
            <div
              className="h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
              style={{ width: sidebarOpen ? '272px' : '0px' }}
            >
              <div className="h-full w-[272px]">
                <ErrorBoundary fallbackMessage="Sidebar crashed">
                  <Sidebar />
                </ErrorBoundary>
              </div>
            </div>
          )
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
                    ? 'fixed left-0 right-0 bottom-0 top-[35%] z-40 animate-slide-up rounded-t-lg overflow-hidden'
                    : 'fixed right-0 top-12 bottom-0 z-40 animate-slide-in-right')
                : 'h-full'
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
          <div className="px-2.5 py-1 bg-surface-1/80 backdrop-blur-sm border border-border-default rounded-lg text-[10px] text-text-tertiary font-mono">
            ESC to exit focus
          </div>
        </div>
      )}

      {/* Full-screen drop overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[70] pointer-events-none animate-focus-fade-in" style={{ animationDuration: '0.15s' }}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-bg/80 backdrop-blur-sm" />

          {/* Inset border frame */}
          <div className="absolute inset-5 sm:inset-8">
            {/* Border lines */}
            <div className="absolute inset-0 border border-accent/40" />

            {/* Corner accents — top-left */}
            <div className="absolute -top-px -left-px w-5 h-5">
              <div className="absolute top-0 left-0 w-full h-px bg-accent" />
              <div className="absolute top-0 left-0 h-full w-px bg-accent" />
            </div>
            {/* Corner accents — top-right */}
            <div className="absolute -top-px -right-px w-5 h-5">
              <div className="absolute top-0 right-0 w-full h-px bg-accent" />
              <div className="absolute top-0 right-0 h-full w-px bg-accent" />
            </div>
            {/* Corner accents — bottom-left */}
            <div className="absolute -bottom-px -left-px w-5 h-5">
              <div className="absolute bottom-0 left-0 w-full h-px bg-accent" />
              <div className="absolute bottom-0 left-0 h-full w-px bg-accent" />
            </div>
            {/* Corner accents — bottom-right */}
            <div className="absolute -bottom-px -right-px w-5 h-5">
              <div className="absolute bottom-0 right-0 w-full h-px bg-accent" />
              <div className="absolute bottom-0 right-0 h-full w-px bg-accent" />
            </div>

            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="w-14 h-14 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
                <Upload size={24} className="text-accent" />
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-sm font-semibold text-text-primary">Drop files to attach</span>
                <span className="text-xs text-text-tertiary">Images, documents, spreadsheets, and more</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {commandPaletteOpen && <CommandPalette />}
      {shortcutsOpen && <KeyboardShortcuts onClose={() => setShortcutsOpen(false)} />}
      <DiffViewer />
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
