'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import { DEFAULT_MODEL_ID, MODELS, type AgentPersona } from '@/lib/types';
import { X, Plus, Save, Play, Trash2, Bot, Search } from 'lucide-react';
import * as icons from 'lucide-react';
import PageShell from './page-shell';
import ConfirmDialog from './confirm-dialog';
import IconPicker from './icon-picker';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { Switch } from './ui/switch';

const MODEL_OPTIONS = MODELS.map((model) => ({ label: model.name, value: model.id }));

const emptyAgent: AgentPersona = {
  id: '', name: '', icon: 'Bot', description: '', systemPrompt: '',
  defaultModel: DEFAULT_MODEL_ID, isPublic: false,
};

function AgentIcon({ name, size = 14, className = '' }: { name: string; size?: number; className?: string }) {
  const Icon = (icons as unknown as Record<string, icons.LucideIcon>)[name] || Bot;
  return <Icon size={size} className={className} />;
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

  useEffect(() => { api.listAgents().then(setAgents).catch(() => setAgents([])); }, []);

  useEffect(() => {
    if (!editing && agents && agents.length > 0) {
      setEditing({ ...agents[0] });
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

  const isInitialLoading = agents === null && editing === null;
  const filtered = agents?.filter((a) =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.description?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const handleSave = async () => {
    if (!editing || !editing.name.trim()) return;
    try {
      const data: Partial<AgentPersona> = { name: editing.name, icon: editing.icon, description: editing.description, systemPrompt: editing.systemPrompt, defaultModel: editing.defaultModel, isPublic: editing.isPublic };
      if (editing.id) await api.updateAgent(editing.id, data);
      else await api.createAgent(data);
      setAgents(await api.listAgents());
      setEditing(null);
    } catch (e) { console.error('Failed to save agent:', e); }
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
    try { await api.deleteAgent(editing.id); setAgents(await api.listAgents()); setEditing(null); }
    catch (e) { console.error('Failed to delete agent:', e); }
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
    } catch (e) { console.error('Failed to create conversation:', e); }
    router.push('/');
  };

  const agentsSidebar = (
    <div className="flex flex-col h-full">
      {/* New agent + search */}
      <div className="px-3 py-3 space-y-2">
        <button
          onClick={() => setEditing({ ...emptyAgent })}
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

      {/* Agent list */}
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
            {filtered.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setEditing({ ...agent })}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 text-left rounded-lg transition-all cursor-pointer ${
                  editing?.id === agent.id
                    ? 'bg-accent/8 text-text-primary border-l-2 border-accent -ml-px'
                    : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                  editing?.id === agent.id ? 'bg-accent/10 border-accent/20' : 'bg-surface-1 border-border-default'
                }`}>
                  <AgentIcon name={agent.icon} size={14} className={editing?.id === agent.id ? 'text-accent' : 'text-text-tertiary'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{agent.name}</div>
                  {agent.description && (
                    <div className="text-[10px] text-text-tertiary mt-0.5 truncate">{agent.description}</div>
                  )}
                </div>
                {agent.isPublic && (
                  <span className="text-[9px] px-1 py-0.5 bg-accent/10 text-accent rounded shrink-0">{t('publicBadge')}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <PageShell title={t('pageTitle')} sidebar={agentsSidebar}>
      {editing ? (
        <div className="flex-1 overflow-y-auto p-6 animate-[fadeIn_0.15s_ease-out]">
          <div className="max-w-2xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                  editing.id ? 'bg-surface-0 border-border-default' : 'bg-accent/10 border-accent/20'
                }`}>
                  <AgentIcon name={editing.icon} size={18} className={editing.id ? 'text-text-tertiary' : 'text-accent'} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">
                    {editing.id ? editing.name || t('editHeading') : t('newHeading')}
                  </h2>
                  <p className="text-[10px] text-text-tertiary">
                    {editing.id ? t('editSubtitle') : t('newSubtitle')}
                  </p>
                </div>
              </div>
              <button onClick={() => setEditing(null)} className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-1 rounded-lg cursor-pointer transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Identity Section */}
            <div className="bg-surface-0 border border-border-default rounded-xl p-5 mb-4">
              <h3 className="text-[11px] text-text-tertiary uppercase tracking-wider font-medium mb-4">{t('identitySection')}</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-[1fr_auto] gap-4">
                  <div>
                    <Label htmlFor="agent-name" className="text-xs font-medium text-text-secondary mb-1.5">{t('nameLabel')}</Label>
                    <Input
                      id="agent-name"
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      placeholder={t('namePlaceholder')}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-text-secondary mb-1.5">{t('iconLabel')}</Label>
                    <IconPicker
                      value={editing.icon}
                      onChange={(icon) => setEditing({ ...editing, icon })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="agent-desc" className="text-xs font-medium text-text-secondary mb-1.5">{t('descriptionLabel')}</Label>
                  <Input
                    id="agent-desc"
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    placeholder={t('descriptionPlaceholder')}
                  />
                </div>
              </div>
            </div>

            {/* Configuration Section */}
            <div className="bg-surface-0 border border-border-default rounded-xl p-5 mb-4">
              <h3 className="text-[11px] text-text-tertiary uppercase tracking-wider font-medium mb-4">{t('configSection')}</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="agent-prompt" className="text-xs font-medium text-text-secondary mb-1.5">{t('systemPromptLabel')}</Label>
                  <Textarea
                    id="agent-prompt"
                    value={editing.systemPrompt}
                    onChange={(e) => setEditing({ ...editing, systemPrompt: e.target.value })}
                    placeholder={t('systemPromptPlaceholder')}
                    rows={10}
                    className="font-mono text-[11px] leading-relaxed"
                  />
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
                  <div>
                    <Label className="text-xs font-medium text-text-secondary mb-1.5">{t('defaultModelLabel')}</Label>
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
                  <div className="flex items-center gap-2.5 pb-1">
                    <Label className="mb-0 text-xs text-text-tertiary">{t('publicLabel')}</Label>
                    <Switch
                      checked={editing.isPublic ?? false}
                      onCheckedChange={(checked) => setEditing({ ...editing, isPublic: checked })}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button onClick={handleSave} className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-accent text-bg text-[11px] font-medium rounded-lg hover:bg-accent-hover cursor-pointer transition-colors">
                <Save size={12} /> {tc('save')}
              </button>
              {editing.id && (
                <button onClick={handleTry} className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-surface-0 border border-border-default text-text-primary text-[11px] font-medium rounded-lg hover:bg-surface-1 cursor-pointer transition-colors">
                  <Play size={12} /> {t('tryButton')}
                </button>
              )}
              <div className="flex-1" />
              {editing.id && (
                <button onClick={handleDelete} className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-error/60 hover:text-error text-[11px] rounded-lg hover:bg-error/5 cursor-pointer transition-colors">
                  <Trash2 size={12} /> {tc('delete')}
                </button>
              )}
            </div>
          </div>
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
