'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import type { Citation } from '@/lib/types';
import { FileText, Hash, ExternalLink, X, ChevronRight, BookOpen } from 'lucide-react';

function HighlightedPassage({ text, maxLines = 8 }: { text: string; maxLines?: number }) {
  const t = useTranslations('citationDetail');
  const [expanded, setExpanded] = useState(false);
  const lines = text.split('\n');
  const truncated = !expanded && lines.length > maxLines;
  const displayText = truncated ? lines.slice(0, maxLines).join('\n') + '...' : text;

  return (
    <div className="relative">
      <div className="bg-accent/5 border-l-2 border-accent/30 pl-3 pr-2 py-2 rounded-r text-xs text-text-secondary leading-relaxed whitespace-pre-wrap font-mono">
        {displayText}
      </div>
      {truncated && (
        <button
          onClick={() => setExpanded(true)}
          className="text-[10px] text-accent hover:underline mt-1 cursor-pointer"
        >
          {t('showFullPassage')}
        </button>
      )}
      {expanded && lines.length > maxLines && (
        <button
          onClick={() => setExpanded(false)}
          className="text-[10px] text-accent hover:underline mt-1 cursor-pointer"
        >
          {t('collapse')}
        </button>
      )}
    </div>
  );
}

function ScoreIndicator({ score }: { score: number }) {
  const t = useTranslations('citationDetail');
  const pct = Math.round(score * 100);
  const color = score >= 0.7 ? 'bg-accent' : score >= 0.4 ? 'bg-warning' : 'bg-error';
  const label = score >= 0.7 ? t('scoreHigh') : score >= 0.4 ? t('scoreModerate') : t('scoreLow');

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-text-tertiary whitespace-nowrap">
        {pct}% {label}
      </span>
    </div>
  );
}

export function CitationDetailPanel({
  citation,
  onClose,
}: {
  citation: Citation;
  onClose: () => void;
}) {
  const t = useTranslations('citationDetail');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const locationParts: string[] = [];
  if (citation.page) locationParts.push(`${t('pageLabel')} ${citation.page}`);
  if (citation.section) locationParts.push(citation.section);
  if (citation.chunkIndex !== undefined) locationParts.push(`${t('chunkId')} #${citation.chunkIndex}`);

  return (
    <div
      ref={panelRef}
      className="flex flex-col h-full bg-surface-0 border-l border-border-default"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen size={16} className="text-accent shrink-0" />
          <h3 className="text-sm font-medium text-text-primary truncate">{t('title')}</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-text-tertiary hover:text-text-primary hover:bg-surface-2 rounded transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Document info */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText size={14} className="text-accent" />
            <span className="text-sm font-medium text-text-primary">{citation.filename}</span>
          </div>
          {locationParts.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-text-tertiary ml-5">
              <Hash size={10} />
              <span>{locationParts.join(' / ')}</span>
            </div>
          )}
        </div>

        {/* Relevance score */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-tertiary font-medium mb-1 block">
            {t('relevanceLabel')}
          </label>
          <ScoreIndicator score={citation.score} />
        </div>

        {/* Retrieved passage */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-tertiary font-medium mb-1.5 block">
            {t('retrievedPassage')}
          </label>
          <HighlightedPassage text={citation.snippet} />
        </div>

        {/* Link to document */}
        {citation.knowledgeBaseId && (
          <a
            href={`/knowledge?kb=${citation.knowledgeBaseId}&doc=${citation.documentId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-surface-1 border border-border-default rounded-lg text-xs text-accent hover:bg-accent/5 hover:border-accent/30 transition-colors"
          >
            <ExternalLink size={12} />
            <span>{t('openInKB')}</span>
            <ChevronRight size={12} className="ml-auto" />
          </a>
        )}

        {/* Metadata */}
        <div className="border-t border-border-default pt-3">
          <label className="text-[10px] uppercase tracking-wider text-text-tertiary font-medium mb-2 block">
            {t('detailsLabel')}
          </label>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
            <dt className="text-text-tertiary">{t('documentId')}</dt>
            <dd className="text-text-secondary font-mono truncate" title={citation.documentId}>
              {citation.documentId.slice(0, 8)}...
            </dd>
            <dt className="text-text-tertiary">{t('chunkId')}</dt>
            <dd className="text-text-secondary font-mono truncate" title={citation.chunkId}>
              {citation.chunkId.slice(0, 8)}...
            </dd>
            {citation.page && (
              <>
                <dt className="text-text-tertiary">{t('pageLabel')}</dt>
                <dd className="text-text-secondary">{citation.page}</dd>
              </>
            )}
            {citation.section && (
              <>
                <dt className="text-text-tertiary">{t('sectionLabel')}</dt>
                <dd className="text-text-secondary">{citation.section}</dd>
              </>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}

/**
 * Popover variant for inline citation detail (used on hover/click).
 */
export function CitationDetailPopover({
  citation,
  anchorRect,
  onClose,
}: {
  citation: Citation;
  anchorRect: DOMRect;
  onClose: () => void;
}) {
  const t = useTranslations('citationDetail');
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, placement: 'above' as 'above' | 'below' });

  useEffect(() => {
    const popupW = 320;
    const popupH = 300;
    let left = anchorRect.left;
    let top = anchorRect.top - 8;
    let placement: 'above' | 'below' = 'above';

    // If not enough space above, place below
    if (anchorRect.top - popupH < 16) {
      top = anchorRect.bottom + 8;
      placement = 'below';
    }

    // Clamp horizontal
    if (left + popupW > window.innerWidth - 16) {
      left = window.innerWidth - popupW - 16;
    }
    if (left < 16) left = 16;

    setPos({ top, left, placement });
  }, [anchorRect]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  const locationParts: string[] = [];
  if (citation.page) locationParts.push(`${t('pageLabel')} ${citation.page}`);
  if (citation.section) locationParts.push(citation.section);

  const scoreColor = citation.score >= 0.7
    ? 'text-accent bg-accent/10'
    : citation.score >= 0.4
      ? 'text-warning bg-warning/10'
      : 'text-text-tertiary bg-surface-2';

  return createPortal(
    <div
      ref={popupRef}
      className="fixed z-[100] w-80 max-h-[300px] overflow-y-auto bg-surface-1 border border-border-default rounded-lg shadow-xl shadow-black/30 p-4 text-xs"
      style={{
        top: pos.top,
        left: pos.left,
        transform: pos.placement === 'above' ? 'translateY(-100%)' : undefined,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <FileText size={12} className="text-accent shrink-0" />
          <span className="font-medium text-text-primary truncate">{citation.filename}</span>
        </div>
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ml-2 ${scoreColor}`}>
          {Math.round(citation.score * 100)}%
        </span>
      </div>

      {locationParts.length > 0 && (
        <div className="flex items-center gap-1 text-text-tertiary text-[10px] mb-2">
          <Hash size={8} />
          <span>{locationParts.join(' / ')}</span>
        </div>
      )}

      {/* Passage */}
      <div className="bg-accent/5 border-l-2 border-accent/30 pl-2 pr-1 py-1.5 rounded-r mb-2">
        <p className="text-text-secondary leading-relaxed line-clamp-6 whitespace-pre-wrap">
          {citation.snippet}
        </p>
      </div>

      {/* Relevance bar */}
      <ScoreIndicator score={citation.score} />

      {/* Link */}
      {citation.knowledgeBaseId && (
        <a
          href={`/knowledge?kb=${citation.knowledgeBaseId}&doc=${citation.documentId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-[10px] text-accent hover:underline"
        >
          <ExternalLink size={9} />
          {t('openInKB')}
        </a>
      )}
    </div>,
    document.body,
  );
}
