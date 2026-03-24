'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Memory } from '@/lib/types';
import { listMemories, createMemory, updateMemory, deleteMemory } from '@/lib/api';
import { Brain, Plus, Trash2, Check, X, Pencil, Filter, Globe, FolderOpen, MessageSquare } from 'lucide-react';

const SCOPE_ICONS: Record<string, typeof Globe> = {
  global: Globe,
  project: FolderOpen,
  conversation: MessageSquare,
};

const CATEGORY_COLORS: Record<string, string> = {
  preference: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  fact: 'bg-green-500/15 text-green-400 border-green-500/20',
  decision: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  instruction: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
};

function CategoryBadge({ category }: { category: string }) {
  const color = CATEGORY_COLORS[category] || 'bg-surface-2 text-text-secondary border-border-default';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${color}`}>
      {category}
    </span>
  );
}

function MemoryCard({
  memory,
  onUpdate,
  onDelete,
}: {
  memory: Memory;
  onUpdate: (id: string, params: Partial<Memory>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(memory.content);
  const [confirming, setConfirming] = useState(false);

  const ScopeIcon = SCOPE_ICONS[memory.scope] || Globe;

  const handleSave = () => {
    if (editContent.trim() && editContent.trim() !== memory.content) {
      onUpdate(memory.id, { content: editContent.trim() });
    }
    setEditing(false);
  };

  const handleDelete = () => {
    if (confirming) {
      onDelete(memory.id);
      setConfirming(false);
    } else {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
    }
  };

  const createdDate = new Date(memory.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="group bg-surface-1 border border-border-default rounded-lg p-3 hover:border-border-hover transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 bg-surface-0 border border-border-default rounded px-2 py-1 text-sm text-text-primary resize-none focus:outline-none focus:border-accent"
                rows={2}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
                  if (e.key === 'Escape') setEditing(false);
                }}
              />
              <button onClick={handleSave} className="p-1 text-accent hover:bg-accent/10 rounded cursor-pointer">
                <Check size={14} />
              </button>
              <button onClick={() => setEditing(false)} className="p-1 text-text-tertiary hover:bg-surface-2 rounded cursor-pointer">
                <X size={14} />
              </button>
            </div>
          ) : (
            <p className="text-sm text-text-primary leading-relaxed">{memory.content}</p>
          )}
        </div>

        {!editing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={() => { setEditContent(memory.content); setEditing(true); }} className="p-1 text-text-tertiary hover:text-text-primary hover:bg-surface-2 rounded cursor-pointer" title="Edit">
              <Pencil size={12} />
            </button>
            <button onClick={handleDelete} className={`p-1 rounded cursor-pointer ${confirming ? 'text-error bg-error/10' : 'text-text-tertiary hover:text-error hover:bg-error/10'}`} title={confirming ? 'Click again to confirm' : 'Delete'}>
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2">
        <CategoryBadge category={memory.category} />
        <div className="flex items-center gap-1 text-[10px] text-text-tertiary">
          <ScopeIcon size={10} />
          <span>{memory.scope}</span>
        </div>
        <span className="text-[10px] text-text-tertiary">{createdDate}</span>
        {memory.relevance_count > 0 && (
          <span className="text-[10px] text-text-tertiary" title="Times retrieved">
            Used {memory.relevance_count}x
          </span>
        )}
      </div>
    </div>
  );
}

function AddMemoryForm({ onAdd, onCancel }: { onAdd: (data: { content: string; scope: string; category: string }) => void; onCancel: () => void }) {
  const [content, setContent] = useState('');
  const [scope, setScope] = useState('global');
  const [category, setCategory] = useState('preference');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim()) {
      onAdd({ content: content.trim(), scope, category });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-surface-1 border border-accent/30 rounded-lg p-3 space-y-3">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What should the AI remember?"
        className="w-full bg-surface-0 border border-border-default rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary resize-none focus:outline-none focus:border-accent"
        rows={3}
        autoFocus
      />
      <div className="flex items-center gap-3">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="bg-surface-0 border border-border-default rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent cursor-pointer"
        >
          <option value="global">Global</option>
          <option value="project">Project</option>
          <option value="conversation">Conversation</option>
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-surface-0 border border-border-default rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent cursor-pointer"
        >
          <option value="preference">Preference</option>
          <option value="fact">Fact</option>
          <option value="decision">Decision</option>
          <option value="instruction">Instruction</option>
        </select>
        <div className="flex-1" />
        <button type="button" onClick={onCancel} className="px-3 py-1 text-xs text-text-tertiary hover:text-text-primary cursor-pointer">
          Cancel
        </button>
        <button type="submit" disabled={!content.trim()} className="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
          Save
        </button>
      </div>
    </form>
  );
}

export function MemoryPanel({ projectId }: { projectId?: string }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filterScope, setFilterScope] = useState<string | undefined>();
  const [filterCategory, setFilterCategory] = useState<string | undefined>();
  const [showFilters, setShowFilters] = useState(false);

  const fetchMemories = useCallback(async () => {
    try {
      setLoading(true);
      const result = await listMemories({
        scope: filterScope,
        category: filterCategory,
        project_id: projectId,
      });
      setMemories(result);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [filterScope, filterCategory, projectId]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const handleAdd = async (data: { content: string; scope: string; category: string }) => {
    try {
      const mem = await createMemory({
        content: data.content,
        scope: data.scope,
        category: data.category,
        project_id: projectId,
      });
      setMemories((prev) => [mem, ...prev]);
      setShowAdd(false);
    } catch {
      // error toast handled by apiFetch
    }
  };

  const handleUpdate = async (id: string, params: Partial<Memory>) => {
    try {
      const updated = await updateMemory(id, params);
      setMemories((prev) => prev.map((m) => (m.id === id ? updated : m)));
    } catch {
      // error toast handled by apiFetch
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // error toast handled by apiFetch
    }
  };

  // Group memories by scope
  const grouped = memories.reduce<Record<string, Memory[]>>((acc, m) => {
    if (!acc[m.scope]) acc[m.scope] = [];
    acc[m.scope].push(m);
    return acc;
  }, {});

  const scopeOrder = ['global', 'project', 'conversation'];
  const sortedScopes = Object.keys(grouped).sort(
    (a, b) => scopeOrder.indexOf(a) - scopeOrder.indexOf(b),
  );

  const hasFilters = filterScope || filterCategory;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-accent" />
          <h3 className="text-sm font-medium text-text-primary">AI Memory</h3>
          <span className="text-[10px] text-text-tertiary bg-surface-2 px-1.5 py-0.5 rounded">
            {memories.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              hasFilters || showFilters
                ? 'text-accent bg-accent/10'
                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-2'
            }`}
            title="Filter"
          >
            <Filter size={14} />
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="p-1.5 text-text-tertiary hover:text-accent hover:bg-accent/10 rounded transition-colors cursor-pointer"
            title="Add memory"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border-default bg-surface-1/50">
          <select
            value={filterScope || ''}
            onChange={(e) => setFilterScope(e.target.value || undefined)}
            className="bg-surface-0 border border-border-default rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="">All scopes</option>
            <option value="global">Global</option>
            <option value="project">Project</option>
            <option value="conversation">Conversation</option>
          </select>
          <select
            value={filterCategory || ''}
            onChange={(e) => setFilterCategory(e.target.value || undefined)}
            className="bg-surface-0 border border-border-default rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="">All categories</option>
            <option value="preference">Preference</option>
            <option value="fact">Fact</option>
            <option value="decision">Decision</option>
            <option value="instruction">Instruction</option>
          </select>
          {hasFilters && (
            <button
              onClick={() => { setFilterScope(undefined); setFilterCategory(undefined); }}
              className="text-[10px] text-text-tertiary hover:text-text-primary cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {showAdd && (
          <AddMemoryForm onAdd={handleAdd} onCancel={() => setShowAdd(false)} />
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full" />
          </div>
        ) : memories.length === 0 ? (
          <div className="text-center py-8">
            <Brain size={24} className="mx-auto text-text-tertiary mb-2" />
            <p className="text-sm text-text-tertiary">No memories yet</p>
            <p className="text-xs text-text-tertiary mt-1">
              Add things you want the AI to remember across conversations.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-3 text-xs text-accent hover:underline cursor-pointer"
            >
              Add your first memory
            </button>
          </div>
        ) : (
          sortedScopes.map((scope) => {
            const ScopeIcon = SCOPE_ICONS[scope] || Globe;
            return (
              <div key={scope}>
                <div className="flex items-center gap-1.5 mb-2">
                  <ScopeIcon size={12} className="text-text-tertiary" />
                  <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                    {scope}
                  </h4>
                  <span className="text-[10px] text-text-tertiary">({grouped[scope].length})</span>
                </div>
                <div className="space-y-2">
                  {grouped[scope].map((mem) => (
                    <MemoryCard
                      key={mem.id}
                      memory={mem}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
