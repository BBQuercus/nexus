'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import type { AgentPersona, AgentMode } from '@/lib/types';
import { Zap, ArrowLeft, X, Plus, Save, Play, Trash2, Globe, Lock } from 'lucide-react';
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

  // Auto-open editor with pre-filled data from URL params
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const name = params.get('name');
    const prompt = params.get('prompt');
    const mode = params.get('mode');
    const model = params.get('model');
    if (name || prompt) {
      setEditing({
        ...emptyAgent,
        name: name || '',
        systemPrompt: prompt || '',
        defaultMode: (mode as AgentMode) || emptyAgent.defaultMode,
        defaultModel: model || emptyAgent.defaultModel,
      });
      window.history.replaceState({}, '', '/agents');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      {/* Header - matches admin page pattern */}
      <div className="flex items-center h-11 px-3 bg-surface-0 border-b border-border-default shrink-0">
        <button onClick={() => router.push('/')} className="flex items-center gap-1.5 cursor-pointer mr-4">
          <Zap size={14} className="text-accent" />
          <span className="text-sm font-bold tracking-[0.12em] uppercase">Nexus</span>
        </button>
        <div className="h-4 w-px bg-border-default mr-3" />
        <span className="text-[11px] text-text-tertiary uppercase tracking-wider mr-6">Agents</span>
        <div className="flex-1" />
        <button
          onClick={() => setEditing({ ...emptyAgent })}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-accent text-bg rounded-md hover:bg-accent-hover cursor-pointer transition-colors mr-3"
        >
          <Plus size={12} /> New Agent
        </button>
        <button onClick={() => router.push('/')} className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-secondary cursor-pointer">
          <ArrowLeft size={11} /> Workspace
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Agent list */}
        <div className={`flex-1 overflow-y-auto ${editing ? 'max-w-[60%]' : ''}`}>
          {agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-text-tertiary">
              <div className="text-2xl mb-2">🤖</div>
              <div className="text-xs">No agents yet</div>
              <button
                onClick={() => setEditing({ ...emptyAgent })}
                className="mt-3 text-[11px] text-accent hover:text-accent-hover cursor-pointer"
              >
                Create your first agent
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border-default">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => setEditing({ ...agent })}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-1 transition-colors cursor-pointer ${
                    editing?.id === agent.id ? 'bg-accent/5 border-l-2 border-accent' : 'border-l-2 border-transparent'
                  }`}
                >
                  <span className="text-lg shrink-0">{agent.icon || '🤖'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-text-primary truncate">{agent.name}</div>
                    {agent.description && (
                      <div className="text-[11px] text-text-tertiary mt-0.5 truncate">{agent.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-text-tertiary font-mono bg-surface-1 border border-border-default rounded px-1.5 py-0.5">
                      {agent.defaultModel?.split('/').pop() || 'Default'}
                    </span>
                    <span className="flex items-center gap-0.5 text-[10px] text-text-tertiary">
                      {agent.isPublic ? <Globe size={9} /> : <Lock size={9} />}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Editor panel */}
        {editing && (
          <div className="w-[380px] bg-surface-0 border-l border-border-default overflow-y-auto shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
              <h3 className="text-[11px] font-semibold text-text-tertiary tracking-wider uppercase">
                {editing.id ? 'Edit Agent' : 'New Agent'}
              </h3>
              <button onClick={() => setEditing(null)} className="text-text-tertiary hover:text-text-primary cursor-pointer">
                <X size={14} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] text-text-tertiary mb-1.5 uppercase tracking-wide">Icon</label>
                <div className="flex flex-wrap gap-1">
                  {EMOJI_OPTIONS.map((e) => (
                    <button key={e} onClick={() => setEditing({ ...editing, icon: e })}
                      className={`w-7 h-7 flex items-center justify-center cursor-pointer text-sm rounded-md transition-colors ${editing.icon === e ? 'bg-accent/20 border border-accent' : 'border border-border-default hover:bg-surface-2'}`}
                    >{e}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-text-tertiary mb-1.5 uppercase tracking-wide">Name</label>
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Agent name"
                  className="w-full px-3 py-2 bg-surface-1 border border-border-default rounded-md text-xs text-text-primary outline-none focus:border-border-focus transition-colors" />
              </div>

              <div>
                <label className="block text-[10px] text-text-tertiary mb-1.5 uppercase tracking-wide">Description</label>
                <input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Brief description"
                  className="w-full px-3 py-2 bg-surface-1 border border-border-default rounded-md text-xs text-text-primary outline-none focus:border-border-focus transition-colors" />
              </div>

              <div>
                <label className="block text-[10px] text-text-tertiary mb-1.5 uppercase tracking-wide">System Prompt</label>
                <textarea value={editing.systemPrompt} onChange={(e) => setEditing({ ...editing, systemPrompt: e.target.value })} placeholder="Instructions..." rows={6}
                  className="w-full px-3 py-2 bg-surface-1 border border-border-default rounded-md text-xs text-text-primary outline-none focus:border-border-focus resize-none font-mono transition-colors" />
              </div>

              <div>
                <label className="block text-[10px] text-text-tertiary mb-1.5 uppercase tracking-wide">Default Model</label>
                <select value={editing.defaultModel} onChange={(e) => setEditing({ ...editing, defaultModel: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-1 border border-border-default rounded-md text-xs text-text-primary outline-none focus:border-border-focus transition-colors">
                  {MODEL_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-text-tertiary mb-1.5 uppercase tracking-wide">Default Mode</label>
                <select value={editing.defaultMode} onChange={(e) => setEditing({ ...editing, defaultMode: e.target.value as AgentMode })}
                  className="w-full px-3 py-2 bg-surface-1 border border-border-default rounded-md text-xs text-text-primary outline-none focus:border-border-focus transition-colors">
                  <option value="chat">Chat</option>
                  <option value="code">Code</option>
                  <option value="architect">Architect</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-[10px] text-text-tertiary uppercase tracking-wide">Public</label>
                <button onClick={() => setEditing({ ...editing, isPublic: !editing.isPublic })}
                  className={`w-8 h-[18px] rounded-full flex items-center cursor-pointer transition-colors ${editing.isPublic ? 'bg-accent justify-end' : 'bg-surface-2 justify-start'}`}>
                  <div className={`w-3.5 h-3.5 rounded-full bg-white mx-[2px] transition-all ${!editing.isPublic ? 'opacity-50' : ''}`} />
                </button>
              </div>

              <div className="flex gap-1.5 pt-2">
                <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-accent text-bg text-[11px] font-medium rounded-md hover:bg-accent-hover cursor-pointer transition-colors">
                  <Save size={12} /> Save
                </button>
                {editing.id && (
                  <button onClick={handleTry} className="flex items-center justify-center gap-1.5 px-4 py-2 bg-surface-1 border border-border-default text-text-primary text-[11px] rounded-md hover:bg-surface-2 cursor-pointer transition-colors">
                    <Play size={12} /> Try
                  </button>
                )}
                {editing.id && (
                  <button onClick={handleDelete} className="flex items-center justify-center gap-1.5 px-4 py-2 text-error text-[11px] rounded-md hover:bg-error/10 cursor-pointer transition-colors">
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
