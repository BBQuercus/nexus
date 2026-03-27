'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';
import { AlertTriangle } from 'lucide-react';

interface Segment {
  label: string;
  tokens: number;
  color: string;
}

// Common context window limits by model family
function getContextLimit(model: string): number {
  const m = model.toLowerCase();
  if (m.includes('claude') && m.includes('opus')) return 200000;
  if (m.includes('claude')) return 200000;
  if (m.includes('gpt-5') || m.includes('gpt-4.1')) return 128000;
  if (m.includes('gpt-4o')) return 128000;
  if (m.includes('llama-4')) return 128000;
  if (m.includes('deepseek')) return 128000;
  if (m.includes('grok')) return 128000;
  if (m.includes('kimi')) return 128000;
  return 128000; // default
}

export default function ContextWindowViz() {
  const t = useTranslations('contextWindow');
  const messages = useStore((s) => s.messages);
  const activeModel = useStore((s) => s.activeModel);
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);

  const { segments, totalTokens, contextLimit, usagePercent } = useMemo(() => {
    const limit = getContextLimit(activeModel);

    // Estimate tokens from messages
    let systemTokens = 0;
    let historyTokens = 0;
    let toolTokens = 0;
    let retrievalTokens = 0;

    for (const msg of messages) {
      const estimated = msg.cost?.inputTokens || Math.ceil((msg.content?.length || 0) / 4);
      if (msg.role === 'system') {
        systemTokens += estimated;
      } else if (msg.toolCalls && msg.toolCalls.length > 0) {
        // Tool calls and results
        const toolEstimate = msg.toolCalls.reduce((sum, tc) => {
          return sum + Math.ceil(((tc.code || '').length + (tc.output || '').length) / 4);
        }, 0);
        toolTokens += toolEstimate;
        historyTokens += Math.ceil((msg.content?.length || 0) / 4);
      } else if (msg.citations && msg.citations.length > 0) {
        // Retrieval context
        const citationEstimate = msg.citations.reduce((sum, c) => {
          return sum + Math.ceil((c.snippet?.length || 0) / 4);
        }, 0);
        retrievalTokens += citationEstimate;
        historyTokens += Math.ceil((msg.content?.length || 0) / 4);
      } else {
        historyTokens += estimated;
      }
    }

    // Add baseline system prompt estimate
    if (systemTokens === 0) systemTokens = 500;

    const total = systemTokens + historyTokens + toolTokens + retrievalTokens;
    const pct = Math.min(100, (total / limit) * 100);

    const segs: Segment[] = [
      { label: t('systemPrompt'), tokens: systemTokens, color: '#6366f1' },
      { label: t('conversation'), tokens: historyTokens, color: '#22c55e' },
      { label: t('toolResults'), tokens: toolTokens, color: '#f59e0b' },
      { label: t('retrieval'), tokens: retrievalTokens, color: '#3b82f6' },
    ].filter((s) => s.tokens > 0);

    return {
      segments: segs,
      totalTokens: total,
      contextLimit: limit,
      usagePercent: pct,
    };
  }, [messages, activeModel, t]);

  if (messages.length === 0) return null;

  const isWarning = usagePercent > 80;
  const isCritical = usagePercent > 95;

  return (
    <div className="px-3 py-2">
      {/* Label row */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] text-text-tertiary font-mono">{t('label')}</span>
        <span className={`text-[10px] font-mono ${isCritical ? 'text-error' : isWarning ? 'text-warning' : 'text-text-tertiary'}`}>
          {(totalTokens / 1000).toFixed(1)}k / {(contextLimit / 1000).toFixed(0)}k
        </span>
        {isWarning && (
          <AlertTriangle size={10} className={isCritical ? 'text-error' : 'text-warning'} />
        )}
        <span className={`text-[9px] font-mono ml-auto ${isCritical ? 'text-error' : isWarning ? 'text-warning' : 'text-text-tertiary'}`}>
          {usagePercent.toFixed(0)}%
        </span>
      </div>

      {/* Bar */}
      <div className="relative h-2 bg-surface-2 rounded-full overflow-hidden">
        <div className="absolute inset-0 flex">
          {segments.map((seg) => {
            const width = (seg.tokens / contextLimit) * 100;
            return (
              <div
                key={seg.label}
                className="h-full transition-all relative"
                style={{
                  width: `${Math.max(width, 0.5)}%`,
                  backgroundColor: seg.color,
                  opacity: hoveredSegment && hoveredSegment !== seg.label ? 0.3 : 1,
                }}
                onMouseEnter={() => setHoveredSegment(seg.label)}
                onMouseLeave={() => setHoveredSegment(null)}
              />
            );
          })}
        </div>

        {/* Warning threshold markers */}
        <div
          className="absolute top-0 bottom-0 w-px bg-warning/40"
          style={{ left: '80%' }}
        />
      </div>

      {/* Hover tooltip */}
      {hoveredSegment && (
        <div className="mt-1.5 flex items-center gap-3">
          {segments.map((seg) => (
            <div
              key={seg.label}
              className={`flex items-center gap-1 transition-opacity ${
                hoveredSegment !== seg.label ? 'opacity-40' : ''
              }`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-[9px] text-text-tertiary">
                {seg.label}: {(seg.tokens / 1000).toFixed(1)}k
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
