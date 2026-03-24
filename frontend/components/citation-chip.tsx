'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Citation } from '@/lib/types';
import { FileText, AlertTriangle, Hash, ExternalLink } from 'lucide-react';
import { useStore } from '@/lib/store';

function CitationPopup({
  citation,
  anchorRect,
  onClose,
}: {
  citation: Citation;
  anchorRect: DOMRect;
  onClose: () => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    // Position above the chip, clamped to viewport
    const popupW = 288;
    let left = anchorRect.left;
    let top = anchorRect.top - 8; // 8px gap above

    // Clamp horizontal
    if (left + popupW > window.innerWidth - 16) {
      left = window.innerWidth - popupW - 16;
    }
    if (left < 16) left = 16;

    setPos({ top, left });
  }, [anchorRect]);

  const scoreColor = citation.score >= 0.7
    ? 'text-accent bg-accent/10 border-accent/20'
    : citation.score >= 0.4
      ? 'text-warning bg-warning/10 border-warning/20'
      : 'text-text-tertiary bg-surface-1 border-border-default';

  const locationParts: string[] = [];
  if (citation.page) locationParts.push(`Page ${citation.page}`);
  if (citation.section) locationParts.push(citation.section);
  if (citation.chunkIndex !== undefined) locationParts.push(`Chunk #${citation.chunkIndex}`);

  return createPortal(
    <div
      ref={popupRef}
      className="fixed z-[100] w-72 bg-surface-1 border border-border-default rounded-lg shadow-xl shadow-black/30 p-3 text-xs"
      style={{ top: pos.top, left: pos.left, transform: 'translateY(-100%)' }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-medium text-text-primary truncate">{citation.filename}</span>
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
      <p className="text-text-secondary leading-relaxed line-clamp-5">{citation.snippet}</p>
      {citation.knowledgeBaseId && (
        <a
          href={`/knowledge?kb=${citation.knowledgeBaseId}&doc=${citation.documentId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-[10px] text-accent hover:underline"
        >
          <ExternalLink size={9} />
          Open in Knowledge Base
        </a>
      )}
    </div>,
    document.body,
  );
}

function CitationChip({
  citation,
  index,
  isOpen,
  onToggle,
}: {
  citation: Citation;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (isOpen && btnRef.current) {
      setRect(btnRef.current.getBoundingClientRect());
    }
  }, [isOpen]);

  const scoreColor = citation.score >= 0.7
    ? 'text-accent bg-accent/10 border-accent/20'
    : citation.score >= 0.4
      ? 'text-warning bg-warning/10 border-warning/20'
      : 'text-text-tertiary bg-surface-1 border-border-default';

  return (
    <span className="relative inline-block align-middle">
      <button
        ref={btnRef}
        onClick={onToggle}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-mono transition-colors cursor-pointer hover:opacity-80 ${scoreColor}`}
        title={`${citation.filename} (${Math.round(citation.score * 100)}%)`}
      >
        <FileText size={10} />
        {index + 1}
      </button>
      {isOpen && rect && (
        <CitationPopup
          citation={citation}
          anchorRect={rect}
          onClose={onToggle}
        />
      )}
    </span>
  );
}

/** Group citations by filename, showing each file once with chunk locations */
function GroupedCitations({
  citations,
  openIndex,
  onToggle,
}: {
  citations: Citation[];
  openIndex: number | null;
  onToggle: (i: number) => void;
}) {
  // Group by filename
  const groups = new Map<string, { indices: number[]; citations: Citation[] }>();
  citations.forEach((c, i) => {
    const key = c.filename;
    if (!groups.has(key)) groups.set(key, { indices: [], citations: [] });
    groups.get(key)!.indices.push(i);
    groups.get(key)!.citations.push(c);
  });

  // If every citation is from a unique file, just render chips directly
  if (groups.size === citations.length) {
    return (
      <>
        {citations.map((c, i) => (
          <CitationChip
            key={c.chunkId || i}
            citation={c}
            index={i}
            isOpen={openIndex === i}
            onToggle={() => onToggle(i)}
          />
        ))}
      </>
    );
  }

  // Grouped: show filename with chip indices
  const elements: React.ReactNode[] = [];
  for (const [filename, group] of groups) {
    const bestScore = Math.max(...group.citations.map((c) => c.score));
    const scoreColor = bestScore >= 0.7
      ? 'text-accent'
      : bestScore >= 0.4
        ? 'text-warning'
        : 'text-text-tertiary';

    elements.push(
      <span key={filename} className="inline-flex items-center gap-1 mr-1">
        <FileText size={10} className={scoreColor} />
        <span className="text-[10px] text-text-secondary truncate max-w-[120px]">{filename}</span>
        {group.indices.map((idx) => (
          <CitationChip
            key={group.citations[idx - group.indices[0]]?.chunkId || idx}
            citation={citations[idx]}
            index={idx}
            isOpen={openIndex === idx}
            onToggle={() => onToggle(idx)}
          />
        ))}
      </span>
    );
  }

  return <>{elements}</>;
}

export function CitationBar({ citations }: { citations: Citation[] }) {
  if (!citations || citations.length === 0) return null;

  const setRightPanelTab = useStore((s) => s.setRightPanelTab);
  const setRightPanelOpen = useStore((s) => s.setRightPanelOpen);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Close popup on click outside or Escape
  useEffect(() => {
    if (openIndex === null) return;
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenIndex(null);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenIndex(null);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [openIndex]);

  return (
    <div ref={barRef} className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-border-default/20">
      <span className="text-[10px] text-text-tertiary mr-1">Sources:</span>
      <GroupedCitations
        citations={citations}
        openIndex={openIndex}
        onToggle={(i) => setOpenIndex(openIndex === i ? null : i)}
      />
      <button
        onClick={() => {
          setOpenIndex(null);
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
