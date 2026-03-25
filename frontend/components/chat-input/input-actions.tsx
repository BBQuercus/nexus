'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Settings2, X, BookOpen, MessageSquare, LoaderCircle, GitCompare } from 'lucide-react';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import { IMAGE_MODELS, MODELS } from '@/lib/types';
import type { Message } from '@/lib/types';
import ModelPicker from '../model-picker';
import AgentPicker from '../agent-picker';
import KBPicker from '../kb-picker';
import type { AttachedContext, ComposeMode, SlashCommand, Verbosity, Creativity, Tone } from './types';
import { RESPONSE_COUNTS, CONTEXT_WINDOW, estimateTokens, VERBOSITY_OPTIONS, CREATIVITY_OPTIONS, TONE_OPTIONS } from './types';

// ── Token indicator ──

function TokenIndicator({ messages }: { messages: Message[] }) {
  const totalTokens = useMemo(() => {
    return messages.reduce((sum, msg) => {
      if (msg.cost) {
        return sum + msg.cost.inputTokens + msg.cost.outputTokens;
      }
      return sum + estimateTokens(msg.content);
    }, 0);
  }, [messages]);

  if (messages.length === 0) return null;

  const pct = totalTokens / CONTEXT_WINDOW;
  const colorClass = pct > 0.8
    ? 'text-error'
    : pct > 0.5
      ? 'text-yellow-500'
      : 'text-text-tertiary';

  const formatted = totalTokens >= 1000
    ? `~${(totalTokens / 1000).toFixed(1)}K`
    : `~${totalTokens}`;

  return (
    <span className={`text-[10px] font-mono ${colorClass} transition-colors`} title={`${totalTokens.toLocaleString()} tokens (~${(pct * 100).toFixed(0)}% of 128K context)`}>
      {formatted} tokens
    </span>
  );
}

// ── Chat settings popover ──

interface ChatSettingsProps {
  numResponses: number;
  setNumResponses: (n: number) => void;
  verbosity: Verbosity;
  setVerbosity: (v: Verbosity) => void;
  creativity: Creativity;
  setCreativity: (c: Creativity) => void;
  tone: Tone;
  setTone: (t: Tone) => void;
}

function SettingRow({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1.5">{label}</div>
      <div className="flex items-center gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`flex-1 px-1.5 py-1 text-[11px] rounded-md border cursor-pointer transition-all capitalize ${
              value === opt
                ? 'text-accent bg-accent/10 border-accent/30'
                : 'text-text-tertiary bg-surface-1 border-border-default hover:border-border-focus hover:text-text-secondary'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatSettings({ numResponses, setNumResponses, verbosity, setVerbosity, creativity, setCreativity, tone, setTone }: ChatSettingsProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const hasCustomSettings = numResponses > 1 || verbosity !== 'balanced' || creativity !== 'balanced' || tone !== 'professional';

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative ml-auto hidden sm:block">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center justify-center w-7 h-7 rounded-lg border transition-all cursor-pointer ${
          open || hasCustomSettings
            ? 'text-accent bg-accent/10 border-accent/30'
            : 'text-text-tertiary bg-surface-1 border-border-default hover:border-border-focus hover:text-text-secondary'
        }`}
        title="Chat settings"
      >
        <Settings2 size={13} />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-1.5 w-60 bg-surface-0 border border-border-default rounded-lg shadow-2xl shadow-black/40 z-50 p-3 space-y-3">
          <div>
            <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1.5">Responses per turn</div>
            <div className="flex items-center gap-1">
              {RESPONSE_COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setNumResponses(n)}
                  className={`flex-1 px-1.5 py-1 text-[11px] font-mono rounded-md border cursor-pointer transition-all ${
                    numResponses === n
                      ? 'text-accent bg-accent/10 border-accent/30'
                      : 'text-text-tertiary bg-surface-1 border-border-default hover:border-border-focus hover:text-text-secondary'
                  }`}
                >
                  {n}x
                </button>
              ))}
            </div>
          </div>
          <SettingRow label="Verbosity" options={VERBOSITY_OPTIONS} value={verbosity} onChange={(v) => setVerbosity(v as Verbosity)} />
          <SettingRow label="Creativity" options={CREATIVITY_OPTIONS} value={creativity} onChange={(v) => setCreativity(v as Creativity)} />
          <SettingRow label="Tone" options={TONE_OPTIONS} value={tone} onChange={(v) => setTone(v as Tone)} />
        </div>
      )}
    </div>
  );
}

// ── Context chips (KB + conversation references) ──

interface ContextChipsProps {
  activeKBIds: string[];
  attachedContexts: AttachedContext[];
  onRemoveContext: (id: string) => void;
}

export function ContextChips({ activeKBIds, attachedContexts, onRemoveContext }: ContextChipsProps) {
  const toggleKB = useStore((s) => s.toggleKnowledgeBase);
  const [kbNames, setKbNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (activeKBIds.length === 0) return;
    const missing = activeKBIds.filter((id) => !kbNames[id]);
    if (missing.length === 0) return;
    api.listKnowledgeBases().then((kbs) => {
      const map: Record<string, string> = { ...kbNames };
      kbs.forEach((kb) => { map[kb.id] = kb.name; });
      setKbNames(map);
    }).catch(() => {});
  }, [activeKBIds]); // eslint-disable-line react-hooks/exhaustive-deps

  if (activeKBIds.length === 0 && attachedContexts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {activeKBIds.map((kbId) => (
        <div key={kbId} className="flex items-center gap-1.5 px-2 py-1 bg-accent/10 border border-accent/20 rounded-lg text-[11px] text-accent">
          <BookOpen size={10} />
          <span className="truncate max-w-[160px]">{kbNames[kbId] || 'Knowledge Base'}</span>
          <button onClick={() => toggleKB(kbId)} className="text-accent/60 hover:text-accent cursor-pointer">
            <X size={10} />
          </button>
        </div>
      ))}
      {attachedContexts.map((ctx) => (
        <div key={ctx.id} className="flex items-center gap-1.5 px-2 py-1 bg-accent/10 border border-accent/20 rounded-lg text-[11px] text-accent">
          <MessageSquare size={10} />
          <span className="truncate max-w-[160px]">{ctx.title}</span>
          <button onClick={() => onRemoveContext(ctx.id)} className="text-accent/60 hover:text-accent cursor-pointer">
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Image generation indicator ──

export function ImageGeneratingIndicator({ imageModel }: { imageModel: string }) {
  return (
    <div className="mb-2 flex items-center gap-2.5 px-3 py-2 bg-accent/10 border border-accent/20 rounded-lg">
      <LoaderCircle size={14} className="text-accent animate-spin shrink-0" />
      <div className="min-w-0 text-[11px] text-text-secondary">
        Generating with {IMAGE_MODELS.find((model) => model.id === imageModel)?.name || imageModel}
      </div>
    </div>
  );
}

// ── Compare models banner ──

export function CompareModelsBanner({ compareModels, onCancel }: { compareModels: string[]; onCancel: () => void }) {
  if (compareModels.length < 2) return null;

  return (
    <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-accent/8 border border-accent/20 rounded-lg">
      <GitCompare size={12} className="text-accent shrink-0" />
      <span className="text-[11px] text-text-secondary">Comparing:</span>
      <div className="flex items-center gap-1.5 flex-wrap flex-1">
        {compareModels.map((id) => (
          <span key={id} className="px-1.5 py-0.5 text-[10px] font-medium bg-accent/10 text-accent rounded border border-accent/20">
            {MODELS.find((m) => m.id === id)?.name || id.split('/').pop()}
          </span>
        ))}
      </div>
      <button
        onClick={onCancel}
        className="text-text-tertiary hover:text-text-secondary cursor-pointer shrink-0"
        title="Cancel compare"
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ── Slash command menu ──

interface SlashMenuProps {
  open: boolean;
  commands: SlashCommand[];
  highlightIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onHover: (index: number) => void;
  setContent: (value: string) => void;
  setSlashMenuOpen: (open: boolean) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function SlashMenu({ open, commands, highlightIndex, onSelect, onHover, setContent, setSlashMenuOpen, textareaRef }: SlashMenuProps) {
  if (!open || commands.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-surface-0 border border-border-default rounded-lg shadow-xl overflow-hidden z-20 animate-fade-in-up" style={{ animationDuration: '0.1s' }}>
      <div className="py-1">
        <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-text-tertiary font-mono">
          Slash Commands
        </div>
        {commands.map((cmd, idx) => (
          <button
            key={cmd.name}
            onClick={() => {
              if (cmd.hint) {
                setContent(`/${cmd.name} `);
                setSlashMenuOpen(false);
                textareaRef.current?.focus();
              } else {
                onSelect(cmd);
              }
            }}
            onMouseEnter={() => onHover(idx)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer transition-colors ${
              idx === highlightIndex
                ? 'bg-accent/10 text-text-primary'
                : 'text-text-secondary hover:bg-surface-1'
            }`}
          >
            <span className="text-text-tertiary w-4 shrink-0">{cmd.icon}</span>
            <span className="font-mono text-accent">/{cmd.name}</span>
            <span className="text-text-tertiary ml-1">{cmd.description.replace(/^[^—]*— ?/, '')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Mention menu ──

interface MentionMenuProps {
  open: boolean;
  results: { id: string; title: string }[];
  highlightIndex: number;
  onSelect: (conv: { id: string; title: string }) => void;
  onHover: (index: number) => void;
}

export function MentionMenu({ open, results, highlightIndex, onSelect, onHover }: MentionMenuProps) {
  if (!open || results.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-surface-0 border border-border-default rounded-lg shadow-xl overflow-hidden z-20 animate-fade-in-up" style={{ animationDuration: '0.1s' }}>
      <div className="py-1">
        <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-text-tertiary font-mono">
          Reference a conversation
        </div>
        {results.map((conv, idx) => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv)}
            onMouseEnter={() => onHover(idx)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer transition-colors ${
              idx === highlightIndex ? 'bg-accent/10 text-text-primary' : 'text-text-secondary hover:bg-surface-1'
            }`}
          >
            <MessageSquare size={12} className="text-text-tertiary shrink-0" />
            <span className="truncate">{conv.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Slash hint bar ──

export function SlashHintBar({ command }: { command: SlashCommand | null }) {
  if (!command) return null;

  return (
    <div className="flex items-center gap-2 mb-1.5 px-1">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono font-medium bg-accent/10 text-accent border border-accent/20 rounded-md">
        {command.icon}
        /{command.name}
      </span>
      <span className="text-[11px] text-text-tertiary">{command.hint}</span>
    </div>
  );
}

// ── Bottom action bar ──

interface InputActionsBarProps {
  composeMode: ComposeMode;
  imageModel: string;
  setImageModel: (model: string) => void;
  numResponses: number;
  setNumResponses: (n: number) => void;
  verbosity: Verbosity;
  setVerbosity: (v: Verbosity) => void;
  creativity: Creativity;
  setCreativity: (c: Creativity) => void;
  tone: Tone;
  setTone: (t: Tone) => void;
  isStreaming: boolean;
}

export function InputActionsBar({ composeMode, imageModel, setImageModel, numResponses, setNumResponses, verbosity, setVerbosity, creativity, setCreativity, tone, setTone, isStreaming }: InputActionsBarProps) {
  return (
    <div className="mt-2 flex items-center gap-3 pb-0.5">
      <ModelPicker disabled={composeMode === 'image'} disabledReason="Locked while in image mode" />
      <AgentPicker />
      <KBPicker />
      {composeMode === 'image' && (
        <ModelPicker models={IMAGE_MODELS} value={imageModel} onChange={setImageModel} />
      )}
      <div className="flex-1" />
      {!isStreaming && (
        <ChatSettings numResponses={numResponses} setNumResponses={setNumResponses} verbosity={verbosity} setVerbosity={setVerbosity} creativity={creativity} setCreativity={setCreativity} tone={tone} setTone={setTone} />
      )}
    </div>
  );
}
