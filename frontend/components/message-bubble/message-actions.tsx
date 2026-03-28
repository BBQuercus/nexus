'use client';

import { createPortal } from 'react-dom';
import { useRef, useEffect, useState, useCallback } from 'react';
import { Copy, GitBranch, RefreshCw, Check, Download, ArrowRight, X, Link, Pencil, ThumbsUp, ThumbsDown, Volume2, SkipForward, Play, Pause, MessageSquare, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ProviderLogo } from '../provider-logos';
import { MODELS } from '@/lib/types';
import type { ModelOption, ModelProvider } from '@/lib/types';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import type { Message } from './types';
import { FEEDBACK_TAGS } from './types';

export function InlineBranchInput({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const t = useTranslations('message');
  const [branchText, setBranchText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const isStreaming = useStore((s) => s.isStreaming);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const handleSubmit = () => {
    const text = branchText.trim();
    if (!text || !activeConversationId || isStreaming) return;
    useStore.getState().setBranchingFromId(messageId);
    window.dispatchEvent(new CustomEvent('nexus:branch-send', {
      detail: { content: text, parentId: messageId },
    }));
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div className="relative flex gap-0 mt-3">
      <div className="flex flex-col items-center w-8 shrink-0 pt-3">
        <div className="w-full h-[2px] bg-border-default/40" />
        <div className="w-[2px] flex-1 border-l border-dashed border-border-default/50" />
      </div>
      <div className="bg-surface-0 border border-border-default rounded-lg p-4 shadow-xl shadow-black/20 w-[min(320px,calc(100vw-24px))] animate-fade-in-up" style={{ animationDuration: '0.15s' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-bold text-accent uppercase tracking-widest">{t('branchThread')}</span>
          <span className="h-[1px] flex-1 bg-border-default/30" />
          <button onClick={onClose} className="text-text-tertiary hover:text-text-secondary cursor-pointer"><X size={12} /></button>
        </div>
        <div className="space-y-3">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={branchText}
              onChange={(e) => setBranchText(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-surface-1 border border-border-default rounded-lg p-3 text-sm text-text-primary placeholder:text-text-tertiary/50 focus:border-accent/30 focus:shadow-[0_0_12px_-4px_var(--color-accent-dim)] transition-all resize-none outline-none"
              placeholder={t('branchPlaceholder')}
              rows={3}
            />
            <div className="absolute bottom-2 right-2">
              <button
                onClick={handleSubmit}
                disabled={!branchText.trim() || isStreaming}
                className="p-1.5 rounded-lg bg-accent text-bg hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
          <div className="flex justify-between items-center text-[10px] text-text-tertiary">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-surface-1 border border-border-default rounded text-[9px]">&#8984;+Enter</kbd>
              {t('branchKeyHint')}
            </span>
            <span className="flex items-center gap-1"><Link size={9} /> {t('branchContextLocked')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InlineEditForm({ message, onClose }: { message: Message; onClose: () => void }) {
  const t = useTranslations('message');
  const [editText, setEditText] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = useStore((s) => s.isStreaming);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = ta.value.length;
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, []);

  const handleSubmit = () => {
    const text = editText.trim();
    if (!text || isStreaming || text === message.content) { onClose(); return; }
    const parentId = message.parentId || undefined;
    if (parentId) {
      useStore.getState().setBranchingFromId(parentId);
      window.dispatchEvent(new CustomEvent('nexus:branch-send', {
        detail: { content: text, parentId },
      }));
    } else {
      useStore.getState().setBranchingFromId(message.id);
      window.dispatchEvent(new CustomEvent('nexus:branch-send', {
        detail: { content: text, parentId: message.id },
      }));
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div className="bg-surface-1 border border-accent/20 rounded-xl rounded-br-sm px-4 py-2.5 animate-fade-in-up" style={{ animationDuration: '0.1s' }}>
      <textarea
        ref={textareaRef}
        value={editText}
        onChange={(e) => {
          setEditText(e.target.value);
          const ta = e.target;
          ta.style.height = 'auto';
          ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
        }}
        onKeyDown={handleKeyDown}
        className="w-full bg-transparent text-sm text-text-primary resize-none outline-none"
        rows={1}
      />
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={onClose} className="px-2.5 py-1 text-[10px] text-text-tertiary hover:text-text-secondary bg-surface-2 rounded-lg cursor-pointer transition-colors">
          {t('editCancel')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={!editText.trim() || editText.trim() === message.content}
          className="px-2.5 py-1 text-[10px] font-medium bg-accent text-bg rounded-lg hover:bg-accent-hover cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {t('editSave')}
        </button>
      </div>
    </div>
  );
}

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  meta: 'Meta',
  microsoft: 'Microsoft',
  xai: 'xAI',
  moonshot: 'Moonshot',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
};

const PROVIDER_ORDER: ModelProvider[] = ['anthropic', 'openai', 'meta', 'microsoft', 'mistral', 'xai', 'moonshot', 'deepseek'];

function groupByProvider(models: ModelOption[]) {
  return models.reduce((acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = [];
    acc[model.provider].push(model);
    return acc;
  }, {} as Record<ModelProvider, ModelOption[]>);
}

export function RetryWithModelMenu({ messageId, onClose, triggerRef }: { messageId: string; onClose: () => void; triggerRef: React.RefObject<HTMLElement | null> }) {
  const activeConversationId = useStore((s) => s.activeConversationId);
  const activeModel = useStore((s) => s.activeModel);
  const isStreaming = useStore((s) => s.isStreaming);
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });

  // Position relative to trigger, clamped to viewport
  useEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuW = Math.min(288, window.innerWidth - 24); // w-72, clamped to viewport
    const menuMaxH = 288; // max-h-72
    const gap = 6;

    let top = rect.bottom + gap;
    let left = rect.left;

    // Clamp right edge
    if (left + menuW > window.innerWidth - 12) left = window.innerWidth - menuW - 12;
    if (left < 12) left = 12;

    // If not enough space below, open upward
    if (top + menuMaxH > window.innerHeight - 8 && rect.top > menuMaxH + gap) {
      top = rect.top - menuMaxH - gap;
    }

    setStyle({ position: 'fixed', top, left, opacity: 1 });
  }, [triggerRef]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && triggerRef.current && !triggerRef.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', keyHandler); };
  }, [onClose, triggerRef]);

  const handleRetry = (modelId: string) => {
    if (!activeConversationId || isStreaming) return;
    onClose();
    window.dispatchEvent(new CustomEvent('nexus:regenerate-with-model', {
      detail: { conversationId: activeConversationId, messageId, model: modelId },
    }));
  };

  const primaryModels = MODELS.filter((m) => !m.legacy);
  const grouped = groupByProvider(primaryModels);

  return createPortal(
    <div
      ref={menuRef}
      className="w-[min(288px,calc(100vw-24px))] max-h-72 overflow-y-auto bg-surface-0 border border-border-default rounded-lg shadow-2xl shadow-black/40 z-[100] animate-fade-in-up"
      style={{ animationDuration: '0.1s', ...style }}
    >
      {PROVIDER_ORDER.filter((p) => grouped[p]?.length).map((provider, gi) => (
        <div key={provider}>
          {gi > 0 && <div className="h-px bg-border-subtle mx-3" />}
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
            <ProviderLogo provider={provider} size={12} className="text-text-tertiary" />
            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">{PROVIDER_LABELS[provider]}</span>
          </div>
          {grouped[provider].map((model) => (
            <button
              key={model.id}
              onClick={() => handleRetry(model.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-surface-1 transition-colors cursor-pointer ${
                model.id === activeModel ? 'bg-surface-1' : ''
              }`}
            >
              <span className="text-xs text-text-primary">{model.name}</span>
              {model.id === activeModel && <Check size={13} className="text-accent shrink-0" />}
            </button>
          ))}
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function FeedbackPanel({ message }: { message: Message }) {
  const t = useTranslations('message');
  const activeConversationId = useStore((s) => s.activeConversationId);
  const [feedbackState, setFeedbackState] = useState<'up' | 'down' | null>(message.feedback ?? null);
  const [showForm, setShowForm] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [thanks, setThanks] = useState(false);

  const submitFeedback = async (rating: 'up' | 'down', tags?: string[], commentText?: string) => {
    if (!activeConversationId) return;
    try {
      await api.submitEnhancedFeedback(activeConversationId, message.id, {
        rating,
        tags: tags?.length ? tags : undefined,
        comment: commentText?.trim() || undefined,
      });
      setFeedbackState(rating);
      setShowForm(false);
      setThanks(true);
      setTimeout(() => setThanks(false), 2000);
    } catch (e) {
      console.error('Feedback submit failed:', e);
    }
  };

  const handleThumbsUp = () => {
    if (feedbackState === 'up') return;
    submitFeedback('up');
  };

  const handleThumbsDown = () => {
    if (feedbackState === 'down') {
      setShowForm(!showForm);
      return;
    }
    setShowForm(true);
  };

  const handleSubmitDown = () => {
    submitFeedback('down', selectedTags, comment);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  return (
    <>
      <div className="h-3 w-[1px] bg-border-default/30 mx-0.5" />
      {thanks ? (
        <span className="text-[10px] text-accent font-medium animate-fade-in-up" style={{ animationDuration: '0.15s' }}>{t('feedbackThanks')}</span>
      ) : (
        <>
          <button
            onClick={handleThumbsUp}
            title={t('thumbsUp')}
            className={`flex items-center gap-1 text-[10px] cursor-pointer transition-colors ${
              feedbackState === 'up' ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <ThumbsUp size={10} className={feedbackState === 'up' ? 'fill-current' : ''} />
          </button>
          <button
            onClick={handleThumbsDown}
            title={t('thumbsDown')}
            className={`flex items-center gap-1 text-[10px] cursor-pointer transition-colors ${
              feedbackState === 'down' ? 'text-error' : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <ThumbsDown size={10} className={feedbackState === 'down' ? 'fill-current' : ''} />
          </button>
        </>
      )}
      {showForm && (
        <div className="absolute left-0 top-full mt-1.5 w-[min(320px,calc(100vw-24px))] bg-surface-0 border border-border-default rounded-lg shadow-xl shadow-black/30 z-50 p-3 animate-fade-in-up" style={{ animationDuration: '0.12s' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">{t('feedbackHeading')}</span>
            <button onClick={() => setShowForm(false)} className="text-text-tertiary hover:text-text-secondary cursor-pointer"><X size={12} /></button>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {FEEDBACK_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2 py-0.5 text-[10px] rounded-lg border cursor-pointer transition-colors ${
                  selectedTags.includes(tag)
                    ? 'bg-accent/15 border-accent/30 text-accent'
                    : 'bg-surface-1 border-border-default text-text-tertiary hover:text-text-secondary hover:border-border-focus'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('feedbackPlaceholder')}
            className="w-full bg-surface-1 border border-border-default rounded-lg p-2 text-xs text-text-primary placeholder:text-text-tertiary/50 focus:border-accent/30 outline-none resize-none mb-2"
            rows={2}
          />
          <button
            onClick={handleSubmitDown}
            className="w-full px-3 py-1.5 text-[11px] font-medium bg-accent text-bg rounded-lg hover:bg-accent-hover cursor-pointer transition-colors"
          >
            {t('feedbackSubmit')}
          </button>
        </div>
      )}
    </>
  );
}

export function AudioPlayer({ src, onClose }: { src: string; onClose: () => void }) {
  const t = useTranslations('message');
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => setDuration(audio.duration);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onLoaded);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('durationchange', onLoaded);
    };
  }, []);

  useEffect(() => {
    audioRef.current?.play().catch(() => {});
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, []);

  const skipForward = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(audio.currentTime + 10, audio.duration || 0);
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  }, [duration]);

  const fmt = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface-2 border border-border-default px-3 py-2">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button onClick={togglePlay} className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <button onClick={skipForward} className="text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer" title={t('audioSkip')}>
        <SkipForward size={14} />
      </button>
      <span className="text-[10px] text-text-tertiary tabular-nums w-8 text-right">{fmt(currentTime)}</span>
      <div className="flex-1 h-1.5 bg-border-default rounded-full cursor-pointer relative" onClick={handleSeek}>
        <div className="absolute inset-y-0 left-0 bg-accent rounded-full transition-[width] duration-100" style={{ width: `${progress}%` }} />
      </div>
      <span className="text-[10px] text-text-tertiary tabular-nums w-8">{duration > 0 ? fmt(duration) : '--:--'}</span>
      <a href={src} download="assistant-response.wav" className="text-text-tertiary hover:text-text-secondary transition-colors" title={t('audioDownload')}>
        <Download size={12} />
      </a>
      <button onClick={onClose} className="text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer" title={t('audioClose')}>
        <X size={12} />
      </button>
    </div>
  );
}

/** User message action buttons */
export function UserMessageActions({
  message,
  copied,
  onCopy,
  showBranchInput,
  onToggleBranch,
  onEdit,
  onDelete,
}: {
  message: Message;
  copied: boolean;
  onCopy: () => void;
  showBranchInput: boolean;
  onToggleBranch: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const t = useTranslations('message');
  const tc = useTranslations('common');
  return (
    <div className="flex justify-end gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button onClick={() => {
        if (onEdit) { onEdit(); return; }
        window.dispatchEvent(new CustomEvent('nexus:edit-message', {
          detail: {
            content: message.content,
            contexts: message.contexts || [],
            branchFrom: message.parentId || undefined,
            messageId: message.id,
          },
        }));
      }} className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary cursor-pointer">
        <Pencil size={10} /> {tc('edit')}
      </button>
      <button onClick={onCopy} className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary cursor-pointer">
        {copied ? <Check size={10} className="text-accent" /> : <Copy size={10} />} {copied ? tc('copied') : tc('copy')}
      </button>
      <button
        onClick={onToggleBranch}
        className={`flex items-center gap-1 text-[10px] cursor-pointer transition-colors ${
          showBranchInput
            ? 'text-accent'
            : 'text-text-tertiary hover:text-text-secondary'
        }`}
      >
        <GitBranch size={10} /> {t('branch')}
      </button>
      {onDelete && (
        <button onClick={onDelete} className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-error cursor-pointer transition-colors">
          <Trash2 size={10} /> {tc('delete')}
        </button>
      )}
    </div>
  );
}

/** Assistant message action buttons */
export function AssistantMessageActions({
  message,
  copied,
  onCopy,
  onRegenerate,
  onGenerateAudio,
  isGeneratingAudio,
  showRetryMenu,
  onToggleRetryMenu,
  showBranchInput,
  onToggleBranch,
  onDelete,
}: {
  message: Message;
  copied: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
  onGenerateAudio: () => void;
  isGeneratingAudio: boolean;
  showRetryMenu: boolean;
  onToggleRetryMenu: () => void;
  showBranchInput: boolean;
  onToggleBranch: () => void;
  onDelete?: () => void;
}) {
  const t = useTranslations('message');
  const tc = useTranslations('common');
  const retryBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className={`flex items-center gap-3 mt-1.5 transition-opacity ${
      showRetryMenu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
    }`}>
      <button onClick={onCopy} className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary cursor-pointer">
        {copied ? <Check size={10} className="text-accent" /> : <Copy size={10} />} {copied ? tc('copied') : tc('copy')}
      </button>
      <button onClick={onRegenerate} className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary cursor-pointer">
        <RefreshCw size={10} /> {t('regenerate')}
      </button>
      {message.content && (
        <button onClick={onGenerateAudio} className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary cursor-pointer">
          <Volume2 size={10} /> {isGeneratingAudio ? t('audioLoading') : t('audio')}
        </button>
      )}
      <button
        ref={retryBtnRef}
        onClick={onToggleRetryMenu}
        className={`flex items-center gap-1 text-[10px] cursor-pointer transition-colors ${
          showRetryMenu ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'
        }`}
      >
        <RefreshCw size={10} /> {t('retryWith')}
      </button>
      {showRetryMenu && (
        <RetryWithModelMenu messageId={message.id} onClose={onToggleRetryMenu} triggerRef={retryBtnRef} />
      )}
      <button
        onClick={onToggleBranch}
        className={`flex items-center gap-1 text-[10px] cursor-pointer transition-colors ${
          showBranchInput
            ? 'text-accent'
            : 'text-text-tertiary hover:text-text-secondary'
        }`}
      >
        <GitBranch size={10} /> {t('branch')}
      </button>
      <FeedbackPanel message={message} />
      {onDelete && (
        <button onClick={onDelete} className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-error cursor-pointer transition-colors">
          <Trash2 size={10} /> {tc('delete')}
        </button>
      )}
    </div>
  );
}
