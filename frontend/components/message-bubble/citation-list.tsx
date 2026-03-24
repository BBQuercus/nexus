'use client';

import { useMemo } from 'react';
import { CitationBar } from '../citation-chip';
import type { Citation } from './types';

export { CitationBar };

/**
 * Post-processor for markdown HTML that converts [Source N] references
 * into styled inline citation chips.
 */
export function useSourcePostProcess() {
  return useMemo(() => (html: string) => {
    return html.replace(
      /\[Source\s+(\d+)(?:\s*[—–-]\s*([^\]]+))?\]/gi,
      (_match: string, num: string, filename: string) => {
        const label = filename ? `${filename.trim()}` : `Source ${num}`;
        return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-mono bg-accent/10 text-accent border border-accent/20 align-middle" title="Source ${num}${filename ? `: ${filename.trim()}` : ''}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>${label}</span>`;
      },
    );
  }, []);
}

export function CitationSection({ citations }: { citations?: Citation[] }) {
  if (!citations || citations.length === 0) return null;
  return <CitationBar citations={citations} />;
}
