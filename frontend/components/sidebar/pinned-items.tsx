'use client';

import type { Conversation } from '@/lib/types';
import { Pin } from 'lucide-react';
import ConversationItem from './conversation-item';

interface PinnedItemsProps {
  items: Conversation[];
  activeConversationId: string | null;
  bulkMode: boolean;
  selectedIds: Set<string>;
  renamingId: string | null;
  renameValue: string;
  onSelect: (id: string) => void;
  onDoubleClick: (conv: Conversation, e: React.MouseEvent) => void;
  onHoverStart: (conv: Conversation, e: React.MouseEvent) => void;
  onHoverEnd: () => void;
  onPin: (id: string, e: React.MouseEvent) => void;
  onExport: (conv: Conversation, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
}

export default function PinnedItems({
  items,
  activeConversationId,
  bulkMode,
  selectedIds,
  renamingId,
  renameValue,
  onSelect,
  onDoubleClick,
  onHoverStart,
  onHoverEnd,
  onPin,
  onExport,
  onDelete,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  renameInputRef,
}: PinnedItemsProps) {
  if (items.length === 0) return null;

  return (
    <div className="mb-1">
      <div className="px-2 py-1.5 text-[10px] uppercase tracking-[0.1em] font-medium text-accent/70">
        <Pin size={8} className="inline mr-1 -mt-0.5" />
        Pinned
      </div>
      {items.map((conv) => (
        <ConversationItem
          key={conv.id}
          conv={conv}
          isActive={conv.id === activeConversationId}
          bulkMode={bulkMode}
          isSelected={selectedIds.has(conv.id)}
          isRenaming={renamingId === conv.id}
          renameValue={renameValue}
          onSelect={onSelect}
          onDoubleClick={onDoubleClick}
          onHoverStart={onHoverStart}
          onHoverEnd={onHoverEnd}
          onPin={onPin}
          onExport={onExport}
          onDelete={onDelete}
          onRenameChange={onRenameChange}
          onRenameSubmit={onRenameSubmit}
          onRenameCancel={onRenameCancel}
          renameInputRef={renameInputRef}
        />
      ))}
    </div>
  );
}
