'use client';

import type { Conversation } from '@/lib/types';
import ConversationItem from './conversation-item';

interface ConversationGroup {
  label: string;
  items: Conversation[];
}

interface ConversationListProps {
  groups: ConversationGroup[];
  conversations: Conversation[];
  search: string;
  activeConversationId: string | null;
  deletingIds: Set<string>;
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

export default function ConversationList({
  groups,
  conversations,
  search,
  activeConversationId,
  deletingIds,
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
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <div className="p-6 text-center text-text-tertiary text-xs">
          {search.trim() ? 'No conversations found' : 'No conversations'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 pb-4">
      {groups.filter((g) => g.items.length > 0).map((group) => (
        <div key={group.label} className="mb-1">
          <div className={`px-2 py-1.5 text-[10px] uppercase tracking-[0.1em] font-medium ${
            group.label === 'Pinned' ? 'text-accent/70' : 'text-text-tertiary'
          }`}>
            {group.label === 'Pinned' && (
              <>
                {/* Pin icon handled inline for consistency */}
                <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline mr-1 -mt-0.5"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
              </>
            )}
            {group.label}
          </div>
          {group.items.map((conv) => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              isActive={conv.id === activeConversationId}
              isDeleting={deletingIds.has(conv.id)}
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
      ))}
    </div>
  );
}
