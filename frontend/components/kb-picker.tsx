'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import type { KnowledgeBase } from '@/lib/types';
import { BookOpen, Check, ChevronDown } from 'lucide-react';

export default function KBPicker() {
  const t = useTranslations('kbPicker');
  const activeIds = useStore((s) => s.activeKnowledgeBaseIds);
  const toggleKB = useStore((s) => s.toggleKnowledgeBase);
  const setActiveIds = useStore((s) => s.setActiveKnowledgeBaseIds);
  const [open, setOpen] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Load KBs on first open
  useEffect(() => {
    if (open && !loaded) {
      api.listKnowledgeBases().then((kbs) => {
        setKnowledgeBases(kbs.filter((kb) => kb.status === 'ready' || kb.documentCount > 0));
        setLoaded(true);
      }).catch(() => setLoaded(true));
    }
  }, [open, loaded]);

  const selectedKBs = knowledgeBases.filter((kb) => activeIds.includes(kb.id));

  const label = activeIds.length === 0
    ? t('ragLabel')
    : activeIds.length === 1 && selectedKBs.length === 1
      ? selectedKBs[0].name
      : t('kbCount', { count: activeIds.length });

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-lg transition-all cursor-pointer glow-hover ${
          activeIds.length > 0
            ? 'text-accent bg-accent/8 border-accent/25 hover:border-accent/40'
            : 'text-text-tertiary hover:text-text-secondary bg-surface-1 border-border-default hover:border-border-focus'
        }`}
      >
        <BookOpen size={13} className={activeIds.length > 0 ? 'text-accent' : 'text-text-tertiary'} />
        <span className="max-w-[120px] truncate">{label}</span>
        <ChevronDown size={11} className="text-text-tertiary" />
      </button>

      {open && (
        <div
          className="absolute left-0 bottom-full mb-1.5 w-[min(256px,calc(100vw-24px))] bg-surface-0 border border-border-default rounded-lg shadow-2xl shadow-black/30 overflow-hidden z-50 animate-fade-in-up"
          style={{ animationDuration: '0.1s' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
            <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">{t('headerTitle')}</span>
            {activeIds.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setActiveIds([]); }}
                className="text-[10px] text-text-tertiary hover:text-text-secondary cursor-pointer"
              >
                {t('clearAll')}
              </button>
            )}
          </div>

          {/* KB list */}
          <div className="max-h-56 overflow-y-auto py-1">
            {knowledgeBases.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-text-tertiary">
                {t('noKBsYet')}{' '}
                <a href="/knowledge" className="text-accent hover:underline" onClick={() => setOpen(false)}>{t('createOne')}</a>
              </div>
            ) : (
              knowledgeBases.map((kb) => {
                const isActive = activeIds.includes(kb.id);
                return (
                  <button
                    key={kb.id}
                    onClick={() => toggleKB(kb.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-accent/8 text-text-primary'
                        : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      isActive
                        ? 'bg-accent border-accent'
                        : 'border-border-default'
                    }`}>
                      {isActive && <Check size={10} className="text-surface-0" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{kb.name}</div>
                      <div className="text-[10px] text-text-tertiary font-mono">
                        {kb.documentCount} doc{kb.documentCount !== 1 ? 's' : ''} {t('chunksSuffix', { count: kb.chunkCount })}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="px-3 py-1.5 border-t border-border-default text-[10px] text-text-tertiary">
            {t('footerHint')}
          </div>
        </div>
      )}
    </div>
  );
}
