'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import { DEFAULT_MODEL_ID, MODELS, type AgentPersona } from '@/lib/types';
import { X, Plus, Save, Play, Trash2, Bot, Search, Clock, History, TestTube2, FlaskConical, Info } from 'lucide-react';
import * as icons from 'lucide-react';
import PageShell from './page-shell';
import ConfirmDialog from './confirm-dialog';
import IconPicker from './icon-picker';
import AgentScheduleManager from './agent-schedule-manager';
import AgentRunHistory from './agent-run-history';
import TestSuitePanel from './test-suite-panel';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { Switch } from './ui/switch';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip';

const MODEL_OPTIONS = MODELS.map((model) => ({ label: model.name, value: model.id }));

const AVAILABLE_TOOLS = [
  { id: 'web_search', label: 'Web Search', description: 'Search the web for information' },
  { id: 'web_browse', label: 'Web Browse', description: 'Fetch and read webpage content' },
  { id: 'call_api', label: 'API Calls', description: 'Make HTTP requests to external APIs' },
  { id: 'execute_code', label: 'Code Execution', description: 'Run code in a sandboxed environment' },
  { id: 'create_chart', label: 'Charts', description: 'Generate data visualizations' },
  { id: 'create_ui', label: 'UI Generation', description: 'Create interactive UI components' },
  { id: 'run_sql', label: 'SQL Queries', description: 'Execute SQL against connected databases' },
  { id: 'read_file', label: 'Read Files', description: 'Read file contents from the workspace' },
  { id: 'write_file', label: 'Write Files', description: 'Create or modify files in the workspace' },
  { id: 'list_files', label: 'List Files', description: 'Browse workspace file structure' },
  { id: 'preview_app', label: 'App Preview', description: 'Preview web applications' },
];

const ALL_TOOL_IDS = AVAILABLE_TOOLS.map((t) => t.id);

const emptyAgent: AgentPersona = {
  id: '', name: '', icon: 'Bot', description: '', systemPrompt: '',
  defaultModel: DEFAULT_MODEL_ID, isPublic: false,
};

function AgentIcon({ name, size = 14, className = '' }: { name: string; size?: number; className?: string }) {
  const Icon = (icons as unknown as Record<string, icons.LucideIcon>)[name] || Bot;
  return <Icon size={size} className={className} />;
}

function AgentSidebarItem({ agent, isActive, onSelect, publicLabel, installedLabel }: {
  agent: AgentPersona;
  isActive: boolean;
  onSelect: () => void;
  publicLabel: string;
  installedLabel: string;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 text-left rounded-lg transition-all cursor-pointer ${
        isActive
          ? 'bg-accent/8 text-text-primary border-l-2 border-accent -ml-px'
          : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
        isActive ? 'bg-accent/10 border-accent/20' : 'bg-surface-1 border-border-default'
      }`}>
        <AgentIcon name={agent.icon} size={14} className={isActive ? 'text-accent' : 'text-text-tertiary'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{agent.name}</div>
        {agent.description && (
          <div className="text-[10px] text-text-tertiary mt-0.5 truncate">{agent.description}</div>
        )}
      </div>
      {agent.installedFrom ? (
        <span className="text-[9px] px-1 py-0.5 bg-surface-2 text-text-tertiary rounded shrink-0">{installedLabel}</span>
      ) : agent.isPublic ? (
        <span className="text-[9px] px-1 py-0.5 bg-accent/10 text-accent rounded shrink-0">{publicLabel}</span>
      ) : null}
    </button>
  );
}

export default function AgentsView() {
  const t = useTranslations('agents');
  const tc = useTranslations('common');
  const router = useRouter();
  const setActivePersona = useStore((s) => s.setActivePersona);
  const setActiveModel = useStore((s) => s.setActiveModel);
  const confirmDialog = useStore((s) => s.confirmDialog);
  const resolveConfirm = useStore((s) => s.resolveConfirm);

  const [agents, setAgents] = useState<AgentPersona[] | null>(null);
  const [editing, setEditing] = useState<AgentPersona | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('schedules');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api.listAgents().then(setAgents).catch(() => setAgents([])); }, []);

  useEffect(() => {
    if (!editing && agents && agents.length > 0) {
      const lastId = (() => { try { return localStorage.getItem('nexus:lastEditedAgentId'); } catch { return null; } })();
      const match = lastId ? agents.find((a) => a.id === lastId) : null;
      setEditing({ ...(match ?? agents[0]) });
    }
  }, [agents]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const name = params.get('name');
    const prompt = params.get('prompt');
    const model = params.get('model');
    if (name || prompt) {
      setEditing({
        ...emptyAgent,
        name: name || '',
        systemPrompt: prompt || '',
        defaultModel: model || emptyAgent.defaultModel,
      });
      window.history.replaceState({}, '', '/agents');
    }
  }, []);

  // Auto-focus name field for new agents
  useEffect(() => {
    if (editing && !editing.id) {
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isInitialLoading = agents === null && editing === null;
  const filtered = agents?.filter((a) =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.description?.toLowerCase().includes(search.toLowerCase())
  ) || [];
  const customAgents = filtered.filter((a) => !a.installedFrom);
  const installedAgents = filtered.filter((a) => !!a.installedFrom);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!editing?.name.trim()) errs.name = t('nameRequired');
    if (!editing?.systemPrompt.trim()) errs.systemPrompt = t('promptRequired');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!editing || !validate()) return;
    setSaving(true);
    try {
      const disabledTools = editing.tools && editing.tools.length < ALL_TOOL_IDS.length ? editing.tools : undefined;
      const data: Partial<AgentPersona> = {
        name: editing.name, icon: editing.icon, description: editing.description,
        systemPrompt: editing.systemPrompt, defaultModel: editing.defaultModel, isPublic: editing.isPublic,
        category: editing.category,
        tools: disabledTools ?? undefined,
      };
      const saved = editing.id
        ? await api.updateAgent(editing.id, data)
        : await api.createAgent(data);
      const refreshed = await api.listAgents();
      setAgents(refreshed);
      // Select the saved/created agent
      const match = refreshed.find((a) => a.id === (saved as AgentPersona).id);
      if (match) {
        try { localStorage.setItem('nexus:lastEditedAgentId', match.id); } catch {}
        setEditing({ ...match });
      } else {
        setEditing(null);
      }
    } catch (e) {
      console.error('Failed to save agent:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing?.id) return;
    const confirmed = await useStore.getState().showConfirm({
      title: t('deleteConfirmTitle', { name: editing.name }),
      message: t('deleteConfirmMessage'),
      confirmLabel: t('deleteConfirmLabel'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.deleteAgent(editing.id);
      setAgents(await api.listAgents());
      setEditing(null);
    } catch (e) {
      console.error('Failed to delete agent:', e);
    }
  };

  const handleTry = async () => {
    if (!editing) return;
    setActivePersona(editing);
    if (editing.defaultModel) setActiveModel(editing.defaultModel);
    try {
      const conv = await api.createConversation({ model: editing.defaultModel || useStore.getState().activeModel });
      useStore.getState().setActiveConversationId(conv.id);
      useStore.getState().setMessages([]);
      const r = await api.listConversations();
      useStore.getState().setConversations(r.conversations);
    } catch (e) {
      console.error('Failed to create conversation:', e);
    }
    router.push('/');
  };

  const hasUnsavedChanges = (() => {
    if (!editing) return false;
    if (!editing.id) return editing.name.trim() !== '' || editing.systemPrompt.trim() !== '';
    const original = agents?.find((a) => a.id === editing.id);
    if (!original) return false;
    return (
      original.name !== editing.name ||
      original.description !== editing.description ||
      original.systemPrompt !== editing.systemPrompt ||
      original.defaultModel !== editing.defaultModel ||
      original.icon !== editing.icon ||
      original.isPublic !== editing.isPublic ||
      original.category !== editing.category ||
      JSON.stringify(original.tools ?? []) !== JSON.stringify(editing.tools ?? [])
    );
  })();

  const promptLineCount = editing?.systemPrompt.split('\n').length ?? 0;

  const agentsSidebar = (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 space-y-2">
        <button
          onClick={() => { setEditing({ ...emptyAgent }); setErrors({});}}
          className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] font-medium bg-accent text-bg rounded-lg hover:bg-accent-hover cursor-pointer transition-colors"
        >
          <Plus size={12} /> {t('newAgent')}
        </button>
        {agents && agents.length > 3 && (
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('filterPlaceholder')}
              className="w-full pl-7 pr-2.5 py-1.5 bg-bg border border-border-default rounded-lg text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {agents === null ? (
          <div className="space-y-1 px-1 pt-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2.5 px-2.5 py-2.5 animate-pulse">
                <div className="w-8 h-8 rounded-lg bg-surface-2" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-24 bg-surface-2 rounded" />
                  <div className="h-2 w-16 bg-surface-2 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
            <Bot size={24} className="mb-2 opacity-20" />
            <div className="text-[11px]">{search ? t('noMatches') : t('noAgentsYet')}</div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {customAgents.length > 0 && installedAgents.length > 0 && (
              <div className="px-2.5 pt-1 pb-0.5">
                <span className="text-[9px] font-semibold uppercase tracking-widest text-text-tertiary">{t('sectionCustom')}</span>
              </div>
            )}
            {customAgents.map((agent) => (
              <AgentSidebarItem
                key={agent.id}
                agent={agent}
                isActive={editing?.id === agent.id}
                onSelect={() => {
                  try { localStorage.setItem('nexus:lastEditedAgentId', agent.id); } catch {}
                  setEditing({ ...agent });
                  setErrors({});
                }}
                publicLabel={t('publicBadge')}
                installedLabel={t('installedBadge')}
              />
            ))}
            {installedAgents.length > 0 && (
              <div className="px-2.5 pt-3 pb-0.5">
                <span className="text-[9px] font-semibold uppercase tracking-widest text-text-tertiary">{t('sectionInstalled')}</span>
              </div>
            )}
            {installedAgents.map((agent) => (
              <AgentSidebarItem
                key={agent.id}
                agent={agent}
                isActive={editing?.id === agent.id}
                onSelect={() => {
                  try { localStorage.setItem('nexus:lastEditedAgentId', agent.id); } catch {}
                  setEditing({ ...agent });
                  setErrors({});
                }}
                publicLabel={t('publicBadge')}
                installedLabel={t('installedBadge')}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <PageShell title={t('pageTitle')} sidebar={agentsSidebar}>
      {editing?.installedFrom ? (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 pt-6 pb-8 animate-[fadeIn_0.15s_ease-out]">
            {/* Header */}
            <div className="flex items-start justify-between mb-8">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-surface-1 border border-border-default flex items-center justify-center shrink-0">
                  <AgentIcon name={editing.icon} size={18} className="text-text-tertiary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-text-primary leading-tight">{editing.name}</h2>
                    <span className="text-[9px] px-1.5 py-0.5 bg-surface-2 text-text-tertiary rounded border border-border-default">{t('installedBadge')}</span>
                  </div>
                  <p className="text-xs text-text-tertiary mt-0.5">{t('installedSubtitle')}</p>
                </div>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-1 rounded-lg cursor-pointer transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Description */}
            {editing.description && (
              <div className="mb-6">
                <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wide mb-1.5">{t('descriptionLabel')}</div>
                <p className="text-sm text-text-secondary">{editing.description}</p>
              </div>
            )}

            {/* System Prompt */}
            <div className="mb-6">
              <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wide mb-1.5">{t('systemPromptLabel')}</div>
              <pre className="font-mono text-[11px] leading-relaxed text-text-secondary bg-surface-0 border border-border-default rounded-lg px-4 py-3 whitespace-pre-wrap break-words">{editing.systemPrompt}</pre>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              {editing.defaultModel && (
                <div>
                  <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wide mb-1">{t('defaultModelLabel')}</div>
                  <div className="text-xs text-text-secondary">{MODELS.find((m) => m.id === editing.defaultModel)?.name ?? editing.defaultModel}</div>
                </div>
              )}
              {editing.category && (
                <div>
                  <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wide mb-1">{t('categoryLabel')}</div>
                  <div className="text-xs text-text-secondary capitalize">{editing.category.replace('-', ' ')}</div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={handleTry} className="gap-1.5">
                <Play size={12} /> {t('tryButton')}
              </Button>
            </div>
          </div>
        </div>
      ) : editing ? (
        <div className="flex-1 overflow-y-auto">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSave(); }}
            className="max-w-2xl mx-auto px-6 pt-6 pb-4 animate-[fadeIn_0.15s_ease-out]"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-8">
              <div className="flex items-center gap-3.5">
                <IconPicker
                  value={editing.icon}
                  onChange={(icon) => setEditing({ ...editing, icon })}
                />
                <div>
                  <h2 className="text-base font-semibold text-text-primary leading-tight">
                    {editing.id ? editing.name || t('editHeading') : t('newHeading')}
                  </h2>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    {editing.id ? t('editSubtitle') : t('newSubtitle')}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-1 rounded-lg cursor-pointer transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Name + Description */}
            <div className="space-y-4 mb-6">
              <div className="space-y-1.5">
                <Label htmlFor="agent-name" className="text-xs font-medium text-text-secondary">
                  {t('nameLabel')} <span className="text-error">*</span>
                </Label>
                <Input
                  ref={nameRef}
                  id="agent-name"
                  value={editing.name}
                  onChange={(e) => { setEditing({ ...editing, name: e.target.value }); if (errors.name) setErrors((prev) => ({ ...prev, name: '' })); }}
                  placeholder={t('namePlaceholder')}
                  aria-invalid={!!errors.name}
                  className={errors.name ? 'border-error focus:border-error' : ''}
                />
                {errors.name && <p className="text-[10px] text-error mt-1">{errors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agent-desc" className="text-xs font-medium text-text-secondary">{t('descriptionLabel')}</Label>
                <Input
                  id="agent-desc"
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder={t('descriptionPlaceholder')}
                />
              </div>
            </div>

            {/* System Prompt — primary field, prominent */}
            <div className="mb-6">
              <div className="flex items-baseline justify-between mb-1.5">
                <Label htmlFor="agent-prompt" className="text-xs font-medium text-text-secondary">
                  {t('systemPromptLabel')} <span className="text-error">*</span>
                </Label>
                <span className="text-[10px] text-text-tertiary tabular-nums">
                  {promptLineCount} {promptLineCount === 1 ? 'line' : 'lines'}
                </span>
              </div>
              <Textarea
                id="agent-prompt"
                value={editing.systemPrompt}
                onChange={(e) => { setEditing({ ...editing, systemPrompt: e.target.value }); if (errors.systemPrompt) setErrors((prev) => ({ ...prev, systemPrompt: '' })); }}
                placeholder={t('systemPromptPlaceholder')}
                rows={Math.max(8, Math.min(promptLineCount + 2, 24))}
                className={`font-mono text-[11px] leading-relaxed resize-y ${errors.systemPrompt ? 'border-error focus:border-error' : ''}`}
                aria-invalid={!!errors.systemPrompt}
              />
              {errors.systemPrompt && <p className="text-[10px] text-error mt-1">{errors.systemPrompt}</p>}
            </div>

            {/* Model + Category */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-text-secondary">{t('defaultModelLabel')}</Label>
                <Select
                  value={editing.defaultModel}
                  onValueChange={(value) => setEditing({ ...editing, defaultModel: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectModelPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-text-secondary">{t('categoryLabel')}</Label>
                <Select
                  value={editing.category ?? ''}
                  onValueChange={(value) => setEditing({ ...editing, category: value || undefined })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('categoryPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="coding">{t('catCoding')}</SelectItem>
                    <SelectItem value="writing">{t('catWriting')}</SelectItem>
                    <SelectItem value="research">{t('catResearch')}</SelectItem>
                    <SelectItem value="data-analysis">{t('catData')}</SelectItem>
                    <SelectItem value="creative">{t('catCreative')}</SelectItem>
                    <SelectItem value="productivity">{t('catProductivity')}</SelectItem>
                    <SelectItem value="education">{t('catEducation')}</SelectItem>
                    <SelectItem value="business">{t('catBusiness')}</SelectItem>
                    <SelectItem value="other">{t('catOther')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Public toggle */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <Label className="text-xs font-medium text-text-secondary">{t('publicLabel')}</Label>
                <p className="text-[10px] text-text-tertiary mt-0.5">{t('publicHint')}</p>
              </div>
              <Switch
                checked={editing.isPublic ?? false}
                onCheckedChange={(checked) => setEditing({ ...editing, isPublic: checked })}
              />
            </div>

            {/* Tool Access */}
            <div className="mb-8">
              <div className="mb-2">
                <Label className="text-xs font-medium text-text-secondary">{t('toolsLabel')}</Label>
                <p className="text-[10px] text-text-tertiary mt-0.5">{t('toolsHint')}</p>
              </div>
              <TooltipProvider delayDuration={200}>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0 rounded-lg border border-border-default/50 px-3 py-1">
                  {AVAILABLE_TOOLS.map((tool) => {
                    const enabled = editing.tools ? editing.tools.includes(tool.id) : true;
                    return (
                      <div key={tool.id} className="flex items-center justify-between py-1.5">
                        <span className="flex items-center gap-1.5 text-[11px] text-text-primary">
                          {tool.label}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="text-text-tertiary hover:text-text-secondary transition-colors cursor-help">
                                <Info size={11} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[200px]">
                              {tool.description}
                            </TooltipContent>
                          </Tooltip>
                        </span>
                        <Switch
                          checked={enabled}
                          onCheckedChange={(checked) => {
                            const current = editing.tools ?? [...ALL_TOOL_IDS];
                            const next = checked
                              ? [...current, tool.id]
                              : current.filter((id) => id !== tool.id);
                            setEditing({ ...editing, tools: next });
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </TooltipProvider>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 sticky bottom-0 bg-bg/80 backdrop-blur-sm py-3 -mx-6 px-6">
              <Button type="submit" disabled={saving} className="gap-1.5">
                {saving ? (
                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save size={12} />
                )}
                {tc('save')}
              </Button>
              {editing.id && (
                <Button type="button" variant="outline" onClick={handleTry} className="gap-1.5">
                  <Play size={12} /> {t('tryButton')}
                </Button>
              )}
              <div className="flex-1" />
              {hasUnsavedChanges && (
                <span className="text-[10px] text-text-tertiary">{t('unsavedChanges')}</span>
              )}
              {editing.id && (
                <Button type="button" variant="ghost" onClick={handleDelete} className="gap-1.5 text-error/60 hover:text-error hover:bg-error/5">
                  <Trash2 size={12} /> {tc('delete')}
                </Button>
              )}
            </div>
          </form>

          {/* Feature Tabs — only for saved agents, outside form */}
          {editing.id && (
            <div className="max-w-2xl mx-auto px-6 pb-8">
              <div className="pt-2">
                <div className="flex gap-1 mb-5 bg-surface-0 border border-border-default rounded-lg p-1">
                  {[
                    { id: 'schedules', label: t('tabSchedules'), icon: Clock },
                    { id: 'runs', label: t('tabRunHistory'), icon: History },
                    { id: 'testCases', label: t('tabTestCases'), icon: TestTube2 },
                    { id: 'testRuns', label: t('tabTestRuns'), icon: FlaskConical },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                        activeTab === tab.id
                          ? 'bg-accent/10 text-accent'
                          : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-1'
                      }`}
                    >
                      <tab.icon size={12} />
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className={activeTab === 'schedules' ? '' : 'hidden'}><AgentScheduleManager agentPersonaId={editing.id} onTriggered={() => setActiveTab('runs')} /></div>
                <div className={activeTab === 'runs' ? '' : 'hidden'}><AgentRunHistory agentPersonaId={editing.id} /></div>
                <div className={activeTab === 'testCases' ? '' : 'hidden'}><TestSuitePanel agentPersonaId={editing.id} view="cases" /></div>
                <div className={activeTab === 'testRuns' ? '' : 'hidden'}><TestSuitePanel agentPersonaId={editing.id} view="runs" /></div>
              </div>
            </div>
          )}
        </div>
      ) : isInitialLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center animate-[fadeIn_0.2s_ease-out]">
          <div className="w-14 h-14 rounded-2xl bg-surface-0 border border-border-default flex items-center justify-center mb-4">
            <Bot size={24} className="text-text-tertiary opacity-30" />
          </div>
          <h2 className="text-sm font-medium text-text-primary mb-1">{t('noAgentSelected')}</h2>
          <p className="text-xs text-text-tertiary mb-5">{t('noAgentSelectedDesc')}</p>
          <button
            onClick={() => setEditing({ ...emptyAgent })}
            className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium bg-accent text-bg rounded-lg hover:bg-accent-hover cursor-pointer transition-colors"
          >
            <Plus size={12} /> {t('createAgent')}
          </button>
        </div>
      )}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={() => resolveConfirm(true)}
        onCancel={() => resolveConfirm(false)}
      />
    </PageShell>
  );
}
