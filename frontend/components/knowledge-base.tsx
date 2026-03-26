'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import * as api from '@/lib/api';
import type { KnowledgeBase, KBDocument } from '@/lib/types';
import type { KBChunk } from '@/lib/api';
import {
  BookOpen, Plus, Trash2, Upload, X, FileText, Check,
  Loader2, Search, ArrowLeft, Download, Database, Hash,
} from 'lucide-react';
import { toast } from './toast';
import { getCsrfToken } from '@/lib/auth';
import PageShell from './page-shell';
import ConfirmDialog from './confirm-dialog';
import { useStore } from '@/lib/store';
import { toApiUrl } from '@/lib/runtime';

async function directUpload(url: string, files: File[]): Promise<{ documents: Record<string, unknown>[] }> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  const headers: Record<string, string> = {};
  const csrfToken = getCsrfToken();
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const resp = await fetch(toApiUrl(url), {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || resp.statusText);
  }
  return resp.json();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    ready: { label: 'Ready', cls: 'text-accent bg-accent/10' },
    processing: { label: 'Processing', cls: 'text-warning bg-warning/10' },
    error: { label: 'Error', cls: 'text-error bg-error/10' },
  }[status] || { label: status, cls: 'text-text-tertiary bg-surface-1' };

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${config.cls}`}>
      {status === 'processing' && <Loader2 size={9} className="inline animate-spin mr-1" />}
      {config.label}
    </span>
  );
}

// ── Sidebar ──

function KBSidebar({
  knowledgeBases, selectedId, onSelect, onCreate, loading,
}: {
  knowledgeBases: KnowledgeBase[];
  selectedId: string | null;
  onSelect: (kb: KnowledgeBase | null) => void;
  onCreate: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3">
        <button
          onClick={onCreate}
          className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] font-medium bg-accent text-bg rounded-lg hover:bg-accent-hover cursor-pointer transition-colors"
        >
          <Plus size={12} /> New Knowledge Base
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-text-tertiary">
            <Loader2 size={14} className="animate-spin" />
          </div>
        ) : knowledgeBases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
            <BookOpen size={20} className="mb-2 opacity-20" />
            <div className="text-[11px]">No knowledge bases yet</div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {knowledgeBases.map((kb) => (
              <button
                key={kb.id}
                onClick={() => onSelect(kb)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 text-left rounded-lg transition-all cursor-pointer ${
                  selectedId === kb.id
                    ? 'bg-accent/8 text-text-primary border-l-2 border-accent -ml-px'
                    : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                  selectedId === kb.id ? 'bg-accent/10 border-accent/20' : 'bg-surface-1 border-border-default'
                }`}>
                  <BookOpen size={13} className={selectedId === kb.id ? 'text-accent' : 'text-text-tertiary'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{kb.name}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-text-tertiary font-mono">
                    <span>{kb.documentCount} doc{kb.documentCount !== 1 ? 's' : ''}</span>
                    <StatusBadge status={kb.status} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Document Row ──

function DocumentRow({ doc, kbId, onDelete, onView }: { doc: KBDocument; kbId: string; onDelete: () => void; onView: () => void }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(true);
    try {
      await api.deleteKBDocument(kbId, doc.id);
      onDelete();
      toast.success('Document removed');
    } catch { toast.error('Failed to delete document'); }
    setDeleting(false);
  };

  return (
    <div
      onClick={doc.status === 'ready' ? onView : undefined}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
        doc.status === 'ready' ? 'cursor-pointer hover:bg-surface-1/50' : ''
      }`}
    >
      <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
        doc.status === 'ready' ? 'bg-accent/5 border-accent/10' : doc.status === 'error' ? 'bg-error/5 border-error/10' : 'bg-surface-1 border-border-default'
      }`}>
        <FileText size={14} className={
          doc.status === 'ready' ? 'text-accent/60' : doc.status === 'error' ? 'text-error/60' : 'text-text-tertiary'
        } />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-text-primary truncate">{doc.filename}</div>
        <div className="text-[10px] text-text-tertiary font-mono mt-0.5">
          {formatBytes(doc.fileSizeBytes)}
          {doc.pageCount != null && <span> · {doc.pageCount} pages</span>}
        </div>
        {doc.errorMessage && <div className="text-[10px] text-error mt-0.5 truncate">{doc.errorMessage}</div>}
      </div>
      <StatusBadge status={doc.status} />
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="p-1 text-text-tertiary hover:text-error cursor-pointer transition-colors disabled:opacity-50"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ── Document Viewer ──

type DocViewTab = 'chunks' | 'full';

function DocumentViewer({ doc, kbId, onBack }: { doc: KBDocument; kbId: string; onBack: () => void }) {
  const [tab, setTab] = useState<DocViewTab>('chunks');
  const [chunks, setChunks] = useState<KBChunk[]>([]);
  const [rawText, setRawText] = useState<string | null>(null);
  const [loadingChunks, setLoadingChunks] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set());

  useEffect(() => {
    setLoadingChunks(true);
    api.getKBDocumentChunks(kbId, doc.id)
      .then(setChunks)
      .catch(() => toast.error('Failed to load document chunks'))
      .finally(() => setLoadingChunks(false));
  }, [kbId, doc.id]);

  useEffect(() => {
    if (tab !== 'full' || rawText !== null) return;
    setLoadingContent(true);
    api.getKBDocumentContent(kbId, doc.id)
      .then((res) => setRawText(res.rawText))
      .catch(() => toast.error('Failed to load document content'))
      .finally(() => setLoadingContent(false));
  }, [tab, rawText, kbId, doc.id]);

  const filteredChunks = search.trim()
    ? chunks.filter((c) =>
        c.content.toLowerCase().includes(search.toLowerCase()) ||
        (c.sectionTitle || '').toLowerCase().includes(search.toLowerCase())
      )
    : chunks;

  const toggleChunk = (idx: number) => {
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);

  const handleDownload = () => {
    if (!rawText) return;
    const blob = new Blob([rawText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.filename.replace(/\.[^.]+$/, '')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 animate-[fadeIn_0.15s_ease-out]">
      <div className="max-w-4xl mx-auto">
        {/* Back + Header */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[11px] text-text-tertiary hover:text-text-secondary cursor-pointer transition-colors mb-4"
        >
          <ArrowLeft size={11} /> Back to documents
        </button>

        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-0 border border-border-default flex items-center justify-center shrink-0">
              <FileText size={18} className="text-text-tertiary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">{doc.filename}</h2>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-text-tertiary font-mono">
                <span>{formatBytes(doc.fileSizeBytes)}</span>
                {doc.pageCount != null && <span>{doc.pageCount} pages</span>}
                <span>{chunks.length} chunks</span>
                <span>{totalTokens.toLocaleString()} tokens</span>
              </div>
            </div>
          </div>
          <StatusBadge status={doc.status} />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-5 border-b border-border-default">
          {([
            { id: 'chunks' as DocViewTab, label: `Chunks (${chunks.length})` },
            { id: 'full' as DocViewTab, label: 'Full Document' },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2.5 text-xs font-medium cursor-pointer transition-colors relative ${
                tab === t.id ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {t.label}
              {tab === t.id && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent rounded-full" />}
            </button>
          ))}
        </div>

        {tab === 'chunks' && (
          <>
            <div className="relative mb-4">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search within document..."
                className="w-full bg-bg border border-border-default rounded-lg pl-8 pr-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
              />
              {search && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-tertiary font-mono">
                  {filteredChunks.length}/{chunks.length}
                </span>
              )}
            </div>

            {loadingChunks ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={16} className="text-text-tertiary animate-spin" />
              </div>
            ) : chunks.length === 0 ? (
              <div className="text-center py-12 text-text-tertiary text-xs">
                No chunks found. Document may still be processing.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredChunks.map((chunk) => {
                  const isExpanded = expandedChunks.has(chunk.chunkIndex);
                  const preview = chunk.content.slice(0, 200);
                  const hasMore = chunk.content.length > 200;

                  return (
                    <div key={chunk.id} className="bg-surface-0 border border-border-default rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleChunk(chunk.chunkIndex)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left cursor-pointer hover:bg-surface-1/30 transition-colors"
                      >
                        <span className="text-[10px] font-mono text-text-tertiary bg-surface-1 rounded px-1.5 py-0.5 shrink-0">
                          #{chunk.chunkIndex + 1}
                        </span>
                        {chunk.pageNumber != null && (
                          <span className="text-[10px] font-mono text-text-tertiary shrink-0">p.{chunk.pageNumber}</span>
                        )}
                        {chunk.sectionTitle && (
                          <span className="text-[11px] text-text-secondary truncate font-medium">{chunk.sectionTitle}</span>
                        )}
                        <span className="flex-1" />
                        <span className="text-[10px] font-mono text-text-tertiary shrink-0">{chunk.tokenCount} tok</span>
                      </button>
                      <div className="px-4 pb-3">
                        {chunk.contextPrefix && (
                          <div className="text-[11px] text-accent/70 italic mb-1.5 border-l-2 border-accent/20 pl-2">
                            {chunk.contextPrefix}
                          </div>
                        )}
                        <div className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
                          {isExpanded ? chunk.content : preview}
                          {hasMore && !isExpanded && <span className="text-text-tertiary">...</span>}
                        </div>
                        {hasMore && (
                          <button onClick={() => toggleChunk(chunk.chunkIndex)} className="text-[10px] text-accent hover:underline cursor-pointer mt-1">
                            {isExpanded ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'full' && (
          <>
            {loadingContent ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={16} className="text-text-tertiary animate-spin" />
              </div>
            ) : rawText === '' ? (
              <div className="text-center py-12 text-text-tertiary text-xs">
                No extracted text available for this document.
              </div>
            ) : rawText !== null ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] text-text-tertiary font-mono">
                    {rawText.length.toLocaleString()} characters
                  </span>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-text-secondary hover:text-text-primary bg-surface-0 border border-border-default hover:border-border-focus rounded-lg transition-colors cursor-pointer"
                  >
                    <Download size={11} /> Download .txt
                  </button>
                </div>
                <div className="bg-surface-0 border border-border-default rounded-xl p-5 max-h-[70vh] overflow-y-auto">
                  <div className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap font-mono">
                    {rawText}
                  </div>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

// ── KB Detail ──

function KBDetail({ kb, onRefresh, initialDocId }: { kb: KnowledgeBase; onRefresh: () => void; initialDocId?: string | null }) {
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<KBDocument | null>(null);

  const loadDocs = useCallback(async () => {
    try { const docs = await api.listKBDocuments(kb.id); setDocuments(docs); }
    catch { toast.error('Failed to load documents'); }
    setLoading(false);
  }, [kb.id]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  useEffect(() => {
    if (initialDocId && documents.length > 0 && !viewingDoc) {
      const doc = documents.find((d) => d.id === initialDocId);
      if (doc && doc.status === 'ready') setViewingDoc(doc);
    }
  }, [initialDocId, documents]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === 'processing');
    if (!hasProcessing) return;
    const interval = setInterval(() => { loadDocs(); onRefresh(); }, 3000);
    return () => clearInterval(interval);
  }, [documents, loadDocs, onRefresh]);

  const handleUpload = async (files: FileList | File[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      await directUpload(`/api/knowledge-bases/${kb.id}/documents`, Array.from(files));
      toast.success(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`);
      await loadDocs();
      onRefresh();
    } catch (e) { toast.error((e as Error).message || 'Upload failed'); }
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  const handleDeleteKB = async () => {
    const confirmed = await useStore.getState().showConfirm({
      title: `Delete "${kb.name}"?`,
      message: 'All documents and chunks will be permanently deleted.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.deleteKnowledgeBase(kb.id);
      toast.success('Knowledge base deleted');
      onRefresh();
    } catch { toast.error('Failed to delete'); }
  };

  useEffect(() => { setViewingDoc(null); }, [kb.id]);

  if (viewingDoc) {
    return <DocumentViewer doc={viewingDoc} kbId={kb.id} onBack={() => setViewingDoc(null)} />;
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 animate-[fadeIn_0.15s_ease-out]">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-0 border border-border-default flex items-center justify-center shrink-0">
              <BookOpen size={18} className="text-text-tertiary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">{kb.name}</h2>
              {kb.description && <p className="text-[11px] text-text-tertiary mt-0.5">{kb.description}</p>}
            </div>
          </div>
          <button
            onClick={handleDeleteKB}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-error/60 hover:text-error rounded-lg hover:bg-error/5 cursor-pointer transition-colors"
          >
            <Trash2 size={11} /> Delete
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[
            { icon: FileText, label: 'Documents', value: String(kb.documentCount) },
            { icon: Hash, label: 'Chunks', value: String(kb.chunkCount) },
            { icon: Database, label: 'Model', value: kb.embeddingModel.split('/').pop() || kb.embeddingModel },
          ].map((stat) => (
            <div key={stat.label} className="bg-surface-0 border border-border-default rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <stat.icon size={11} className="text-text-tertiary opacity-60" />
                <span className="text-[10px] text-text-tertiary uppercase tracking-wider">{stat.label}</span>
              </div>
              <div className="text-sm font-semibold text-text-primary font-mono">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Upload zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-5 text-center transition-all mb-6 ${
            dragOver ? 'border-accent bg-accent/5 scale-[1.01]' : 'border-border-default hover:border-border-focus'
          }`}
        >
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-xs text-text-secondary py-2">
              <Loader2 size={14} className="animate-spin" /> Uploading and processing...
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-surface-1 border border-border-default flex items-center justify-center shrink-0">
                <Upload size={16} className="text-text-tertiary" />
              </div>
              <div className="text-left">
                <p className="text-xs text-text-secondary">
                  Drag & drop files or{' '}
                  <button onClick={() => fileInputRef.current?.click()} className="text-accent hover:underline cursor-pointer">browse</button>
                </p>
                <p className="text-[10px] text-text-tertiary mt-0.5">
                  PDF, DOCX, PPTX, Excel, CSV, TXT, JSON, Markdown
                </p>
              </div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.pptx,.xlsx,.xls,.csv,.tsv,.txt,.md,.json"
            className="hidden"
            onChange={(e) => { if (e.target.files) handleUpload(e.target.files); e.target.value = ''; }}
          />
        </div>

        {/* Documents */}
        <div className="bg-surface-0 border border-border-default rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border-default">
            <h3 className="text-[11px] text-text-tertiary uppercase tracking-wider font-medium">
              {documents.length} Document{documents.length !== 1 ? 's' : ''}
            </h3>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={16} className="text-text-tertiary animate-spin" />
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText size={24} className="text-text-tertiary opacity-20 mb-2" />
              <p className="text-xs text-text-tertiary">No documents yet. Upload files to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-border-default">
              {documents.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} kbId={kb.id} onDelete={() => { loadDocs(); onRefresh(); }} onView={() => setViewingDoc(doc)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Create form ──

function CreateKBForm({
  value, onChange, onSubmit, onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 animate-[fadeIn_0.2s_ease-out]">
      <div className="w-full max-w-md">
        <div className="w-12 h-12 rounded-xl bg-surface-0 border border-border-default flex items-center justify-center mb-4">
          <BookOpen size={20} className="text-accent" />
        </div>
        <h2 className="text-base font-semibold text-text-primary mb-1">New Knowledge Base</h2>
        <p className="text-xs text-text-tertiary mb-5">
          Give your knowledge base a name. You can upload documents after creating it.
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="e.g. Q4 Reports, Product Documentation..."
          className="w-full bg-bg border border-border-default rounded-lg px-3 py-2.5 text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors mb-4"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={onSubmit}
            disabled={!value.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium bg-accent text-bg rounded-lg hover:bg-accent-hover cursor-pointer transition-colors disabled:opacity-40"
          >
            <Plus size={12} /> Create
          </button>
          <button onClick={onCancel} className="px-4 py-2 text-[11px] text-text-tertiary hover:text-text-secondary cursor-pointer transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Empty state ──

function EmptyContent({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-[fadeIn_0.2s_ease-out]">
      <div className="w-14 h-14 rounded-2xl bg-surface-0 border border-border-default flex items-center justify-center mb-4">
        <BookOpen size={24} className="text-text-tertiary opacity-30" />
      </div>
      <h3 className="text-sm font-medium text-text-primary mb-1">No knowledge base selected</h3>
      <p className="text-xs text-text-tertiary mb-5 max-w-xs">
        Select a knowledge base from the sidebar, or create a new one to start uploading documents for RAG-powered conversations.
      </p>
      <button
        onClick={onCreate}
        className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium bg-accent text-bg rounded-lg hover:bg-accent-hover cursor-pointer transition-colors"
      >
        <Plus size={12} /> New Knowledge Base
      </button>
    </div>
  );
}

// ── Main view ──

export default function KnowledgeBaseView() {
  const confirmDialog = useStore((s) => s.confirmDialog);
  const resolveConfirm = useStore((s) => s.resolveConfirm);

  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKB, setSelectedKB] = useState<KnowledgeBase | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [initialDocId, setInitialDocId] = useState<string | null>(null);

  const loadKBs = useCallback(async () => {
    try {
      const kbs = await api.listKnowledgeBases();
      setKnowledgeBases(kbs);
      if (selectedKB && !kbs.find((kb) => kb.id === selectedKB.id)) setSelectedKB(null);
    } catch { toast.error('Failed to load knowledge bases'); }
    setLoading(false);
  }, [selectedKB]);

  useEffect(() => {
    loadKBs().then(async () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const kbId = params.get('kb');
      const docId = params.get('doc');
      if (docId) setInitialDocId(docId);
      if (kbId) {
        try { setSelectedKB(await api.getKnowledgeBase(kbId)); } catch {}
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedKB && !creating && knowledgeBases.length > 0) setSelectedKB(knowledgeBases[0]);
  }, [knowledgeBases]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const kb = await api.createKnowledgeBase({ name: newName.trim() });
      setKnowledgeBases((prev) => [kb, ...prev]);
      setCreating(false);
      setNewName('');
      setSelectedKB(kb);
      toast.success('Knowledge base created');
    } catch { toast.error('Failed to create knowledge base'); }
  };

  const sidebar = (
    <KBSidebar
      knowledgeBases={knowledgeBases}
      selectedId={selectedKB?.id || null}
      onSelect={(kb) => { setSelectedKB(kb); setCreating(false); }}
      onCreate={() => { setSelectedKB(null); setCreating(true); }}
      loading={loading}
    />
  );

  return (
    <PageShell sidebar={sidebar} title="Knowledge Bases">
      {creating ? (
        <CreateKBForm value={newName} onChange={setNewName} onSubmit={handleCreate} onCancel={() => { setCreating(false); setNewName(''); }} />
      ) : selectedKB ? (
        <KBDetail kb={selectedKB} onRefresh={loadKBs} initialDocId={initialDocId} />
      ) : (
        <EmptyContent onCreate={() => setCreating(true)} />
      )}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={() => resolveConfirm(true)}
        onCancel={() => resolveConfirm(false)}
      />
    </PageShell>
  );
}
