'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import type { Citation, RetrievalResult } from '@/lib/types';
import { FileText, ChevronDown, ChevronUp, Search, AlertTriangle, ExternalLink, Hash } from 'lucide-react';

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

interface FileGroup {
  filename: string;
  documentId: string;
  knowledgeBaseId?: string;
  bestScore: number;
  chunks: Citation[];
}

function groupByFile(citations: Citation[]): FileGroup[] {
  const map = new Map<string, FileGroup>();
  for (const c of citations) {
    const key = c.documentId || c.filename;
    if (!map.has(key)) {
      map.set(key, {
        filename: c.filename,
        documentId: c.documentId,
        knowledgeBaseId: c.knowledgeBaseId,
        bestScore: c.score,
        chunks: [],
      });
    }
    const group = map.get(key)!;
    group.chunks.push(c);
    if (c.score > group.bestScore) group.bestScore = c.score;
  }
  // Sort by best score descending
  return Array.from(map.values()).sort((a, b) => b.bestScore - a.bestScore);
}

function FileCard({ group }: { group: FileGroup }) {
  const [expanded, setExpanded] = useState(false);

  const scoreColor = group.bestScore >= 0.7
    ? 'text-accent'
    : group.bestScore >= 0.4
      ? 'text-warning'
      : 'text-error';

  return (
    <div className="border border-border-default rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-3 hover:bg-surface-1/50 transition-colors text-left cursor-pointer"
      >
        <FileText size={14} className="text-text-tertiary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-text-primary truncate">{group.filename}</span>
            <span className={`text-[10px] font-mono ml-auto shrink-0 ${scoreColor}`}>
              {Math.round(group.bestScore * 100)}%
            </span>
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">
            {group.chunks.length} matching section{group.chunks.length !== 1 ? 's' : ''}
            {group.chunks.some((c) => c.page) && (
              <span>
                {' -- '}
                {(() => {
                  const pages = [...new Set(group.chunks.map((c) => c.page).filter(Boolean))].sort((a, b) => a! - b!);
                  if (pages.length === 0) return '';
                  if (pages.length <= 3) return `Page${pages.length > 1 ? 's' : ''} ${pages.join(', ')}`;
                  return `Pages ${pages[0]}-${pages[pages.length - 1]}`;
                })()}
              </span>
            )}
            {group.chunks.some((c) => c.chunkIndex !== undefined) && !group.chunks.some((c) => c.page) && (
              <span>
                {' -- '}
                Chunks {group.chunks.map((c) => `#${c.chunkIndex}`).join(', ')}
              </span>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp size={12} className="text-text-tertiary mt-1" /> : <ChevronDown size={12} className="text-text-tertiary mt-1" />}
      </button>
      {expanded && (
        <div className="border-t border-border-subtle">
          {group.chunks.map((chunk, i) => {
            const locationParts: string[] = [];
            if (chunk.page) locationParts.push(`Page ${chunk.page}`);
            if (chunk.section) locationParts.push(chunk.section);
            if (chunk.chunkIndex !== undefined) locationParts.push(`Chunk #${chunk.chunkIndex}`);

            const chunkScoreColor = chunk.score >= 0.7
              ? 'text-accent'
              : chunk.score >= 0.4
                ? 'text-warning'
                : 'text-text-tertiary';

            return (
              <div key={chunk.chunkId || i} className={`px-3 py-2.5 ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
                <div className="flex items-center justify-between mb-1">
                  {locationParts.length > 0 ? (
                    <div className="flex items-center gap-1 text-[10px] text-text-tertiary">
                      <Hash size={8} />
                      <span>{locationParts.join(' / ')}</span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-text-tertiary">Section {i + 1}</span>
                  )}
                  <span className={`text-[10px] font-mono ${chunkScoreColor}`}>
                    {Math.round(chunk.score * 100)}%
                  </span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap line-clamp-4">{chunk.snippet}</p>
              </div>
            );
          })}
          {group.knowledgeBaseId && (
            <div className="px-3 py-2 border-t border-border-subtle">
              <a
                href={`/knowledge?kb=${group.knowledgeBaseId}&doc=${group.documentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-accent hover:underline"
              >
                <ExternalLink size={9} />
                Open in Knowledge Base
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SourcesPanel() {
  const streaming = useStore((s) => s.streaming);
  const messages = useStore((s) => s.messages);

  const { citations, retrievalResult } = useMemo(() => {
    if (streaming.citations.length > 0) {
      return {
        citations: streaming.citations,
        retrievalResult: streaming.retrievalResult,
      };
    }

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

  const fileGroups = useMemo(() => groupByFile(citations), [citations]);

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
            <span className="truncate">&ldquo;{retrievalResult.query}&rdquo;</span>
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

      {/* File count */}
      <div className="text-[10px] text-text-tertiary font-mono px-1">
        {fileGroups.length} file{fileGroups.length !== 1 ? 's' : ''}, {citations.length} section{citations.length !== 1 ? 's' : ''}
      </div>

      {/* File cards */}
      <div className="space-y-2">
        {fileGroups.map((group) => (
          <FileCard key={group.documentId || group.filename} group={group} />
        ))}
      </div>
    </div>
  );
}
