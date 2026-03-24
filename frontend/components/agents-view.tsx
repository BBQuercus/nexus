'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import { DEFAULT_MODEL_ID, MODELS, type AgentPersona } from '@/lib/types';
import { X, Plus, Save, Play, Trash2, Bot } from 'lucide-react';
import * as icons from 'lucide-react';
import PageShell from './page-shell';
import ConfirmDialog from './confirm-dialog';
import IconPicker from './icon-picker';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select } from './ui/select';
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
  const router = useRouter();
  const setActivePersona = useStore((s) => s.setActivePersona);
  const setActiveModel = useStore((s) => s.setActiveModel);
  const confirmDialog = useStore((s) => s.confirmDialog);
  const resolveConfirm = useStore((s) => s.resolveConfirm);

  const [agents, setAgents] = useState<AgentPersona[]>([]);
  const [editing, setEditing] = useState<AgentPersona | null>(null);

  useEffect(() => { api.listAgents().then(setAgents).catch(() => setAgents([])); }, []);

  // Auto-open editor with pre-filled data from URL params
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      title: `Delete "${editing.name}"?`,
      message: 'This persona will be permanently removed.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try { await api.deleteAgent(editing.id); setAgents(await api.listAgents()); setEditing(null); }
    catch (e) { console.error('Failed to delete agent:', e); }
  };

  const handleTry = () => {
    if (!editing) return;
    setActivePersona(editing);
    if (editing.defaultModel) setActiveModel(editing.defaultModel);
    router.push('/');
  };

  const agentsSidebar = (
    <>
      {/* New agent button */}
      <div className="px-3 py-2.5">
        <button
          onClick={() => setEditing({ ...emptyAgent })}
          className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] font-medium bg-accent text-bg rounded-lg hover:bg-accent-hover cursor-pointer transition-colors"
        >
          <Plus size={12} /> New Agent
        </button>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto px-2">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
            <Bot size={24} className="mb-2 opacity-40" />
            <div className="text-xs">No agents yet</div>
          </div>
        ) : (
          agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setEditing({ ...agent })}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 text-left rounded-lg transition-colors cursor-pointer mb-0.5 ${
                editing?.id === agent.id
                  ? 'bg-accent/8 text-text-primary border-l-2 border-accent'
                  : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary border-l-2 border-transparent'
              }`}
            >
              <div className="w-7 h-7 rounded-md bg-surface-2 border border-border-default flex items-center justify-center shrink-0">
                <AgentIcon name={agent.icon} size={14} className="text-text-tertiary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{agent.name}</div>
                {agent.description && (
                  <div className="text-[10px] text-text-tertiary mt-0.5 truncate">{agent.description}</div>
                )}
              </div>
            </button>
          ))
        )}
      </div>

    </>
  );

  return (
    <PageShell title="Agents" sidebar={agentsSidebar}>
      {editing ? (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-semibold text-text-primary">
                {editing.id ? 'Edit Agent' : 'New Agent'}
              </h3>
              <button onClick={() => setEditing(null)} className="text-text-tertiary hover:text-text-primary cursor-pointer">
                <X size={14} />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <Label>Icon</Label>
                <IconPicker
                  value={editing.icon}
                  onChange={(icon) => setEditing({ ...editing, icon })}
                />
              </div>

              <div>
                <Label htmlFor="agent-name">Name</Label>
                <Input
                  id="agent-name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Agent name"
                />
              </div>

              <div>
                <Label htmlFor="agent-desc">Description</Label>
                <Input
                  id="agent-desc"
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Brief description"
                />
              </div>

              <div>
                <Label htmlFor="agent-prompt">System Prompt</Label>
                <Textarea
                  id="agent-prompt"
                  value={editing.systemPrompt}
                  onChange={(e) => setEditing({ ...editing, systemPrompt: e.target.value })}
                  placeholder="Instructions for this agent..."
                  rows={8}
                />
              </div>

              <div>
                <Label htmlFor="agent-model">Default Model</Label>
                <Select
                  id="agent-model"
                  value={editing.defaultModel}
                  onChange={(e) => setEditing({ ...editing, defaultModel: e.target.value })}
                >
                  {MODEL_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </Select>
              </div>

              <div className="flex items-center justify-between py-1">
                <Label className="mb-0">Public</Label>
                <Switch
                  checked={editing.isPublic ?? false}
                  onCheckedChange={(checked) => setEditing({ ...editing, isPublic: checked })}
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-border-default">
                <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-accent text-bg text-[11px] font-medium rounded-lg hover:bg-accent-hover cursor-pointer transition-colors">
                  <Save size={12} /> Save
                </button>
                {editing.id && (
                  <button onClick={handleTry} className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-surface-1 border border-border-default text-text-primary text-[11px] rounded-lg hover:bg-surface-2 cursor-pointer transition-colors">
                    <Play size={12} /> Try
                  </button>
                )}
                {editing.id && (
                  <button onClick={handleDelete} className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-error text-[11px] rounded-lg hover:bg-error/10 cursor-pointer transition-colors">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-text-tertiary">
          <Bot size={28} className="mb-2 opacity-30" />
          <div className="text-xs">Select an agent or create a new one</div>
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
