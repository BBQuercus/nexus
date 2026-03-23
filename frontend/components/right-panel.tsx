'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { Terminal, FolderOpen, Eye, Layers, Network } from 'lucide-react';
import TerminalPanel from './terminal-panel';
import FilesPanel from './files-panel';
import PreviewPanel from './preview-panel';
import ArtifactsPanel from './artifacts-panel';
import TreePanel from './tree-panel';

const TABS = [
  { key: 'terminal' as const, label: 'Terminal', icon: <Terminal size={12} /> },
  { key: 'files' as const, label: 'Files', icon: <FolderOpen size={12} /> },
  { key: 'preview' as const, label: 'Preview', icon: <Eye size={12} /> },
  { key: 'artifacts' as const, label: 'Artifacts', icon: <Layers size={12} /> },
  { key: 'tree' as const, label: 'Tree', icon: <Network size={12} /> },
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
      className="relative flex flex-col bg-surface-0 border-l border-border-default shrink-0"
      style={{ width }}
    >
      {/* Resize handle — wide hit target, thin visual indicator */}
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

      <div className="flex gap-0.5 p-1.5 border-b border-border-default shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setRightPanelTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium tracking-wide uppercase rounded-md transition-colors cursor-pointer ${
              activeTab === tab.key
                ? 'text-accent bg-accent/8'
                : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-1'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'terminal' && <TerminalPanel />}
        {activeTab === 'files' && <FilesPanel />}
        {activeTab === 'preview' && <PreviewPanel />}
        {activeTab === 'artifacts' && <ArtifactsPanel />}
        {activeTab === 'tree' && <TreePanel />}
      </div>
    </div>
  );
}
