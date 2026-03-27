'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Shield, Users, ThumbsUp, ThumbsDown, AlertTriangle, RefreshCw,
  BarChart3, Building2, Plus, X, UserPlus, Loader2, Save,
  MessageSquare, Zap, Clock, ChevronDown,
} from 'lucide-react';
import PageShell from '@/components/page-shell';
import CreateOrgDialog from '@/components/create-org-dialog';
import { toast } from '@/components/toast';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';

type Tab = 'overview' | 'feedback' | 'users' | 'errors' | 'organizations';

const s = (v: unknown) => (v != null ? String(v) : '');
const n = (v: unknown) => { const x = Number(v); return isNaN(x) ? 0 : x; };
const fmt = (v: unknown) => n(v).toLocaleString();
const fmtDate = (v: unknown) => {
  if (!v) return '-';
  try { return new Date(String(v)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return s(v); }
};

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  overview: <BarChart3 size={14} />,
  feedback: <ThumbsUp size={14} />,
  users: <Users size={14} />,
  errors: <AlertTriangle size={14} />,
  organizations: <Building2 size={14} />,
};

const TAB_LABEL_KEYS: Record<Tab, string> = {
  overview: 'tabOverview',
  feedback: 'tabFeedback',
  users: 'tabUsers',
  errors: 'tabErrors',
  organizations: 'tabOrganizations',
};

const TAB_DESC_KEYS: Record<Tab, string> = {
  overview: 'descOverview',
  feedback: 'descFeedback',
  users: 'descUsers',
  errors: 'descErrors',
  organizations: 'descOrganizations',
};

// ── Shared UI ──

function PageHeader({ tab }: { tab: Tab }) {
  const t = useTranslations('admin');
  return (
    <div className="mb-6 animate-[fadeIn_0.2s_ease-out]">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="text-text-tertiary">{TAB_ICONS[tab]}</span>
        <h1 className="text-base font-semibold text-text-primary">{t(TAB_LABEL_KEYS[tab])}</h1>
      </div>
      <p className="text-xs text-text-tertiary ml-[26px]">{t(TAB_DESC_KEYS[tab])}</p>
    </div>
  );
}

function SectionCard({ title, action, children, className = '' }: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-surface-0 border border-border-default rounded-xl overflow-hidden ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          {title && <h3 className="text-[11px] text-text-tertiary uppercase tracking-wider font-medium">{title}</h3>}
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

function EmptyState({ icon: Icon, message, action }: { icon: React.ComponentType<{ size?: number; className?: string }>; message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon size={28} className="text-text-tertiary opacity-20 mb-3" />
      <p className="text-xs text-text-tertiary mb-4">{message}</p>
      {action}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    owner: 'bg-accent/10 text-accent',
    admin: 'bg-yellow-500/10 text-yellow-400',
    editor: 'bg-blue-500/10 text-blue-400',
    viewer: 'bg-surface-1 text-text-tertiary',
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${styles[role] || styles.viewer}`}>
      {role}
    </span>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 size={16} className="text-text-tertiary animate-spin" />
    </div>
  );
}

// ── Main Page ──

export default function AdminPage() {
  const router = useRouter();
  const t = useTranslations('admin');
  const [tab, setTab] = useState<Tab>('overview');
  const user = useStore((s) => s.user);

  const isAdmin = user?.role === 'admin' || user?.role === 'owner' || user?.isSuperadmin;

  if (!isAdmin) return (
    <div className="h-screen bg-bg flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-surface-0 border border-border-default flex items-center justify-center">
        <Shield size={20} className="text-text-tertiary" />
      </div>
      <div className="text-center">
        <p className="text-sm text-text-primary font-medium mb-1">{t('accessRequired')}</p>
        <p className="text-xs text-text-tertiary">{t('noPermission')}</p>
      </div>
      <button onClick={() => router.push('/')} className="text-xs text-accent hover:text-accent-hover cursor-pointer transition-colors">{t('backToNexus')}</button>
    </div>
  );

  const tabs = (Object.keys(TAB_ICONS) as Tab[]);

  const adminSidebar = (
    <div className="px-2 py-3 flex flex-col gap-0.5">
      {tabs.map((id) => (
        <button
          key={id}
          onClick={() => setTab(id)}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-lg cursor-pointer transition-all ${
            tab === id
              ? 'bg-accent/8 text-text-primary border-l-2 border-accent -ml-px'
              : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary'
          }`}
        >
          <span className={tab === id ? 'text-accent' : 'text-text-tertiary'}>{TAB_ICONS[id]}</span>
          {t(TAB_LABEL_KEYS[id])}
        </button>
      ))}
    </div>
  );

  return (
    <PageShell title={t('pageTitle')} sidebar={adminSidebar}>
      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <PageHeader tab={tab} />
        {tab === 'overview' && <OverviewTab />}
        {tab === 'feedback' && <FeedbackTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'errors' && <ErrorsTab />}
        {tab === 'organizations' && <OrganizationsTab />}
      </div>
    </PageShell>
  );
}

// ── Overview ──

function OverviewTab() {
  const t = useTranslations('admin');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { api.getAdminOverview().then(setData).catch(() => {}); }, []);
  if (!data) return <Loading />;

  const stats = [
    { label: t('totalUsers'), value: fmt(data.total_users), icon: Users, color: 'text-blue-400' },
    { label: t('active24h'), value: fmt(data.active_users_24h), icon: Zap, color: 'text-accent' },
    { label: t('conversations'), value: fmt(data.total_conversations), icon: MessageSquare, color: 'text-purple-400' },
    { label: t('messagesToday'), value: fmt(data.messages_today), icon: MessageSquare, color: 'text-cyan-400' },
    { label: t('errorsToday'), value: fmt(data.errors_today), icon: AlertTriangle, color: 'text-error' },
    { label: t('uptime'), value: t('uptimeValue'), icon: Clock, color: 'text-accent' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 animate-[fadeIn_0.2s_ease-out]">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-surface-0 border border-border-default rounded-xl px-4 py-4 group hover:border-border-focus transition-colors">
          <div className="flex items-center gap-2 mb-3">
            <stat.icon size={13} className={`${stat.color} opacity-60`} />
            <span className="text-[10px] text-text-tertiary uppercase tracking-wider">{stat.label}</span>
          </div>
          <div className="text-xl font-bold text-text-primary font-mono">{stat.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Feedback ──

function FeedbackTab() {
  const t = useTranslations('admin');
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getAdminFeedback()
      .then((res) => setItems(((res as Record<string, unknown>).items as Record<string, unknown>[]) || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;

  return (
    <div className="space-y-3 animate-[fadeIn_0.2s_ease-out]">
      <SectionCard
        title={t('entriesCount', { count: items.length })}
        action={
          <button onClick={load} className="text-text-tertiary hover:text-text-secondary cursor-pointer transition-colors">
            <RefreshCw size={13} />
          </button>
        }
      >
        {items.length === 0 ? (
          <EmptyState icon={ThumbsUp} message={t('noFeedbackYet')} />
        ) : (
          <div className="space-y-2 -m-1">
            {items.map((item, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-1/50 transition-colors">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  item.rating === 'up' ? 'bg-accent/10' : 'bg-error/10'
                }`}>
                  {item.rating === 'up'
                    ? <ThumbsUp size={12} className="text-accent" />
                    : <ThumbsDown size={12} className="text-error" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-secondary leading-relaxed">{s(item.message_preview) || t('noPreview')}</div>
                  {item.comment ? <div className="text-[11px] text-text-tertiary mt-1 italic">{`"${s(item.comment)}"`}</div> : null}
                  {(item.tags as string[] || []).length > 0 && (
                    <div className="flex gap-1 mt-1.5">{(item.tags as string[]).map((tag, j) => (
                      <span key={j} className="text-[9px] px-1.5 py-0.5 bg-surface-1 rounded text-text-tertiary">{tag}</span>
                    ))}</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-text-tertiary font-mono">{s(item.model).split('/').pop()}</div>
                  <div className="text-[10px] text-text-tertiary mt-0.5">{fmtDate(item.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Users ──

function UsersTab() {
  const t = useTranslations('admin');
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingRole, setChangingRole] = useState<string | null>(null);

  useEffect(() => {
    api.getAdminUsers()
      .then((res) => {
        const arr = Array.isArray(res) ? res : ((res as Record<string, unknown>).items as Record<string, unknown>[]) || [];
        setUsers(arr);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setChangingRole(userId);
    try {
      await api.updateAdminUser(userId, { role: newRole });
      setUsers((prev) => prev.map((u) => s(u.id) === userId ? { ...u, role: newRole } : u));
    } catch {} finally { setChangingRole(null); }
  };

  if (loading) return <Loading />;

  return (
    <div className="animate-[fadeIn_0.2s_ease-out]">
      <SectionCard title={t('usersCount', { count: users.length })}>
        {/* Table header */}
        <div className="flex items-center gap-3 px-3 py-2 text-[10px] text-text-tertiary uppercase tracking-wider border-b border-border-default -mx-4 px-7 mb-2">
          <div className="flex-1">{t('columnUser')}</div>
          <div className="w-20 text-center">{t('columnConversations')}</div>
          <div className="w-20 text-center">{t('columnMessages')}</div>
          <div className="w-28">{t('columnLastSeen')}</div>
          <div className="w-24">{t('columnRole')}</div>
        </div>
        <div className="space-y-1 -mx-1">
          {users.map((u) => (
            <div key={s(u.id)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-1/50 transition-colors">
              <div className="w-8 h-8 bg-surface-1 border border-border-default rounded-full flex items-center justify-center text-[11px] font-mono text-text-tertiary shrink-0 overflow-hidden">
                {u.avatar_url ? (
                  <img src={s(u.avatar_url)} alt="" className="w-full h-full object-cover" />
                ) : (
                  s(u.name).charAt(0).toUpperCase() || '?'
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-text-primary font-medium truncate">{s(u.name)}</div>
                <div className="text-[10px] text-text-tertiary truncate">{s(u.email)}</div>
              </div>
              <div className="w-20 text-center text-[11px] text-text-secondary font-mono">{fmt(u.conversation_count)}</div>
              <div className="w-20 text-center text-[11px] text-text-secondary font-mono">{fmt(u.message_count)}</div>
              <div className="w-28 text-[10px] text-text-tertiary">{fmtDate(u.last_seen)}</div>
              <div className="w-24">
                <select
                  value={s(u.role)}
                  onChange={(e) => handleRoleChange(s(u.id), e.target.value)}
                  disabled={changingRole === s(u.id)}
                  className="w-full px-2 py-1 bg-bg border border-border-default rounded text-[10px] text-text-secondary focus:outline-none focus:border-accent transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <option value="viewer">{t('roleViewer')}</option>
                  <option value="editor">{t('roleEditor')}</option>
                  <option value="admin">{t('roleAdmin')}</option>
                  <option value="owner">{t('roleOwner')}</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

// ── Errors ──

function ErrorsTab() {
  const t = useTranslations('admin');
  const [errors, setErrors] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAdminErrors()
      .then((res) => setErrors(((res as Record<string, unknown>).items as Record<string, unknown>[]) || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  return (
    <div className="animate-[fadeIn_0.2s_ease-out]">
      <SectionCard title={t('errorsCount', { count: errors.length })}>
        {errors.length === 0 ? (
          <EmptyState icon={AlertTriangle} message={t('noErrorsRecorded')} />
        ) : (
          <div className="space-y-2 -m-1">
            {errors.map((err, i) => (
              <div key={i} className="rounded-lg px-3 py-2.5 hover:bg-surface-1/50 transition-colors">
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-error/10 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle size={11} className="text-error" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-text-primary leading-relaxed">{s(err.message)}</div>
                    {err.url ? <div className="text-[10px] text-text-tertiary font-mono truncate mt-1">{s(err.url)}</div> : null}
                    {err.component ? <span className="text-[10px] text-text-tertiary mt-1 inline-block">{t('inComponent', { component: s(err.component) })}</span> : null}
                  </div>
                  <div className="text-[10px] text-text-tertiary shrink-0">{fmtDate(err.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Organizations ──

function OrganizationsTab() {
  const t = useTranslations('admin');
  const currentOrg = useStore((s) => s.currentOrg);
  const switchOrgFn = useStore((s) => s.switchOrg);
  const [members, setMembers] = useState<api.OrgMemberInfo[]>([]);
  const [orgs, setOrgs] = useState<api.OrgWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);

  const [orgName, setOrgName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [saving, setSaving] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [inviting, setInviting] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [changingRole, setChangingRole] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [orgsList, membersList] = await Promise.all([
        api.listOrgs(),
        currentOrg ? api.listOrgMembers(currentOrg.id) : Promise.resolve([]),
      ]);
      setOrgs(orgsList);
      setMembers(membersList);
      if (currentOrg) {
        setOrgName(currentOrg.name);
        setSystemPrompt(currentOrg.systemPrompt || '');
      }
    } catch {} finally { setLoading(false); }
  }, [currentOrg]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveSettings = async () => {
    if (!currentOrg || saving) return;
    setSaving(true);
    try {
      const updated = await api.updateOrg(currentOrg.id, { name: orgName.trim(), systemPrompt });
      useStore.getState().setCurrentOrg(updated);
      toast.success(t('settingsSaved'));
    } catch {} finally { setSaving(false); }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !inviteEmail.trim() || inviting) return;
    setInviting(true);
    try {
      await api.inviteOrgMember(currentOrg.id, { email: inviteEmail.trim(), role: inviteRole });
      toast.success(t('invitedEmail', { email: inviteEmail.trim() }));
      setInviteEmail('');
      setShowInvite(false);
      loadData();
    } catch {} finally { setInviting(false); }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!currentOrg) return;
    setChangingRole(userId);
    try {
      await api.updateOrgMemberRole(currentOrg.id, userId, newRole);
      setMembers((prev) => prev.map((m) => m.userId === userId ? { ...m, role: newRole } : m));
    } catch {} finally { setChangingRole(null); }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    if (!currentOrg) return;
    const confirmed = await useStore.getState().showConfirm({
      title: t('removeMemberTitle'),
      message: t('removeMemberMessage', { name }),
      confirmLabel: t('removeMemberConfirm'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.removeOrgMember(currentOrg.id, userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      toast.success(t('removedMember', { name }));
    } catch {}
  };

  if (loading) return <Loading />;

  const currentUserId = useStore.getState().user?.id;

  return (
    <div className="space-y-5 animate-[fadeIn_0.2s_ease-out]">
      {/* Org Settings */}
      {currentOrg && (
        <SectionCard title={t('settingsTitle')}>
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_auto] gap-4">
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">{t('nameLabel')}</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full px-3 py-2 bg-bg border border-border-default rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">{t('slugLabel')}</label>
                <div className="px-3 py-2 bg-surface-1 border border-border-default rounded-lg text-xs text-text-tertiary font-mono min-w-[140px]">
                  /{currentOrg.slug}
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">{t('systemPromptLabel')}</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder={t('systemPromptPlaceholder')}
                rows={3}
                className="w-full px-3 py-2 bg-bg border border-border-default rounded-lg text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors resize-none"
              />
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={handleSaveSettings}
                disabled={saving || !orgName.trim()}
                className="px-4 py-2 text-xs bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 font-medium"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {t('saveChanges')}
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Members */}
      {currentOrg && (
        <SectionCard
          title={t('membersCount', { count: members.length })}
          action={
            <button
              onClick={() => setShowInvite(!showInvite)}
              className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover cursor-pointer transition-colors font-medium"
            >
              <UserPlus size={12} />
              {t('invite')}
            </button>
          }
        >
          {showInvite && (
            <form onSubmit={handleInvite} className="flex items-end gap-2 pb-3 mb-3 border-b border-border-default">
              <div className="flex-1">
                <label className="text-[10px] font-medium text-text-tertiary mb-1 block uppercase tracking-wider">{t('columnUser')}</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  className="w-full px-3 py-2 bg-bg border border-border-default rounded-lg text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
                  autoFocus
                />
              </div>
              <div className="w-28">
                <label className="text-[10px] font-medium text-text-tertiary mb-1 block uppercase tracking-wider">{t('columnRole')}</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 bg-bg border border-border-default rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent transition-colors cursor-pointer"
                >
                  <option value="viewer">{t('roleViewer')}</option>
                  <option value="editor">{t('roleEditor')}</option>
                  <option value="admin">{t('roleAdmin')}</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={inviting || !inviteEmail.trim()}
                className="px-4 py-2 text-xs bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 font-medium"
              >
                {inviting ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                {t('invite')}
              </button>
              <button type="button" onClick={() => setShowInvite(false)} className="p-2 text-text-tertiary hover:text-text-secondary cursor-pointer">
                <X size={13} />
              </button>
            </form>
          )}

          <div className="space-y-1">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-1/50 transition-colors">
                <div className="w-8 h-8 bg-surface-1 border border-border-default rounded-full flex items-center justify-center text-[11px] font-mono text-text-tertiary shrink-0 overflow-hidden">
                  {m.avatarUrl ? (
                    <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    m.name?.charAt(0)?.toUpperCase() || '?'
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-primary font-medium">{m.name}</div>
                  <div className="text-[10px] text-text-tertiary">{m.email}</div>
                </div>
                <div className="text-[10px] text-text-tertiary">{fmtDate(m.joinedAt)}</div>
                <select
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                  disabled={changingRole === m.userId || m.userId === currentUserId}
                  className="px-2 py-1 bg-bg border border-border-default rounded text-[10px] text-text-secondary focus:outline-none focus:border-accent transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  <option value="viewer">{t('roleViewer')}</option>
                  <option value="editor">{t('roleEditor')}</option>
                  <option value="admin">{t('roleAdmin')}</option>
                  <option value="owner">{t('roleOwner')}</option>
                </select>
                {m.userId !== currentUserId && (
                  <button
                    onClick={() => handleRemoveMember(m.userId, m.name)}
                    className="p-1 text-text-tertiary hover:text-error cursor-pointer transition-colors"
                    title={t('removeMemberTooltip')}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* All Orgs */}
      <SectionCard
        title={t('allOrganizations')}
        action={
          <button
            onClick={() => setCreateOrgOpen(true)}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover cursor-pointer transition-colors font-medium"
          >
            <Plus size={12} />
            {t('new')}
          </button>
        }
      >
        <div className="space-y-2">
          {orgs.map((org) => (
            <div
              key={org.id}
              className={`flex items-center gap-3 rounded-lg px-3 py-3 cursor-pointer transition-all ${
                org.id === currentOrg?.id
                  ? 'bg-accent/5 border border-accent/20'
                  : 'hover:bg-surface-1/50 border border-transparent'
              }`}
              onClick={() => org.id !== currentOrg?.id && switchOrgFn(org.id)}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                org.id === currentOrg?.id ? 'bg-accent/10 border border-accent/20' : 'bg-surface-1 border border-border-default'
              }`}>
                <Building2 size={15} className={org.id === currentOrg?.id ? 'text-accent' : 'text-text-tertiary'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-text-primary font-medium">{org.name}</div>
                <div className="text-[10px] text-text-tertiary font-mono">/{org.slug}</div>
              </div>
              <div className="text-[10px] text-text-tertiary">{t('memberCount', { count: org.memberCount })}</div>
              <RoleBadge role={org.role} />
            </div>
          ))}
        </div>
      </SectionCard>

      <CreateOrgDialog open={createOrgOpen} onClose={() => setCreateOrgOpen(false)} onCreated={() => loadData()} switchAfterCreate />
    </div>
  );
}
