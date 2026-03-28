'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { AgentRunRecord, AgentRunStep } from '@/lib/types';
import * as api from '@/lib/api';
import { formatDuration, formatTokens } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Play, RotateCcw, ChevronDown, ChevronRight, Clock, Cpu, Coins, Zap, Loader2, AlertCircle, Inbox,
} from 'lucide-react';

interface AgentRunHistoryProps {
  agentPersonaId?: string;
}

type StatusFilter = 'all' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';

const STATUS_BADGE_VARIANT: Record<AgentRunRecord['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  running: 'default',
  completed: 'secondary',
  failed: 'destructive',
  paused: 'outline',
  cancelled: 'outline',
};

const STATUS_BADGE_KEY: Record<AgentRunRecord['status'], string> = {
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  paused: 'paused',
  cancelled: 'cancelled',
};

const STEP_TYPE_LABEL: Record<AgentRunStep['stepType'], string> = {
  llm_call: 'LLM Call',
  tool_call: 'Tool Call',
  approval_wait: 'Approval Wait',
};

function truncate(text: string | undefined | null, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '...' : text;
}

export default function AgentRunHistory({ agentPersonaId }: AgentRunHistoryProps) {
  const t = useTranslations('agentRuns');
  const [runs, setRuns] = useState<AgentRunRecord[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      setError(null);
      const params: Parameters<typeof api.listAgentRuns>[0] = {};
      if (agentPersonaId) params.agent_persona_id = agentPersonaId;
      if (statusFilter !== 'all') params.status = statusFilter;
      const data = await api.listAgentRuns(params);
      setRuns(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load runs');
      setRuns([]);
    }
  }, [agentPersonaId, statusFilter]);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  // Auto-refresh while any run is still "running"
  useEffect(() => {
    const hasRunning = runs?.some((r) => r.status === 'running');
    if (!hasRunning) return;
    const interval = setInterval(fetchRuns, 3000);
    return () => clearInterval(interval);
  }, [runs, fetchRuns]);

  async function handleRerun(run: AgentRunRecord) {
    setRerunning(run.id);
    try {
      await api.rerunAgent(run.id);
      await fetchRuns();
    } catch {
      // error toast handled by apiFetch
    } finally {
      setRerunning(null);
    }
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  // Loading skeleton
  if (runs === null) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Filter bar */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-[11px] text-text-tertiary uppercase tracking-wider font-medium">{t('runHistory')}</span>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-32 h-7 text-[11px]">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allStatuses')}</SelectItem>
            <SelectItem value="running">{t('running')}</SelectItem>
            <SelectItem value="completed">{t('completed')}</SelectItem>
            <SelectItem value="failed">{t('failed')}</SelectItem>
            <SelectItem value="paused">{t('paused')}</SelectItem>
            <SelectItem value="cancelled">{t('cancelled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-red-400">
          <AlertCircle className="h-3 w-3" />
          {error}
        </div>
      )}

      {/* Empty state */}
      {runs.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-10 text-text-tertiary">
          <Inbox className="h-6 w-6 mb-2 opacity-30" />
          <p className="text-xs">{t('noRunsFound')}</p>
          <p className="text-[10px] mt-0.5">{t('runsWillAppear')}</p>
        </div>
      )}

      {/* Run list */}
      {runs.length > 0 && (
        <div className="space-y-2">
          {runs.map((run) => {
            const isExpanded = expandedId === run.id;
            const statusVariant = STATUS_BADGE_VARIANT[run.status];
            const statusKey = STATUS_BADGE_KEY[run.status];

            return (
              <div key={run.id} className="bg-surface-1 border border-border-default rounded-lg overflow-hidden">
                {/* Run summary row */}
                <button
                  onClick={() => toggleExpand(run.id)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface-2 transition-colors"
                >
                  {isExpanded
                    ? <ChevronDown className="h-3.5 w-3.5 text-text-secondary shrink-0" />
                    : <ChevronRight className="h-3.5 w-3.5 text-text-secondary shrink-0" />
                  }
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant}>{t(statusKey)}</Badge>
                      <Badge variant="outline">{run.trigger}</Badge>
                      {run.model && (
                        <span className="text-[10px] text-text-secondary truncate">{run.model}</span>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary truncate">
                      {truncate(run.inputText, 120)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-text-secondary shrink-0">
                    <span className="flex items-center gap-1" title="Duration">
                      <Clock className="h-3 w-3" />
                      {formatDuration(run.durationMs)}
                    </span>
                    <span className="flex items-center gap-1" title="Tokens">
                      <Cpu className="h-3 w-3" />
                      {formatTokens(run.totalInputTokens + run.totalOutputTokens)}
                    </span>
                    {run.costUsd !== undefined && (
                      <span className="flex items-center gap-1" title="Cost">
                        <Coins className="h-3 w-3" />
                        ${run.costUsd.toFixed(4)}
                      </span>
                    )}
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-border-default p-3 space-y-3">
                    {/* Metadata grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-text-secondary">{t('inputTokens')}</span>
                        <p className="text-text-primary font-medium">{run.totalInputTokens.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-text-secondary">{t('outputTokens')}</span>
                        <p className="text-text-primary font-medium">{run.totalOutputTokens.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-text-secondary">{t('started')}</span>
                        <p className="text-text-primary font-medium">{new Date(run.createdAt).toLocaleString()}</p>
                      </div>
                      {run.completedAt && (
                        <div>
                          <span className="text-text-secondary">{t('completedAt')}</span>
                          <p className="text-text-primary font-medium">{new Date(run.completedAt).toLocaleString()}</p>
                        </div>
                      )}
                    </div>

                    {/* Full input */}
                    <div>
                      <span className="text-xs text-text-secondary font-medium">{t('input')}</span>
                      <pre className="mt-1 bg-surface-0 border border-border rounded-md p-2 text-xs text-text-secondary whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {run.inputText}
                      </pre>
                    </div>

                    {/* Output */}
                    {run.outputText && (
                      <div>
                        <span className="text-xs text-text-secondary font-medium">{t('output')}</span>
                        <pre className="mt-1 bg-surface-0 border border-border rounded-md p-2 text-xs text-text-secondary whitespace-pre-wrap max-h-40 overflow-y-auto">
                          {run.outputText}
                        </pre>
                      </div>
                    )}

                    {/* Error */}
                    {run.error && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-md p-2">
                        <span className="text-xs text-red-400 font-medium">{t('error')}</span>
                        <p className="text-xs text-red-300 mt-1">{run.error}</p>
                      </div>
                    )}

                    {/* Steps */}
                    {run.steps && run.steps.length > 0 && (
                      <div>
                        <span className="text-xs text-text-secondary font-medium">{t('steps')} ({run.steps.length})</span>
                        <div className="mt-1 space-y-1">
                          {run.steps.map((step) => (
                            <div key={step.id} className="flex items-center gap-2 bg-surface-0 border border-border rounded-md p-2">
                              <span className="text-[10px] text-text-secondary w-5 text-center shrink-0">
                                {step.stepIndex + 1}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {STEP_TYPE_LABEL[step.stepType]}
                              </Badge>
                              {step.toolName && (
                                <span className="text-xs text-text-primary">{step.toolName}</span>
                              )}
                              <span className="ml-auto text-[10px] text-text-secondary flex items-center gap-1">
                                <Zap className="h-2.5 w-2.5" />
                                {formatDuration(step.durationMs)}
                              </span>
                              {step.status === 'failed' && (
                                <Badge variant="destructive" className="text-[10px]">{t('failed')}</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRerun(run)}
                        disabled={rerunning === run.id}
                      >
                        {rerunning === run.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <RotateCcw className="h-3 w-3" />
                        }
                        {t('rerun')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
