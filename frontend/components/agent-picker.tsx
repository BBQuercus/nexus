'use client';

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import type { AgentPersona } from '@/lib/types';
import { Bot, ChevronDown, X, Check, Lock } from 'lucide-react';
import * as icons from 'lucide-react';

function AgentIcon({ name, size = 13, className = '' }: { name: string; size?: number; className?: string }) {
  const Icon = (icons as unknown as Record<string, icons.LucideIcon>)[name] || Bot;
  return <Icon size={size} className={className} />;
}

export default function AgentPicker() {
  const activePersona = useStore((s) => s.activePersona);
  const setActivePersona = useStore((s) => s.setActivePersona);
  const setActiveModel = useStore((s) => s.setActiveModel);
  const messages = useStore((s) => s.messages);
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<AgentPersona[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // Locked once conversation has messages — can't switch persona mid-conversation
  const isLocked = messages.length > 0;

  useEffect(() => {
    if (open && agents.length === 0) {
      api.listAgents().then(setAgents).catch(() => {});
    }
  }, [open, agents.length]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  if (isLocked && !activePersona) return null; // No persona set, conversation started — hide picker entirely

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <button
        onClick={() => !isLocked && setOpen(!open)}
        className={`flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-lg transition-all ${
          isLocked ? 'cursor-default' : 'cursor-pointer'
        } ${
          activePersona
            ? isLocked
              ? 'bg-surface-1 border border-border-default text-text-secondary'
              : 'bg-accent/10 border border-accent/20 text-accent hover:bg-accent/15'
            : 'text-text-tertiary bg-surface-1 border border-border-default hover:border-border-focus hover:text-text-secondary'
        }`}
        title={isLocked ? `Agent: ${activePersona?.name} (locked for this conversation)` : 'Select agent'}
      >
        {activePersona ? (
          <AgentIcon name={activePersona.icon} size={12} className="shrink-0" />
        ) : (
          <Bot size={12} className="shrink-0" />
        )}
        <span className="truncate max-w-[120px]">{activePersona?.name || 'Agent'}</span>
        {isLocked ? (
          <Lock size={9} className="shrink-0 text-text-tertiary" />
        ) : (
          <ChevronDown size={10} className={`transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {!isLocked && activePersona && (
        <button
          onClick={() => setActivePersona(null)}
          title="Clear agent"
          className="p-1 text-text-tertiary hover:text-text-secondary cursor-pointer rounded hover:bg-surface-1 transition-colors"
        >
          <X size={12} />
        </button>
      )}

      {open && !isLocked && (
        <div className="absolute bottom-full left-0 mb-1.5 w-64 max-h-72 overflow-y-auto bg-surface-0 border border-border-default rounded-lg shadow-2xl shadow-black/40 z-50">
          {activePersona && (
            <button
              onClick={() => { setActivePersona(null); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:bg-surface-1 cursor-pointer transition-colors border-b border-border-default"
            >
              <X size={12} className="text-text-tertiary shrink-0" />
              <span>No agent (default)</span>
            </button>
          )}
          {agents.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] text-text-tertiary">
              No agents yet.{' '}
              <a href="/agents" className="text-accent hover:underline">Create one</a>
            </div>
          ) : (
            agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => { setActivePersona(agent); if (agent.defaultModel) setActiveModel(agent.defaultModel); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-1 transition-colors cursor-pointer ${
                  agent.id === activePersona?.id ? 'bg-surface-1' : ''
                }`}
              >
                <div className="w-6 h-6 rounded-md bg-surface-2 border border-border-default flex items-center justify-center shrink-0">
                  <AgentIcon name={agent.icon} size={12} className="text-text-tertiary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-primary truncate">{agent.name}</div>
                  {agent.description && (
                    <div className="text-[10px] text-text-tertiary truncate">{agent.description}</div>
                  )}
                </div>
                {agent.id === activePersona?.id && <Check size={13} className="text-accent shrink-0" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
