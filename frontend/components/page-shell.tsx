'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { useRouter } from 'next/navigation';
import { PanelLeft, Zap, ArrowLeft } from 'lucide-react';
import UserDropdown from './user-dropdown';

/**
 * Shared shell for non-chat pages (agents, admin) that provides the
 * same layout chrome as the main workspace: collapsible sidebar area,
 * top bar with Nexus brand, and smooth transitions.
 *
 * Pass page-specific navigation into the `sidebar` prop.
 */
export default function PageShell({
  children,
  sidebar,
  title,
}: {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  title: string;
}) {
  const router = useRouter();
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const isDesktop = useIsDesktop();
  const sidebarIsOverlay = !isDesktop;

  useEffect(() => {
    if (!isDesktop) setSidebarOpen(false);
  }, [isDesktop]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b' && !e.shiftKey) {
        e.preventDefault();
        useStore.getState().setSidebarOpen(!useStore.getState().sidebarOpen);
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, []);

  return (
    <div className="relative flex flex-col h-dvh w-screen bg-bg overflow-hidden noise-overlay">
      {/* Floating sidebar toggle when closed */}
      <div className={`absolute top-0 left-0 z-20 flex items-center gap-0.5 p-2 transition-opacity duration-200 ${
        sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}>
        <button
          onClick={() => setSidebarOpen(true)}
          title="Show sidebar (Cmd+B)"
          className="flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-colors text-text-tertiary hover:text-text-secondary hover:bg-surface-1"
        >
          <PanelLeft size={15} />
        </button>
      </div>

      {/* User icon — always visible, fixed top-right */}
      <div className="absolute top-0 right-0 z-20 p-2">
        <UserDropdown compact />
      </div>

      {/* Top bar — only on desktop, collapses when sidebar is closed */}
      <div className={`relative flex items-center px-3 bg-surface-0 border-b shrink-0 z-10 transition-[height,border-color,opacity] duration-200 ease-in-out overflow-hidden ${
        isDesktop && sidebarOpen ? 'h-12 border-border-default opacity-100' : 'h-0 border-transparent opacity-0'
      }`}>
        <button
          onClick={() => setSidebarOpen(false)}
          title="Hide sidebar (Cmd+B)"
          className="flex items-center justify-center w-8 h-8 rounded-lg mr-2 cursor-pointer transition-colors text-text-tertiary hover:text-text-secondary hover:bg-surface-1"
        >
          <PanelLeft size={15} />
        </button>
        <button
          onClick={() => router.push('/')}
          title="Home"
          className="flex items-center gap-2 cursor-pointer rounded-lg px-1.5 py-1 -ml-1.5 hover:bg-surface-1 transition-colors"
        >
          <Zap size={15} className="text-accent shrink-0" />
          <span className="text-sm font-bold tracking-[0.12em] uppercase whitespace-nowrap">Nexus</span>
        </button>
        <div className="h-4 w-px bg-border-default mx-3" />
        <span className="text-[11px] text-text-tertiary uppercase tracking-wider">{title}</span>
        <div className="flex-1" />
      </div>

      <div className="flex flex-1 min-h-0 relative">
        {/* Sidebar */}
        {sidebarIsOverlay ? (
          sidebarOpen && (
            <>
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
                onClick={() => setSidebarOpen(false)}
              />
              <div className="fixed left-0 top-0 bottom-0 z-40 animate-slide-in-left">
                <SidebarChrome>{sidebar}</SidebarChrome>
              </div>
            </>
          )
        ) : (
          <div
            className="h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
            style={{ width: sidebarOpen ? '272px' : '0px' }}
          >
            <div className="h-full w-[272px]">
              <SidebarChrome>{sidebar}</SidebarChrome>
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="relative flex flex-col flex-1 min-w-0">
          <div className="absolute inset-0 dot-texture opacity-40 pointer-events-none" />
          <div className="relative flex flex-col flex-1 min-h-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Sidebar wrapper: page-specific content + back link + user dropdown at the bottom */
function SidebarChrome({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="relative flex flex-col w-[min(75vw,320px)] xl:w-[272px] xl:min-w-[272px] bg-surface-0 border-r border-border-default shrink-0 h-full">
      <div className="absolute inset-0 grid-texture opacity-10 pointer-events-none" />
      <div className="relative flex-1 flex flex-col min-h-0">
        {children}
      </div>
      <div className="relative border-t border-border-default">
        <div className="px-3 pt-2">
          <button
            onClick={() => router.push('/')}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-[11px] text-text-tertiary hover:text-text-secondary cursor-pointer transition-colors rounded-lg hover:bg-surface-1"
          >
            <ArrowLeft size={11} /> Back to chat
          </button>
        </div>
      </div>
    </div>
  );
}
