'use client';

import { Search, X, Plus, CheckSquare, Download, Trash2 } from 'lucide-react';

interface SidebarActionsProps {
  search: string;
  onSearchChange: (value: string) => void;
  bulkMode: boolean;
  onToggleBulkMode: () => void;
  onNewConversation: () => void;
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onBulkExport: () => void;
  onBulkDelete: () => void;
  conversationCount: number;
}

export default function SidebarActions({
  search,
  onSearchChange,
  bulkMode,
  onToggleBulkMode,
  onNewConversation,
  selectedCount,
  totalCount,
  onSelectAll,
  onBulkExport,
  onBulkDelete,
  conversationCount,
}: SidebarActionsProps) {
  const allSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2.5">
        <div className="flex-1 flex items-center gap-2 px-2.5 py-2 bg-surface-1 border border-border-default rounded-lg">
          <Search size={13} className="text-text-tertiary shrink-0" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary outline-none"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              className="text-text-tertiary hover:text-text-secondary cursor-pointer shrink-0"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <button
          onClick={onToggleBulkMode}
          title={bulkMode ? 'Exit select mode' : 'Select multiple'}
          className={`w-8 h-8 flex items-center justify-center border rounded-lg cursor-pointer transition-colors shrink-0 ${
            bulkMode
              ? 'bg-accent/10 border-accent/30 text-accent'
              : 'bg-surface-1 border-border-default text-text-tertiary hover:text-text-secondary hover:border-border-focus'
          }`}
        >
          <CheckSquare size={13} />
        </button>
        <button
          data-tour="new-chat"
          onClick={onNewConversation}
          title="New conversation (Cmd+N)"
          className="w-8 h-8 flex items-center justify-center bg-surface-1 border border-border-default rounded-lg text-text-tertiary hover:text-accent hover:border-accent/30 cursor-pointer transition-colors shrink-0"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Bulk action bar — compact single line */}
      {bulkMode && (
        <div className="flex items-center gap-3 px-3 pb-2 animate-fade-in-up" style={{ animationDuration: '0.1s' }}>
          <span className="text-[10px] text-text-tertiary font-mono shrink-0">
            {selectedCount > 0 ? `${selectedCount} / ${totalCount}` : `0 / ${totalCount}`}
          </span>
          <div className="flex items-center gap-2 text-[10px] text-text-tertiary">
            <button
              onClick={onSelectAll}
              className="hover:text-text-secondary cursor-pointer transition-colors"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
            {selectedCount > 0 && (
              <>
                <span>·</span>
                <button
                  onClick={onBulkExport}
                  className="flex items-center gap-1 hover:text-text-secondary cursor-pointer transition-colors"
                >
                  <Download size={10} /> Export
                </button>
                <span>·</span>
                <button
                  onClick={onBulkDelete}
                  className="flex items-center gap-1 hover:text-error cursor-pointer transition-colors"
                >
                  <Trash2 size={10} /> Delete
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Search result count */}
      {search.trim() && (
        <div className="px-3 pb-1 text-[10px] font-mono text-text-tertiary">
          {conversationCount === 0
            ? 'No conversations found'
            : `${conversationCount} result${conversationCount !== 1 ? 's' : ''}`}
        </div>
      )}
    </>
  );
}
