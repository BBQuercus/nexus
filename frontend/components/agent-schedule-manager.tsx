'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { AgentSchedule } from '@/lib/types';
import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus, Trash2, Play, Clock, Calendar, Loader2, AlertCircle, Inbox, X, Bell, Pencil, Save,
} from 'lucide-react';

interface AgentScheduleManagerProps {
  agentPersonaId?: string;
  onTriggered?: () => void;
}

const CRON_PRESETS: { key: string; cron: string }[] = [
  { key: 'everyHour', cron: '0 * * * *' },
  { key: 'everyDayAt9', cron: '0 9 * * *' },
  { key: 'everyMondayAt9', cron: '0 9 * * 1' },
  { key: 'every15Minutes', cron: '*/15 * * * *' },
  { key: 'every6Hours', cron: '0 */6 * * *' },
  { key: 'weekdaysAt8', cron: '0 8 * * 1-5' },
  { key: 'firstOfMonth', cron: '0 9 1 * *' },
];

export default function AgentScheduleManager({ agentPersonaId, onTriggered }: AgentScheduleManagerProps) {
  const t = useTranslations('agentSchedules');
  const [schedules, setSchedules] = useState<AgentSchedule[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCron, setFormCron] = useState('');
  const [formInput, setFormInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Action loading states
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    try {
      setError(null);
      const data = await api.listAgentSchedules();
      // Filter by agent if provided
      const filtered = agentPersonaId
        ? data.filter((s) => s.agentPersonaId === agentPersonaId)
        : data;
      setSchedules(filtered);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load schedules');
      setSchedules([]);
    }
  }, [agentPersonaId]);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  function openCreate() {
    setEditingId(null);
    setFormName('');
    setFormCron('');
    setFormInput('');
    setShowForm(true);
  }

  function openEdit(schedule: AgentSchedule) {
    setEditingId(schedule.id);
    setFormName(schedule.name);
    setFormCron(schedule.cronExpression);
    setFormInput(schedule.inputText || '');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSave() {
    if (!formName.trim() || !formCron.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await api.updateAgentSchedule(editingId, {
          name: formName.trim(),
          cron_expression: formCron.trim(),
          input_text: formInput.trim() || undefined,
        });
      } else {
        if (!agentPersonaId) return;
        await api.createAgentSchedule({
          agent_persona_id: agentPersonaId,
          name: formName.trim(),
          cron_expression: formCron.trim(),
          input_text: formInput.trim() || undefined,
        });
      }
      closeForm();
      await fetchSchedules();
    } catch (e) {
      setError(e instanceof Error ? e.message : editingId ? 'Failed to update schedule' : 'Failed to create schedule');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(schedule: AgentSchedule) {
    setTogglingId(schedule.id);
    try {
      await api.updateAgentSchedule(schedule.id, { enabled: !schedule.enabled });
      await fetchSchedules();
    } catch {
      // handled by apiFetch
    } finally {
      setTogglingId(null);
    }
  }

  async function handleTrigger(id: string) {
    setTriggeringId(id);
    try {
      await api.triggerAgentSchedule(id);
      await fetchSchedules();
      onTriggered?.();
    } catch {
      // handled by apiFetch
    } finally {
      setTriggeringId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.deleteAgentSchedule(id);
      setConfirmDeleteId(null);
      await fetchSchedules();
    } catch {
      // handled by apiFetch
    } finally {
      setDeletingId(null);
    }
  }

  // Loading
  if (schedules === null) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-[11px] text-text-tertiary uppercase tracking-wider font-medium">{t('schedules')}</span>
        {agentPersonaId && (
          <Button size="sm" variant="outline" onClick={() => showForm ? closeForm() : openCreate()} className="h-7 text-[11px]">
            {showForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {showForm ? t('cancel') : t('newSchedule')}
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-red-400">
          <AlertCircle className="h-3 w-3" />
          {error}
        </div>
      )}

      {/* Create / Edit form */}
      {showForm && (
        <div className={`p-4 rounded-lg border space-y-3 mb-3 ${editingId ? 'border-accent/30 bg-surface-1' : 'border-border-default bg-surface-0'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-primary">
              {editingId ? t('editSchedule') : t('newSchedule')}
            </span>
            <button
              type="button"
              onClick={closeForm}
              className="p-1 rounded hover:bg-surface-0 text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-text-secondary">{t('scheduleName')}</Label>
            <Input
              autoFocus
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Daily summary"
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-text-secondary">{t('cronExpression')}</Label>
            <Input
              value={formCron}
              onChange={(e) => setFormCron(e.target.value)}
              placeholder="0 9 * * *"
              className="font-mono h-8 text-xs"
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              {CRON_PRESETS.map((preset) => (
                <button
                  key={preset.cron}
                  type="button"
                  onClick={() => setFormCron(preset.cron)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 border border-border text-text-secondary hover:text-text-primary hover:border-border-focus transition-colors cursor-pointer"
                >
                  {t(preset.key)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-text-secondary">{t('inputTextOptional')}</Label>
            <Textarea
              value={formInput}
              onChange={(e) => setFormInput(e.target.value)}
              placeholder="Input to pass to the agent on each run..."
              className="min-h-[60px] text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              onClick={closeForm}
              className="px-3 py-1.5 text-[11px] text-text-secondary hover:text-text-primary rounded-lg hover:bg-surface-0 transition-colors cursor-pointer"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formName.trim() || !formCron.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-accent text-bg rounded-lg hover:bg-accent-hover cursor-pointer transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {editingId ? t('saveChanges') : t('createSchedule')}
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {schedules.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center py-10 text-text-tertiary">
          <Calendar className="h-6 w-6 mb-2 opacity-30" />
          <p className="text-xs">{t('noSchedules')}</p>
          <p className="text-[10px] mt-0.5">{t('createScheduleHint')}</p>
        </div>
      )}

      {/* Schedule list */}
      {schedules.length > 0 && (
        <div className="space-y-2">
          {schedules.map((schedule) => editingId === schedule.id ? null : (
            <div key={schedule.id} className="bg-surface-1 border border-border-default rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-text-primary truncate">{schedule.name}</span>
                  <Badge variant={schedule.enabled ? 'default' : 'outline'}>
                    {schedule.enabled ? t('enabled') : t('disabled')}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {togglingId === schedule.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-text-secondary" />
                  ) : (
                    <Switch
                      checked={schedule.enabled}
                      onCheckedChange={() => handleToggle(schedule)}
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-text-secondary">
                <span className="flex items-center gap-1 font-mono">
                  <Clock className="h-3 w-3" />
                  {schedule.cronExpression}
                </span>
                {schedule.lastRunAt && (
                  <span className="flex items-center gap-1">
                    Last: {new Date(schedule.lastRunAt).toLocaleString()}
                  </span>
                )}
                {schedule.nextRunAt && (
                  <span className="flex items-center gap-1">
                    Next: {new Date(schedule.nextRunAt).toLocaleString()}
                  </span>
                )}
              </div>

              {schedule.inputText && (
                <p className="text-xs text-text-secondary truncate">{schedule.inputText}</p>
              )}

              <div className="flex items-center gap-1.5 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTrigger(schedule.id)}
                  disabled={triggeringId === schedule.id}
                >
                  {triggeringId === schedule.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Play className="h-3 w-3" />
                  }
                  {t('triggerNow')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-text-secondary hover:text-text-primary"
                  onClick={() => openEdit(schedule)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>

                {confirmDeleteId === schedule.id ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-red-400">{t('deleteConfirm')}</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(schedule.id)}
                      disabled={deletingId === schedule.id}
                    >
                      {deletingId === schedule.id ? <Loader2 className="h-3 w-3 animate-spin" /> : t('yes')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                      {t('no')}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-text-secondary hover:text-red-400"
                    onClick={() => setConfirmDeleteId(schedule.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notification integration teaser */}
      <div className="mt-4 p-3 rounded-lg border border-dashed border-border-default bg-surface-0/50">
        <div className="flex items-center gap-2 mb-1.5">
          <Bell className="h-3.5 w-3.5 text-text-tertiary" />
          <span className="text-[11px] font-medium text-text-secondary">{t('notificationsTitle')}</span>
          <Badge variant="outline" className="text-[9px] px-1 py-0">{t('comingSoon')}</Badge>
        </div>
        <p className="text-[10px] text-text-tertiary leading-relaxed">
          {t('notificationsDescription')}
        </p>
      </div>
    </div>
  );
}
