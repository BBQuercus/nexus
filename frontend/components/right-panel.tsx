'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useIsMobile } from '@/lib/useMediaQuery';
import { Terminal, FolderOpen, Eye, Layers, Network, BookOpen, Brain, X } from 'lucide-react';
import TerminalPanel from './terminal-panel';
import FilesPanel from './files-panel';
import PreviewPanel from './preview-panel';
import ArtifactCenter from './artifact-center';
import TreePanel from './tree-panel';
import SourcesPanel from './sources-panel';
import { MemoryPanel } from './memory-panel';

const ALL_TABS = [
  { key: 'terminal' as const, label: 'Terminal', icon: <Terminal size={12} />, needsSandbox: true },
  { key: 'files' as const, label: 'Files', icon: <FolderOpen size={12} />, needsSandbox: true },
  { key: 'preview' as const, label: 'Preview', icon: <Eye size={12} />, needsSandbox: true },
  { key: 'artifacts' as const, label: 'Artifacts', icon: <Layers size={12} />, needsSandbox: false },
  { key: 'tree' as const, label: 'Tree', icon: <Network size={12} />, needsSandbox: false },
  { key: 'sources' as const, label: 'Sources', icon: <BookOpen size={12} />, needsSandbox: false },
  { key: 'memory' as const, label: 'Memory', icon: <Brain size={12} />, needsSandbox: false },
];

const MIN_WIDTH = 280;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 420;

function getInitialWidth() {
  if (typeof window === 'undefined') return DEFAULT_WIDTH;
  try {
    const saved = localStorage.getItem('nexus:rightPanelWidth');
    if (saved) return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parseInt(saved, 10)));
  } catch {}
  return DEFAULT_WIDTH;
}

export default function RightPanel() {
  const activeTab = useStore((s) => s.rightPanelTab);
  const setRightPanelTab = useStore((s) => s.setRightPanelTab);
  const sandboxStatus = useStore((s) => s.sandboxStatus);
  const previewUrl = useStore((s) => s.previewUrl);
  const hasSandbox = sandboxStatus !== 'none';
  const artifacts = useStore((s) => s.artifacts);
  const tree = useStore((s) => s.conversationTree);
  const hasBranches = tree?.nodes.some((n) => n.childCount > 1) ?? false;

  const streamingCitations = useStore((s) => s.streaming.citations);
  const messages = useStore((s) => s.messages);
  const hasCitations = streamingCitations.length > 0 || messages.some((m) => m.citations && m.citations.length > 0);

  const visibleTabs = useMemo(() => {
    return ALL_TABS.filter((tab) => {
      if (tab.needsSandbox && !hasSandbox) return false;
      if (tab.key === 'preview' && !previewUrl) return false;
      if (tab.key === 'preview') return true;
      if (tab.key === 'artifacts' && artifacts.length === 0 && !hasSandbox) return false;
      if (tab.key === 'tree' && !hasBranches) return false;
      if (tab.key === 'sources' && !hasCitations) return false;
      return true;
    });
  }, [hasSandbox, previewUrl, artifacts.length, hasBranches, hasCitations]);

  // If the current tab is no longer visible, switch to first available
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.key === activeTab)) {
      setRightPanelTab(visibleTabs[0].key);
    }
  }, [visibleTabs, activeTab, setRightPanelTab]);

  const isMobile = useIsMobile();
  const setRightPanelOpen = useStore((s) => s.setRightPanelOpen);

  const [width, setWidth] = useState(getInitialWidth);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startWidth: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startWidth: width };
    setDragging(true);
  }, [width]);

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e: MouseEvent) => {
      // Moving mouse left → panel gets wider (it's on the right side)
      const delta = dragRef.current.startX - e.clientX;
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, dragRef.current.startWidth + delta));
      setWidth(newWidth);
    };

    const onMouseUp = () => {
      setDragging(false);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging]);

  // Persist width on change (debounced via dragging state)
  useEffect(() => {
    if (dragging) return; // save only when drag ends
    try { localStorage.setItem('nexus:rightPanelWidth', String(width)); } catch {}
  }, [width, dragging]);

  return (
    <div
      className="relative flex flex-col bg-surface-0 border-l border-border-default shrink-0 h-full"
      style={isMobile ? { width: '100%' } : { width }}
    >
      {/* Resize handle — hidden on mobile */}
      {!isMobile && (
        <div
          onMouseDown={onMouseDown}
          className="absolute -left-[5px] top-0 bottom-0 w-[10px] cursor-col-resize z-30 flex items-stretch justify-center"
        >
          <div
            className={`w-[3px] rounded-full transition-colors ${
              dragging ? 'bg-accent/50' : 'bg-transparent hover:bg-accent/30'
            }`}
          />
        </div>
      )}

      <div className="flex gap-0.5 p-1.5 border-b border-border-default shrink-0">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setRightPanelTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium tracking-wide uppercase rounded-lg transition-colors cursor-pointer ${
              activeTab === tab.key
                ? 'text-accent bg-accent/8'
                : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-1'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
        {/* Close button */}
        <button
          onClick={() => setRightPanelOpen(false)}
          className="flex items-center justify-center px-2 py-1.5 text-text-tertiary hover:text-text-secondary rounded-lg cursor-pointer transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'terminal' && <TerminalPanel />}
        {activeTab === 'files' && <FilesPanel />}
        {activeTab === 'preview' && <PreviewPanel />}
        {activeTab === 'artifacts' && <ArtifactCenter />}
        {activeTab === 'tree' && <TreePanel />}
        {activeTab === 'sources' && <SourcesPanel />}
        {activeTab === 'memory' && <MemoryPanel />}
      </div>
    </div>
  );
}
