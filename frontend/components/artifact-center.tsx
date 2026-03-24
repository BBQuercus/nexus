'use client';

/**
 * ArtifactCenter -- unified artifact center for the right panel.
 *
 * Grid/list view toggle, filter by type (code, chart, table, document, form),
 * artifact cards with type icons, labels, previews, pin/unpin.
 */

import { useState, useMemo, useCallback } from 'react';
import { useStore } from '@/lib/store';
import type { Artifact } from '@/lib/types';
import * as api from '@/lib/api';
import VegaChart from './vega-chart';
import FormRenderer from './form-renderer';
import {
  Pin, PinOff, Code2, Image, BarChart3, Table, FileText, GitBranch,
  Copy, Check, Download, LayoutGrid, LayoutList, Filter,
  FileSpreadsheet, Presentation, ClipboardList, ChevronDown, ChevronRight,
} from 'lucide-react';

type FilterType = 'all' | 'code' | 'charts' | 'tables' | 'documents' | 'forms';

const FILTER_OPTIONS: { key: FilterType; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: 'All', icon: null },
  { key: 'code', label: 'Code', icon: <Code2 size={10} /> },
  { key: 'charts', label: 'Charts', icon: <BarChart3 size={10} /> },
  { key: 'tables', label: 'Tables', icon: <Table size={10} /> },
  { key: 'documents', label: 'Docs', icon: <FileText size={10} /> },
  { key: 'forms', label: 'Forms', icon: <ClipboardList size={10} /> },
];

function filterMatches(artifact: Artifact, filter: FilterType): boolean {
  if (filter === 'all') return true;
  if (filter === 'code') return artifact.type === 'code';
  if (filter === 'charts') return artifact.type === 'chart' || artifact.type === 'image' || artifact.type === 'diagram';
  if (filter === 'tables') return artifact.type === 'table';
  if (filter === 'documents') return artifact.type === 'document';
  if (filter === 'forms') return artifact.type === 'form';
  return true;
}

function getTypeIcon(artifact: Artifact) {
  switch (artifact.type) {
    case 'code':
      return <Code2 size={14} className="text-accent" />;
    case 'chart':
    case 'image':
      return <BarChart3 size={14} className="text-purple-400" />;
    case 'table':
      return <Table size={14} className="text-blue-400" />;
    case 'document': {
      const label = artifact.label.toLowerCase();
      if (label.endsWith('.xlsx') || label.endsWith('.xls'))
        return <FileSpreadsheet size={14} className="text-green-400" />;
      if (label.endsWith('.pptx') || label.endsWith('.ppt'))
        return <Presentation size={14} className="text-orange-400" />;
      if (label.endsWith('.pdf'))
        return <FileText size={14} className="text-red-400" />;
      return <FileText size={14} className="text-text-tertiary" />;
    }
    case 'diagram':
      return <GitBranch size={14} className="text-text-tertiary" />;
    case 'form':
      return <ClipboardList size={14} className="text-emerald-400" />;
    default:
      return <Code2 size={14} className="text-text-tertiary" />;
  }
}

function getTypeBadge(artifact: Artifact) {
  switch (artifact.type) {
    case 'code': {
      const lang = (artifact.metadata?.language as string) || artifact.label.split('.').pop() || 'code';
      return <span className="px-1.5 py-0 text-[9px] font-bold uppercase rounded bg-accent/10 text-accent tracking-wide">{lang}</span>;
    }
    case 'chart':
    case 'image':
      return <span className="px-1.5 py-0 text-[9px] font-bold uppercase rounded bg-purple-500/10 text-purple-400 tracking-wide">chart</span>;
    case 'table': {
      if (!artifact.content) return null;
      const lines = artifact.content.trim().split('\n');
      return (
        <span className="px-1.5 py-0 text-[9px] font-bold rounded bg-blue-500/10 text-blue-400 font-mono">
          {lines.length}r x {(lines[0]?.split(/[,\t]/).length || 0)}c
        </span>
      );
    }
    case 'document': {
      const ext = artifact.label.split('.').pop()?.toLowerCase() || '';
      const color = ext === 'xlsx' || ext === 'xls' ? 'bg-green-500/15 text-green-400'
        : ext === 'pptx' || ext === 'ppt' ? 'bg-orange-500/15 text-orange-400'
        : ext === 'pdf' ? 'bg-red-500/15 text-red-400'
        : 'bg-surface-2 text-text-tertiary';
      return ext ? <span className={`px-1.5 py-0 text-[9px] font-bold uppercase rounded tracking-wide ${color}`}>{ext}</span> : null;
    }
    case 'form':
      return <span className="px-1.5 py-0 text-[9px] font-bold uppercase rounded bg-emerald-500/10 text-emerald-400 tracking-wide">form</span>;
    default:
      return null;
  }
}

function ArtifactCard({ artifact, isGrid, expanded, onToggleExpand }: {
  artifact: Artifact;
  isGrid: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [chartView, setChartView] = useState<{ toImageURL: (type: string) => Promise<string> } | null>(null);
  const sandboxId = useStore((s) => s.sandboxId);
  const setArtifacts = useStore((s) => s.setArtifacts);
  const artifacts = useStore((s) => s.artifacts);

  const handleCopy = () => {
    if (!artifact.content) return;
    navigator.clipboard.writeText(artifact.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleTogglePin = async () => {
    try {
      const updated = await api.updateArtifact(artifact.id, { pinned: !artifact.pinned });
      setArtifacts(artifacts.map((a) => (a.id === artifact.id ? { ...a, pinned: updated.pinned } : a)));
    } catch {
      setArtifacts(artifacts.map((a) => (a.id === artifact.id ? { ...a, pinned: !a.pinned } : a)));
    }
  };

  const handleDownload = (filename?: string, mimeType?: string) => {
    if (artifact.url) {
      const a = document.createElement('a');
      a.href = artifact.url;
      a.download = filename || artifact.label;
      a.click();
      return;
    }
    if (artifact.content) {
      const blob = new Blob([artifact.content], { type: mimeType || 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || artifact.label;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (sandboxId && artifact.metadata?.path) {
      const path = artifact.metadata.path as string;
      window.open(`/api/sandboxes/${sandboxId}/files/read?path=${encodeURIComponent(path)}`, '_blank');
    }
  };

  const handleChartDownload = useCallback(async (format: 'png' | 'svg') => {
    if (!chartView) return;
    const imageUrl = await chartView.toImageURL(format);
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `${artifact.label.replace(/\.[^.]+$/, '')}.${format}`;
    a.click();
  }, [artifact.label, chartView]);

  const chartSpec = useMemo(() => {
    if (artifact.type !== 'chart' || !artifact.content) return null;
    try {
      return JSON.parse(artifact.content) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [artifact.content, artifact.type]);

  const formSpec = useMemo(() => {
    if (artifact.type !== 'form' || !artifact.content) return null;
    try {
      return JSON.parse(artifact.content);
    } catch {
      return null;
    }
  }, [artifact.content, artifact.type]);

  const isImagePreviewable = (artifact.type === 'image' || artifact.type === 'chart') &&
    (artifact.url || (artifact.content && (artifact.content.startsWith('data:') || artifact.content.startsWith('http'))));
  const previewUrl = isImagePreviewable ? (artifact.url || artifact.content || '') : '';

  return (
    <div className={`bg-surface-1 border border-border-default hover:border-border-focus rounded-lg transition-colors ${isGrid ? 'p-3' : 'p-2.5'}`}>
      {/* Clickable header */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex items-start gap-3 w-full text-left cursor-pointer"
      >
        {!isGrid && (
          <div className="w-9 h-9 rounded bg-surface-2 border border-border-default flex items-center justify-center shrink-0 mt-0.5">
            {getTypeIcon(artifact)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {getTypeBadge(artifact)}
            {artifact.pinned && <Pin size={9} className="text-accent" />}
            {expanded ? <ChevronDown size={10} className="text-text-tertiary ml-auto" /> : <ChevronRight size={10} className="text-text-tertiary ml-auto" />}
          </div>
          <div className="text-xs text-text-primary truncate">{artifact.label}</div>
          <div className="text-[10px] text-text-tertiary font-mono mt-0.5">
            {new Date(artifact.createdAt).toLocaleTimeString()}
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border-subtle">
          {/* Image preview */}
          {isImagePreviewable && previewUrl && (
            <div className="mb-2 rounded overflow-hidden border border-border-default bg-bg">
              <img src={previewUrl} alt={artifact.label} className="w-full max-h-64 object-contain" />
            </div>
          )}

          {/* Chart preview */}
          {artifact.type === 'chart' && chartSpec && (
            <div className="mb-2 rounded overflow-hidden border border-border-default bg-surface-0">
              <VegaChart spec={chartSpec} className="max-h-64 overflow-hidden p-2 w-full" onViewReady={setChartView} />
            </div>
          )}

          {/* Form preview */}
          {artifact.type === 'form' && formSpec && (
            <div className="mb-2">
              <FormRenderer spec={formSpec} compact />
            </div>
          )}

          {/* Code preview */}
          {artifact.type === 'code' && artifact.content && (
            <pre className="mb-2 px-3 py-2 bg-bg border border-border-default rounded-lg text-xs text-text-secondary overflow-x-auto max-h-48">
              <code>{artifact.content}</code>
            </pre>
          )}

          {/* Table preview */}
          {artifact.type === 'table' && artifact.content && (
            <div className="mb-2 overflow-x-auto border border-border-default rounded-lg">
              <table className="min-w-full text-[10px]">
                <tbody>
                  {artifact.content.trim().split('\n').slice(0, 8).map((row, i) => (
                    <tr key={i} className={i === 0 ? 'bg-surface-2 font-medium' : 'border-t border-border-subtle'}>
                      {row.split(',').map((cell, j) => (
                        <td key={j} className="px-2 py-1 text-text-secondary whitespace-nowrap">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {artifact.type === 'code' && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-medium rounded border border-border-default bg-surface-2 text-text-tertiary hover:text-text-secondary hover:border-border-focus cursor-pointer transition-colors"
              >
                {copied ? <Check size={9} className="text-accent" /> : <Copy size={9} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            {artifact.type === 'chart' && (
              <>
                <button
                  onClick={() => void handleChartDownload('png')}
                  className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-medium rounded border border-border-default bg-surface-2 text-text-tertiary hover:text-text-secondary hover:border-border-focus cursor-pointer transition-colors"
                >
                  <Download size={9} /> PNG
                </button>
                <button
                  onClick={() => void handleChartDownload('svg')}
                  className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-medium rounded border border-border-default bg-surface-2 text-text-tertiary hover:text-text-secondary hover:border-border-focus cursor-pointer transition-colors"
                >
                  <Download size={9} /> SVG
                </button>
              </>
            )}
            {artifact.type === 'table' && (
              <button
                onClick={() => {
                  if (!artifact.content) return;
                  const blob = new Blob([artifact.content], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = artifact.label.replace(/\.[^.]+$/, '') + '.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-medium rounded border border-border-default bg-surface-2 text-text-tertiary hover:text-text-secondary hover:border-border-focus cursor-pointer transition-colors"
              >
                <Download size={9} /> Export CSV
              </button>
            )}
            {artifact.type === 'document' && (
              <button
                onClick={() => handleDownload()}
                className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-medium rounded border border-border-default bg-surface-2 text-text-tertiary hover:text-text-secondary hover:border-border-focus cursor-pointer transition-colors"
              >
                <Download size={9} /> Download
              </button>
            )}
            <button
              onClick={handleTogglePin}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] rounded border border-border-default bg-surface-2 text-text-tertiary hover:text-accent hover:border-accent/20 cursor-pointer transition-colors"
              title={artifact.pinned ? 'Unpin' : 'Pin'}
            >
              {artifact.pinned ? <PinOff size={9} /> : <Pin size={9} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ArtifactCenter() {
  const artifacts = useStore((s) => s.artifacts);
  const [filter, setFilter] = useState<FilterType>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () => {
      const sorted = [...artifacts].sort((a, b) => {
        // Pinned first
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      return sorted.filter((a) => filterMatches(a, filter));
    },
    [artifacts, filter],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Count artifacts by type for filter badges
  const counts = useMemo(() => {
    const c: Record<FilterType, number> = { all: artifacts.length, code: 0, charts: 0, tables: 0, documents: 0, forms: 0 };
    for (const a of artifacts) {
      if (a.type === 'code') c.code++;
      else if (a.type === 'chart' || a.type === 'image' || a.type === 'diagram') c.charts++;
      else if (a.type === 'table') c.tables++;
      else if (a.type === 'document') c.documents++;
      else if (a.type === 'form') c.forms++;
    }
    return c;
  }, [artifacts]);

  if (artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-tertiary px-6">
        <BarChart3 size={24} className="mb-2 opacity-40" />
        <p className="text-xs font-mono text-center">Charts, code, forms, and documents will appear here</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-2 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-text-tertiary font-mono tracking-wide uppercase">
          Artifacts &middot; {filtered.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode('list')}
            className={`p-1 rounded cursor-pointer transition-colors ${viewMode === 'list' ? 'text-accent bg-accent/10' : 'text-text-tertiary hover:text-text-secondary'}`}
            title="List view"
          >
            <LayoutList size={12} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1 rounded cursor-pointer transition-colors ${viewMode === 'grid' ? 'text-accent bg-accent/10' : 'text-text-tertiary hover:text-text-secondary'}`}
            title="Grid view"
          >
            <LayoutGrid size={12} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1 px-1 flex-wrap">
        <Filter size={10} className="text-text-tertiary mr-0.5" />
        {FILTER_OPTIONS.filter((opt) => opt.key === 'all' || counts[opt.key] > 0).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-lg border cursor-pointer transition-all ${
              filter === opt.key
                ? 'text-accent bg-accent/10 border-accent/30'
                : 'text-text-tertiary bg-surface-1 border-border-default hover:border-border-focus hover:text-text-secondary'
            }`}
          >
            {opt.icon}
            {opt.label}
            {opt.key !== 'all' && <span className="text-[9px] opacity-60">{counts[opt.key]}</span>}
          </button>
        ))}
      </div>

      {/* Artifact list / grid */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-text-tertiary text-xs font-mono">
          No {filter} artifacts
        </div>
      ) : (
        <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-2' : 'space-y-1.5'}>
          {filtered.map((artifact) => (
            <ArtifactCard
              key={artifact.id}
              artifact={artifact}
              isGrid={viewMode === 'grid'}
              expanded={expandedIds.has(artifact.id)}
              onToggleExpand={() => toggleExpand(artifact.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
