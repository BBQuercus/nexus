'use client';

import { useRef } from 'react';
import type { Conversation } from '@/lib/types';
import { Pin, PinOff, Download, X, CheckSquare, Square, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ConversationItemProps {
  conv: Conversation;
  isActive: boolean;
  isDeleting: boolean;
  bulkMode: boolean;
  isSelected: boolean;
  isRenaming: boolean;
  renameValue: string;
  onSelect: (id: string) => void;
  onDoubleClick: (conv: Conversation, e: React.MouseEvent) => void;
  onHoverStart: (conv: Conversation, e: React.MouseEvent) => void;
  onHoverEnd: () => void;
  onPin: (id: string, e: React.MouseEvent) => void;
  onExport: (conv: Conversation, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRenameStart: (conv: Conversation, e: React.MouseEvent) => void;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
}

export default function ConversationItem({
  conv,
  isActive,
  isDeleting,
  bulkMode,
  isSelected,
  isRenaming,
  renameValue,
  onSelect,
  onDoubleClick,
  onHoverStart,
  onHoverEnd,
  onPin,
  onExport,
  onDelete,
  onRenameStart,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  renameInputRef,
}: ConversationItemProps) {
  const t = useTranslations('sidebar');

  return (
    <div
      onClick={() => onSelect(conv.id)}
      onDoubleClick={(e) => { if (!bulkMode) onDoubleClick(conv, e); }}
      onMouseEnter={(e) => onHoverStart(conv, e)}
      onMouseLeave={onHoverEnd}
      className={`group flex items-center gap-2 px-2.5 py-2.5 cursor-pointer text-xs rounded-lg transition-colors mb-0.5 ${
        bulkMode && isSelected
          ? 'bg-accent/8 text-text-primary border-l-2 border-accent'
          : isActive
            ? 'bg-accent/8 text-text-primary border-l-2 border-accent ml-0'
            : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary border-l-2 border-transparent'
      }`}
    >
      {bulkMode && (
        <span className="shrink-0 text-text-tertiary">
          {isSelected ? <CheckSquare size={13} className="text-accent" /> : <Square size={13} />}
        </span>
      )}
      {isRenaming ? (
        <input
          ref={renameInputRef}
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onRenameSubmit(); }
            if (e.key === 'Escape') { e.preventDefault(); onRenameCancel(); }
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-surface-1 border border-accent/30 rounded px-1.5 py-0.5 text-xs text-text-primary outline-none min-w-0"
          autoFocus
        />
      ) : (
        <span className="flex-1 truncate leading-snug">
          {conv.title || <span className="text-text-tertiary italic">{t('untitled')}</span>}
        </span>
      )}
      {!bulkMode && !isRenaming && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
          <button
            onClick={(e) => onRenameStart(conv, e)}
            title={t('renameTooltip')}
            className="text-text-tertiary hover:text-accent shrink-0 cursor-pointer p-0.5 rounded hover:bg-surface-2 transition-all"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={(e) => onPin(conv.id, e)}
            title={conv.pinned ? t('unpinTooltip') : t('pinTooltip')}
            className={`cursor-pointer p-0.5 rounded hover:bg-surface-2 transition-all ${
              conv.pinned ? 'text-accent' : 'text-text-tertiary hover:text-accent'
            }`}
          >
            {conv.pinned ? <PinOff size={11} /> : <Pin size={11} />}
          </button>
          <button
            onClick={(e) => onExport(conv, e)}
            title={t('exportTooltip')}
            className="text-text-tertiary hover:text-accent shrink-0 cursor-pointer p-0.5 rounded hover:bg-surface-2 transition-all"
          >
            <Download size={11} />
          </button>
          <button
            onClick={(e) => onDelete(conv.id, e)}
            title={t('deleteTooltip')}
            disabled={isDeleting}
            className="text-text-tertiary hover:text-error shrink-0 cursor-pointer p-0.5 rounded hover:bg-surface-2 transition-all disabled:opacity-40 disabled:cursor-default"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
