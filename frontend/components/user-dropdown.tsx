'use client';

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { logout as apiLogout } from '@/lib/api';
import { clearToken } from '@/lib/auth';
import { LogOut, User, Keyboard, Shield, Users } from 'lucide-react';

export default function UserDropdown() {
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
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 w-full px-1 py-1 rounded-lg hover:bg-surface-1 transition-colors cursor-pointer"
      >
        <div className="w-7 h-7 bg-surface-1 border border-border-default rounded-full flex items-center justify-center text-xs font-mono text-text-secondary overflow-hidden shrink-0">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            user?.name?.charAt(0)?.toUpperCase() || 'U'
          )}
        </div>
        <span className="text-xs text-text-secondary truncate">{user?.name || 'User'}</span>
      </button>

      {open && (
        <div
          className="absolute left-0 bottom-full mb-1.5 w-56 bg-surface-0 border border-border-default rounded-lg shadow-2xl shadow-black/30 overflow-hidden animate-fade-in-up z-50"
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
