'use client';

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { logout as apiLogout } from '@/lib/api';
import { clearToken } from '@/lib/auth';
import { Zap, Command, PanelRight, PanelLeft, Network, LogOut, User, Settings, Keyboard, Shield, X, MessageSquare, Code, Compass, ExternalLink } from 'lucide-react';
import SandboxBar from './sandbox-bar';
import type { AgentMode } from '@/lib/types';

const MODE_LABELS: Record<AgentMode, { label: string; icon: React.ReactNode }> = {
  chat: { label: 'Chat', icon: <MessageSquare size={11} /> },
  code: { label: 'Code', icon: <Code size={11} /> },
  architect: { label: 'Architect', icon: <Compass size={11} /> },
};

const DEFAULT_SYSTEM_PROMPTS: Record<AgentMode, string> = {
  chat: `You are a helpful AI assistant. You answer questions clearly, concisely, and accurately. When you don't know something, you say so.`,
  code: `You are an expert software engineer. You write clean, efficient, well-documented code. You use best practices and modern patterns. When given a task, you think step-by-step, consider edge cases, and produce production-quality code.`,
  architect: `You are a senior software architect. You design scalable, maintainable systems. You consider trade-offs, suggest appropriate technologies, and create clear technical plans. You think about performance, security, and developer experience.`,
};

function SystemPromptPanel({ onClose }: { onClose: () => void }) {
  const activeMode = useStore((s) => s.activeMode);
  const setActiveMode = useStore((s) => s.setActiveMode);
  const activePersona = useStore((s) => s.activePersona);
  const [selectedMode, setSelectedMode] = useState<AgentMode>(activeMode);

  const handleModeSwitch = (mode: AgentMode) => {
    setSelectedMode(mode);
    setActiveMode(mode);
  };

  const handleSaveAsAgent = () => {
    const prompt = activePersona?.systemPrompt || DEFAULT_SYSTEM_PROMPTS[selectedMode];
    const name = activePersona?.name || MODE_LABELS[selectedMode].label + ' Agent';
    const params = new URLSearchParams({ name, prompt, mode: selectedMode });
    window.location.href = `/agents?${params.toString()}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[60px]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-lg bg-surface-0 border border-border-default rounded-xl shadow-2xl shadow-black/30 animate-fade-in-up overflow-hidden"
        style={{ animationDuration: '0.15s' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <div className="text-xs font-semibold text-text-primary tracking-wide uppercase">
            System Prompt
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary cursor-pointer">
            <X size={14} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-border-default">
          {(['chat', 'code', 'architect'] as AgentMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => handleModeSwitch(mode)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] font-medium cursor-pointer transition-colors ${
                selectedMode === mode
                  ? 'text-accent border-b-2 border-accent bg-accent/5'
                  : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-1'
              }`}
            >
              {MODE_LABELS[mode].icon}
              {MODE_LABELS[mode].label}
            </button>
          ))}
        </div>

        {/* Persona info */}
        {activePersona && (
          <div className="mx-4 mt-3 px-3 py-2 bg-accent/5 border border-accent/20 rounded-lg">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-sm">{activePersona.icon}</span>
              <span className="font-medium text-text-primary">{activePersona.name}</span>
              <span className="text-text-tertiary">Active persona</span>
            </div>
            {activePersona.description && (
              <div className="text-[11px] text-text-tertiary mt-1">{activePersona.description}</div>
            )}
          </div>
        )}

        {/* Prompt display */}
        <div className="p-4">
          {activePersona && (
            <div className="mb-3">
              <label className="block text-[10px] text-text-tertiary mb-1 uppercase tracking-wide">
                Persona Prompt
              </label>
              <textarea
                readOnly
                value={activePersona.systemPrompt}
                className="w-full h-24 px-3 py-2 bg-surface-1 border border-border-default rounded-md text-[11px] text-text-secondary font-mono resize-none outline-none"
              />
            </div>
          )}
          <label className="block text-[10px] text-text-tertiary mb-1 uppercase tracking-wide">
            {activePersona ? 'Base System Prompt' : 'System Prompt'} ({MODE_LABELS[selectedMode].label} mode)
          </label>
          <textarea
            readOnly
            value={DEFAULT_SYSTEM_PROMPTS[selectedMode]}
            className="w-full h-28 px-3 py-2 bg-surface-1 border border-border-default rounded-md text-[11px] text-text-secondary font-mono resize-none outline-none"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-default">
          <button
            onClick={handleSaveAsAgent}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-accent bg-accent/10 border border-accent/20 rounded-md hover:bg-accent/15 cursor-pointer transition-colors"
          >
            <ExternalLink size={11} />
            Save as Agent
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeIndicatorPill() {
  const activeMode = useStore((s) => s.activeMode);
  const activePersona = useStore((s) => s.activePersona);
  const [showPanel, setShowPanel] = useState(false);

  const label = activePersona
    ? `${activePersona.icon} ${activePersona.name}`
    : MODE_LABELS[activeMode].label;

  return (
    <>
      <button
        onClick={() => setShowPanel(true)}
        className="flex items-center gap-1.5 ml-3 px-2.5 py-1 text-[11px] font-medium bg-surface-1 border border-border-default rounded-full hover:border-border-focus hover:text-text-primary text-text-secondary cursor-pointer transition-colors glow-hover"
        title="View system prompt"
      >
        {!activePersona && <span className="text-text-tertiary">{MODE_LABELS[activeMode].icon}</span>}
        <span>{label}</span>
      </button>
      {showPanel && <SystemPromptPanel onClose={() => setShowPanel(false)} />}
    </>
  );
}

function TreeToggleButton() {
  const tree = useStore((s) => s.conversationTree);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const rightPanelTab = useStore((s) => s.rightPanelTab);
  const setRightPanelOpen = useStore((s) => s.setRightPanelOpen);
  const setRightPanelTab = useStore((s) => s.setRightPanelTab);
  const activeConversationId = useStore((s) => s.activeConversationId);

  const hasBranches = tree?.nodes.some((n) => n.childCount > 1) ?? false;
  if (!activeConversationId || !hasBranches) return null;

  const isActive = rightPanelOpen && rightPanelTab === 'tree';

  return (
    <button
      onClick={() => {
        if (isActive) {
          setRightPanelOpen(false);
        } else {
          setRightPanelTab('tree');
          setRightPanelOpen(true);
        }
      }}
      title="View conversation tree"
      className={`flex items-center gap-1 px-2 py-1 text-[11px] bg-surface-1 border rounded-md hover:border-border-focus ml-2 cursor-pointer transition-colors glow-hover ${
        isActive ? 'text-accent border-accent/30' : 'text-text-tertiary border-border-default'
      }`}
    >
      <Network size={12} />
    </button>
  );
}

function UserDropdown() {
  const user = useStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    const confirmed = await useStore.getState().showConfirm({
      title: 'Log out?',
      message: 'You will need to sign in again.',
      confirmLabel: 'Log out',
      variant: 'danger',
    });
    if (!confirmed) return;
    try { await apiLogout(); } catch {}
    clearToken();
    useStore.getState().reset();
    window.location.href = '/login';
  };

  const handleShortcuts = () => {
    setOpen(false);
    useStore.getState().setCommandPaletteOpen(true);
  };

  return (
    <div ref={dropdownRef} className="relative ml-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-7 h-7 bg-surface-1 border border-border-default rounded-full flex items-center justify-center text-xs font-mono text-text-secondary hover:border-border-focus hover:text-text-primary transition-colors cursor-pointer overflow-hidden glow-hover"
      >
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          user?.name?.charAt(0)?.toUpperCase() || 'U'
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-56 bg-surface-0 border border-border-default rounded-xl shadow-2xl shadow-black/30 overflow-hidden animate-fade-in-up z-50"
          style={{ animationDuration: '0.1s' }}
        >
          {/* User info */}
          <div className="px-3 py-2.5 border-b border-border-default">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-surface-2 border border-border-default rounded-full flex items-center justify-center text-xs font-mono text-text-secondary overflow-hidden shrink-0">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User size={14} className="text-text-tertiary" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-text-primary truncate">
                  {user?.name || 'User'}
                </div>
                <div className="text-[10px] text-text-tertiary truncate">
                  {user?.email || ''}
                </div>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button
              onClick={handleShortcuts}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-1 cursor-pointer transition-colors"
            >
              <Keyboard size={13} className="text-text-tertiary shrink-0" />
              <span className="flex-1 text-left">Keyboard shortcuts</span>
              <kbd className="text-[9px] text-text-tertiary bg-surface-1 border border-border-default rounded px-1 py-0.5">&#8984;K</kbd>
            </button>
            {user?.isAdmin && (
              <a
                href="/admin"
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-1 cursor-pointer transition-colors"
              >
                <Shield size={13} className="text-text-tertiary shrink-0" />
                <span className="flex-1 text-left">Admin dashboard</span>
              </a>
            )}
          </div>

          {/* Logout */}
          <div className="border-t border-border-default py-1">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-error/80 hover:text-error hover:bg-error/5 cursor-pointer transition-colors"
            >
              <LogOut size={13} className="shrink-0" />
              <span className="flex-1 text-left">Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TopBar() {
  const isStreaming = useStore((s) => s.isStreaming);
  const sandboxStatus = useStore((s) => s.sandboxStatus);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const setRightPanelOpen = useStore((s) => s.setRightPanelOpen);
  const setActiveConversationId = useStore((s) => s.setActiveConversationId);
  const setMessages = useStore((s) => s.setMessages);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const setCommandPaletteOpen = useStore((s) => s.setCommandPaletteOpen);

  return (
    <div className="relative flex items-center h-11 px-3 bg-surface-0 border-b border-border-default shrink-0 z-10">
      {isStreaming && (
        <div className="absolute bottom-0 left-0 right-0 h-px overflow-hidden">
          <div className="h-full shimmer" style={{ background: 'linear-gradient(90deg, transparent, var(--color-accent), transparent)', backgroundSize: '200% 100%' }} />
        </div>
      )}

      {/* Sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        title={`${sidebarOpen ? 'Hide' : 'Show'} sidebar (Cmd+B)`}
        className={`flex items-center justify-center w-7 h-7 rounded-md mr-2 cursor-pointer transition-colors ${
          sidebarOpen ? 'text-text-tertiary hover:text-text-secondary hover:bg-surface-1' : 'text-accent hover:bg-accent/10'
        }`}
      >
        <PanelLeft size={14} />
      </button>

      {/* Brand */}
      <button
        onClick={() => { setActiveConversationId(null); setMessages([]); }}
        className={`flex items-center gap-1.5 cursor-pointer transition-all ${isStreaming ? 'brand-processing' : 'hover:opacity-80'}`}
      >
        <Zap size={14} className="text-accent" />
        <span className="text-sm font-bold tracking-[0.12em] uppercase">Nexus</span>
      </button>

      <ModeIndicatorPill />

      <div className="flex-1" />

      <SandboxBar />

      {/* Terminal/panel toggle */}
      {sandboxStatus !== 'none' && (
        <button
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          title="Toggle terminal panel"
          className={`flex items-center gap-1 px-2 py-1 text-[11px] bg-surface-1 border rounded-md hover:border-border-focus ml-2 cursor-pointer transition-colors glow-hover ${
            rightPanelOpen ? 'text-accent border-accent/30' : 'text-text-tertiary border-border-default'
          }`}
        >
          <PanelRight size={12} />
        </button>
      )}

      <TreeToggleButton />

      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-tertiary bg-surface-1 border border-border-default rounded-md hover:border-border-focus hover:text-text-secondary ml-2 cursor-pointer transition-colors glow-hover"
      >
        <Command size={11} />
        <span className="text-[10px] hidden sm:inline">K</span>
      </button>

      <UserDropdown />
    </div>
  );
}
