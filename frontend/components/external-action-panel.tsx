'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import * as api from '@/lib/api';
import type { ExternalAction } from '@/lib/types';
import {
  Mail, MessageSquare, Users, Loader2, Check, X,
  Clock, Send, AlertTriangle, ChevronDown, ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { toast } from './toast';
import { Badge } from './ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';

const ACTION_ICONS: Record<string, React.ElementType> = {
  email: Mail,
  slack: MessageSquare,
  teams: Users,
};

const ACTION_LABEL_KEYS: Record<string, string> = {
  email: 'email',
  slack: 'slack',
  teams: 'teams',
};

function StatusBadge({ status, label }: { status: ExternalAction['status']; label: string }) {
  const config = {
    pending: { cls: 'text-warning bg-warning/10 border-warning/20' },
    approved: { cls: 'text-accent bg-accent/10 border-accent/20' },
    sent: { cls: 'text-green-500 bg-green-500/10 border-green-500/20' },
    failed: { cls: 'text-error bg-error/10 border-error/20' },
    rejected: { cls: 'text-text-tertiary bg-surface-1 border-border-default' },
  }[status] ?? { cls: 'text-text-tertiary bg-surface-1 border-border-default' };

  return (
    <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border font-medium ${config.cls}`}>
      {label}
    </span>
  );
}

function previewStr(preview: Record<string, unknown>, key: string): string | null {
  const v = preview[key];
  return v != null ? String(v) : null;
}

function ActionPreview({ action, t }: { action: ExternalAction; t: (key: string) => string }) {
  const preview = action.preview ?? {};
  const to = previewStr(preview, 'to');
  const subject = previewStr(preview, 'subject');
  const body = previewStr(preview, 'body');
  const channel = previewStr(preview, 'channel');
  const message = previewStr(preview, 'message');

  if (action.actionType === 'email') {
    return (
      <div className="space-y-1.5 text-[11px]">
        {to && (
          <div className="flex gap-2">
            <span className="text-text-tertiary w-12 shrink-0">{t('to')}</span>
            <span className="text-text-primary truncate">{to}</span>
          </div>
        )}
        {subject && (
          <div className="flex gap-2">
            <span className="text-text-tertiary w-12 shrink-0">{t('subject')}</span>
            <span className="text-text-primary truncate">{subject}</span>
          </div>
        )}
        {body && (
          <div className="mt-1">
            <span className="text-text-tertiary">{t('body')}</span>
            <p className="text-text-secondary mt-0.5 whitespace-pre-wrap line-clamp-4 text-[10px]">
              {body}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Slack / Teams
  return (
    <div className="space-y-1.5 text-[11px]">
      {channel && (
        <div className="flex gap-2">
          <span className="text-text-tertiary w-14 shrink-0">{t('channel')}</span>
          <span className="text-text-primary truncate">#{channel}</span>
        </div>
      )}
      {message && (
        <div className="mt-1">
          <span className="text-text-tertiary">{t('message')}</span>
          <p className="text-text-secondary mt-0.5 whitespace-pre-wrap line-clamp-4 text-[10px]">
            {message}
          </p>
        </div>
      )}
    </div>
  );
}

function ActionCard({
  action,
  onApprove,
  onReject,
  isProcessing,
  t,
}: {
  action: ExternalAction;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  isProcessing?: boolean;
  t: (key: string) => string;
}) {
  const [expanded, setExpanded] = useState(action.status === 'pending');
  const TypeIcon = ACTION_ICONS[action.actionType] ?? ExternalLink;
  const isPending = action.status === 'pending';
  const labelKey = ACTION_LABEL_KEYS[action.actionType];

  return (
    <div className="rounded-lg border border-border-default bg-surface-1 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-surface-2 transition-colors cursor-pointer text-left"
      >
        <div className="w-7 h-7 rounded-md flex items-center justify-center bg-surface-0 border border-border-default shrink-0">
          <TypeIcon size={13} className="text-text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-text-primary">
              {labelKey ? t(labelKey) : action.actionType}
            </span>
            <StatusBadge status={action.status} label={action.status === 'pending' ? t('pendingTab') : action.status.charAt(0).toUpperCase() + action.status.slice(1)} />
          </div>
          <p className="text-[10px] text-text-tertiary mt-0.5">
            {new Date(action.createdAt).toLocaleString()}
          </p>
        </div>
        {expanded ? <ChevronDown size={13} className="text-text-tertiary" /> : <ChevronRight size={13} className="text-text-tertiary" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-border-default/50">
          <div className="pt-2.5">
            <ActionPreview action={action} t={t} />
          </div>

          {isPending && onApprove && onReject && (
            <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border-default/50">
              <button
                onClick={() => onApprove(action.id)}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {t('approve')}
              </button>
              <button
                onClick={() => onReject(action.id)}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-surface-0 text-text-secondary border border-border-default rounded-lg hover:bg-surface-2 hover:text-error cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} {t('reject')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ExternalActionPanel({ agentRunId }: { agentRunId?: string }) {
  const t = useTranslations('externalActions');
  const [actions, setActions] = useState<ExternalAction[] | null>(null);
  const [processing, setProcessing] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    api.listExternalActions(agentRunId ? { agent_run_id: agentRunId } : undefined)
      .then(setActions)
      .catch(() => {
        setActions([]);
        toast.error('Failed to load external actions');
      });
  }, [agentRunId]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id: string) => {
    setProcessing((p) => ({ ...p, [id]: true }));
    try {
      await api.approveExternalAction(id);
      toast.success('Action approved');
      load();
    } catch {
      toast.error('Failed to approve action');
    } finally {
      setProcessing((p) => ({ ...p, [id]: false }));
    }
  };

  const handleReject = async (id: string) => {
    setProcessing((p) => ({ ...p, [id]: true }));
    try {
      await api.rejectExternalAction(id);
      toast.success('Action rejected');
      load();
    } catch {
      toast.error('Failed to reject action');
    } finally {
      setProcessing((p) => ({ ...p, [id]: false }));
    }
  };

  const pending = actions?.filter((a) => a.status === 'pending') ?? [];
  const history = actions?.filter((a) => a.status !== 'pending') ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-default">
        <Send size={16} className="text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">{t('externalActions')}</h2>
        {pending.length > 0 && (
          <Badge className="bg-warning/10 text-warning border-warning/20 text-[10px]">
            {pending.length} {t('pending')}
          </Badge>
        )}
      </div>

      {actions === null ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={16} className="animate-spin text-text-tertiary" />
        </div>
      ) : actions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
          <Send size={24} className="mb-2 opacity-40" />
          <p className="text-xs">{t('noActionsYet')}</p>
        </div>
      ) : (
        <Tabs defaultValue="pending" className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-2">
            <TabsList>
              <TabsTrigger value="pending">
                {t('pendingTab')} {pending.length > 0 && `(${pending.length})`}
              </TabsTrigger>
              <TabsTrigger value="history">
                {t('historyTab')} {history.length > 0 && `(${history.length})`}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="pending" className="flex-1 min-h-0">
            <ScrollArea className="h-full px-4 pb-4">
              {pending.length === 0 ? (
                <div className="text-center py-8 text-text-tertiary text-xs">
                  <Clock size={20} className="mx-auto mb-2 opacity-40" />
                  {t('noPendingActions')}
                </div>
              ) : (
                <div className="space-y-2">
                  {pending.map((a) => (
                    <ActionCard
                      key={a.id}
                      action={a}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      isProcessing={!!processing[a.id]}
                      t={t}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="history" className="flex-1 min-h-0">
            <ScrollArea className="h-full px-4 pb-4">
              {history.length === 0 ? (
                <div className="text-center py-8 text-text-tertiary text-xs">
                  {t('noActionHistory')}
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((a) => (
                    <ActionCard key={a.id} action={a} t={t} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
