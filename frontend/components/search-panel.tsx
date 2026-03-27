'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import type { SearchResult, SearchHit } from '@/lib/types';
import { Search, X, MessageSquare, FileText, Layers, Loader2 } from 'lucide-react';

function HitIcon({ type }: { type: SearchHit['type'] }) {
  switch (type) {
    case 'conversation': return <MessageSquare size={12} className="text-text-tertiary shrink-0" />;
    case 'message': return <FileText size={12} className="text-text-tertiary shrink-0" />;
    case 'artifact': return <Layers size={12} className="text-text-tertiary shrink-0" />;
  }
}

export default function SearchPanel() {
  const t = useTranslations('searchPanel');
  const setSearchPanelOpen = useStore((s) => s.setSearchPanelOpen);
  const setActiveConversationId = useStore((s) => s.setActiveConversationId);

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'conversations' | 'messages' | 'artifacts'>('all');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const SCOPE_OPTIONS = [
    { value: 'all' as const, label: t('scopeAll') },
    { value: 'conversations' as const, label: t('scopeConversations') },
    { value: 'messages' as const, label: t('scopeMessages') },
    { value: 'artifacts' as const, label: t('scopeArtifacts') },
  ];

  // Focus on open
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Register global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchPanelOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setSearchPanelOpen]);

  const doSearch = useCallback(async (q: string, s: typeof scope) => {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const r = await api.searchAll(q, s);
      setResults(r);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value, scope), 300);
  };

  const handleScopeChange = (s: typeof scope) => {
    setScope(s);
    if (query.trim()) doSearch(query, s);
  };

  const handleHitClick = (hit: SearchHit) => {
    const convId = hit.type === 'conversation' ? hit.id : hit.conversation_id;
    if (convId) {
      setActiveConversationId(convId);
    }
    setSearchPanelOpen(false);
  };

  const close = () => setSearchPanelOpen(false);

  const allHits: { label: string; hits: SearchHit[] }[] = results
    ? [
        { label: t('scopeConversations'), hits: results.conversations },
        { label: t('scopeMessages'), hits: results.messages },
        { label: t('scopeArtifacts'), hits: results.artifacts },
      ].filter((g) => g.hits.length > 0)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] md:pt-[15vh] px-3 md:px-0">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-xl bg-surface-0 border border-border-default rounded-lg shadow-2xl overflow-hidden animate-fade-in-up" style={{ animationDuration: '0.15s' }}>
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-default">
          <Search size={14} className="text-text-tertiary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder={t('placeholder')}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
          />
          {loading && <Loader2 size={14} className="text-text-tertiary animate-spin shrink-0" />}
          <kbd className="text-[10px] text-text-tertiary bg-surface-1 border border-border-default rounded px-1.5 py-0.5 font-mono">{t('escHint')}</kbd>
        </div>

        {/* Scope tabs */}
        <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border-default">
          {SCOPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleScopeChange(opt.value)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-md cursor-pointer transition-colors ${
                scope === opt.value
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-1'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {!query.trim() ? (
            <div className="px-4 py-8 text-center text-text-tertiary text-xs font-mono">
              {t('emptyHint')}
            </div>
          ) : results && allHits.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-tertiary text-xs font-mono">
              {t('noResults', { query })}
            </div>
          ) : (
            allHits.map((group) => (
              <div key={group.label}>
                <div className="px-4 py-1.5 text-[10px] uppercase tracking-[0.1em] text-text-tertiary font-mono">
                  {group.label} ({group.hits.length})
                </div>
                {group.hits.map((hit) => (
                  <button
                    key={`${hit.type}-${hit.id}`}
                    onClick={() => handleHitClick(hit)}
                    className="w-full flex items-start gap-2.5 px-4 py-2.5 text-xs cursor-pointer transition-colors hover:bg-surface-1 text-left"
                  >
                    <div className="mt-0.5">
                      <HitIcon type={hit.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-text-primary truncate font-medium text-[11px]">
                        {hit.title}
                      </div>
                      {hit.snippet && hit.snippet !== hit.title && (
                        <div className="text-text-tertiary text-[10px] line-clamp-2 mt-0.5 leading-relaxed">
                          {hit.snippet}
                        </div>
                      )}
                    </div>
                    {hit.created_at && (
                      <span className="text-[9px] text-text-tertiary font-mono shrink-0 mt-0.5">
                        {new Date(hit.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {results && results.total > 0 && (
          <div className="px-4 py-2 border-t border-border-default text-[10px] text-text-tertiary font-mono">
            {t('resultCount', { count: results.total })}
          </div>
        )}
      </div>
    </div>
  );
}
