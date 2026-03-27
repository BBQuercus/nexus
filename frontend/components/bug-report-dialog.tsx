'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Bug, Send, Loader2, ImagePlus, Clipboard, Trash2 } from 'lucide-react';
import { toast } from '@/components/toast';
import { getCsrfToken } from '@/lib/auth';
import { toApiUrl } from '@/lib/runtime';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from './ui/dialog';

const SEVERITY_OPTIONS = [
  { value: 'low', labelKey: 'severityLow' as const, color: 'bg-green-500/15 text-green-400 border-green-500/20' },
  { value: 'medium', labelKey: 'severityMedium' as const, color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' },
  { value: 'high', labelKey: 'severityHigh' as const, color: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  { value: 'critical', labelKey: 'severityCritical' as const, color: 'bg-red-500/15 text-red-400 border-red-500/20' },
];

const MAX_SCREENSHOTS = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function BugReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('bugReport');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [steps, setSteps] = useState('');
  const [expected, setExpected] = useState('');
  const [screenshots, setScreenshots] = useState<{ name: string; dataUrl: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [open]);

  const addImageFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (fileArr.length === 0) return;

    const remaining = MAX_SCREENSHOTS - screenshots.length;
    if (remaining <= 0) {
      toast.warning(t('maxScreenshots', { max: MAX_SCREENSHOTS }));
      return;
    }

    const toProcess = fileArr.slice(0, remaining);
    const oversized = toProcess.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      toast.warning(t('oversizedSkipped'));
    }

    const valid = toProcess.filter((f) => f.size <= MAX_FILE_SIZE);
    const newScreenshots = await Promise.all(
      valid.map(async (f) => ({ name: f.name, dataUrl: await fileToDataUrl(f) })),
    );

    setScreenshots((prev) => [...prev, ...newScreenshots].slice(0, MAX_SCREENSHOTS));
  }, [screenshots.length, t]);

  // Paste handler
  useEffect(() => {
    if (!open) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        addImageFiles(imageFiles);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [open, addImageFiles]);

  // Drop handler
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
      addImageFiles(e.dataTransfer.files);
    }
  }, [addImageFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const removeScreenshot = (index: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const csrf = getCsrfToken();
      if (csrf) headers['X-CSRF-Token'] = csrf;

      const resp = await fetch(toApiUrl('/api/bug-reports'), {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          severity,
          steps_to_reproduce: steps.trim() || undefined,
          expected_behavior: expected.trim() || undefined,
          screenshots: screenshots.map((s) => ({ filename: s.name, data_url: s.dataUrl })),
          url: window.location.href,
          user_agent: navigator.userAgent,
        }),
      });

      if (!resp.ok) throw new Error('Failed to submit');

      toast.success(t('successToast'));
      setTitle('');
      setDescription('');
      setSeverity('medium');
      setSteps('');
      setExpected('');
      setScreenshots([]);
      onClose();
    } catch {
      toast.error(t('errorToast'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-lg p-0 gap-0" hideClose>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Bug size={16} className="text-accent" />
            <DialogTitle>{t('dialogTitle')}</DialogTitle>
          </div>
        </div>

        {/* Form */}
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto"
        >
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('titleLabel')}</label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('titlePlaceholder')}
              required
              className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Severity */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('severityLabel')}</label>
            <div className="flex gap-2">
              {SEVERITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSeverity(opt.value)}
                  className={`px-2.5 py-1 text-xs rounded border cursor-pointer transition-all ${
                    severity === opt.value
                      ? opt.color
                      : 'bg-surface-1 text-text-tertiary border-border hover:border-border-focus'
                  }`}
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('descriptionLabel')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              required
              rows={3}
              className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors resize-none"
            />
          </div>

          {/* Screenshots */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              {t('screenshotsLabel')} <span className="text-text-tertiary font-normal">{t('screenshotsOptional')}</span>
            </label>

            {screenshots.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {screenshots.map((ss, i) => (
                  <div key={i} className="relative group w-20 h-20 rounded border border-border overflow-hidden bg-surface-1">
                    <img src={ss.dataUrl} alt={ss.name} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeScreenshot(i)}
                      className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Trash2 size={14} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {screenshots.length < MAX_SCREENSHOTS && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 w-full border border-dashed border-border rounded text-xs text-text-tertiary hover:text-text-secondary hover:border-border-focus transition-colors cursor-pointer"
              >
                <ImagePlus size={14} />
                <span>{t('addScreenshot')}</span>
                <span className="ml-auto flex items-center gap-1 text-[10px]">
                  <Clipboard size={10} />
                  {t('orPaste')}
                </span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addImageFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {/* Steps to Reproduce */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('stepsLabel')} <span className="text-text-tertiary font-normal">{t('stepsOptional')}</span></label>
            <textarea
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              placeholder={t('stepsPlaceholder')}
              rows={3}
              className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors resize-none"
            />
          </div>

          {/* Expected Behavior */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('expectedLabel')} <span className="text-text-tertiary font-normal">{t('expectedOptional')}</span></label>
            <textarea
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              placeholder={t('expectedPlaceholder')}
              rows={2}
              className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors resize-none"
            />
          </div>

          <p className="text-[10px] text-text-tertiary">
            {t('autoIncludeNote')}
          </p>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !description.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-accent text-bg font-medium rounded hover:bg-accent-hover transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Send size={12} />
            )}
            <span>{t('submitReport')}</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
