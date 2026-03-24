'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import type { Citation, RetrievalResult } from '@/lib/types';
import { FileText, ChevronDown, ChevronUp, Search, AlertTriangle } from 'lucide-react';

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = confidence >= 0.7 ? 'bg-accent' : confidence >= 0.4 ? 'bg-warning' : 'bg-error';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-text-tertiary">{pct}%</span>
    </div>
  );
}

function SourceCard({ citation, index }: { citation: Citation; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const scoreColor = citation.score >= 0.7
    ? 'text-accent'
    : citation.score >= 0.4
      ? 'text-warning'
      : 'text-error';

  return (
    <div className="border border-border-default rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-3 hover:bg-surface-1/50 transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-surface-2 text-[11px] font-mono text-text-secondary shrink-0 mt-0.5">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <FileText size={12} className="text-text-tertiary shrink-0" />
            <span className="text-xs font-medium text-text-primary truncate">{citation.filename}</span>
            <span className={`text-[10px] font-mono ml-auto shrink-0 ${scoreColor}`}>
              {Math.round(citation.score * 100)}%
            </span>
          </div>
          {(citation.page || citation.section) && (
            <div className="text-[10px] text-text-tertiary mt-0.5">
              {citation.page && <span>Page {citation.page}</span>}
              {citation.page && citation.section && <span> / </span>}
              {citation.section && <span>{citation.section}</span>}
            </div>
          )}
        </div>
        {expanded ? <ChevronUp size={12} className="text-text-tertiary mt-1" /> : <ChevronDown size={12} className="text-text-tertiary mt-1" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-border-subtle">
          <p className="text-xs text-text-secondary leading-relaxed mt-2 whitespace-pre-wrap">{citation.snippet}</p>
        </div>
      )}
    </div>
  );
}

export default function SourcesPanel() {
  const streaming = useStore((s) => s.streaming);
  const messages = useStore((s) => s.messages);

  // Gather citations: prefer streaming if active, otherwise from last message with citations
  const { citations, retrievalResult } = useMemo(() => {
    if (streaming.citations.length > 0) {
      return {
        citations: streaming.citations,
        retrievalResult: streaming.retrievalResult,
      };
    }

    // Find the most recent message with citations
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.citations && msg.citations.length > 0) {
        return {
          citations: msg.citations,
          retrievalResult: null as RetrievalResult | null,
        };
      }
    }

    return { citations: [] as Citation[], retrievalResult: null as RetrievalResult | null };
  }, [streaming.citations, streaming.retrievalResult, messages]);

  if (citations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-tertiary p-6 text-center">
        <Search size={24} className="mb-3 opacity-50" />
        <p className="text-sm">No sources yet</p>
        <p className="text-xs mt-1 opacity-70">When the AI retrieves from knowledge bases, sources will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 space-y-3">
      {/* Retrieval summary */}
      {retrievalResult && (
        <div className="bg-surface-1 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Search size={12} />
            <span className="truncate">{retrievalResult.query}</span>
          </div>
          <ConfidenceBar confidence={retrievalResult.confidence} />
          {retrievalResult.confidence < 0.3 && (
            <div className="flex items-center gap-1.5 text-[10px] text-error/70 mt-1">
              <AlertTriangle size={10} />
              Low relevance -- results may not answer the query
            </div>
          )}
        </div>
      )}

      {/* Source cards */}
      <div className="space-y-2">
        {citations.map((c, i) => (
          <SourceCard key={c.chunkId || i} citation={c} index={i} />
        ))}
      </div>
    </div>
  );
}
