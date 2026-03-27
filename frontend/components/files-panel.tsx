'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import type { FileNode } from '@/lib/types';
import { highlightCode } from '@/lib/markdown';
import { File, Folder, FolderOpen, ChevronRight, ArrowLeft, Download } from 'lucide-react';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function FileTreeNode({ node, depth, onSelect }: { node: FileNode; depth: number; onSelect: (path: string, node: FileNode) => void }) {
  const [expanded, setExpanded] = useState(false);

  const sorted = node.children
    ? [...node.children].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
    : [];

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => { setExpanded(!expanded); onSelect(node.path, node); }}
          className="flex items-center gap-1.5 w-full px-2 py-1 text-xs text-text-secondary hover:bg-surface-1 hover:text-text-primary cursor-pointer font-mono"
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <ChevronRight size={10} className={`shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          {expanded ? <FolderOpen size={12} className="text-accent/60 shrink-0" /> : <Folder size={12} className="text-text-tertiary shrink-0" />}
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && sorted.map((child) => (
          <FileTreeNode key={child.path} node={child} depth={depth + 1} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node.path, node)}
      className="flex items-center gap-1.5 w-full px-2 py-1 text-xs text-text-secondary hover:bg-surface-1 hover:text-text-primary cursor-pointer font-mono"
      style={{ paddingLeft: `${22 + depth * 14}px` }}
    >
      <File size={11} className="text-text-tertiary shrink-0" />
      <span className="truncate flex-1">{node.name}</span>
      {node.size !== undefined && (
        <span className="text-[10px] text-text-tertiary shrink-0">{formatSize(node.size)}</span>
      )}
    </button>
  );
}

function FileViewer({ path, content, language, onBack }: { path: string; content: string; language: string; onBack: () => void }) {
  const tc = useTranslations('common');
  const highlighted = highlightCode(content, language);
  const lineNumbers = content.split('\n').map((_, i) => i + 1).join('\n');

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-default shrink-0">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary cursor-pointer">
          <ArrowLeft size={12} /> {tc('back')}
        </button>
        <span className="text-[11px] text-text-secondary font-mono truncate flex-1">{path}</span>
        <button className="text-text-tertiary hover:text-text-secondary cursor-pointer">
          <Download size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="flex text-xs">
          <pre className="py-2 px-2 text-right text-text-tertiary select-none border-r border-border-subtle shrink-0 font-mono">
            {lineNumbers}
          </pre>
          <div className="flex-1 py-2 px-3 overflow-x-auto" dangerouslySetInnerHTML={{ __html: highlighted }} />
        </div>
      </div>
    </div>
  );
}

export default function FilesPanel() {
  const t = useTranslations('filesPanel');
  const tc = useTranslations('common');
  const sandboxId = useStore((s) => s.sandboxId);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [viewingFile, setViewingFile] = useState<{ path: string; content: string; language: string } | null>(null);

  const loadFiles = useCallback(async () => {
    if (!sandboxId) return;
    try { setFiles(await api.listSandboxFiles(sandboxId)); }
    catch (e) { console.error('Failed to load files:', e); }
  }, [sandboxId]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  if (!sandboxId) {
    return <div className="flex items-center justify-center h-full text-text-tertiary text-xs font-mono">{t('noSandboxActive')}</div>;
  }

  if (viewingFile) {
    return <FileViewer {...viewingFile} onBack={() => { setViewingFile(null); loadFiles(); }} />;
  }

  const handleSelect = async (path: string, node: FileNode) => {
    if (node.type === 'file' && sandboxId) {
      try { const { content, language } = await api.readSandboxFile(sandboxId, path); setViewingFile({ path, content, language }); }
      catch (e) { console.error('Failed to read file:', e); }
    }
  };

  const sorted = [...files].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="h-full overflow-y-auto py-1">
      {files.length === 0 ? (
        <div className="flex items-center justify-center h-full text-text-tertiary text-xs font-mono">{t('noFiles')}</div>
      ) : (
        sorted.map((node) => <FileTreeNode key={node.path} node={node} depth={0} onSelect={handleSelect} />)
      )}
    </div>
  );
}
