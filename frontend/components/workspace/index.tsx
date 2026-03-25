'use client';

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useStore } from '@/lib/store';
import { useIsMobile } from '@/lib/useMediaQuery';
import { useVisualViewport } from '@/lib/useVisualViewport';
import { initErrorReporter } from '@/lib/error-reporter';
import { toast } from '@/components/toast';
import TopBar from '../top-bar';
import ChatMessages from '../chat-messages';
import ChatInput from '../chat-input';
import EmptyState from '../empty-state';
import ConfirmDialog from '../confirm-dialog';
import ToastContainer from '../toast';
import PanelErrorBoundary from '../panel-error-boundary';
import HealthBanner from '../health-banner';
import InstallPrompt from '../install-prompt';
import ShellLayout from './shell-layout';
import { useKeyboardShortcuts } from './use-keyboard-shortcuts';
import { useFocusMode } from './use-focus-mode';
import { Upload } from 'lucide-react';
import { startTour, isTourCompleted } from '@/lib/onboarding-tour';

const CommandPalette = lazy(() => import('../command-palette'));
const SearchPanel = lazy(() => import('../search-panel'));
const KeyboardShortcuts = lazy(() => import('../keyboard-shortcuts'));
const DiffViewer = lazy(() => import('../diff-viewer'));

export default function Workspace() {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const commandPaletteOpen = useStore((s) => s.commandPaletteOpen);
  const searchPanelOpen = useStore((s) => s.searchPanelOpen);
  const setSearchPanelOpen = useStore((s) => s.setSearchPanelOpen);
  const confirmDialog = useStore((s) => s.confirmDialog);
  const resolveConfirm = useStore((s) => s.resolveConfirm);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);

  const isMobile = useIsMobile();
  useVisualViewport();

  const { focusMode, focusModeRef, toggleFocusMode } = useFocusMode();

  const openShortcuts = useCallback(() => {
    setShortcutsOpen((prev) => !prev);
  }, []);

  useKeyboardShortcuts({
    onToggleFocusMode: toggleFocusMode,
    onOpenShortcuts: openShortcuts,
    focusModeRef,
  });

  useEffect(() => {
    initErrorReporter();
  }, []);

  // Listen for open-shortcuts event from slash commands / command palette
  useEffect(() => {
    const handler = () => setShortcutsOpen(true);
    window.addEventListener('nexus:open-shortcuts', handler);
    return () => window.removeEventListener('nexus:open-shortcuts', handler);
  }, []);

  // Onboarding tour: auto-start for new users, listen for manual trigger
  useEffect(() => {
    const handleStartTour = () => startTour();
    window.addEventListener('nexus:start-tour', handleStartTour);

    if (!isTourCompleted()) {
      const timeout = setTimeout(() => startTour(), 800);
      return () => {
        clearTimeout(timeout);
        window.removeEventListener('nexus:start-tour', handleStartTour);
      };
    }

    return () => window.removeEventListener('nexus:start-tour', handleStartTour);
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

  const hasConversation = !!activeConversationId;

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
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
      className="relative flex flex-col w-screen bg-bg overflow-hidden noise-overlay"
      style={{ height: 'var(--viewport-height, 100dvh)' }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {!focusMode && <HealthBanner />}
      <div className="relative flex flex-col flex-1 min-h-0">
        {!focusMode && <TopBar />}

        <ShellLayout focusMode={focusMode}>
          {/* Main chat area */}
          <div className="relative flex flex-col flex-1 min-w-0">
            <div className="absolute inset-0 dot-texture opacity-40 pointer-events-none" />
            <div className="relative flex flex-col flex-1 min-h-0">
              <PanelErrorBoundary panelName="Chat">
                {hasConversation ? <ChatMessages /> : <EmptyState />}
              </PanelErrorBoundary>
              <ChatInput />
            </div>
          </div>
        </ShellLayout>
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
          <div className="absolute inset-0 bg-bg/80 backdrop-blur-sm" />
          <div className="absolute inset-5 md:inset-8">
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

      <Suspense fallback={null}>
        {commandPaletteOpen && <CommandPalette />}
        {searchPanelOpen && <SearchPanel />}
        {shortcutsOpen && <KeyboardShortcuts onClose={() => setShortcutsOpen(false)} />}
        <DiffViewer />
      </Suspense>
      <InstallPrompt />
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
