'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';
import { X } from 'lucide-react';
import MarkdownContent from './markdown-content';

export default function DiffViewer() {
  const t = useTranslations('diffViewer');
  const diffView = useStore((s) => s.diffView);
  const setDiffView = useStore((s) => s.setDiffView);

  useEffect(() => {
    if (!diffView) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDiffView(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [diffView, setDiffView]);

  if (!diffView) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur-sm animate-fade-in-up" style={{ animationDuration: '0.15s' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default bg-surface-0 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-text-primary">{t('headerTitle')}</span>
          <span className="text-[10px] text-text-tertiary">{t('responsesCount', { count: diffView.columns.length })}</span>
        </div>
        <button
          onClick={() => setDiffView(null)}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-1 cursor-pointer transition-colors"
          title={t('closeTitle')}
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 divide-x divide-border-default">
        {diffView.columns.map((col, i) => (
          <div key={i} className="flex-1 flex flex-col min-w-0">
            <div className="px-4 py-2 bg-surface-0 border-b border-border-subtle shrink-0">
              <span className="text-[11px] font-mono font-medium text-accent uppercase tracking-wider">{col.label}</span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <MarkdownContent
                text={col.content}
                className="markdown-content text-sm text-text-primary leading-relaxed"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
