'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import type { AgentPersona, AgentMode } from '@/lib/types';
import { Zap, ArrowLeft, X, Plus, Save, Play, Trash2, Globe, Lock, Check } from 'lucide-react';
import ConfirmDialog from './confirm-dialog';

const EMOJI_OPTIONS = ['🤖', '🧑‍💻', '👨‍🔬', '👩‍🎨', '⚙️', '📚', '🚀', '🧠', '🔮', '🎯', '💡', '🔥', '🌟', '⚡', '🧙', '👾'];

const MODEL_OPTIONS = [
  { label: 'Claude Sonnet 4.5', value: 'azure_ai/claude-sonnet-4-5-swc' },
  { label: 'Claude Opus 4.5', value: 'azure_ai/claude-opus-4-5-swc' },
  { label: 'GPT-5', value: 'gpt-5-gwc' },
  { label: 'GPT-5 Mini', value: 'gpt-5-mini-gwc' },
  { label: 'GPT-4.1', value: 'gpt-4.1-chn' },
  { label: 'GPT-4o', value: 'gpt-4o-swc' },
  { label: 'Llama 3.3 70B', value: 'Llama-3.3-70B-Instruct' },
];

const emptyAgent: AgentPersona = {
  id: '', name: '', icon: '🤖', description: '', systemPrompt: '',
  defaultModel: 'azure_ai/claude-sonnet-4-5-swc', defaultMode: 'chat', isPublic: false,
};

export default function AgentsView() {
  const router = useRouter();
  const setActivePersona = useStore((s) => s.setActivePersona);
  const setActiveModel = useStore((s) => s.setActiveModel);
  const setActiveMode = useStore((s) => s.setActiveMode);
  const confirmDialog = useStore((s) => s.confirmDialog);
  const resolveConfirm = useStore((s) => s.resolveConfirm);

  const [agents, setAgents] = useState<AgentPersona[]>([]);
  const [editing, setEditing] = useState<AgentPersona | null>(null);

  useEffect(() => { api.listAgents().then(setAgents).catch(() => setAgents([])); }, []);

  const handleSave = async () => {
    if (!editing || !editing.name.trim()) return;
    try {
      const data: Partial<AgentPersona> = { name: editing.name, icon: editing.icon, description: editing.description, systemPrompt: editing.systemPrompt, defaultModel: editing.defaultModel, defaultMode: editing.defaultMode, isPublic: editing.isPublic };
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
    if (editing.defaultMode) setActiveMode(editing.defaultMode);
    router.push('/');
  };

  return (
    <div className="flex flex-col h-screen bg-bg">
      <div className="flex items-center h-11 px-3 bg-surface-0 border-b border-border-default shrink-0">
        <button onClick={() => router.push('/')} className="flex items-center gap-1.5 cursor-pointer">
          <Zap size={14} className="text-accent" />
          <span className="text-sm font-bold tracking-[0.12em] uppercase">Nexus</span>
        </button>
        <div className="flex-1" />
        <button onClick={() => router.push('/')} className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary cursor-pointer">
          <ArrowLeft size={12} /> Workspace
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className={`flex-1 overflow-y-auto p-6 ${editing ? 'max-w-[60%]' : ''}`}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-semibold text-text-primary tracking-wide uppercase">Agent Personas</h2>
            <button onClick={() => setEditing({ ...emptyAgent })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-bg font-medium hover:bg-accent-hover cursor-pointer">
              <Plus size={12} /> New Persona
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setEditing({ ...agent })}
                className={`p-4 bg-surface-0 border text-left hover:border-border-focus transition-colors cursor-pointer ${
                  editing?.id === agent.id ? 'border-accent' : 'border-border-default'
                }`}
              >
                <div className="text-xl mb-2">{agent.icon || '🤖'}</div>
                <div className="text-xs font-medium text-text-primary truncate">{agent.name}</div>
                <div className="text-[11px] text-text-tertiary mt-1 truncate">{agent.description}</div>
                <div className="flex items-center gap-2 mt-2 text-[10px] text-text-tertiary font-mono">
                  <span>{agent.defaultModel?.split('/').pop() || 'Default'}</span>
                  <span className="flex items-center gap-0.5">
                    {agent.isPublic ? <Globe size={9} /> : <Lock size={9} />}
                    {agent.isPublic ? 'Public' : 'Private'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {editing && (
          <div className="w-[380px] bg-surface-0 border-l border-border-default p-5 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-semibold text-text-primary tracking-wide uppercase">
                {editing.id ? 'Edit Persona' : 'New Persona'}
              </h3>
              <button onClick={() => setEditing(null)} className="text-text-tertiary hover:text-text-primary cursor-pointer">
                <X size={14} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] text-text-tertiary mb-1 uppercase tracking-wide">Icon</label>
                <div className="flex flex-wrap gap-1">
                  {EMOJI_OPTIONS.map((e) => (
                    <button key={e} onClick={() => setEditing({ ...editing, icon: e })}
                      className={`w-7 h-7 flex items-center justify-center cursor-pointer text-sm ${editing.icon === e ? 'bg-accent/20 border border-accent' : 'border border-border-default hover:bg-surface-2'}`}
                    >{e}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-text-tertiary mb-1 uppercase tracking-wide">Name</label>
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Persona name"
                  className="w-full px-3 py-2 bg-surface-1 border border-border-default text-sm text-text-primary outline-none focus:border-border-focus" />
              </div>

              <div>
                <label className="block text-[10px] text-text-tertiary mb-1 uppercase tracking-wide">Description</label>
                <input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Brief description"
                  className="w-full px-3 py-2 bg-surface-1 border border-border-default text-sm text-text-primary outline-none focus:border-border-focus" />
              </div>

              <div>
                <label className="block text-[10px] text-text-tertiary mb-1 uppercase tracking-wide">System Prompt</label>
                <textarea value={editing.systemPrompt} onChange={(e) => setEditing({ ...editing, systemPrompt: e.target.value })} placeholder="Instructions..." rows={6}
                  className="w-full px-3 py-2 bg-surface-1 border border-border-default text-sm text-text-primary outline-none focus:border-border-focus resize-none font-mono" />
              </div>

              <div>
                <label className="block text-[10px] text-text-tertiary mb-1 uppercase tracking-wide">Default Model</label>
                <select value={editing.defaultModel} onChange={(e) => setEditing({ ...editing, defaultModel: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-1 border border-border-default text-sm text-text-primary outline-none focus:border-border-focus">
                  {MODEL_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-text-tertiary mb-1 uppercase tracking-wide">Default Mode</label>
                <select value={editing.defaultMode} onChange={(e) => setEditing({ ...editing, defaultMode: e.target.value as AgentMode })}
                  className="w-full px-3 py-2 bg-surface-1 border border-border-default text-sm text-text-primary outline-none focus:border-border-focus">
                  <option value="chat">Chat</option>
                  <option value="code">Code</option>
                  <option value="architect">Architect</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-[10px] text-text-tertiary uppercase tracking-wide">Public</label>
                <button onClick={() => setEditing({ ...editing, isPublic: !editing.isPublic })}
                  className={`w-8 h-4 flex items-center cursor-pointer transition-colors ${editing.isPublic ? 'bg-accent justify-end' : 'bg-surface-2 justify-start'}`}>
                  <div className="w-3.5 h-3.5 bg-white mx-px" />
                </button>
              </div>

              <div className="flex gap-1 pt-2">
                <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-accent text-bg text-xs font-medium hover:bg-accent-hover cursor-pointer">
                  <Save size={12} /> Save
                </button>
                {editing.id && (
                  <button onClick={handleTry} className="flex items-center justify-center gap-1.5 px-4 py-2 bg-surface-2 text-text-primary text-xs hover:bg-border-default cursor-pointer">
                    <Play size={12} /> Try
                  </button>
                )}
                {editing.id && (
                  <button onClick={handleDelete} className="flex items-center justify-center gap-1.5 px-4 py-2 text-error text-xs hover:bg-error/10 cursor-pointer">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={() => resolveConfirm(true)}
        onCancel={() => resolveConfirm(false)}
      />
    </div>
  );
}
