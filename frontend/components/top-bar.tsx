'use client';

import { useStore } from '@/lib/store';
import { logout as apiLogout } from '@/lib/api';
import { clearToken } from '@/lib/auth';
import { Zap, Command, PanelRight, Network } from 'lucide-react';
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
      className={`flex items-center gap-1 px-2 py-1 text-[11px] bg-surface-1 border rounded-md hover:border-border-focus ml-2 cursor-pointer transition-colors glow-hover ${
        isActive ? 'text-accent border-accent/30' : 'text-text-tertiary border-border-default'
      }`}
    >
      <Network size={12} />
    </button>
  );
}

export default function TopBar() {
  const isStreaming = useStore((s) => s.isStreaming);
  const sandboxStatus = useStore((s) => s.sandboxStatus);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const setRightPanelOpen = useStore((s) => s.setRightPanelOpen);
  const user = useStore((s) => s.user);
  const setActiveConversationId = useStore((s) => s.setActiveConversationId);
  const setMessages = useStore((s) => s.setMessages);
  const setCommandPaletteOpen = useStore((s) => s.setCommandPaletteOpen);

  const handleLogout = async () => {
    if (!confirm('Log out?')) return;
    try { await apiLogout(); } catch {}
    clearToken();
    useStore.getState().reset();
    window.location.href = '/login';
  };

  return (
    <div className="relative flex items-center h-11 px-3 bg-surface-0 border-b border-border-default shrink-0 z-10">
      {isStreaming && (
        <div className="absolute bottom-0 left-0 right-0 h-px overflow-hidden">
          <div className="h-full shimmer" style={{ background: 'linear-gradient(90deg, transparent, var(--color-accent), transparent)', backgroundSize: '200% 100%' }} />
        </div>
      )}

      {/* Brand */}
      <button
        onClick={() => { setActiveConversationId(null); setMessages([]); }}
        className={`flex items-center gap-1.5 cursor-pointer transition-all ${isStreaming ? 'brand-processing' : 'hover:opacity-80'}`}
      >
        <Zap size={14} className="text-accent" />
        <span className="text-sm font-bold tracking-[0.12em] uppercase">Nexus</span>
      </button>

      <div className="flex-1" />

      <SandboxBar />

      {/* Terminal/panel toggle — show when sandbox exists or has branches */}
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

      {/* Tree view toggle — always available when there's a conversation */}
      <TreeToggleButton />

      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-tertiary bg-surface-1 border border-border-default rounded-md hover:border-border-focus hover:text-text-secondary ml-2 cursor-pointer transition-colors glow-hover"
      >
        <Command size={11} />
        <span className="text-[10px]">K</span>
      </button>

      <button
        onClick={handleLogout}
        title="Log out"
        className="ml-2 w-7 h-7 bg-surface-1 border border-border-default rounded-full flex items-center justify-center text-xs font-mono text-text-secondary hover:border-border-focus hover:text-text-primary transition-colors cursor-pointer overflow-hidden glow-hover"
      >
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          user?.name?.charAt(0)?.toUpperCase() || 'U'
        )}
      </button>
    </div>
  );
}
