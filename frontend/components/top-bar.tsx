'use client';

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { logout as apiLogout } from '@/lib/api';
import { clearToken } from '@/lib/auth';
import { Zap, Command, PanelRight, PanelLeft, Network, LogOut, User, Keyboard, Shield, Users } from 'lucide-react';
import SandboxBar from './sandbox-bar';

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
      className={`flex items-center justify-center w-8 h-8 bg-surface-1 border rounded-lg hover:border-border-focus ml-2 cursor-pointer transition-colors glow-hover ${
        isActive ? 'text-accent border-accent/30' : 'text-text-tertiary border-border-default'
      }`}
    >
      <Network size={14} />
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
        className="w-8 h-8 bg-surface-1 border border-border-default rounded-full flex items-center justify-center text-xs font-mono text-text-secondary hover:border-border-focus hover:text-text-primary transition-colors cursor-pointer overflow-hidden glow-hover"
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
            <a href="/agents" onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-1 cursor-pointer transition-colors">
              <Users size={13} className="text-text-tertiary shrink-0" />
              <span className="flex-1 text-left">Agents</span>
            </a>
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
    <div className="relative flex items-center h-12 px-3 bg-surface-0 border-b border-border-default shrink-0 z-10">
      {isStreaming && (
        <div className="absolute bottom-0 left-0 right-0 h-px overflow-hidden">
          <div className="h-full shimmer" style={{ background: 'linear-gradient(90deg, transparent, var(--color-accent), transparent)', backgroundSize: '200% 100%' }} />
        </div>
      )}

      {/* Sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        title={`${sidebarOpen ? 'Hide' : 'Show'} sidebar (Cmd+B)`}
        className={`flex items-center justify-center w-8 h-8 rounded-lg mr-2 cursor-pointer transition-colors ${
          sidebarOpen ? 'text-text-tertiary hover:text-text-secondary hover:bg-surface-1' : 'text-accent hover:bg-accent/10'
        }`}
      >
        <PanelLeft size={15} />
      </button>

      {/* Brand */}
      <button
        onClick={() => { setActiveConversationId(null); setMessages([]); }}
        className={`flex items-center gap-2 cursor-pointer transition-all ${isStreaming ? 'brand-processing' : 'hover:opacity-80'}`}
      >
        <Zap size={15} className="text-accent" />
        <span className="text-sm font-bold tracking-[0.12em] uppercase">Nexus</span>
      </button>

      <div className="flex-1" />

      <SandboxBar />

      {/* Terminal/panel toggle */}
      {sandboxStatus !== 'none' && (
        <button
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          title="Toggle terminal panel"
          className={`flex items-center justify-center w-8 h-8 bg-surface-1 border rounded-lg hover:border-border-focus ml-2 cursor-pointer transition-colors glow-hover ${
            rightPanelOpen ? 'text-accent border-accent/30' : 'text-text-tertiary border-border-default'
          }`}
        >
          <PanelRight size={14} />
        </button>
      )}

      <TreeToggleButton />

      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="flex items-center gap-1.5 px-2.5 h-8 text-[11px] text-text-tertiary bg-surface-1 border border-border-default rounded-lg hover:border-border-focus hover:text-text-secondary ml-2 cursor-pointer transition-colors glow-hover"
      >
        <Command size={12} />
        <span className="text-[10px] hidden sm:inline">K</span>
      </button>

      <UserDropdown />
    </div>
  );
}
