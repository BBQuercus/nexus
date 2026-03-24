'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import * as api from '@/lib/api';
import type { KnowledgeBase, KBDocument } from '@/lib/types';
import {
  BookOpen, Plus, Trash2, Upload, X, FileText, Check,
  AlertCircle, Loader2, ArrowLeft, Search, ChevronRight,
} from 'lucide-react';
import { toast } from './toast';

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

function KBCard({ kb, onClick }: { kb: KnowledgeBase; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 bg-surface-1 border border-border-default rounded-lg hover:border-accent/30 transition-colors cursor-pointer group"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <BookOpen size={14} className="text-accent shrink-0" />
        <span className="text-sm font-medium text-text-primary truncate">{kb.name}</span>
        <ChevronRight size={14} className="text-text-tertiary ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      {kb.description && (
        <p className="text-xs text-text-tertiary mb-2 line-clamp-2">{kb.description}</p>
      )}
      <div className="flex items-center gap-3 text-[10px] text-text-tertiary font-mono">
        <span>{kb.documentCount} doc{kb.documentCount !== 1 ? 's' : ''}</span>
        <span>{kb.chunkCount} chunks</span>
        <StatusBadge status={kb.status} />
      </div>
    </button>
  );
}

function DocumentRow({ doc, kbId, onDelete }: { doc: KBDocument; kbId: string; onDelete: () => void }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
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
    <div className="flex items-center gap-3 px-3 py-2.5 border border-border-default rounded-lg">
      <FileText size={14} className="text-text-tertiary shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-text-primary truncate">{doc.filename}</div>
        <div className="text-[10px] text-text-tertiary font-mono">
          {formatBytes(doc.fileSizeBytes)}
          {doc.pageCount && <span> / {doc.pageCount} pages</span>}
        </div>
      </div>
      <StatusBadge status={doc.status} />
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="text-text-tertiary hover:text-error cursor-pointer transition-colors disabled:opacity-50"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function KBDetail({ kb, onBack }: { kb: KnowledgeBase; onBack: () => void }) {
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const loadDocs = useCallback(async () => {
    try {
      const docs = await api.listKBDocuments(kb.id);
      setDocuments(docs);
    } catch {
      toast.error('Failed to load documents');
    }
    setLoading(false);
  }, [kb.id]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  // Poll for processing documents
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === 'processing');
    if (!hasProcessing) return;
    const interval = setInterval(loadDocs, 3000);
    return () => clearInterval(interval);
  }, [documents, loadDocs]);

  const handleUpload = async (files: FileList | File[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      await api.uploadKBDocuments(kb.id, Array.from(files));
      toast.success(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`);
      await loadDocs();
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-4 border-b border-border-default">
        <button onClick={onBack} className="text-text-tertiary hover:text-text-secondary cursor-pointer">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-medium text-text-primary truncate">{kb.name}</h2>
          {kb.description && <p className="text-[10px] text-text-tertiary truncate">{kb.description}</p>}
        </div>
        <div className="text-[10px] text-text-tertiary font-mono">
          {kb.documentCount} docs / {kb.chunkCount} chunks
        </div>
      </div>

      {/* Upload zone */}
      <div
        ref={dropRef}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`mx-4 mt-4 border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
          dragOver ? 'border-accent bg-accent/5' : 'border-border-default'
        }`}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-text-secondary">
            <Loader2 size={14} className="animate-spin" /> Uploading...
          </div>
        ) : (
          <>
            <Upload size={20} className="mx-auto mb-2 text-text-tertiary" />
            <p className="text-xs text-text-tertiary">
              Drag & drop files here or{' '}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-accent hover:underline cursor-pointer"
              >
                browse
              </button>
            </p>
            <p className="text-[10px] text-text-tertiary mt-1">
              PDF, DOCX, Excel, CSV, TXT, JSON, Markdown
            </p>
          </>
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
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-text-tertiary">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-8 text-text-tertiary text-xs">
            No documents yet. Upload files to get started.
          </div>
        ) : (
          documents.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} kbId={kb.id} onDelete={loadDocs} />
          ))
        )}
      </div>
    </div>
  );
}

export default function KnowledgeBasePanel({ onClose }: { onClose: () => void }) {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKB, setSelectedKB] = useState<KnowledgeBase | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const loadKBs = useCallback(async () => {
    try {
      const kbs = await api.listKnowledgeBases();
      setKnowledgeBases(kbs);
    } catch {
      toast.error('Failed to load knowledge bases');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadKBs(); }, [loadKBs]);

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

  const handleDelete = async (kbId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteKnowledgeBase(kbId);
      setKnowledgeBases((prev) => prev.filter((kb) => kb.id !== kbId));
      if (selectedKB?.id === kbId) setSelectedKB(null);
      toast.success('Knowledge base deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  if (selectedKB) {
    return (
      <div className="fixed inset-0 z-50 bg-surface-0/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-2xl h-[80vh] bg-surface-0 border border-border-default rounded-xl shadow-2xl flex flex-col overflow-hidden">
          <KBDetail kb={selectedKB} onBack={() => { setSelectedKB(null); loadKBs(); }} />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-surface-0/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-surface-0 border border-border-default rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-default">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-accent" />
            <h2 className="text-sm font-medium text-text-primary">Knowledge Bases</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] bg-accent text-surface-0 rounded-lg hover:bg-accent/90 transition-colors cursor-pointer"
            >
              <Plus size={12} /> New
            </button>
            <button onClick={onClose} className="text-text-tertiary hover:text-text-secondary cursor-pointer">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Create form */}
        {creating && (
          <div className="flex items-center gap-2 p-4 border-b border-border-default bg-surface-1/50">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
              placeholder="Knowledge base name..."
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="text-accent hover:text-accent/80 cursor-pointer disabled:opacity-50"
            >
              <Check size={16} />
            </button>
            <button onClick={() => setCreating(false)} className="text-text-tertiary hover:text-text-secondary cursor-pointer">
              <X size={14} />
            </button>
          </div>
        )}

        {/* KB List */}
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-text-tertiary">
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : knowledgeBases.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen size={32} className="mx-auto mb-3 text-text-tertiary opacity-50" />
              <p className="text-sm text-text-tertiary">No knowledge bases yet</p>
              <p className="text-xs text-text-tertiary mt-1">Create one to upload documents for RAG-powered conversations</p>
            </div>
          ) : (
            knowledgeBases.map((kb) => (
              <div key={kb.id} className="relative group">
                <KBCard kb={kb} onClick={() => setSelectedKB(kb)} />
                <button
                  onClick={(e) => handleDelete(kb.id, e)}
                  className="absolute top-3 right-3 text-text-tertiary hover:text-error opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
