'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import * as api from '@/lib/api';
import type { KnowledgeBase, KBDocument } from '@/lib/types';
import type { KBChunk } from '@/lib/api';
import {
  BookOpen, Plus, Trash2, Upload, X, FileText, Check,
  Loader2, Search, ArrowLeft, Download,
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
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${config.cls}`}>
      {status === 'processing' && <Loader2 size={9} className="inline animate-spin mr-1" />}
      {config.label}
    </span>
  );
}

// ── Sidebar ──

function KBSidebar({
  knowledgeBases,
  selectedId,
  onSelect,
  onCreate,
  loading,
}: {
  knowledgeBases: KnowledgeBase[];
  selectedId: string | null;
  onSelect: (kb: KnowledgeBase | null) => void;
  onCreate: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-default">
        <span className="text-[11px] text-text-tertiary uppercase tracking-wider flex-1">Knowledge Bases</span>
        <button
          onClick={onCreate}
          title="New knowledge base"
          className="w-7 h-7 flex items-center justify-center bg-surface-1 border border-border-default rounded-lg text-text-tertiary hover:text-accent hover:border-accent/30 cursor-pointer transition-colors"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-text-tertiary">
            <Loader2 size={14} className="animate-spin" />
          </div>
        ) : knowledgeBases.length === 0 ? (
          <div className="text-center py-8 text-text-tertiary text-[11px]">
            No knowledge bases yet
          </div>
        ) : (
          <div className="space-y-0.5">
            {knowledgeBases.map((kb) => (
              <button
                key={kb.id}
                onClick={() => onSelect(kb)}
                className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors cursor-pointer group ${
                  selectedId === kb.id
                    ? 'bg-accent/8 text-accent'
                    : 'text-text-secondary hover:bg-surface-1'
                }`}
              >
                <div className="flex items-center gap-2">
                  <BookOpen size={12} className={selectedId === kb.id ? 'text-accent' : 'text-text-tertiary'} />
                  <span className="text-xs font-medium truncate flex-1">{kb.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 ml-5 text-[10px] text-text-tertiary font-mono">
                  <span>{kb.documentCount} doc{kb.documentCount !== 1 ? 's' : ''}</span>
                  <StatusBadge status={kb.status} />
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
    } catch {
      toast.error('Failed to delete document');
    }
    setDeleting(false);
  };

  return (
    <div
      onClick={doc.status === 'ready' ? onView : undefined}
      className={`flex items-center gap-3 px-4 py-3 border border-border-default rounded-lg bg-surface-0 transition-colors ${
        doc.status === 'ready' ? 'cursor-pointer hover:border-border-focus hover:bg-surface-1/50' : ''
      }`}
    >
      <FileText size={16} className="text-text-tertiary shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary truncate">{doc.filename}</div>
        <div className="text-[11px] text-text-tertiary font-mono">
          {formatBytes(doc.fileSizeBytes)}
          {doc.pageCount && <span> / {doc.pageCount} pages</span>}
        </div>
        {doc.errorMessage && <div className="text-[11px] text-error mt-0.5">{doc.errorMessage}</div>}
      </div>
      <StatusBadge status={doc.status} />
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="text-text-tertiary hover:text-error cursor-pointer transition-colors disabled:opacity-50"
      >
        <Trash2 size={13} />
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

  // Lazy-load full content on tab switch
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
    const baseName = doc.filename.replace(/\.[^.]+$/, '');
    a.download = `${baseName}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { id: DocViewTab; label: string }[] = [
    { id: 'chunks', label: `Chunks (${chunks.length})` },
    { id: 'full', label: 'Full Document' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-8 w-full">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[11px] text-text-tertiary hover:text-text-secondary cursor-pointer transition-colors mb-3"
        >
          <ArrowLeft size={11} /> Back to documents
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2.5">
              <FileText size={18} className="text-text-tertiary" />
              {doc.filename}
            </h2>
            <div className="flex items-center gap-3 mt-2 text-[11px] text-text-tertiary font-mono">
              <span>{formatBytes(doc.fileSizeBytes)}</span>
              {doc.pageCount && <span>{doc.pageCount} pages</span>}
              <span>{chunks.length} chunks</span>
              <span>{totalTokens.toLocaleString()} tokens</span>
            </div>
          </div>
          <StatusBadge status={doc.status} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-border-default">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-medium cursor-pointer transition-colors relative ${
              tab === t.id
                ? 'text-accent'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {t.label}
            {tab === t.id && (
              <div className="absolute bottom-0 left-0 right-0 h-px bg-accent" />
            )}
          </button>
        ))}
      </div>

      {tab === 'chunks' && (
        <>
          {/* Search */}
          <div className="relative mb-4">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search within document..."
              className="w-full bg-surface-1 border border-border-default rounded-lg pl-8 pr-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40"
            />
            {search && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-tertiary font-mono">
                {filteredChunks.length}/{chunks.length}
              </span>
            )}
          </div>

          {/* Chunks */}
          {loadingChunks ? (
            <div className="flex items-center justify-center py-12 text-text-tertiary">
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : chunks.length === 0 ? (
            <div className="text-center py-12 text-text-tertiary text-sm">
              No chunks found. Document may still be processing.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredChunks.map((chunk) => {
                const isExpanded = expandedChunks.has(chunk.chunkIndex);
                const preview = chunk.content.slice(0, 200);
                const hasMore = chunk.content.length > 200;

                return (
                  <div
                    key={chunk.id}
                    className="border border-border-default rounded-lg bg-surface-0 overflow-hidden"
                  >
                    {/* Chunk header */}
                    <button
                      onClick={() => toggleChunk(chunk.chunkIndex)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left cursor-pointer hover:bg-surface-1/50 transition-colors"
                    >
                      <span className="text-[10px] font-mono text-text-tertiary bg-surface-1 border border-border-default rounded px-1.5 py-0.5 shrink-0">
                        #{chunk.chunkIndex + 1}
                      </span>
                      {chunk.pageNumber != null && (
                        <span className="text-[10px] font-mono text-text-tertiary shrink-0">
                          p.{chunk.pageNumber}
                        </span>
                      )}
                      {chunk.sectionTitle && (
                        <span className="text-[11px] text-text-secondary truncate font-medium">
                          {chunk.sectionTitle}
                        </span>
                      )}
                      <span className="flex-1" />
                      <span className="text-[10px] font-mono text-text-tertiary shrink-0">
                        {chunk.tokenCount} tok
                      </span>
                    </button>

                    {/* Chunk content */}
                    <div className="px-4 pb-3">
                      {chunk.contextPrefix && (
                        <div className="text-[11px] text-accent/70 italic mb-1.5 border-l-2 border-accent/20 pl-2">
                          {chunk.contextPrefix}
                        </div>
                      )}
                      <div className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
                        {isExpanded ? chunk.content : preview}
                        {hasMore && !isExpanded && (
                          <span className="text-text-tertiary">...</span>
                        )}
                      </div>
                      {hasMore && (
                        <button
                          onClick={() => toggleChunk(chunk.chunkIndex)}
                          className="text-[10px] text-accent hover:underline cursor-pointer mt-1"
                        >
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
            <div className="flex items-center justify-center py-12 text-text-tertiary">
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : rawText === '' ? (
            <div className="text-center py-12 text-text-tertiary text-sm">
              No extracted text available for this document.
            </div>
          ) : rawText !== null ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] text-text-tertiary font-mono">
                  {rawText.length.toLocaleString()} characters
                </span>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-text-secondary hover:text-text-primary border border-border-default hover:border-border-focus rounded-lg transition-colors cursor-pointer"
                >
                  <Download size={11} /> Download as .txt
                </button>
              </div>
              <div className="border border-border-default rounded-lg bg-surface-0 p-5 max-h-[70vh] overflow-y-auto">
                <div className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap">
                  {rawText}
                </div>
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

// ── KB Detail (main content) ──

function KBDetail({ kb, onRefresh, initialDocId }: { kb: KnowledgeBase; onRefresh: () => void; initialDocId?: string | null }) {
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<KBDocument | null>(null);

  const loadDocs = useCallback(async () => {
    try {
      const docs = await api.listKBDocuments(kb.id);
      setDocuments(docs);
    } catch {
      toast.error('Failed to load documents');
    }
    setLoading(false);
  }, [kb.id]);

  useEffect(() => {
    loadDocs().then(() => {
      // handled below after documents state updates
    });
  }, [loadDocs]);

  // Auto-open document from URL param
  useEffect(() => {
    if (initialDocId && documents.length > 0 && !viewingDoc) {
      const doc = documents.find((d) => d.id === initialDocId);
      if (doc && doc.status === 'ready') setViewingDoc(doc);
    }
  }, [initialDocId, documents]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for processing documents
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
    } catch (e) {
      toast.error((e as Error).message || 'Upload failed');
    }
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
    } catch {
      toast.error('Failed to delete');
    }
  };

  // Reset viewingDoc when KB changes
  useEffect(() => { setViewingDoc(null); }, [kb.id]);

  if (viewingDoc) {
    return <DocumentViewer doc={viewingDoc} kbId={kb.id} onBack={() => setViewingDoc(null)} />;
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 w-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">{kb.name}</h2>
          {kb.description && <p className="text-sm text-text-tertiary mt-1">{kb.description}</p>}
          <div className="flex items-center gap-3 mt-2 text-[11px] text-text-tertiary font-mono">
            <span>{kb.documentCount} documents</span>
            <span>{kb.chunkCount} chunks</span>
            <span>{kb.embeddingModel}</span>
          </div>
        </div>
        <button
          onClick={handleDeleteKB}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-error/70 hover:text-error border border-error/20 hover:border-error/40 rounded-lg transition-colors cursor-pointer"
        >
          <Trash2 size={11} /> Delete
        </button>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors mb-6 max-w-xl ${
          dragOver ? 'border-accent bg-accent/5' : 'border-border-default hover:border-border-focus'
        }`}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-text-secondary">
            <Loader2 size={16} className="animate-spin" /> Uploading and processing...
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Upload size={22} className="text-text-tertiary shrink-0" />
            <div className="text-left">
              <p className="text-sm text-text-secondary">
                Drag & drop files or{' '}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-accent hover:underline cursor-pointer"
                >
                  browse
                </button>
              </p>
              <p className="text-[11px] text-text-tertiary mt-0.5">
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

      {/* Document list */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-text-tertiary">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12 text-text-tertiary text-sm">
          No documents yet. Upload files to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-2">
          {documents.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} kbId={kb.id} onDelete={() => { loadDocs(); onRefresh(); }} onView={() => setViewingDoc(doc)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Create form (main content) ──

function CreateKBForm({
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <div className="w-full max-w-md">
        <h2 className="text-lg font-semibold text-text-primary mb-1">New Knowledge Base</h2>
        <p className="text-xs text-text-tertiary mb-6">
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
          className="w-full bg-surface-1 border border-border-default rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40 mb-4"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={onSubmit}
            disabled={!value.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-accent text-surface-0 rounded-lg hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-40"
          >
            <Plus size={13} /> Create
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs text-text-tertiary hover:text-text-secondary cursor-pointer"
          >
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
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <BookOpen size={48} className="text-text-tertiary opacity-30 mb-4" />
      <h3 className="text-sm font-medium text-text-secondary mb-1">Select a knowledge base</h3>
      <p className="text-xs text-text-tertiary mb-4 max-w-xs">
        Choose a knowledge base from the sidebar, or create a new one to start uploading documents for RAG-powered conversations.
      </p>
      <button
        onClick={onCreate}
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-accent text-surface-0 rounded-lg hover:bg-accent/90 transition-colors cursor-pointer"
      >
        <Plus size={13} /> New Knowledge Base
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
      // If selected KB was deleted, deselect it
      if (selectedKB && !kbs.find((kb) => kb.id === selectedKB.id)) {
        setSelectedKB(null);
      }
    } catch {
      toast.error('Failed to load knowledge bases');
    }
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
        // Auto-select KB from URL params (e.g. ?kb=xxx&doc=yyy)
        try { setSelectedKB(await api.getKnowledgeBase(kbId)); } catch {}
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select the first KB once loaded (if nothing selected and not from URL)
  useEffect(() => {
    if (!selectedKB && !creating && knowledgeBases.length > 0) {
      setSelectedKB(knowledgeBases[0]);
    }
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
    } catch {
      toast.error('Failed to create knowledge base');
    }
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
        <CreateKBForm
          value={newName}
          onChange={setNewName}
          onSubmit={handleCreate}
          onCancel={() => { setCreating(false); setNewName(''); }}
        />
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
