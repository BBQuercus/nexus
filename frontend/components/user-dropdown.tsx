'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { logout as apiLogout } from '@/lib/api';
import { LogOut, User, Keyboard, Shield, Users, BookOpen, Home, Compass } from 'lucide-react';

export default function UserDropdown({ compact = false }: { compact?: boolean }) {
  const user = useStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

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
    useStore.getState().reset();
    window.location.href = '/login';
  };

  const handleShortcuts = () => {
    setOpen(false);
    useStore.getState().setCommandPaletteOpen(true);
  };

  const handleTour = () => {
    setOpen(false);
    window.dispatchEvent(new Event('nexus:start-tour'));
  };

  const navigateTo = (href: string) => {
    setOpen(false);
    if (pathname !== href) {
      router.push(href);
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2.5 px-1 py-1 rounded-lg hover:bg-surface-1 transition-colors cursor-pointer ${compact ? '' : 'w-full'}`}
      >
        <div className="w-7 h-7 bg-surface-1 border border-border-default rounded-full flex items-center justify-center text-xs font-mono text-text-secondary overflow-hidden shrink-0">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            user?.name?.charAt(0)?.toUpperCase() || 'U'
          )}
        </div>
        {!compact && <span className="text-xs text-text-secondary truncate">{user?.name || 'User'}</span>}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-56 max-w-[calc(100vw-16px)] bg-surface-0 border border-border-default rounded-lg shadow-2xl shadow-black/30 overflow-hidden animate-fade-in-up z-50"
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
              onClick={() => { setOpen(false); useStore.getState().setActiveConversationId(null); useStore.getState().setMessages([]); navigateTo('/'); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-1 cursor-pointer transition-colors"
            >
              <Home size={13} className="text-text-tertiary shrink-0" />
              <span className="flex-1 text-left">Home</span>
            </button>
            <button
              onClick={handleShortcuts}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-1 cursor-pointer transition-colors"
            >
              <Keyboard size={13} className="text-text-tertiary shrink-0" />
              <span className="flex-1 text-left">Keyboard shortcuts</span>
              <kbd className="text-[9px] text-text-tertiary bg-surface-1 border border-border-default rounded px-1 py-0.5">&#8984;K</kbd>
            </button>
            <button
              onClick={handleTour}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-1 cursor-pointer transition-colors"
            >
              <Compass size={13} className="text-text-tertiary shrink-0" />
              <span className="flex-1 text-left">Take a tour</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/agents')}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-1 cursor-pointer transition-colors"
            >
              <Users size={13} className="text-text-tertiary shrink-0" />
              <span className="flex-1 text-left">Agents</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/knowledge')}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-1 cursor-pointer transition-colors"
            >
              <BookOpen size={13} className="text-text-tertiary shrink-0" />
              <span className="flex-1 text-left">Knowledge Bases</span>
            </button>
            {(user?.role === 'admin' || user?.role === 'org_admin') && (
              <button
                type="button"
                onClick={() => navigateTo('/admin')}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-1 cursor-pointer transition-colors"
              >
                <Shield size={13} className="text-text-tertiary shrink-0" />
                <span className="flex-1 text-left">Admin dashboard</span>
              </button>
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
