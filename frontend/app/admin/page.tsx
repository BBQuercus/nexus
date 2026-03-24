'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3, Users, MessageSquare, ThumbsUp, ThumbsDown, AlertTriangle,
  Cpu, Shield, RefreshCw, ChevronLeft, ChevronRight, Zap,
} from 'lucide-react';
import * as api from '@/lib/api';

type Tab = 'overview' | 'feedback' | 'usage' | 'models' | 'users' | 'errors';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <BarChart3 size={14} /> },
  { id: 'feedback', label: 'Feedback', icon: <ThumbsUp size={14} /> },
  { id: 'usage', label: 'Usage', icon: <BarChart3 size={14} /> },
  { id: 'models', label: 'Models', icon: <Cpu size={14} /> },
  { id: 'users', label: 'Users', icon: <Users size={14} /> },
  { id: 'errors', label: 'Errors', icon: <AlertTriangle size={14} /> },
];

function StatCard({ label, value, icon, accent }: { label: string; value: string | number; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className="bg-surface-0 border border-border-default rounded-xl p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${accent ? 'bg-accent/10 text-accent' : 'bg-surface-1 text-text-tertiary'}`}>
        {icon}
      </div>
      <div>
        <div className="text-[11px] text-text-tertiary uppercase tracking-wider font-medium">{label}</div>
        <div className="text-xl font-bold text-text-primary mt-0.5">{value}</div>
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 mt-4">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="flex items-center gap-1 px-2 py-1 text-xs text-text-tertiary hover:text-text-secondary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
      >
        <ChevronLeft size={12} /> Prev
      </button>
      <span className="text-xs text-text-tertiary">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="flex items-center gap-1 px-2 py-1 text-xs text-text-tertiary hover:text-text-secondary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
      >
        Next <ChevronRight size={12} />
      </button>
    </div>
  );
}

function OverviewTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAdminOverview().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (!data) return <div className="text-text-tertiary text-sm">Failed to load overview.</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Total Users" value={num(data.total_users)} icon={<Users size={16} />} accent />
        <StatCard label="Active Today" value={num(data.active_today)} icon={<Users size={16} />} />
        <StatCard label="Conversations" value={num(data.total_conversations)} icon={<MessageSquare size={16} />} />
        <StatCard label="Messages Today" value={num(data.messages_today)} icon={<MessageSquare size={16} />} accent />
        <StatCard label="Error Rate" value={`${num(data.error_rate)}%`} icon={<AlertTriangle size={16} />} />
      </div>
      {data.summary ? (
        <div className="bg-surface-0 border border-border-default rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-2">Summary</h3>
          <p className="text-xs text-text-secondary leading-relaxed">{String(data.summary)}</p>
        </div>
      ) : null}
    </div>
  );
}

function FeedbackTab() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [ratingFilter, setRatingFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getAdminFeedback({ page, rating: ratingFilter || undefined, model: modelFilter || undefined })
      .then((res) => {
        setItems((res.items as Record<string, unknown>[]) || []);
        setTotalPages((res.total_pages as number) || 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, ratingFilter, modelFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={ratingFilter}
          onChange={(e) => { setRatingFilter(e.target.value); setPage(1); }}
          className="bg-surface-1 border border-border-default rounded-lg px-2 py-1.5 text-xs text-text-secondary outline-none focus:border-border-focus"
        >
          <option value="">All ratings</option>
          <option value="up">Thumbs up</option>
          <option value="down">Thumbs down</option>
        </select>
        <input
          type="text"
          placeholder="Filter by model..."
          value={modelFilter}
          onChange={(e) => { setModelFilter(e.target.value); setPage(1); }}
          className="bg-surface-1 border border-border-default rounded-lg px-2 py-1.5 text-xs text-text-secondary placeholder:text-text-tertiary/50 outline-none focus:border-border-focus w-48"
        />
        <button onClick={load} className="text-text-tertiary hover:text-text-secondary cursor-pointer">
          <RefreshCw size={13} />
        </button>
      </div>

      {loading ? <LoadingSkeleton /> : (
        <div className="bg-surface-0 border border-border-default rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-default text-text-tertiary text-left">
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Message</th>
                <th className="px-3 py-2 font-medium">Rating</th>
                <th className="px-3 py-2 font-medium">Tags</th>
                <th className="px-3 py-2 font-medium">Comment</th>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-text-tertiary">No feedback found.</td></tr>
              ) : items.map((item, i) => (
                <tr key={i} className="border-b border-border-subtle hover:bg-surface-1/50 transition-colors">
                  <td className="px-3 py-2 text-text-secondary">{str(item.user_name || item.user_email)}</td>
                  <td className="px-3 py-2 text-text-secondary max-w-[200px] truncate">{str(item.message_preview)}</td>
                  <td className="px-3 py-2">
                    {item.rating === 'up' ? <ThumbsUp size={12} className="text-accent" /> : <ThumbsDown size={12} className="text-error" />}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(item.tags as string[] || []).map((tag: string, j: number) => (
                        <span key={j} className="px-1.5 py-0.5 text-[10px] bg-surface-1 border border-border-default rounded text-text-tertiary">{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-text-tertiary max-w-[150px] truncate">{str(item.comment)}</td>
                  <td className="px-3 py-2 text-text-tertiary font-mono">{str(item.model)}</td>
                  <td className="px-3 py-2 text-text-tertiary">{formatDate(item.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

function UsageTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAdminUsage().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (!data) return <div className="text-text-tertiary text-sm">Failed to load usage data.</div>;

  const topUsers = (data.top_users as Record<string, unknown>[]) || [];
  const popularModels = (data.popular_models as Record<string, unknown>[]) || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Messages/Day Avg" value={num(data.messages_per_day_avg)} icon={<MessageSquare size={16} />} accent />
        <StatCard label="Tokens This Month" value={formatNumber(data.tokens_this_month)} icon={<Cpu size={16} />} />
        <StatCard label="Cost This Month" value={`$${num(data.cost_this_month)}`} icon={<BarChart3 size={16} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-0 border border-border-default rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border-default">
            <h3 className="text-xs font-semibold text-text-primary">Most Active Users</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-default text-text-tertiary text-left">
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium text-right">Messages</th>
                <th className="px-3 py-2 font-medium text-right">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {topUsers.map((u, i) => (
                <tr key={i} className="border-b border-border-subtle hover:bg-surface-1/50 transition-colors">
                  <td className="px-3 py-2 text-text-secondary">{str(u.name || u.email)}</td>
                  <td className="px-3 py-2 text-text-tertiary text-right font-mono">{num(u.message_count)}</td>
                  <td className="px-3 py-2 text-text-tertiary text-right font-mono">{formatNumber(u.total_tokens)}</td>
                </tr>
              ))}
              {topUsers.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-text-tertiary">No data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-surface-0 border border-border-default rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border-default">
            <h3 className="text-xs font-semibold text-text-primary">Popular Models</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-default text-text-tertiary text-left">
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 font-medium text-right">Messages</th>
                <th className="px-3 py-2 font-medium text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {popularModels.map((m, i) => (
                <tr key={i} className="border-b border-border-subtle hover:bg-surface-1/50 transition-colors">
                  <td className="px-3 py-2 text-text-secondary font-mono">{str(m.model)}</td>
                  <td className="px-3 py-2 text-text-tertiary text-right font-mono">{num(m.message_count)}</td>
                  <td className="px-3 py-2 text-text-tertiary text-right font-mono">${num(m.total_cost)}</td>
                </tr>
              ))}
              {popularModels.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-text-tertiary">No data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ModelsTab() {
  const [models, setModels] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAdminModels().then(setModels).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="bg-surface-0 border border-border-default rounded-xl overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border-default text-text-tertiary text-left">
            <th className="px-3 py-2 font-medium">Model</th>
            <th className="px-3 py-2 font-medium text-right">Messages</th>
            <th className="px-3 py-2 font-medium text-right">Avg Input Tok</th>
            <th className="px-3 py-2 font-medium text-right">Avg Output Tok</th>
            <th className="px-3 py-2 font-medium text-right">Total Cost</th>
            <th className="px-3 py-2 font-medium text-right">Avg Cost/Msg</th>
          </tr>
        </thead>
        <tbody>
          {models.length === 0 ? (
            <tr><td colSpan={6} className="px-3 py-8 text-center text-text-tertiary">No model data yet.</td></tr>
          ) : models.map((m, i) => (
            <tr key={i} className="border-b border-border-subtle hover:bg-surface-1/50 transition-colors">
              <td className="px-3 py-2 text-text-secondary font-mono">{str(m.model)}</td>
              <td className="px-3 py-2 text-text-tertiary text-right font-mono">{num(m.message_count)}</td>
              <td className="px-3 py-2 text-text-tertiary text-right font-mono">{formatNumber(m.avg_input_tokens)}</td>
              <td className="px-3 py-2 text-text-tertiary text-right font-mono">{formatNumber(m.avg_output_tokens)}</td>
              <td className="px-3 py-2 text-text-tertiary text-right font-mono">${num(m.total_cost)}</td>
              <td className="px-3 py-2 text-text-tertiary text-right font-mono">${num(m.avg_cost_per_message)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    api.getAdminUsers().then(setUsers).catch(console.error).finally(() => setLoading(false));
  }, []);

  const toggleAdmin = async (userId: string, currentIsAdmin: boolean) => {
    setTogglingId(userId);
    try {
      await api.updateAdminUser(userId, { is_admin: !currentIsAdmin });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_admin: !currentIsAdmin } : u));
    } catch (e) {
      console.error('Failed to update user:', e);
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="bg-surface-0 border border-border-default rounded-xl overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border-default text-text-tertiary text-left">
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Email</th>
            <th className="px-3 py-2 font-medium text-right">Conversations</th>
            <th className="px-3 py-2 font-medium text-right">Messages</th>
            <th className="px-3 py-2 font-medium">Last Seen</th>
            <th className="px-3 py-2 font-medium text-center">Admin</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr><td colSpan={6} className="px-3 py-8 text-center text-text-tertiary">No users found.</td></tr>
          ) : users.map((u) => (
            <tr key={str(u.id)} className="border-b border-border-subtle hover:bg-surface-1/50 transition-colors">
              <td className="px-3 py-2 text-text-secondary">{str(u.name)}</td>
              <td className="px-3 py-2 text-text-tertiary">{str(u.email)}</td>
              <td className="px-3 py-2 text-text-tertiary text-right font-mono">{num(u.conversation_count)}</td>
              <td className="px-3 py-2 text-text-tertiary text-right font-mono">{num(u.message_count)}</td>
              <td className="px-3 py-2 text-text-tertiary">{formatDate(u.last_seen)}</td>
              <td className="px-3 py-2 text-center">
                <button
                  onClick={() => toggleAdmin(str(u.id), !!u.is_admin)}
                  disabled={togglingId === str(u.id)}
                  className="cursor-pointer disabled:opacity-50"
                >
                  <div className={`relative w-8 h-4 rounded-full transition-colors ${u.is_admin ? 'bg-accent' : 'bg-surface-2 border border-border-default'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${u.is_admin ? 'left-4.5 bg-bg' : 'left-0.5 bg-text-tertiary'}`} />
                  </div>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorsTab() {
  const [errors, setErrors] = useState<Record<string, unknown>[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getAdminErrors(page)
      .then((res) => {
        setErrors((res.items as Record<string, unknown>[]) || []);
        setTotalPages((res.total_pages as number) || 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4">
      <div className="bg-surface-0 border border-border-default rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-default text-text-tertiary text-left">
              <th className="px-3 py-2 font-medium">Message</th>
              <th className="px-3 py-2 font-medium">URL</th>
              <th className="px-3 py-2 font-medium">User Agent</th>
              <th className="px-3 py-2 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {errors.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-text-tertiary">No errors recorded.</td></tr>
            ) : errors.map((err, i) => (
              <tr key={i} className="border-b border-border-subtle hover:bg-surface-1/50 transition-colors">
                <td className="px-3 py-2 text-error max-w-[300px] truncate">{str(err.message)}</td>
                <td className="px-3 py-2 text-text-tertiary max-w-[200px] truncate font-mono">{str(err.url)}</td>
                <td className="px-3 py-2 text-text-tertiary max-w-[200px] truncate">{str(err.user_agent)}</td>
                <td className="px-3 py-2 text-text-tertiary">{formatDate(err.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-16 bg-surface-0 border border-border-default rounded-xl animate-pulse" />
      ))}
    </div>
  );
}

// Helpers
function str(val: unknown): string {
  return val != null ? String(val) : '';
}

function num(val: unknown): string {
  if (val == null) return '0';
  const n = Number(val);
  if (isNaN(n)) return '0';
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(2);
}

function formatNumber(val: unknown): string {
  if (val == null) return '0';
  const n = Number(val);
  if (isNaN(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(val: unknown): string {
  if (!val) return '-';
  try {
    return new Date(String(val)).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return str(val);
  }
}

export default function AdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    api.getCurrentUser()
      .then((user) => {
        if (user.isAdmin) {
          setAuthorized(true);
        } else {
          setAuthorized(false);
        }
      })
      .catch(() => {
        setAuthorized(false);
      });
  }, []);

  if (authorized === null) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-4">
        <Shield size={48} className="text-error/60" />
        <h1 className="text-lg font-bold text-text-primary">Access Denied</h1>
        <p className="text-sm text-text-tertiary">You do not have administrator privileges.</p>
        <button
          onClick={() => router.push('/')}
          className="mt-2 px-4 py-2 text-xs font-medium bg-surface-1 border border-border-default rounded-lg text-text-secondary hover:text-text-primary hover:border-border-focus cursor-pointer transition-colors"
        >
          Back to Nexus
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <div className="bg-surface-0 border-b border-border-default">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center h-12 gap-3">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-1.5 text-text-tertiary hover:text-text-secondary cursor-pointer transition-colors mr-2"
            >
              <Zap size={14} className="text-accent" />
              <span className="text-xs font-bold tracking-wider uppercase">Nexus</span>
            </button>
            <div className="h-5 w-[1px] bg-border-default" />
            <div className="flex items-center gap-1.5">
              <Shield size={13} className="text-accent" />
              <span className="text-sm font-semibold text-text-primary">Admin</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 -mb-px overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-accent border-accent'
                    : 'text-text-tertiary border-transparent hover:text-text-secondary hover:border-border-default'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'feedback' && <FeedbackTab />}
        {activeTab === 'usage' && <UsageTab />}
        {activeTab === 'models' && <ModelsTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'errors' && <ErrorsTab />}
      </div>
    </div>
  );
}
