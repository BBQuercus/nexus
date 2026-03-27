'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';
import type { Artifact } from '@/lib/types';
import * as api from '@/lib/api';
import VegaChart from './vega-chart';
import {
  Pin, PinOff, Code2, Image, BarChart3, Table, FileText, GitBranch,
  Copy, Check, Download, LayoutGrid, LayoutList, Filter,
  FileSpreadsheet, Presentation,
} from 'lucide-react';

type FilterType = 'all' | 'code' | 'charts' | 'tables' | 'documents' | 'forms';

function filterMatches(artifact: Artifact, filter: FilterType): boolean {
  if (filter === 'all') return true;
  if (filter === 'code') return artifact.type === 'code';
  if (filter === 'charts') return artifact.type === 'chart' || artifact.type === 'image' || artifact.type === 'diagram';
  if (filter === 'tables') return artifact.type === 'table';
  if (filter === 'documents') return artifact.type === 'document';
  if (filter === 'forms') return artifact.type === 'form';
  return true;
}

function getDocIcon(artifact: Artifact) {
  const label = artifact.label.toLowerCase();
  if (label.endsWith('.xlsx') || label.endsWith('.xls')) return <FileSpreadsheet size={14} className="text-green-400" />;
  if (label.endsWith('.pptx') || label.endsWith('.ppt')) return <Presentation size={14} className="text-orange-400" />;
  if (label.endsWith('.pdf')) return <FileText size={14} className="text-red-400" />;
  return <FileText size={14} className="text-text-tertiary" />;
}

function ArtifactCard({ artifact, isGrid }: { artifact: Artifact; isGrid: boolean }) {
  const t = useTranslations('artifactsPanel');
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
      // Optimistic toggle on failure
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
    // Try sandbox file read
    if (sandboxId && artifact.metadata?.path) {
      const path = artifact.metadata.path as string;
      window.open(`/api/sandboxes/${sandboxId}/files/read?path=${encodeURIComponent(path)}`, '_blank');
    }
  };

  const handleExportCsv = () => {
    if (!artifact.content) return;
    const blob = new Blob([artifact.content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact.label.replace(/\.[^.]+$/, '') + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleChartDownload = useCallback(async (format: 'png' | 'svg') => {
    if (!chartView) return;
    const imageUrl = await chartView.toImageURL(format);
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `${artifact.label.replace(/\.[^.]+$/, '')}.${format}`;
    a.click();
  }, [artifact.label, chartView]);

  const lineCount = artifact.type === 'code' && artifact.content
    ? artifact.content.split('\n').length
    : undefined;

  const rowColCount = artifact.type === 'table' && artifact.content
    ? (() => {
        const lines = artifact.content.trim().split('\n');
        const rows = lines.length;
        const cols = lines[0]?.split(/[,\t]/).length || 0;
        return { rows, cols };
      })()
    : undefined;

  const language = artifact.type === 'code'
    ? (artifact.metadata?.language as string) || artifact.label.split('.').pop() || 'code'
    : undefined;

  const isImagePreviewable = (artifact.type === 'image' || artifact.type === 'chart') &&
    (artifact.url || (artifact.content && (artifact.content.startsWith('data:') || artifact.content.startsWith('http'))));

  const previewUrl = isImagePreviewable
    ? (artifact.url || artifact.content || '')
    : '';

  const docExt = artifact.type === 'document'
    ? (artifact.label.split('.').pop()?.toLowerCase() || '')
    : '';

  const docBadgeColor = docExt === 'xlsx' || docExt === 'xls' ? 'bg-green-500/15 text-green-400'
    : docExt === 'pptx' || docExt === 'ppt' ? 'bg-orange-500/15 text-orange-400'
    : docExt === 'pdf' ? 'bg-red-500/15 text-red-400'
    : 'bg-surface-2 text-text-tertiary';
  const chartSpec = useMemo(() => {
    if (artifact.type !== 'chart' || !artifact.content) return null;
    try {
      return JSON.parse(artifact.content) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [artifact.content, artifact.type]);

  return (
    <div className={`bg-surface-1 border border-border-default hover:border-border-focus rounded-lg transition-colors ${isGrid ? 'p-3' : 'p-2.5 flex items-start gap-3'}`}>
      {/* Thumbnail / icon area */}
      {isGrid && isImagePreviewable && previewUrl && (
        <div className="mb-2 rounded overflow-hidden border border-border-default bg-bg">
          <img src={previewUrl} alt={artifact.label} className="w-full h-24 object-contain" />
        </div>
      )}
      {isGrid && artifact.type === 'chart' && chartSpec && (
        <div className="mb-2 rounded overflow-hidden border border-border-default bg-surface-0">
          <VegaChart spec={chartSpec} className="max-h-52 overflow-hidden p-2 w-full" onViewReady={setChartView} />
        </div>
      )}

      {!isGrid && (
        <div className="w-9 h-9 rounded bg-surface-2 border border-border-default flex items-center justify-center shrink-0 mt-0.5">
          {artifact.type === 'code' ? <Code2 size={14} className="text-accent" />
            : artifact.type === 'image' || artifact.type === 'chart' ? <BarChart3 size={14} className="text-purple-400" />
            : artifact.type === 'table' ? <Table size={14} className="text-blue-400" />
            : artifact.type === 'document' ? getDocIcon(artifact)
            : artifact.type === 'diagram' ? <GitBranch size={14} className="text-text-tertiary" />
            : <Code2 size={14} className="text-text-tertiary" />}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          {artifact.type === 'code' && language && (
            <span className="px-1.5 py-0 text-[9px] font-bold uppercase rounded bg-accent/10 text-accent tracking-wide">{language}</span>
          )}
          {artifact.type === 'code' && lineCount !== undefined && (
            <span className="text-[9px] text-text-tertiary font-mono">{t('linesCount', { count: lineCount })}</span>
          )}
          {artifact.type === 'table' && rowColCount && (
            <span className="px-1.5 py-0 text-[9px] font-bold rounded bg-blue-500/10 text-blue-400 font-mono">
              {rowColCount.rows}r x {rowColCount.cols}c
            </span>
          )}
          {artifact.type === 'document' && docExt && (
            <span className={`px-1.5 py-0 text-[9px] font-bold uppercase rounded tracking-wide ${docBadgeColor}`}>
              {docExt}
            </span>
          )}
          {(artifact.type === 'image' || artifact.type === 'chart') && (
            <span className="px-1.5 py-0 text-[9px] font-bold uppercase rounded bg-purple-500/10 text-purple-400 tracking-wide">{t('chartBadge')}</span>
          )}
          {artifact.pinned && <Pin size={9} className="text-accent" />}
        </div>

        <div className="text-xs text-text-primary truncate">{artifact.label}</div>
        <div className="text-[10px] text-text-tertiary font-mono mt-0.5">
          {new Date(artifact.createdAt).toLocaleTimeString()}
        </div>
        {artifact.type === 'chart' && chartSpec && !isGrid && (
          <div className="mt-2 rounded-lg border border-border-default bg-surface-0 overflow-hidden">
            <VegaChart spec={chartSpec} className="max-h-72 overflow-hidden p-2 w-full" onViewReady={setChartView} />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 mt-2">
          {artifact.type === 'code' && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-medium rounded border border-border-default bg-surface-2 text-text-tertiary hover:text-text-secondary hover:border-border-focus cursor-pointer transition-colors"
            >
              {copied ? <Check size={9} className="text-accent" /> : <Copy size={9} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
          {artifact.type === 'image' && (
            <button
              onClick={() => handleDownload(artifact.label.replace(/\.[^.]+$/, '') + '.png', 'image/png')}
              className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-medium rounded border border-border-default bg-surface-2 text-text-tertiary hover:text-text-secondary hover:border-border-focus cursor-pointer transition-colors"
            >
              <Download size={9} /> {t('downloadPng')}
            </button>
          )}
          {artifact.type === 'chart' && (
            <>
              <button
                onClick={() => void handleChartDownload('png')}
                className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-medium rounded border border-border-default bg-surface-2 text-text-tertiary hover:text-text-secondary hover:border-border-focus cursor-pointer transition-colors"
              >
                <Download size={9} /> {t('png')}
              </button>
              <button
                onClick={() => void handleChartDownload('svg')}
                className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-medium rounded border border-border-default bg-surface-2 text-text-tertiary hover:text-text-secondary hover:border-border-focus cursor-pointer transition-colors"
              >
                <Download size={9} /> {t('svg')}
              </button>
            </>
          )}
          {artifact.type === 'table' && (
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-medium rounded border border-border-default bg-surface-2 text-text-tertiary hover:text-text-secondary hover:border-border-focus cursor-pointer transition-colors"
            >
              <Download size={9} /> {t('exportCsv')}
            </button>
          )}
          {artifact.type === 'document' && (
            <button
              onClick={() => handleDownload()}
              className={`flex items-center gap-1 px-2 py-0.5 text-[9px] font-medium rounded border border-border-default bg-surface-2 hover:border-border-focus cursor-pointer transition-colors ${docBadgeColor}`}
            >
              <Download size={9} /> Download
            </button>
          )}
          <button
            onClick={handleTogglePin}
            className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] rounded border border-border-default bg-surface-2 text-text-tertiary hover:text-accent hover:border-accent/20 cursor-pointer transition-colors"
            title={artifact.pinned ? t('unpin') : t('pin')}
          >
            {artifact.pinned ? <PinOff size={9} /> : <Pin size={9} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ArtifactsPanel() {
  const t = useTranslations('artifactsPanel');
  const artifacts = useStore((s) => s.artifacts);
  const [filter, setFilter] = useState<FilterType>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
    { key: 'all', label: t('filterAll') },
    { key: 'code', label: t('filterCode') },
    { key: 'charts', label: t('filterCharts') },
    { key: 'tables', label: t('filterTables') },
    { key: 'documents', label: t('filterDocuments') },
    { key: 'forms', label: t('filterForms') },
  ];

  const filtered = useMemo(
    () => artifacts.filter((a) => filterMatches(a, filter)),
    [artifacts, filter],
  );

  if (artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-tertiary px-6">
        <BarChart3 size={24} className="mb-2 opacity-40" />
        <p className="text-xs font-mono text-center">{t('emptyState')}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-2 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-text-tertiary font-mono tracking-wide uppercase">
          {t('headerLabel')} · {filtered.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode('list')}
            className={`p-1 rounded cursor-pointer transition-colors ${viewMode === 'list' ? 'text-accent bg-accent/10' : 'text-text-tertiary hover:text-text-secondary'}`}
            title={t('listView')}
          >
            <LayoutList size={12} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1 rounded cursor-pointer transition-colors ${viewMode === 'grid' ? 'text-accent bg-accent/10' : 'text-text-tertiary hover:text-text-secondary'}`}
            title={t('gridView')}
          >
            <LayoutGrid size={12} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1 px-1 flex-wrap">
        <Filter size={10} className="text-text-tertiary mr-0.5" />
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={`px-2 py-0.5 text-[10px] font-medium rounded-lg border cursor-pointer transition-all ${
              filter === opt.key
                ? 'text-accent bg-accent/10 border-accent/30'
                : 'text-text-tertiary bg-surface-1 border-border-default hover:border-border-focus hover:text-text-secondary'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Artifact list / grid */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-text-tertiary text-xs font-mono">
          {t('noFilteredArtifacts', { filter })}
        </div>
      ) : (
        <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-2' : 'space-y-1.5'}>
          {filtered.map((artifact) => (
            <ArtifactCard key={artifact.id} artifact={artifact} isGrid={viewMode === 'grid'} />
          ))}
        </div>
      )}
    </div>
  );
}
