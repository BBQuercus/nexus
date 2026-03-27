'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { logout as apiLogout, updateUserSettings } from '@/lib/api';
import type { UserSettings } from '@/lib/types';
import { LogOut, User, Keyboard, Shield, Users, BookOpen, Home, Compass, Bug, Building2, Check, Plus, Settings, Sun, Moon, Monitor, Type, Zap } from 'lucide-react';
import BugReportDialog from './bug-report-dialog';
import CreateOrgDialog from './create-org-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from './ui/dropdown-menu';

export default function UserDropdown({ compact = false }: { compact?: boolean }) {
  const user = useStore((s) => s.user);
  const currentOrg = useStore((s) => s.currentOrg);
  const memberships = useStore((s) => s.memberships);
  const switchOrg = useStore((s) => s.switchOrg);
  const userSettings = useStore((s) => s.userSettings);
  const setUserSettings = useStore((s) => s.setUserSettings);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [switchingOrg, setSwitchingOrg] = useState(false);

  const handleSetting = async (patch: Partial<UserSettings>) => {
    const next = { ...userSettings, ...patch };
    setUserSettings(next);
    try {
      await updateUserSettings(patch);
    } catch {
      setUserSettings(userSettings); // rollback
    }
  };
  const router = useRouter();
  const pathname = usePathname();

  const handleSwitchOrg = async (orgId: string) => {
    if (orgId === currentOrg?.id || switchingOrg) return;
    setSwitchingOrg(true);
    try {
      await switchOrg(orgId);
      // Navigate home after switch
      if (pathname !== '/') router.push('/');
    } catch {
      // Error handled by API layer toast
    } finally {
      setSwitchingOrg(false);
    }
  };

  const handleLogout = async () => {
    const firstName = user?.name?.split(' ')[0];
    const confirmed = await useStore.getState().showConfirm({
      title: 'Log out?',
      message: firstName
        ? `See you later, ${firstName}. You'll need to sign in again.`
        : 'You will need to sign in again.',
      confirmLabel: 'Log out',
      variant: 'danger',
    });
    if (!confirmed) return;
    useStore.getState().setAuthStatus('loading');
    try { await apiLogout(); } catch {}
    useStore.getState().reset();
    window.location.href = '/login';
  };

  const handleShortcuts = () => {
    useStore.getState().setCommandPaletteOpen(true);
  };

  const handleTour = () => {
    window.dispatchEvent(new Event('nexus:start-tour'));
  };

  const navigateTo = (href: string) => {
    if (pathname !== href) {
      router.push(href);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`flex items-center gap-2.5 px-1 py-1 rounded-lg hover:bg-surface-1 transition-colors cursor-pointer outline-none ${compact ? '' : 'w-full'}`}
          >
            <div className="w-7 h-7 bg-surface-1 border border-border rounded-full flex items-center justify-center text-xs font-mono text-text-secondary overflow-hidden shrink-0">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                user?.name?.charAt(0)?.toUpperCase() || 'U'
              )}
            </div>
            {!compact && <span className="text-xs text-text-secondary truncate">{user?.name || 'User'}</span>}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {/* User info + Org context */}
          <div className="px-2 py-2 border-b border-border -mx-1 mb-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-surface-2 border border-border rounded-full flex items-center justify-center text-xs font-mono text-text-secondary overflow-hidden shrink-0">
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
            {currentOrg && (
              <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
                <Building2 size={10} className="text-text-tertiary shrink-0" />
                <span className="text-[10px] text-text-tertiary truncate">{currentOrg.name}</span>
              </div>
            )}
          </div>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Building2 size={13} />
              <span>Organizations</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-52">
              <DropdownMenuLabel className="text-[10px] text-text-tertiary">Your organizations</DropdownMenuLabel>
              {memberships?.map((m) => (
                <DropdownMenuItem
                  key={m.orgId}
                  onClick={() => handleSwitchOrg(m.orgId)}
                  disabled={switchingOrg}
                >
                  <span className="truncate flex-1">{m.orgName}</span>
                  {m.orgId === currentOrg?.id && <Check size={12} className="text-accent shrink-0" />}
                  <span className="text-[10px] text-text-tertiary ml-1">{m.role}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCreateOrgOpen(true)}>
                <Plus size={13} />
                <span>Create organization</span>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuItem onClick={() => { useStore.getState().setActiveConversationId(null); useStore.getState().setMessages([]); navigateTo('/'); }}>
            <Home size={13} />
            <span>Home</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleShortcuts}>
            <Keyboard size={13} />
            <span>Keyboard shortcuts</span>
            <DropdownMenuShortcut>&#8984;K</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleTour}>
            <Compass size={13} />
            <span>Take a tour</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigateTo('/agents')}>
            <Users size={13} />
            <span>Agents</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigateTo('/knowledge')}>
            <BookOpen size={13} />
            <span>Knowledge Bases</span>
          </DropdownMenuItem>
          {(user?.role === 'admin' || user?.role === 'owner' || user?.isSuperadmin) && (
            <DropdownMenuItem onClick={() => navigateTo('/admin')}>
              <Shield size={13} />
              <span>Admin dashboard</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Settings size={13} />
              <span>Preferences</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-52">
              <DropdownMenuLabel className="text-[10px] text-text-tertiary">Theme</DropdownMenuLabel>
              {(['dark', 'light', 'system'] as const).map((t) => (
                <DropdownMenuItem key={t} onClick={() => handleSetting({ theme: t })}>
                  {t === 'dark' && <Moon size={13} />}
                  {t === 'light' && <Sun size={13} />}
                  {t === 'system' && <Monitor size={13} />}
                  <span className="capitalize">{t}</span>
                  {(userSettings.theme ?? 'dark') === t && <Check size={12} className="ml-auto text-accent" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] text-text-tertiary">Font size</DropdownMenuLabel>
              {([['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']] as const).map(([val, label]) => (
                <DropdownMenuItem key={val} onClick={() => handleSetting({ fontSize: val })}>
                  <Type size={13} />
                  <span>{label}</span>
                  {(userSettings.fontSize ?? 'md') === val && <Check size={12} className="ml-auto text-accent" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleSetting({ reduceAnimations: !userSettings.reduceAnimations })}>
                <Zap size={13} />
                <span>Reduce animations</span>
                {userSettings.reduceAnimations && <Check size={12} className="ml-auto text-accent" />}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setBugReportOpen(true)}>
            <Bug size={13} />
            <span>Report a bug</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleLogout}
            className="text-error/80 focus:text-error focus:bg-error/5 [&>svg]:text-error/80"
          >
            <LogOut size={13} />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <BugReportDialog open={bugReportOpen} onClose={() => setBugReportOpen(false)} />
      <CreateOrgDialog
        open={createOrgOpen}
        onClose={() => setCreateOrgOpen(false)}
        switchAfterCreate
      />
    </>
  );
}
