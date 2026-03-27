'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, Loader2 } from 'lucide-react';
import { toast } from '@/components/toast';
import { createOrg, switchOrg, getCurrentUser } from '@/lib/api';
import { useStore } from '@/lib/store';
import type { Organization } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from './ui/dialog';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

interface CreateOrgDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (org: Organization) => void;
  switchAfterCreate?: boolean;
}

export default function CreateOrgDialog({ open, onClose, onCreated, switchAfterCreate = true }: CreateOrgDialogProps) {
  const t = useTranslations('createOrg');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setSlug('');
      setSlugTouched(false);
      setCreating(false);
      setTimeout(() => nameRef.current?.focus(), 100);
    }
  }, [open]);

  const derivedSlug = slugTouched ? slug : slugify(name);
  const isValid = name.trim().length >= 2 && derivedSlug.length >= 2;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || creating) return;

    setCreating(true);
    try {
      const org = await createOrg({ name: name.trim(), slug: derivedSlug });
      toast.success(t('createdToast', { name: org.name }));

      if (switchAfterCreate) {
        await switchOrg(org.id);
        const user = await getCurrentUser();
        useStore.getState().setUser(user);
        useStore.getState().setCurrentOrg(user.currentOrg || null);
        useStore.getState().setMemberships(user.memberships || []);
        // Clear org-scoped state
        useStore.getState().setConversations([]);
        useStore.getState().setActiveConversationId(null);
        useStore.getState().setMessages([]);
        useStore.getState().setProjects([]);
        useStore.getState().setActiveProjectId(null);
        useStore.getState().setArtifacts([]);
      }

      onCreated?.(org);
      onClose();
    } catch {
      // Error toast handled by apiFetch
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" hideClose>
        <DialogTitle className="sr-only">{t('heading')}</DialogTitle>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <Building2 size={16} className="text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-medium text-text-primary">{t('heading')}</h2>
            <p className="text-[10px] text-text-tertiary">{t('subtitle')}</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">
              {t('nameLabel')} <span className="text-accent">*</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              className="w-full px-3 py-2 bg-bg border border-border rounded text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">
              {t('slugLabel')}
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-text-tertiary font-mono">{t('slugPrefix')}</span>
              <input
                type="text"
                value={derivedSlug}
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                  setSlugTouched(true);
                }}
                placeholder={t('slugPlaceholder')}
                className="flex-1 px-3 py-2 bg-bg border border-border rounded text-xs text-text-primary font-mono placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            {name && !derivedSlug && (
              <p className="text-[10px] text-error mt-1">{t('slugRequired')}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={creating}
              className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-1 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || creating}
              className="px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {creating ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  {t('creating')}
                </>
              ) : (
                t('createButton')
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
