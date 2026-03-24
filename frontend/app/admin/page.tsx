'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Users, MessageSquare, ThumbsUp, ThumbsDown, AlertTriangle, Cpu, RefreshCw, BarChart3 } from 'lucide-react';
import PageShell from '@/components/page-shell';
import * as api from '@/lib/api';

type Tab = 'overview' | 'feedback' | 'users' | 'errors';

// Safe accessors
const s = (v: unknown) => (v != null ? String(v) : '');
const n = (v: unknown) => { const x = Number(v); return isNaN(x) ? 0 : x; };
const fmt = (v: unknown) => n(v).toLocaleString();
const fmtDate = (v: unknown) => {
  if (!v) return '-';
  try { return new Date(String(v)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return s(v); }
};

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [auth, setAuth] = useState<boolean | null>(null);

  useEffect(() => {
    api.getCurrentUser()
      .then((u) => setAuth(!!u.isAdmin))
      .catch(() => setAuth(false));
  }, []);

  if (auth === null) return <div className="h-screen bg-bg flex items-center justify-center"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;

  if (!auth) return (
    <div className="h-screen bg-bg flex flex-col items-center justify-center gap-3">
      <Shield size={32} className="text-text-tertiary" />
      <p className="text-sm text-text-tertiary">Admin access required</p>
      <button onClick={() => router.push('/')} className="text-xs text-accent hover:underline cursor-pointer">Back to Nexus</button>
    </div>
  );

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 size={13} /> },
    { id: 'feedback', label: 'Feedback', icon: <ThumbsUp size={13} /> },
    { id: 'users', label: 'Users', icon: <Users size={13} /> },
    { id: 'errors', label: 'Errors', icon: <AlertTriangle size={13} /> },
  ];

  const adminSidebar = (
    <>
      <div className="px-2 py-2.5 flex flex-col gap-0.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 text-xs rounded-lg cursor-pointer transition-colors ${
              tab === t.id
                ? 'bg-accent/8 text-text-primary border-l-2 border-accent'
                : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary border-l-2 border-transparent'
            }`}
          >
            <span className="text-text-tertiary shrink-0">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1" />
    </>
  );

  return (
    <PageShell title="Admin" sidebar={adminSidebar}>
      <div className="flex-1 overflow-y-auto p-4 max-w-5xl mx-auto w-full">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'feedback' && <FeedbackTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'errors' && <ErrorsTab />}
      </div>
    </PageShell>
  );
}

function OverviewTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { api.getAdminOverview().then(setData).catch(() => {}); }, []);
  if (!data) return <Loading />;

  const stats = [
    { label: 'Users', value: fmt(data.total_users) },
    { label: 'Active (24h)', value: fmt(data.active_users_24h) },
    { label: 'Conversations', value: fmt(data.total_conversations) },
    { label: 'Messages today', value: fmt(data.messages_today) },
    { label: 'Errors today', value: fmt(data.errors_today) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface-0 border border-border-default rounded-lg px-3 py-2.5">
            <div className="text-[10px] text-text-tertiary uppercase tracking-wider">{s.label}</div>
            <div className="text-lg font-bold text-text-primary mt-0.5 font-mono">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedbackTab() {
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-tertiary uppercase tracking-wider">{items.length} feedback entries</span>
        <button onClick={load} className="text-text-tertiary hover:text-text-secondary cursor-pointer"><RefreshCw size={12} /></button>
      </div>
      {items.length === 0 ? (
        <div className="text-center text-text-tertiary text-xs py-12">No feedback yet</div>
      ) : (
        <div className="space-y-1">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-3 bg-surface-0 border border-border-default rounded-lg px-3 py-2">
              {item.rating === 'up' ? <ThumbsUp size={12} className="text-accent mt-0.5 shrink-0" /> : <ThumbsDown size={12} className="text-error mt-0.5 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-text-secondary truncate">{s(item.message_preview) || 'No preview'}</div>
                {item.comment ? <div className="text-[11px] text-text-tertiary mt-0.5">{s(item.comment)}</div> : null}
                {(item.tags as string[] || []).length > 0 && (
                  <div className="flex gap-1 mt-1">{(item.tags as string[]).map((tag, j) => (
                    <span key={j} className="text-[9px] px-1.5 py-0.5 bg-surface-1 border border-border-default rounded text-text-tertiary">{tag}</span>
                  ))}</div>
                )}
              </div>
              <div className="text-[10px] text-text-tertiary shrink-0 font-mono">{s(item.model).split('/').pop()}</div>
              <div className="text-[10px] text-text-tertiary shrink-0">{fmtDate(item.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    api.getAdminUsers()
      .then((res) => {
        // API returns {items: [...]} or direct array
        const arr = Array.isArray(res) ? res : ((res as Record<string, unknown>).items as Record<string, unknown>[]) || [];
        setUsers(arr);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleAdmin = async (userId: string, isAdmin: boolean) => {
    setTogglingId(userId);
    try {
      await api.updateAdminUser(userId, { is_admin: !isAdmin });
      setUsers((prev) => prev.map((u) => s(u.id) === userId ? { ...u, is_admin: !isAdmin } : u));
    } catch {} finally { setTogglingId(null); }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-1">
      {users.map((u) => (
        <div key={s(u.id)} className="flex items-center gap-3 bg-surface-0 border border-border-default rounded-lg px-3 py-2">
          <div className="w-7 h-7 bg-surface-2 rounded-full flex items-center justify-center text-[11px] font-mono text-text-tertiary shrink-0">
            {s(u.name).charAt(0).toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-text-primary">{s(u.name)}</div>
            <div className="text-[10px] text-text-tertiary">{s(u.email)}</div>
          </div>
          <div className="text-[10px] text-text-tertiary font-mono">{fmt(u.conversation_count)} convs</div>
          <div className="text-[10px] text-text-tertiary font-mono">{fmt(u.message_count)} msgs</div>
          <div className="text-[10px] text-text-tertiary">{fmtDate(u.last_seen)}</div>
          <button
            onClick={() => toggleAdmin(s(u.id), !!u.is_admin)}
            disabled={togglingId === s(u.id)}
            className="cursor-pointer disabled:opacity-50"
          >
            <div className={`relative w-8 h-[18px] rounded-full transition-colors ${u.is_admin ? 'bg-accent' : 'bg-surface-2 border border-border-default'}`}>
              <div className={`absolute top-[3px] w-3 h-3 rounded-full bg-white transition-all ${u.is_admin ? 'left-[14px]' : 'left-[3px] opacity-50'}`} />
            </div>
          </button>
        </div>
      ))}
    </div>
  );
}

function ErrorsTab() {
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
    <div className="space-y-1">
      {errors.length === 0 ? (
        <div className="text-center text-text-tertiary text-xs py-12">No errors recorded</div>
      ) : errors.map((err, i) => (
        <div key={i} className="bg-surface-0 border border-border-default rounded-lg px-3 py-2">
          <div className="flex items-start gap-2">
            <AlertTriangle size={11} className="text-error mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-error truncate">{s(err.message)}</div>
              {err.url ? <div className="text-[10px] text-text-tertiary font-mono truncate mt-0.5">{s(err.url)}</div> : null}
            </div>
            <div className="text-[10px] text-text-tertiary shrink-0">{fmtDate(err.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
