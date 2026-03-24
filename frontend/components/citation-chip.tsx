'use client';

import { useState } from 'react';
import type { Citation } from '@/lib/types';
import { FileText, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { useStore } from '@/lib/store';

export function CitationChip({ citation, index }: { citation: Citation; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const scoreColor = citation.score >= 0.7
    ? 'text-accent bg-accent/10 border-accent/20'
    : citation.score >= 0.4
      ? 'text-warning bg-warning/10 border-warning/20'
      : 'text-text-tertiary bg-surface-1 border-border-default';

  return (
    <span className="relative inline-block align-middle">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-mono transition-colors cursor-pointer hover:opacity-80 ${scoreColor}`}
        title={`${citation.filename}${citation.page ? `, p.${citation.page}` : ''}${citation.section ? `, ${citation.section}` : ''} (${Math.round(citation.score * 100)}% relevance)`}
      >
        <FileText size={10} />
        {index + 1}
      </button>
      {expanded && (
        <div className="absolute z-50 left-0 top-full mt-1 w-72 bg-surface-1 border border-border-default rounded-lg shadow-lg p-3 text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-text-primary truncate">{citation.filename}</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${scoreColor}`}>
              {Math.round(citation.score * 100)}%
            </span>
          </div>
          {(citation.page || citation.section) && (
            <div className="text-text-tertiary text-[10px] mb-2">
              {citation.page && <span>Page {citation.page}</span>}
              {citation.page && citation.section && <span> / </span>}
              {citation.section && <span>{citation.section}</span>}
            </div>
          )}
          <p className="text-text-secondary leading-relaxed line-clamp-4">{citation.snippet}</p>
        </div>
      )}
    </span>
  );
}

export function CitationBar({ citations }: { citations: Citation[] }) {
  if (!citations || citations.length === 0) return null;

  const setRightPanelTab = useStore((s) => s.setRightPanelTab);
  const setRightPanelOpen = useStore((s) => s.setRightPanelOpen);

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-border-default/20">
      <span className="text-[10px] text-text-tertiary mr-1">Sources:</span>
      {citations.map((c, i) => (
        <CitationChip key={c.chunkId || i} citation={c} index={i} />
      ))}
      <button
        onClick={() => {
          setRightPanelTab('sources');
          setRightPanelOpen(true);
        }}
        className="text-[10px] text-text-tertiary hover:text-accent ml-1 cursor-pointer"
      >
        View all
      </button>
    </div>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.7) return null;

  const isLow = confidence < 0.3;

  return (
    <div className={`flex items-center gap-1.5 text-[10px] mt-1 ${isLow ? 'text-error/70' : 'text-warning/70'}`}>
      <AlertTriangle size={10} />
      {isLow
        ? 'Low confidence -- sources may not be relevant'
        : 'Moderate confidence -- verify with original documents'}
    </div>
  );
}
