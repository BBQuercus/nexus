'use client';

import { useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Coins,
  Cpu,
  Sparkles,
  Database,
  Terminal,
  Layers,
} from 'lucide-react';
import type { RunSummary as RunSummaryType, ExecutionStep } from '@/lib/execution-types';

// ── Helpers ──

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n} tok`;
  return `${(n / 1000).toFixed(1)}k tok`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(3)}`;
}

// ── Section: What I Did ──

function StepsSummary({ steps }: { steps: ExecutionStep[] }) {
  const { succeeded, failed, skipped } = useMemo(() => {
    const succeeded = steps.filter((s) => s.status === 'success');
    const failed = steps.filter((s) => s.status === 'failed' || s.status === 'timeout');
    const skipped = steps.filter((s) => s.status === 'skipped');
    return { succeeded, failed, skipped };
  }, [steps]);

  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">What I did</h4>
      <ul className="space-y-1">
        {succeeded.map((step) => (
          <li key={step.id} className="flex items-center gap-2 text-xs text-text-secondary">
            <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
            <span className="truncate">{step.name}</span>
            {step.durationMs !== undefined && (
              <span className="text-[10px] font-mono text-text-tertiary ml-auto shrink-0">
                {formatDuration(step.durationMs)}
              </span>
            )}
          </li>
        ))}
        {failed.map((step) => (
          <li key={step.id} className="flex items-center gap-2 text-xs text-error/80">
            <XCircle size={11} className="text-error shrink-0" />
            <span className="truncate">{step.name}</span>
            {step.error && (
              <span className="text-[10px] text-error/60 ml-auto shrink-0 truncate max-w-[120px]">
                {step.error}
              </span>
            )}
          </li>
        ))}
        {skipped.length > 0 && (
          <li className="text-[10px] text-text-tertiary">
            {skipped.length} step{skipped.length !== 1 ? 's' : ''} skipped
          </li>
        )}
      </ul>
    </div>
  );
}

// ── Section: What I Changed ──

function ArtifactsSection({ summary }: { summary: RunSummaryType }) {
  if (summary.artifactsCreated === 0 && !summary.sandboxUsed && !summary.retrievalUsed) return null;

  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">What I changed</h4>
      <div className="flex flex-wrap gap-2">
        {summary.artifactsCreated > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded px-1.5 py-0.5">
            <Sparkles size={9} />
            {summary.artifactsCreated} artifact{summary.artifactsCreated !== 1 ? 's' : ''}
          </span>
        )}
        {summary.sandboxUsed && (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-accent bg-accent/10 border border-accent/20 rounded px-1.5 py-0.5">
            <Terminal size={9} />
            sandbox
          </span>
        )}
        {summary.retrievalUsed && (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded px-1.5 py-0.5">
            <Database size={9} />
            knowledge base
          </span>
        )}
      </div>
    </div>
  );
}

// ── Section: What to Review ──

function ReviewSection({ summary }: { summary: RunSummaryType }) {
  const items = [
    ...summary.warnings.map((w) => ({ text: w, type: 'warning' as const })),
    ...summary.uncertainResults.map((u) => ({ text: u, type: 'uncertain' as const })),
  ];

  if (items.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">What to review</h4>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <AlertTriangle
              size={11}
              className={`shrink-0 mt-0.5 ${item.type === 'warning' ? 'text-amber-400' : 'text-orange-400'}`}
            />
            <span className="text-text-secondary">{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Stats bar ──

function StatsBar({ summary }: { summary: RunSummaryType }) {
  return (
    <div className="flex items-center gap-3 text-[10px] font-mono text-text-tertiary pt-2 border-t border-border-subtle">
      {summary.totalDurationMs > 0 && (
        <span className="flex items-center gap-1">
          <Clock size={9} />
          {formatDuration(summary.totalDurationMs)}
        </span>
      )}
      {summary.totalTokens > 0 && (
        <span className="flex items-center gap-1">
          <Coins size={9} />
          {formatTokens(summary.totalTokens)}
        </span>
      )}
      {summary.totalCostUsd !== undefined && summary.totalCostUsd > 0 && (
        <span>{formatCost(summary.totalCostUsd)}</span>
      )}
      {summary.toolsUsed.length > 0 && (
        <span className="flex items-center gap-1">
          <Layers size={9} />
          {summary.toolsUsed.length} tool{summary.toolsUsed.length !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

// ── Main component ──

export interface RunSummaryProps {
  summary: RunSummaryType;
  defaultExpanded?: boolean;
}

export function RunSummaryPanel({ summary, defaultExpanded = false }: RunSummaryProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!summary || summary.steps.length === 0) return null;

  const failedCount = summary.steps.filter(
    (s) => s.status === 'failed' || s.status === 'timeout',
  ).length;
  const hasIssues = failedCount > 0 || summary.warnings.length > 0 || summary.uncertainResults.length > 0;

  return (
    <div
      className={`my-2 rounded-lg border overflow-hidden ${
        hasIssues ? 'border-amber-400/30' : 'border-border-default'
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-surface-1 hover:bg-surface-2 transition-colors cursor-pointer"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-text-tertiary shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-text-tertiary shrink-0" />
        )}

        <Cpu size={12} className="text-text-secondary shrink-0" />

        <span className="text-[11px] font-mono font-medium text-text-secondary">
          Run Summary
        </span>

        {/* Compact stats when collapsed */}
        {!expanded && (
          <span className="text-[10px] font-mono text-text-tertiary ml-1">
            {summary.steps.length} step{summary.steps.length !== 1 ? 's' : ''}
            {summary.totalDurationMs > 0 && ` \u00B7 ${formatDuration(summary.totalDurationMs)}`}
            {summary.totalTokens > 0 && ` \u00B7 ${formatTokens(summary.totalTokens)}`}
            {failedCount > 0 && (
              <span className="text-amber-400 ml-1">
                \u26A0 {failedCount} failed
              </span>
            )}
          </span>
        )}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-3 py-3 bg-bg space-y-3">
          <StepsSummary steps={summary.steps} />
          <ArtifactsSection summary={summary} />
          <ReviewSection summary={summary} />
          <StatsBar summary={summary} />
        </div>
      )}
    </div>
  );
}
