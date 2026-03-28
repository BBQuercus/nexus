import { useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import { MODELS } from '@/lib/types';

export function useKeyboardShortcuts() {
  const t = useTranslations('sidebar');
  const tc = useTranslations('common');
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey;
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    if (meta && e.shiftKey && e.key === 'f') {
      e.preventDefault();
      useStore.getState().setSearchPanelOpen(!useStore.getState().searchPanelOpen);
      return;
    }
    if (meta && e.shiftKey && e.key === '.') {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('nexus:toggle-focus-mode'));
      return;
    }
    if (meta && e.key === 'k') {
      e.preventDefault();
      useStore.getState().setCommandPaletteOpen(!useStore.getState().commandPaletteOpen);
      return;
    }
    if (e.key === 'Escape') {
      if (useStore.getState().searchPanelOpen) {
        useStore.getState().setSearchPanelOpen(false);
        return;
      }
      if (useStore.getState().commandPaletteOpen) {
        useStore.getState().setCommandPaletteOpen(false);
      } else if (useStore.getState().sidebarOpen && !useStore.getState().commandPaletteOpen) {
        // On mobile/tablet, Escape closes sidebar overlay
        const w = window.innerWidth;
        if (w < 1024) useStore.getState().setSidebarOpen(false);
        else if (isInput) (target as HTMLElement).blur();
      } else if (isInput) {
        (target as HTMLElement).blur();
      }
      return;
    }
    if (meta && e.key === 'b' && !e.shiftKey) {
      e.preventDefault();
      useStore.getState().setSidebarOpen(!useStore.getState().sidebarOpen);
      return;
    }
    if (meta && e.key === 'n') {
      e.preventDefault();
      (async () => {
        try {
          const conv = await api.createConversation({
            model: useStore.getState().activeModel,
          });
          useStore.getState().setActiveConversationId(conv.id);
          useStore.getState().setMessages([]);
          const result = await api.listConversations();
          useStore.getState().setConversations(result.conversations);
        } catch (err) {
          console.error('Failed to create conversation:', err);
        }
      })();
      return;
    }
    if (meta && e.key === 'p' && e.shiftKey) {
      e.preventDefault();
      useStore.getState().setCommandPaletteOpen(!useStore.getState().commandPaletteOpen);
      return;
    }
    if (meta && e.key === 'j') {
      e.preventDefault();
      const textarea = document.querySelector('textarea');
      if (textarea) { textarea.focus(); textarea.select(); }
      return;
    }
    if (meta && e.key === 'Backspace' && e.shiftKey) {
      e.preventDefault();
      const convId = useStore.getState().activeConversationId;
      if (!convId) return;
      (async () => {
        const confirmed = await useStore.getState().showConfirm({
          title: t('deleteConfirmTitle', { count: 1 }),
          message: t('deleteConfirmMessage'),
          confirmLabel: tc('delete'),
          variant: 'danger',
        });
        if (!confirmed) return;
        try {
          await api.deleteConversation(convId);
          useStore.getState().setActiveConversationId(null);
          useStore.getState().setMessages([]);
          const result = await api.listConversations();
          useStore.getState().setConversations(result.conversations);
        } catch (err) {
          console.error('Failed to delete:', err);
        }
      })();
      return;
    }
    if (e.ctrlKey && !e.metaKey && e.key >= '1' && e.key <= '9' && !e.shiftKey) {
      const idx = parseInt(e.key) - 1;
      if (idx < MODELS.length) {
        e.preventDefault();
        useStore.getState().setActiveModel(MODELS[idx].id);
        return;
      }
    }
    if (e.key === '?' && !isInput && !useStore.getState().commandPaletteOpen) {
      e.preventDefault();
      useStore.getState().setShortcutsOpen(!useStore.getState().shortcutsOpen);
      return;
    }
    if (e.key === '/' && !isInput && !useStore.getState().commandPaletteOpen) {
      e.preventDefault();
      const textarea = document.querySelector('textarea');
      textarea?.focus();
      return;
    }
  }, [t, tc]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);
}
