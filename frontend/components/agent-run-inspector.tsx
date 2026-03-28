'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import * as api from '@/lib/api';
import type { AgentRunRecord, AgentRunStep } from '@/lib/types';
import { formatDuration, formatTokens } from '@/lib/utils';
import {
  Loader2, Brain, Terminal, Clock, AlertTriangle,
  ChevronDown, ChevronRight, ChevronLeft,
  Coins, Zap, Hash, CheckCircle2, XCircle, SkipForward,
  Pause, Activity,
} from 'lucide-react';
import { toast } from './toast';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from './ui/tooltip';

const STEP_ICONS: Record<string, React.ElementType> = {
  llm_call: Brain,
  tool_call: Terminal,
  approval_wait: Pause,
};

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  completed: { icon: CheckCircle2, color: 'text-green-500', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-error', label: 'Failed' },
  skipped: { icon: SkipForward, color: 'text-text-tertiary', label: 'Skipped' },
};

const RUN_STATUS_CONFIG: Record<string, { cls: string; label: string }> = {
  running: { cls: 'text-accent bg-accent/10', label: 'Running' },
  completed: { cls: 'text-green-500 bg-green-500/10', label: 'Completed' },
  failed: { cls: 'text-error bg-error/10', label: 'Failed' },
  paused: { cls: 'text-amber-400 bg-amber-400/10', label: 'Paused' },
  cancelled: { cls: 'text-text-tertiary bg-surface-1', label: 'Cancelled' },
};

function formatCost(usd?: number): string {
  if (usd == null) return '-';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function DataBlock({ label, data }: { label: string; data?: Record<string, unknown> | null }) {
  if (!data || Object.keys(data).length === 0) return null;

  return (
    <div>
      <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">{label}</span>
      <pre className="mt-1 p-2 rounded-md bg-surface-0 border border-border-default text-[10px] text-text-secondary font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function StepRow({
  step,
  isActive,
  onClick,
  isExpanded,
  onToggle,
}: {
  step: AgentRunStep;
  isActive: boolean;
  onClick: () => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const StepIcon = STEP_ICONS[step.stepType] ?? Terminal;
  const statusConf = STATUS_CONFIG[step.status] ?? STATUS_CONFIG.completed;
  const StatusIcon = statusConf.icon;
  const isFailed = step.status === 'failed';

  return (
    <div className={`rounded-lg border overflow-hidden transition-colors ${
      isActive ? 'border-accent/40 bg-accent/5' : isFailed ? 'border-error/30 bg-error/5' : 'border-border-default bg-surface-1'
    }`}>
      <button
        onClick={() => { onClick(); onToggle(); }}
        className="w-full flex items-center gap-2.5 p-2.5 hover:bg-surface-2/50 transition-colors cursor-pointer text-left"
      >
        {/* Step index */}
        <span className="text-[10px] text-text-tertiary w-4 text-right shrink-0 font-mono">
          {step.stepIndex + 1}
        </span>

        {/* Type icon */}
        <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
          isActive ? 'bg-accent/10 border-accent/20' : 'bg-surface-0 border-border-default'
        } border`}>
          <StepIcon size={12} className={isActive ? 'text-accent' : 'text-text-secondary'} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-text-primary truncate">
              {step.toolName ?? step.stepType.replace(/_/g, ' ')}
            </span>
            <StatusIcon size={11} className={statusConf.color} />
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {step.durationMs != null && (
              <span className="text-[9px] text-text-tertiary flex items-center gap-0.5">
                <Clock size={8} /> {formatDuration(step.durationMs)}
              </span>
            )}
            {step.tokensUsed != null && step.tokensUsed > 0 && (
              <span className="text-[9px] text-text-tertiary flex items-center gap-0.5">
                <Hash size={8} /> {formatTokens(step.tokensUsed)}
              </span>
            )}
          </div>
        </div>

        {isExpanded ? (
          <ChevronDown size={13} className="text-text-tertiary shrink-0" />
        ) : (
          <ChevronRight size={13} className="text-text-tertiary shrink-0" />
        )}
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-border-default/50 space-y-2.5 pt-2.5">
          {step.error && (
            <div className="flex items-start gap-1.5 p-2 rounded-md bg-error/10 border border-error/20">
              <AlertTriangle size={11} className="text-error shrink-0 mt-0.5" />
              <p className="text-[10px] text-error">{step.error}</p>
            </div>
          )}
          <DataBlock label="Input" data={step.inputData} />
          <DataBlock label="Output" data={step.outputData} />
        </div>
      )}
    </div>
  );
}

export default function AgentRunInspector({ runId }: { runId: string }) {
  const t = useTranslations('agentRunInspector');
  const [run, setRun] = useState<AgentRunRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(0);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setLoading(true);
    api.getAgentRun(runId)
      .then((data) => {
        setRun(data);
        // Auto-expand the first failed step, if any
        const firstFail = data.steps?.findIndex((s) => s.status === 'failed');
        if (firstFail != null && firstFail >= 0) {
          setActiveStep(firstFail);
          setExpanded({ [firstFail]: true });
        }
      })
      .catch(() => {
        toast.error('Failed to load agent run');
      })
      .finally(() => setLoading(false));
  }, [runId]);

  const steps = run?.steps ?? [];
  const totalTokens = (run?.totalInputTokens ?? 0) + (run?.totalOutputTokens ?? 0);
  const runStatus = RUN_STATUS_CONFIG[run?.status ?? ''] ?? RUN_STATUS_CONFIG.completed;

  const goToPrev = () => {
    setActiveStep((s) => {
      const next = Math.max(0, s - 1);
      setExpanded((e) => ({ ...e, [next]: true }));
      return next;
    });
  };

  const goToNext = () => {
    setActiveStep((s) => {
      const next = Math.min(steps.length - 1, s + 1);
      setExpanded((e) => ({ ...e, [next]: true }));
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={16} className="animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-tertiary">
        <AlertTriangle size={24} className="mb-2 opacity-40" />
        <p className="text-xs">{t('runNotFound')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-default">
        <div className="flex items-center gap-2 mb-2">
          <Activity size={16} className="text-accent" />
          <h2 className="text-sm font-semibold text-text-primary">{t('runInspector')}</h2>
          <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-medium ${runStatus.cls}`}>
            {run.status === 'running' && <Loader2 size={9} className="animate-spin mr-1" />}
            {runStatus.label}
          </span>
        </div>

        {/* Summary stats */}
        <div className="flex flex-wrap items-center gap-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 text-[10px] text-text-tertiary">
                  <Clock size={10} /> {formatDuration(run.durationMs)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[10px]">{t('totalDuration')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 text-[10px] text-text-tertiary">
                  <Hash size={10} /> {formatTokens(totalTokens)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[10px]">
                {formatTokens(run.totalInputTokens)} in / {formatTokens(run.totalOutputTokens)} out
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 text-[10px] text-text-tertiary">
                  <Coins size={10} /> {formatCost(run.costUsd)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[10px]">{t('estimatedCost')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {run.model && (
            <Badge variant="outline" className="text-[9px]">{run.model}</Badge>
          )}

          <span className="text-[10px] text-text-tertiary">
            {steps.length} {steps.length !== 1 ? t('steps') : t('step')}
          </span>
        </div>
      </div>

      {/* Replay controls */}
      {steps.length > 1 && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 border-b border-border-default/50">
          <button
            onClick={goToPrev}
            disabled={activeStep === 0}
            className="p-1 rounded hover:bg-surface-1 text-text-secondary disabled:opacity-30 cursor-pointer disabled:cursor-default transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-[10px] text-text-tertiary min-w-[60px] text-center">
            Step {activeStep + 1} / {steps.length}
          </span>
          <button
            onClick={goToNext}
            disabled={activeStep >= steps.length - 1}
            className="p-1 rounded hover:bg-surface-1 text-text-secondary disabled:opacity-30 cursor-pointer disabled:cursor-default transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Steps timeline */}
      <ScrollArea className="flex-1 px-4 pb-4">
        {steps.length === 0 ? (
          <div className="text-center py-8 text-text-tertiary text-xs">
            {t('noStepsRecorded')}
          </div>
        ) : (
          <div className="space-y-1.5 pt-2">
            {steps.map((step, idx) => (
              <StepRow
                key={step.id}
                step={step}
                isActive={idx === activeStep}
                onClick={() => setActiveStep(idx)}
                isExpanded={!!expanded[idx]}
                onToggle={() => setExpanded((e) => ({ ...e, [idx]: !e[idx] }))}
              />
            ))}
          </div>
        )}

        {/* Error banner if run failed */}
        {run.error && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-error/10 border border-error/20">
            <AlertTriangle size={13} className="text-error shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-medium text-error">{t('runError')}</p>
              <p className="text-[10px] text-error/80 mt-0.5">{run.error}</p>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
