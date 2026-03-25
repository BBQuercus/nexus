'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { PanelRight, PanelLeft, Search, Plus, Zap } from 'lucide-react';
import * as api from '@/lib/api';
import UserDropdown from './user-dropdown';


export default function TopBar() {
  const router = useRouter();
  const isStreaming = useStore((s) => s.isStreaming);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const setRightPanelOpen = useStore((s) => s.setRightPanelOpen);
  const activeModel = useStore((s) => s.activeModel);
  const setActiveConversationId = useStore((s) => s.setActiveConversationId);
  const setMessages = useStore((s) => s.setMessages);
  const setConversations = useStore((s) => s.setConversations);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const setCommandPaletteOpen = useStore((s) => s.setCommandPaletteOpen);

  // Remember right panel state when sidebar closes, restore when it reopens
  const rightPanelWasOpen = useRef(false);
  const prevSidebarOpen = useRef(sidebarOpen);

  useEffect(() => {
    if (prevSidebarOpen.current && !sidebarOpen) {
      // Sidebar just closed — hide right panel, remember its state
      rightPanelWasOpen.current = rightPanelOpen;
      if (rightPanelOpen) setRightPanelOpen(false);
    } else if (!prevSidebarOpen.current && sidebarOpen) {
      // Sidebar just opened — restore right panel if it was open before
      if (rightPanelWasOpen.current) setRightPanelOpen(true);
    }
    prevSidebarOpen.current = sidebarOpen;
  }, [sidebarOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewChat = async () => {
    try {
      const conv = await api.createConversation({ model: activeModel });
      setActiveConversationId(conv.id);
      setMessages([]);
      const r = await api.listConversations();
      setConversations(r.conversations);
    } catch (e) {
      console.error('Failed to create conversation:', e);
    }
  };

  return (
    <>
      {/* Floating icons — visible when sidebar is closed, overlays content */}
      <div className={`absolute top-0 left-0 z-20 flex items-center gap-0.5 p-2 transition-opacity duration-200 ${
        sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}>
        {isStreaming && (
          <div className="fixed top-0 left-0 right-0 h-px overflow-hidden z-30">
            <div className="h-full shimmer" style={{ background: 'linear-gradient(90deg, transparent, var(--color-accent), transparent)', backgroundSize: '200% 100%' }} />
          </div>
        )}
        <button
          onClick={() => setSidebarOpen(true)}
          title="Show sidebar (Cmd+B)"
          className="flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-colors text-text-tertiary hover:text-text-secondary hover:bg-surface-1"
        >
          <PanelLeft size={15} />
        </button>
        <button
          data-tour="command-palette"
          onClick={() => setCommandPaletteOpen(true)}
          title="Search (Cmd+K)"
          className="flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-colors text-text-tertiary hover:text-text-secondary hover:bg-surface-1"
        >
          <Search size={15} />
        </button>
        <button
          onClick={handleNewChat}
          title="New conversation (Cmd+N)"
          className="flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-colors text-text-tertiary hover:text-text-secondary hover:bg-surface-1"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Always-visible top-right controls */}
      <div className="absolute top-0 right-0 z-20 p-2 flex items-center gap-1">
        {sidebarOpen && (
          <button
            data-tour="right-panel-toggle"
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            title="Toggle side panel"
            className={`flex items-center justify-center w-7 h-7 rounded-lg cursor-pointer transition-colors ${
              rightPanelOpen ? 'text-accent bg-accent/10' : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-1'
            }`}
          >
            <PanelRight size={15} />
          </button>
        )}
        <div data-tour="user-dropdown">
          <UserDropdown compact />
        </div>
      </div>

      {/* Full header bar — transitions height to collapse when sidebar is closed */}
      <div className={`relative flex items-center pl-3 pr-20 bg-surface-0 border-b shrink-0 z-10 transition-[height,border-color,opacity] duration-200 ease-in-out overflow-hidden ${
        sidebarOpen ? 'h-12 border-border-default opacity-100' : 'h-0 border-transparent opacity-0'
      }`}>
        {isStreaming && (
          <div className="absolute bottom-0 left-0 right-0 h-px overflow-hidden">
            <div className="h-full shimmer" style={{ background: 'linear-gradient(90deg, transparent, var(--color-accent), transparent)', backgroundSize: '200% 100%' }} />
          </div>
        )}

        {/* Sidebar toggle + Brand */}
        <button
          onClick={() => setSidebarOpen(false)}
          title="Hide sidebar (Cmd+B)"
          className="flex items-center justify-center w-8 h-8 rounded-lg mr-2 cursor-pointer transition-colors text-text-tertiary hover:text-text-secondary hover:bg-surface-1"
        >
          <PanelLeft size={15} />
        </button>

        <button
          onClick={() => { setActiveConversationId(null); setMessages([]); router.push('/'); }}
          title="Home"
          className="flex items-center gap-2 cursor-pointer rounded-lg px-1.5 py-1 -ml-1.5 hover:bg-surface-1 transition-colors"
        >
          <Zap size={15} className="text-accent shrink-0" />
          <span className="text-sm font-bold tracking-[0.12em] uppercase whitespace-nowrap">Nexus</span>
        </button>

        <div className="flex-1" />
      </div>
    </>
  );
}
