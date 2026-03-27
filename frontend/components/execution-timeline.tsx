'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  ChevronRight,
  ChevronDown,
  Search,
  Terminal,
  BarChart3,
  Globe,
  FileText,
  Database,
  Brain,
  Sparkles,
  Check,
  X,
  Clock,
  Loader2,
  SkipForward,
  AlertTriangle,
  Coins,
} from 'lucide-react';
import type { ExecutionStep, ExecutionStepType, ExecutionStepStatus } from '@/lib/execution-types';

// ── Icon mapping by step type ──

const STEP_ICONS: Record<ExecutionStepType, React.ElementType> = {
  tool_call: Terminal,
  retrieval: Database,
  sandbox: Terminal,
  reasoning: Brain,
  artifact: Sparkles,
};

const TOOL_NAME_ICONS: Record<string, React.ElementType> = {
  search: Search,
  web_search: Globe,
  browse: Globe,
  code_exec: Terminal,
  execute_code: Terminal,
  run_code: Terminal,
  create_chart: BarChart3,
  chart: BarChart3,
  write_file: FileText,
  read_file: FileText,
  file_search: Search,
  retrieval: Database,
  rag_query: Database,
};

function getStepIcon(step: ExecutionStep): React.ElementType {
  const byName = TOOL_NAME_ICONS[step.name];
  if (byName) return byName;
  return STEP_ICONS[step.type] || Terminal;
}

// ── Status indicators ──

type StatusConfig = { icon: React.ElementType; color: string; labelKey: 'statusRunning' | 'statusDone' | 'statusFailed' | 'statusTimeout' | 'statusSkipped' };

const STATUS_CONFIG: Record<ExecutionStepStatus, StatusConfig> = {
  running: { icon: Loader2, color: 'text-accent', labelKey: 'statusRunning' },
  success: { icon: Check, color: 'text-emerald-400', labelKey: 'statusDone' },
  failed: { icon: X, color: 'text-error', labelKey: 'statusFailed' },
  timeout: { icon: AlertTriangle, color: 'text-amber-400', labelKey: 'statusTimeout' },
  skipped: { icon: SkipForward, color: 'text-text-tertiary', labelKey: 'statusSkipped' },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  return `${(n / 1000).toFixed(1)}k`;
}

// ── Single timeline step ──

function TimelineStep({ step, isLast }: { step: ExecutionStep; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getStepIcon(step);
  const status = STATUS_CONFIG[step.status];
  const StatusIcon = status.icon;
  const hasDetails = !!(step.error || step.result);

  return (
    <div className="relative flex gap-3">
      {/* Vertical connector line */}
      {!isLast && (
        <div className="absolute left-[13px] top-[28px] bottom-0 w-px bg-border-default" />
      )}

      {/* Icon circle */}
      <div
        className={`relative z-10 flex items-center justify-center w-[27px] h-[27px] rounded-full border shrink-0 ${
          step.status === 'running'
            ? 'border-accent/40 bg-accent/10'
            : step.status === 'failed' || step.status === 'timeout'
              ? 'border-error/30 bg-error/5'
              : 'border-border-default bg-surface-1'
        }`}
      >
        <Icon
          size={13}
          className={
            step.status === 'running'
              ? 'text-accent'
              : step.status === 'failed'
                ? 'text-error'
                : 'text-text-secondary'
          }
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        <button
          onClick={() => hasDetails && setExpanded(!expanded)}
          className={`flex items-center gap-2 w-full text-left ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <span className="text-xs font-medium text-text-primary truncate">{step.name}</span>

          {/* Status badge */}
          <StatusIcon
            size={11}
            className={`${status.color} shrink-0 ${step.status === 'running' ? 'animate-spin' : ''}`}
          />

          {/* Duration */}
          {step.durationMs != null ? (
            <span className="text-[10px] font-mono text-text-tertiary shrink-0 flex items-center gap-0.5">
              <Clock size={9} />
              {formatDuration(step.durationMs)}
            </span>
          ) : null}

          {/* Tokens */}
          {step.tokensUsed != null && step.tokensUsed > 0 ? (
            <span className="text-[10px] font-mono text-text-tertiary shrink-0 flex items-center gap-0.5">
              <Coins size={9} />
              {formatTokens(step.tokensUsed)}
            </span>
          ) : null}

          {/* Expand arrow */}
          {hasDetails && (
            <ChevronRight
              size={11}
              className={`text-text-tertiary shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
            />
          )}
        </button>

        {/* Description line */}
        {step.description ? (
          <p className="text-[11px] text-text-tertiary mt-0.5 truncate">{step.description}</p>
        ) : null}

        {/* Expanded details */}
        {expanded && hasDetails && (
          <div className="mt-2 rounded-md border border-border-subtle bg-surface-0 p-2 text-xs">
            {step.error && (
              <pre className="text-error whitespace-pre-wrap break-words">{step.error}</pre>
            )}
            {step.result != null && !step.error ? (
              <pre className="text-text-secondary whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                {typeof step.result === 'string' ? step.result : String(JSON.stringify(step.result, null, 2))}
              </pre>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Collapsed summary ──

function CollapsedSummary({ steps }: { steps: ExecutionStep[] }) {
  const t = useTranslations('executionTimeline');
  const summary = useMemo(() => {
    const toolCount = steps.filter((s) => s.status !== 'skipped').length;
    const totalMs = steps.reduce((acc, s) => acc + (s.durationMs ?? 0), 0);
    const totalTokens = steps.reduce((acc, s) => acc + (s.tokensUsed ?? 0), 0);
    const failedCount = steps.filter((s) => s.status === 'failed' || s.status === 'timeout').length;

    const parts: string[] = [];
    parts.push(`${toolCount} step${toolCount !== 1 ? 's' : ''}`);
    if (totalMs > 0) parts.push(formatDuration(totalMs));
    if (totalTokens > 0) parts.push(`${formatTokens(totalTokens)} tok`);
    if (failedCount > 0) parts.push(t('failedCount', { count: failedCount }));
    return { text: parts.join(' \u00B7 '), failedCount };
  }, [steps, t]);

  return (
    <span className="text-[11px] font-mono text-text-tertiary">
      {summary.text}
      {summary.failedCount > 0 && (
        <span className="ml-1 text-amber-400">\u26A0</span>
      )}
    </span>
  );
}

// ── Main component ──

export interface ExecutionTimelineProps {
  steps: ExecutionStep[];
  defaultExpanded?: boolean;
}

export function ExecutionTimeline({ steps, defaultExpanded = false }: ExecutionTimelineProps) {
  const t = useTranslations('executionTimeline');
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!steps || steps.length === 0) return null;

  const isRunning = steps.some((s) => s.status === 'running');

  return (
    <div className="my-2 rounded-lg border border-border-default overflow-hidden">
      {/* Header / toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-surface-1 hover:bg-surface-2 transition-colors cursor-pointer"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-text-tertiary shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-text-tertiary shrink-0" />
        )}

        <span className="text-[11px] font-mono font-medium text-text-secondary">
          {t('label')}
        </span>

        {isRunning && (
          <Loader2 size={11} className="text-accent animate-spin shrink-0" />
        )}

        {!expanded && <CollapsedSummary steps={steps} />}
      </button>

      {/* Expanded timeline */}
      {expanded && (
        <div className="px-3 pt-3 pb-1 bg-bg">
          {steps.map((step, i) => (
            <TimelineStep key={step.id} step={step} isLast={i === steps.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}
