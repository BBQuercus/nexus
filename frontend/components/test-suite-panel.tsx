'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import * as api from '@/lib/api';
import type { TestCase, TestRun, TestCaseResult } from '@/lib/types';
import { formatDuration } from '@/lib/utils';
import {
  Plus, Trash2, Pencil, Play, Loader2, Check, X,
  ChevronDown, ChevronRight, FlaskConical, Clock,
  CheckCircle2, XCircle, Save, Info,
} from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip';
import { toast } from './toast';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
// inline form — no dialog
import ConfirmDialog from './confirm-dialog';

interface TestCaseFormState {
  name: string;
  inputText: string;
  expectedOutput: string;
  evaluationCriteria: string;
}

const emptyForm: TestCaseFormState = {
  name: '',
  inputText: '',
  expectedOutput: '',
  evaluationCriteria: '',
};

function PassRateBar({ passed, failed }: { passed: number; failed: number }) {
  const total = passed + failed;
  if (total === 0) return null;
  const pct = Math.round((passed / total) * 100);

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-surface-0 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-400' : 'bg-red-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-medium text-text-secondary shrink-0">{pct}%</span>
    </div>
  );
}

function RunStatusBadge({ status }: { status: TestRun['status'] }) {
  const config = {
    running: { label: 'Running', cls: 'text-accent bg-accent/10', icon: Loader2 },
    completed: { label: 'Completed', cls: 'text-green-500 bg-green-500/10', icon: CheckCircle2 },
    failed: { label: 'Failed', cls: 'text-error bg-error/10', icon: XCircle },
  }[status] ?? { label: status, cls: 'text-text-tertiary bg-surface-1', icon: Clock };

  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${config.cls}`}>
      <Icon size={9} className={status === 'running' ? 'animate-spin' : ''} />
      {config.label}
    </span>
  );
}

export default function TestSuitePanel({ agentPersonaId, view }: { agentPersonaId: string; view?: 'cases' | 'runs' }) {
  const t = useTranslations('testSuite');
  const [testCases, setTestCases] = useState<TestCase[] | null>(null);
  const [testRuns, setTestRuns] = useState<TestRun[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TestCaseFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TestCase | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({});

  const loadCases = useCallback(() => {
    api.listTestCases(agentPersonaId).then(setTestCases).catch(() => {
      setTestCases([]);
      toast.error('Failed to load test cases');
    });
  }, [agentPersonaId]);

  const loadRuns = useCallback(() => {
    api.listTestRuns(agentPersonaId).then(setTestRuns).catch(() => {
      setTestRuns([]);
      toast.error('Failed to load test runs');
    });
  }, [agentPersonaId]);

  useEffect(() => { loadCases(); loadRuns(); }, [loadCases, loadRuns]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (tc: TestCase) => {
    setEditingId(tc.id);
    setForm({
      name: tc.name,
      inputText: tc.inputText,
      expectedOutput: tc.expectedOutput ?? '',
      evaluationCriteria: tc.evaluationCriteria ?? '',
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.inputText.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await api.updateTestCase(editingId, {
          name: form.name,
          input_text: form.inputText,
          expected_output: form.expectedOutput || undefined,
          evaluation_criteria: form.evaluationCriteria || undefined,
        });
        toast.success('Test case updated');
      } else {
        await api.createTestCase({
          agent_persona_id: agentPersonaId,
          name: form.name,
          input_text: form.inputText,
          expected_output: form.expectedOutput || undefined,
          evaluation_criteria: form.evaluationCriteria || undefined,
        });
        toast.success('Test case created');
      }
      setFormOpen(false);
      loadCases();
    } catch {
      toast.error('Failed to save test case');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteTestCase(deleteTarget.id);
      toast.success('Test case deleted');
      setDeleteTarget(null);
      loadCases();
    } catch {
      toast.error('Failed to delete test case');
    }
  };

  const handleRunAll = async () => {
    setRunning(true);
    try {
      await api.runTestSuite(agentPersonaId);
      toast.success('Test run started');
      loadRuns();
    } catch {
      toast.error('Failed to start test run');
    } finally {
      setRunning(false);
    }
  };

  const toggleRunExpanded = (runId: string) => {
    setExpandedRuns((prev) => ({ ...prev, [runId]: !prev[runId] }));
  };

  const casesContent = (
    <div>
      {formOpen ? (
        <form
          className={`p-3 rounded-lg border space-y-3 ${editingId ? 'border-accent/30 bg-surface-1' : 'border-border-default bg-surface-0'}`}
          onSubmit={(e) => { e.preventDefault(); handleSave(); }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-primary">
              {editingId ? t('editTestCase') : t('addTestCase')}
            </span>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="p-1 rounded hover:bg-surface-0 text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
          <div>
            <Label className="text-[11px]">{t('name')}</Label>
            <Input
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Summarization accuracy"
              className="mt-1 h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[11px]">{t('inputText')}</Label>
            <Textarea
              value={form.inputText}
              onChange={(e) => setForm((f) => ({ ...f, inputText: e.target.value }))}
              placeholder="The input prompt to send to the agent..."
              className="mt-1 text-xs min-h-[80px]"
            />
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1.5">
              <Label className="text-[11px] mb-0">{t('expectedOutput')}</Label>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info size={11} className="text-text-tertiary cursor-help shrink-0 translate-y-px" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-[10px]">
                    {t('expectedOutputHint')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Textarea
              value={form.expectedOutput}
              onChange={(e) => setForm((f) => ({ ...f, expectedOutput: e.target.value }))}
              placeholder="What the agent should respond with..."
              className="mt-1 text-xs min-h-[60px]"
            />
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1.5">
              <Label className="text-[11px] mb-0">{t('evaluationCriteria')}</Label>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info size={11} className="text-text-tertiary cursor-help shrink-0 translate-y-px" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-[10px]">
                    {t('evaluationCriteriaHint')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Textarea
              value={form.evaluationCriteria}
              onChange={(e) => setForm((f) => ({ ...f, evaluationCriteria: e.target.value }))}
              placeholder="How to judge pass/fail (e.g. 'output must contain key terms')"
              className="mt-1 text-xs min-h-[50px]"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFormOpen(false)}
              className="px-3 py-1.5 text-[11px] text-text-secondary hover:text-text-primary rounded-lg hover:bg-surface-0 transition-colors cursor-pointer"
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={saving || !form.name.trim() || !form.inputText.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-accent text-bg rounded-lg hover:bg-accent-hover cursor-pointer transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {editingId ? t('saveChanges') : t('addTestCase')}
            </Button>
          </div>
        </form>
      ) : null}

      {testCases === null ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="animate-spin text-text-tertiary" />
        </div>
      ) : testCases.length === 0 && !formOpen ? (
        <div className="text-center py-8 text-text-tertiary text-xs">
          {t('noTestCasesYet')}
        </div>
      ) : (
        <div className="space-y-2 mt-2">
          {testCases.map((tc) => editingId === tc.id ? null : (
            <div
              key={tc.id}
              className="p-3 rounded-lg border border-border-default bg-surface-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-primary">{tc.name}</span>
                <div className="flex items-center gap-1 mb-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(tc)}
                    className="p-1 h-auto w-auto rounded hover:bg-surface-0 text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
                  >
                    <Pencil size={12} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(tc)}
                    className="p-1 h-auto w-auto rounded hover:bg-surface-0 text-text-tertiary hover:text-error transition-colors cursor-pointer"
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
              <div className="mt-1.5 space-y-1">
                {tc.inputText && (
                  <div className="text-[10px] text-text-tertiary">
                    <span className="font-medium">{t('input')}:</span>{' '}
                    <span className="text-text-secondary">{tc.inputText.length > 100 ? tc.inputText.slice(0, 100) + '...' : tc.inputText}</span>
                  </div>
                )}
                {tc.expectedOutput && (
                  <div className="text-[10px] text-text-tertiary">
                    <span className="font-medium">{t('expected')}:</span>{' '}
                    <span className="text-text-secondary">{tc.expectedOutput.length > 100 ? tc.expectedOutput.slice(0, 100) + '...' : tc.expectedOutput}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const runsContent = (
    <div>
            {testRuns === null ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={16} className="animate-spin text-text-tertiary" />
              </div>
            ) : testRuns.length === 0 ? (
              <div className="text-center py-8 text-text-tertiary text-xs">
                {t('noTestRunsYet')}
              </div>
            ) : (
              <div className="space-y-2 mt-2">
                {testRuns.map((run) => {
                  const isExpanded = expandedRuns[run.id];
                  const createdDate = run.createdAt ? new Date(run.createdAt) : null;
                  const dateStr = createdDate && !isNaN(createdDate.getTime())
                    ? `${createdDate.toLocaleDateString()} ${createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'Run';
                  const total = run.passed + run.failed;
                  const pct = total > 0 ? Math.round((run.passed / total) * 100) : 0;

                  return (
                    <div key={run.id} className="rounded-lg border border-border-default bg-surface-1 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleRunExpanded(run.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2 transition-colors cursor-pointer text-left"
                      >
                        {isExpanded ? (
                          <ChevronDown size={12} className="text-text-tertiary shrink-0" />
                        ) : (
                          <ChevronRight size={12} className="text-text-tertiary shrink-0" />
                        )}
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <span className="text-[11px] font-medium text-text-primary truncate">{dateStr}</span>
                          <RunStatusBadge status={run.status} />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-green-500 tabular-nums">{run.passed}&#x2713;</span>
                          <span className="text-[10px] text-error tabular-nums">{run.failed}&#x2717;</span>
                          {run.durationMs ? (
                            <span className="text-[10px] text-text-tertiary tabular-nums">{formatDuration(run.durationMs)}</span>
                          ) : null}
                          <span className={`text-[10px] font-medium tabular-nums ${pct === 100 ? 'text-green-500' : pct >= 70 ? 'text-amber-400' : 'text-error'}`}>{pct}%</span>
                        </div>
                      </button>

                      {isExpanded && run.results && run.results.length > 0 && (
                        <div className="border-t border-border-default/50 divide-y divide-border-default/30">
                          {run.results.map((result, idx) => {
                            const tc = testCases?.find((c) => c.id === result.testCaseId);
                            return (
                              <div
                                key={`${result.testCaseId}-${idx}`}
                                className="px-3 py-2 text-[11px] space-y-1.5"
                              >
                                <div className="flex items-center gap-2.5">
                                  {result.passed ? (
                                    <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                                  ) : (
                                    <XCircle size={12} className="text-error shrink-0" />
                                  )}
                                  <span className="flex-1 text-text-primary font-medium truncate">
                                    {tc?.name ?? result.testCaseName ?? result.testCaseId}
                                  </span>
                                  {result.score != null && (
                                    <span className="text-[10px] text-text-tertiary shrink-0">
                                      {(result.score * 100).toFixed(0)}%
                                    </span>
                                  )}
                                </div>
                                {result.error && (
                                  <div className="ml-[22px] px-2 py-1 rounded bg-error/10 text-error text-[10px]">
                                    {result.error}
                                  </div>
                                )}
                                {result.actualOutput && (
                                  <div className="ml-[22px] space-y-1">
                                    <div>
                                      <span className="text-[10px] text-text-tertiary">{t('actualOutput')}</span>
                                      <pre className="mt-0.5 text-[10px] text-text-secondary bg-surface-0 border border-border-default/50 rounded px-2 py-1 whitespace-pre-wrap max-h-24 overflow-y-auto">{result.actualOutput}</pre>
                                    </div>
                                    {result.expectedOutput && (
                                      <div>
                                        <span className="text-[10px] text-text-tertiary">{t('expectedOutput')}</span>
                                        <pre className="mt-0.5 text-[10px] text-text-secondary bg-surface-0 border border-border-default/50 rounded px-2 py-1 whitespace-pre-wrap max-h-24 overflow-y-auto">{result.expectedOutput}</pre>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Header — shown for cases view or when no view specified */}
      {(view === 'cases' || !view) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="text-[11px] text-text-tertiary uppercase tracking-wider font-medium">{t('testCases')}</span>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRunAll}
              disabled={running || !testCases?.length}
              className="h-7 text-[11px]"
            >
              {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              {t('runAll')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => formOpen ? setFormOpen(false) : openCreate()}
              className="h-7 text-[11px]"
            >
              {formOpen ? <X size={12} /> : <Plus size={12} />}
              {formOpen ? t('cancel') : t('addTestCase')}
            </Button>
          </div>
        </div>
      )}
      {view === 'runs' && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] text-text-tertiary uppercase tracking-wider font-medium">{t('testRuns')}</span>
        </div>
      )}

      {view === 'cases' && casesContent}
      {view === 'runs' && runsContent}
      {!view && (
        <Tabs defaultValue="cases" className="flex flex-col">
          <div>
            <TabsList>
              <TabsTrigger value="cases">
                {t('testCases')} {testCases && `(${testCases.length})`}
              </TabsTrigger>
              <TabsTrigger value="runs">
                {t('testRuns')} {testRuns && `(${testRuns.length})`}
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="cases">{casesContent}</TabsContent>
          <TabsContent value="runs">{runsContent}</TabsContent>
        </Tabs>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={t('deleteTestCase')}
        message={t('deleteConfirmMessage', { name: deleteTarget?.name ?? '' })}
        confirmLabel={t('delete')}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
