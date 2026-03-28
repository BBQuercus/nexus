'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';
import { logout as apiLogout, updateUserSettings } from '@/lib/api';
import type { UserSettings } from '@/lib/types';
import { LogOut, User, Keyboard, Shield, Users, BookOpen, Home, Compass, Bug, Building2, Check, Plus, Settings, Sun, Moon, Monitor, Type, Zap, Globe, Store } from 'lucide-react';
import { useLocale } from 'next-intl';
import { locales, type Locale } from '@/i18n/config';
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

const LOCALE_LABELS: Record<Locale, string> = { en: 'English', de: 'Deutsch' };

export default function UserDropdown({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('userDropdown');
  const locale = useLocale();
  const user = useStore((s) => s.user);
  const currentOrg = useStore((s) => s.currentOrg);
  const memberships = useStore((s) => s.memberships);
  const switchOrg = useStore((s) => s.switchOrg);
  const userSettings = useStore((s) => s.userSettings);
  const setUserSettings = useStore((s) => s.setUserSettings);
  const setBugReportOpen = useStore((s) => s.setBugReportOpen);
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
      title: t('logOutTitle'),
      message: firstName
        ? t('logOutMessageName', { firstName })
        : t('logOutMessage'),
      confirmLabel: t('logOutConfirm'),
      variant: 'danger',
    });
    if (!confirmed) return;
    useStore.getState().setAuthStatus('loading');
    try { await apiLogout(); } catch {}
    useStore.getState().reset();
    window.location.href = '/login';
  };

  const navigateTo = (href: string) => {
    if (pathname !== href) router.push(href);
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'owner' || user?.isSuperadmin;

  const FONT_SIZE_OPTIONS = [['sm', t('fontSmall')], ['md', t('fontMedium')], ['lg', t('fontLarge')]] as const;

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
                user?.name?.charAt(0)?.toUpperCase() || t('defaultInitial')
              )}
            </div>
            {!compact && <span className="text-xs text-text-secondary truncate">{user?.name || t('defaultName')}</span>}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">

          {/* Identity header */}
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
                <div className="text-xs font-medium text-text-primary truncate">{user?.name || t('defaultName')}</div>
                <div className="text-[10px] text-text-tertiary truncate">{user?.email || ''}</div>
              </div>
            </div>
            {currentOrg && (
              <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
                <Building2 size={10} className="text-text-tertiary shrink-0" />
                <span className="text-[10px] text-text-tertiary truncate">{currentOrg.name}</span>
              </div>
            )}
          </div>

          {/* Account */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Building2 size={13} />
              <span>{t('organizations')}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-52">
              <DropdownMenuLabel className="text-[10px] text-text-tertiary">{t('yourOrganizations')}</DropdownMenuLabel>
              {memberships?.map((m) => (
                <DropdownMenuItem key={m.orgId} onClick={() => handleSwitchOrg(m.orgId)} disabled={switchingOrg}>
                  <span className="truncate flex-1">{m.orgName}</span>
                  {m.orgId === currentOrg?.id && <Check size={12} className="text-accent shrink-0" />}
                  <span className="text-[10px] text-text-tertiary ml-1">{m.role}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCreateOrgOpen(true)}>
                <Plus size={13} />
                <span>{t('createOrganization')}</span>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Settings size={13} />
              <span>{t('preferences')}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-52">
              <DropdownMenuLabel className="text-[10px] text-text-tertiary">{t('themeLabel')}</DropdownMenuLabel>
              {(['dark', 'light', 'system'] as const).map((theme) => (
                <DropdownMenuItem key={theme} onSelect={(e) => { e.preventDefault(); handleSetting({ theme }); }}>
                  {theme === 'dark' && <Moon size={13} />}
                  {theme === 'light' && <Sun size={13} />}
                  {theme === 'system' && <Monitor size={13} />}
                  <span className="capitalize">{t(`theme${theme.charAt(0).toUpperCase()}${theme.slice(1)}` as 'themeDark' | 'themeLight' | 'themeSystem')}</span>
                  {(userSettings.theme ?? 'dark') === theme && <Check size={12} className="ml-auto text-accent" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] text-text-tertiary">{t('fontSizeLabel')}</DropdownMenuLabel>
              {FONT_SIZE_OPTIONS.map(([val, label]) => (
                <DropdownMenuItem key={val} onSelect={(e) => { e.preventDefault(); handleSetting({ fontSize: val }); }}>
                  <Type size={13} />
                  <span>{label}</span>
                  {(userSettings.fontSize ?? 'md') === val && <Check size={12} className="ml-auto text-accent" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleSetting({ reduceAnimations: !userSettings.reduceAnimations }); }}>
                <Zap size={13} />
                <span>{t('reduceAnimations')}</span>
                {userSettings.reduceAnimations && <Check size={12} className="ml-auto text-accent" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] text-text-tertiary">{t('language')}</DropdownMenuLabel>
              {locales.map((loc) => (
                <DropdownMenuItem key={loc} onSelect={(e) => { e.preventDefault(); document.cookie = `NEXT_LOCALE=${loc};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`; window.location.reload(); }}>
                  <Globe size={13} />
                  <span>{LOCALE_LABELS[loc]}</span>
                  {locale === loc && <Check size={12} className="ml-auto text-accent" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          {/* Navigation */}
          <DropdownMenuItem onClick={() => { useStore.getState().setActiveConversationId(null); useStore.getState().setMessages([]); navigateTo('/'); }}>
            <Home size={13} />
            <span>{t('home')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigateTo('/agents')}>
            <Users size={13} />
            <span>{t('agents')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigateTo('/marketplace')}>
            <Store size={13} />
            <span>{t('marketplace')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigateTo('/knowledge')}>
            <BookOpen size={13} />
            <span>{t('knowledgeBases')}</span>
          </DropdownMenuItem>
          {isAdmin && (
            <DropdownMenuItem onClick={() => navigateTo('/admin')}>
              <Shield size={13} />
              <span>{t('adminDashboard')}</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {/* Utilities */}
          <DropdownMenuItem onClick={() => useStore.getState().setCommandPaletteOpen(true)}>
            <Keyboard size={13} />
            <span>{t('keyboardShortcuts')}</span>
            <DropdownMenuShortcut>&#8984;K</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => window.dispatchEvent(new Event('nexus:start-tour'))}>
            <Compass size={13} />
            <span>{t('takeATour')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setBugReportOpen(true)}>
            <Bug size={13} />
            <span>{t('reportABug')}</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Destructive */}
          <DropdownMenuItem
            onClick={handleLogout}
            className="text-error/80 focus:text-error focus:bg-error/5 [&>svg]:text-error/80"
          >
            <LogOut size={13} />
            <span>{t('logOut')}</span>
          </DropdownMenuItem>

        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOrgDialog open={createOrgOpen} onClose={() => setCreateOrgOpen(false)} switchAfterCreate />
    </>
  );
}
