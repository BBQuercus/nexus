'use client';

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import { mapRawMessages } from '@/lib/useStreaming';
import type { Message } from './types';

export function SiblingNav({ message }: { message: Message }) {
  const tree = useStore((s) => s.conversationTree);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const setMessages = useStore((s) => s.setMessages);
  const setActiveLeafId = useStore((s) => s.setActiveLeafId);
  const setConversationTree = useStore((s) => s.setConversationTree);

  const siblings = useMemo(() => {
    if (!tree) return [];
    return tree.nodes.filter((n) => n.parentId === message.parentId).sort((a, b) => a.branchIndex - b.branchIndex);
  }, [tree, message.parentId]);

  if (siblings.length <= 1) return null;

  const currentIndex = siblings.findIndex((s) => s.id === message.id);
  if (currentIndex === -1) return null;

  const switchToSibling = async (siblingId: string) => {
    if (!activeConversationId || !tree) return;
    let leafId = siblingId;
    const childMap = new Map<string, typeof tree.nodes>();
    for (const n of tree.nodes) {
      if (n.parentId) {
        const existing = childMap.get(n.parentId) || [];
        existing.push(n);
        childMap.set(n.parentId, existing);
      }
    }
    let children = childMap.get(leafId);
    while (children && children.length > 0) {
      children.sort((a, b) => a.branchIndex - b.branchIndex);
      leafId = children[0].id;
      children = childMap.get(leafId);
    }
    try {
      const result = await api.switchBranch(activeConversationId, leafId);
      setMessages(mapRawMessages(result.messages || [], activeConversationId));
      setActiveLeafId(result.active_leaf_id);
      const newTree = await api.getConversationTree(activeConversationId);
      setConversationTree(newTree);
    } catch (e) {
      console.error('Failed to switch branch:', e);
    }
  };

  return (
    <div className="flex items-center gap-1 text-[10px] text-text-tertiary font-mono">
      <button
        onClick={() => currentIndex > 0 && switchToSibling(siblings[currentIndex - 1].id)}
        disabled={currentIndex === 0}
        className="hover:text-text-secondary cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronLeft size={10} />
      </button>
      <span>{currentIndex + 1}/{siblings.length}</span>
      <button
        onClick={() => currentIndex < siblings.length - 1 && switchToSibling(siblings[currentIndex + 1].id)}
        disabled={currentIndex === siblings.length - 1}
        className="hover:text-text-secondary cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight size={10} />
      </button>
    </div>
  );
}
