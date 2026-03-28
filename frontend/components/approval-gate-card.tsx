'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ApprovalGate } from '@/lib/types';
import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Check, X, Pencil, Loader2, ShieldCheck, ShieldX, ShieldAlert } from 'lucide-react';

interface ApprovalGateCardProps {
  gate: ApprovalGate;
  onDecision: (gate: ApprovalGate) => void;
}

const STATUS_CONFIG: Record<ApprovalGate['status'], { key: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof Check }> = {
  pending: { key: 'pending', variant: 'outline', icon: ShieldAlert },
  approved: { key: 'approved', variant: 'default', icon: ShieldCheck },
  rejected: { key: 'rejected', variant: 'destructive', icon: ShieldX },
  edited: { key: 'editedApproved', variant: 'secondary', icon: Pencil },
};

export default function ApprovalGateCard({ gate, onDecision }: ApprovalGateCardProps) {
  const t = useTranslations('approvalGates');
  const [loading, setLoading] = useState<'approve' | 'reject' | 'edit' | null>(null);
  const [editing, setEditing] = useState(false);
  const [editedArgs, setEditedArgs] = useState(
    JSON.stringify(gate.toolArguments ?? {}, null, 2)
  );
  const [error, setError] = useState<string | null>(null);

  const isPending = gate.status === 'pending';
  const statusCfg = STATUS_CONFIG[gate.status];
  const StatusIcon = statusCfg.icon;

  async function handleApprove() {
    setLoading('approve');
    setError(null);
    try {
      const updated = await api.approveGate(gate.id);
      onDecision(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to approve');
    } finally {
      setLoading(null);
    }
  }

  async function handleReject() {
    setLoading('reject');
    setError(null);
    try {
      const updated = await api.rejectGate(gate.id);
      onDecision(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reject');
    } finally {
      setLoading(null);
    }
  }

  async function handleEditApprove() {
    setLoading('edit');
    setError(null);
    try {
      const parsed = JSON.parse(editedArgs);
      const updated = await api.editGate(gate.id, parsed);
      onDecision(updated);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON or request failed');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="bg-surface-1 border border-border-default rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon className="h-4 w-4 shrink-0 text-text-secondary" />
          <span className="text-sm font-medium text-text-primary truncate">
            {gate.toolName}
          </span>
        </div>
        <Badge variant={statusCfg.variant}>{t(statusCfg.key)}</Badge>
      </div>

      {/* Arguments display */}
      {gate.toolArguments && !editing && (
        <pre className="bg-surface-0 border border-border rounded-md p-3 text-xs text-text-secondary overflow-x-auto max-h-48">
          {JSON.stringify(gate.toolArguments, null, 2)}
        </pre>
      )}

      {/* Edited arguments (if decided with edits) */}
      {gate.status === 'edited' && gate.editedArguments && (
        <div className="space-y-1">
          <span className="text-xs text-text-secondary font-medium">{t('editedArguments')}</span>
          <pre className="bg-surface-0 border border-border rounded-md p-3 text-xs text-text-secondary overflow-x-auto max-h-48">
            {JSON.stringify(gate.editedArguments, null, 2)}
          </pre>
        </div>
      )}

      {/* Edit mode */}
      {editing && (
        <div className="space-y-2">
          <Textarea
            value={editedArgs}
            onChange={(e) => setEditedArgs(e.target.value)}
            className="font-mono text-xs min-h-[120px] bg-surface-0"
            placeholder={t('editPlaceholder')}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleEditApprove}
              disabled={loading !== null}
            >
              {loading === 'edit' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {t('approveWithEdits')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setEditedArgs(JSON.stringify(gate.toolArguments ?? {}, null, 2));
              }}
              disabled={loading !== null}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Action buttons (only when pending and not editing) */}
      {isPending && !editing && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={loading !== null}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading === 'approve' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {t('approve')}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleReject}
            disabled={loading !== null}
          >
            {loading === 'reject' ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
            {t('reject')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditing(true)}
            disabled={loading !== null}
          >
            <Pencil className="h-3 w-3" />
            {t('editApprove')}
          </Button>
        </div>
      )}

      {/* Decided info */}
      {!isPending && gate.decidedAt && (
        <p className="text-xs text-text-secondary">
          {t('decided')} {new Date(gate.decidedAt).toLocaleString()}
          {gate.decidedBy && ` by ${gate.decidedBy}`}
        </p>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
