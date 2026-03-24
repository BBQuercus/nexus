'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import type { Message, CostData, ToolCall, Citation } from '@/lib/types';
import { CitationBar, ConfidenceBadge } from './citation-chip';
import { MODELS } from '@/lib/types';
import MarkdownContent from './markdown-content';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import { mapRawMessages } from '@/lib/useStreaming';
import { Copy, GitBranch, RefreshCw, ChevronRight, ChevronDown, ChevronLeft, Terminal, Play, Check, Download, Clock, Coins, Cpu, ArrowRight, X, Link, FileEdit, Pencil, ChevronUp, ThumbsUp, ThumbsDown, FileSpreadsheet, FileText, Presentation, File as FileIcon, MessageSquare, Volume2 } from 'lucide-react';
import { ProviderLogo } from './provider-logos';
import VegaChart from './vega-chart';

function CostBadge({ data }: { data: CostData }) {
  const model = data.model.split('/').pop() || data.model;
  return (
    <div className="flex items-center gap-3 mt-3 text-[10px] font-mono text-text-tertiary">
      <span className="flex items-center gap-1"><Cpu size={9} />{model}</span>
      {(data.inputTokens + data.outputTokens) > 0 && (
        <span className="flex items-center gap-1"><Coins size={9} />{(data.inputTokens + data.outputTokens).toLocaleString()} tok</span>
      )}
      {data.totalCost > 0 && (
        <span>{data.totalCost < 0.01 ? '<$0.01' : `$${data.totalCost.toFixed(3)}`}</span>
      )}
      {data.duration > 0 && (
        <span className="flex items-center gap-1"><Clock size={9} />{(data.duration / 1000).toFixed(1)}s</span>
      )}
    </div>
  );
}

function ExecBlock({ tool }: { tool: ToolCall }) {
  const isWriteFile = tool.name === 'write_file';
  const lang = isWriteFile ? 'write' : (tool.language || tool.name || 'code');
  const [collapsed, setCollapsed] = useState(!tool.isRunning && !!tool.output && tool.output.length > 200);

  return (
    <div className={`my-2 rounded-lg border overflow-hidden ${tool.isRunning ? 'border-accent/30' : 'border-border-default'}`}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-1 text-[11px] font-mono">
        <div className="flex items-center gap-1.5 text-text-secondary">
          {isWriteFile ? <FileEdit size={11} className="text-accent" /> : <Terminal size={11} className="text-text-tertiary" />}
          <span>{isWriteFile && tool.code ? tool.code.split('\n')[0]?.replace(/^.*path['":\s]*['"]?([^'"]+).*$/, '$1') || lang : lang}</span>
        </div>
        <div className="flex items-center gap-2">
          {tool.isRunning ? (
            <span className="flex items-center gap-1 text-accent">
              <Play size={9} className="fill-current animate-pulse" /> running
            </span>
          ) : tool.exitCode !== undefined ? (
            <span className={`flex items-center gap-1 ${tool.exitCode === 0 ? 'text-accent' : 'text-error'}`}>
              {tool.exitCode === 0 ? <Check size={10} /> : <span>exit {tool.exitCode}</span>}
              {tool.duration !== undefined && <span className="text-text-tertiary">{(tool.duration / 1000).toFixed(2)}s</span>}
            </span>
          ) : null}
        </div>
      </div>
      {tool.code && (
        <pre className="px-3 py-2 bg-surface-0 text-xs overflow-x-auto max-h-48 border-t border-border-subtle"><code>{tool.code}</code></pre>
      )}
      {tool.output && (
        <div className="border-t border-border-subtle">
          {tool.output.length > 200 && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center gap-1 px-3 py-1 text-[10px] text-text-tertiary hover:text-text-secondary font-mono cursor-pointer w-full text-left bg-bg/50"
            >
              {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
              output ({tool.output.length} chars)
            </button>
          )}
          {!collapsed && (
            <pre className="px-3 py-2 bg-bg text-xs text-text-secondary overflow-x-auto max-h-40">{tool.output}</pre>
          )}
        </div>
      )}
      {tool.stderr && (
        <pre className="px-3 py-2 bg-bg text-xs text-error overflow-x-auto max-h-32 border-t border-border-subtle">{tool.stderr}</pre>
      )}
    </div>
  );
}

function ReasoningTrace({ content, tokenCount }: { content: string; tokenCount?: number }) {
  return (
    <details className="mb-2 group/reason">
      <summary className="flex items-center gap-1.5 cursor-pointer text-[11px] text-text-tertiary hover:text-text-secondary py-1 font-mono tracking-wide">
        <ChevronRight size={11} className="group-open/reason:rotate-90 transition-transform" />
        <span>reasoning</span>
        {tokenCount && <span className="text-text-tertiary/60">· {tokenCount} tok</span>}
      </summary>
      <div className="mt-1 pl-3 border-l-2 border-accent/20 text-xs text-text-tertiary whitespace-pre-wrap leading-relaxed">{content}</div>
    </details>
  );
}

function InlineImage({ img }: { img: { filename: string; url: string } }) {
  return (
    <div className="rounded-lg border border-border-default overflow-hidden">
      <img src={img.url} alt={img.filename} className="w-full max-h-[500px] object-contain bg-bg" />
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-1 text-[11px] font-mono text-text-tertiary">
        <span className="truncate">{img.filename}</span>
        <a href={img.url} download={img.filename} className="flex items-center gap-1 text-text-tertiary hover:text-accent transition-colors shrink-0 ml-2">
          <Download size={10} /> Save
        </a>
      </div>
    </div>
  );
}

function FileArtifactCard({ file, sandboxId }: { file: { filename: string; fileType: string; sandboxId?: string }; sandboxId: string | null }) {
  const ext = file.filename.split('.').pop()?.toLowerCase() || '';
  const resolvedSandboxId = file.sandboxId || sandboxId;

  const icon = ext === 'xlsx' || ext === 'xls' ? <FileSpreadsheet size={18} className="text-green-400" />
    : ext === 'pptx' || ext === 'ppt' ? <Presentation size={18} className="text-orange-400" />
    : ext === 'pdf' ? <FileText size={18} className="text-red-400" />
    : <FileIcon size={18} className="text-text-tertiary" />;

  const badgeColor = ext === 'xlsx' || ext === 'xls' ? 'bg-green-500/15 text-green-400 border-green-500/20'
    : ext === 'pptx' || ext === 'ppt' ? 'bg-orange-500/15 text-orange-400 border-orange-500/20'
    : ext === 'pdf' ? 'bg-red-500/15 text-red-400 border-red-500/20'
    : 'bg-surface-2 text-text-tertiary border-border-default';

  const downloadUrl = resolvedSandboxId
    ? `/api/sandboxes/${resolvedSandboxId}/files/read?path=${encodeURIComponent(`/home/daytona/output/${file.filename}`)}`
    : undefined;

  const handleDownload = () => {
    if (!downloadUrl) return;
    window.open(downloadUrl, '_blank');
  };

  return (
    <div className="my-2 flex items-center gap-3 p-3 bg-surface-1 border border-border-default rounded-lg hover:border-border-focus transition-colors">
      <div className="w-10 h-10 rounded-lg bg-surface-2 border border-border-default flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary truncate font-medium">{file.filename}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`px-1.5 py-0 text-[9px] font-bold uppercase rounded border tracking-wide ${badgeColor}`}>
            {ext.toUpperCase() || file.fileType.toUpperCase()}
          </span>
          {file.fileType && file.fileType !== ext && (
            <span className="text-[10px] text-text-tertiary">{file.fileType}</span>
          )}
        </div>
      </div>
      {downloadUrl && (
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg bg-accent text-bg hover:bg-accent-hover cursor-pointer transition-colors shrink-0"
        >
          <Download size={12} /> Download
        </button>
      )}
    </div>
  );
}

function SiblingNav({ message }: { message: Message }) {
  const tree = useStore((s) => s.conversationTree);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const setMessages = useStore((s) => s.setMessages);
  const setActiveLeafId = useStore((s) => s.setActiveLeafId);
  const setConversationTree = useStore((s) => s.setConversationTree);

  const siblings = useMemo(() => {
    if (!tree) return [];
    return tree.nodes.filter((n) => n.parentId === message.parentId).sort((a, b) => a.branchIndex - b.branchIndex);
  }, [tree, message.parentId]);

  if (siblings.length <= 1) return null;

  const currentIndex = siblings.findIndex((s) => s.id === message.id);
  if (currentIndex === -1) return null;

  const switchToSibling = async (siblingId: string) => {
    if (!activeConversationId || !tree) return;
    let leafId = siblingId;
    const childMap = new Map<string, typeof tree.nodes>();
    for (const n of tree.nodes) {
      if (n.parentId) {
        const existing = childMap.get(n.parentId) || [];
        existing.push(n);
        childMap.set(n.parentId, existing);
      }
    }
    let children = childMap.get(leafId);
    while (children && children.length > 0) {
      children.sort((a, b) => a.branchIndex - b.branchIndex);
      leafId = children[0].id;
      children = childMap.get(leafId);
    }
    try {
      const result = await api.switchBranch(activeConversationId, leafId);
      setMessages(mapRawMessages(result.messages || [], activeConversationId));
      setActiveLeafId(result.active_leaf_id);
      const newTree = await api.getConversationTree(activeConversationId);
      setConversationTree(newTree);
    } catch (e) {
      console.error('Failed to switch branch:', e);
    }
  };

  return (
    <div className="flex items-center gap-1 text-[10px] text-text-tertiary font-mono">
      <button
        onClick={() => currentIndex > 0 && switchToSibling(siblings[currentIndex - 1].id)}
        disabled={currentIndex === 0}
        className="hover:text-text-secondary cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronLeft size={10} />
      </button>
      <span>{currentIndex + 1}/{siblings.length}</span>
      <button
        onClick={() => currentIndex < siblings.length - 1 && switchToSibling(siblings[currentIndex + 1].id)}
        disabled={currentIndex === siblings.length - 1}
        className="hover:text-text-secondary cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight size={10} />
      </button>
    </div>
  );
}

function InlineBranchInput({ messageId, onClose }: { messageId: string; onClose: () => void }) {
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
      <div className="bg-surface-0 border border-border-default rounded-lg p-4 shadow-xl shadow-black/20 w-80 animate-fade-in-up" style={{ animationDuration: '0.15s' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Branch Thread</span>
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
              placeholder="Explore a different direction..."
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
              to branch
            </span>
            <span className="flex items-center gap-1"><Link size={9} /> Context locked</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Inline edit form for user messages */
function InlineEditForm({ message, onClose }: { message: Message; onClose: () => void }) {
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
    // Editing a user message = branching from its parent with new content
    const parentId = message.parentId || undefined;
    if (parentId) {
      useStore.getState().setBranchingFromId(parentId);
      window.dispatchEvent(new CustomEvent('nexus:branch-send', {
        detail: { content: text, parentId },
      }));
    } else {
      // First message — branch from root
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
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!editText.trim() || editText.trim() === message.content}
          className="px-2.5 py-1 text-[10px] font-medium bg-accent text-bg rounded-lg hover:bg-accent-hover cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Save & Submit
        </button>
      </div>
    </div>
  );
}

/** Model picker dropdown for "retry with..." */
function RetryWithModelMenu({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const activeConversationId = useStore((s) => s.activeConversationId);
  const activeModel = useStore((s) => s.activeModel);
  const isStreaming = useStore((s) => s.isStreaming);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', keyHandler); };
  }, [onClose]);

  const handleRetry = (modelId: string) => {
    if (!activeConversationId || isStreaming) return;
    onClose();
    window.dispatchEvent(new CustomEvent('nexus:regenerate-with-model', {
      detail: { conversationId: activeConversationId, messageId, model: modelId },
    }));
  };

  return (
    <div ref={menuRef} className="absolute left-0 top-full mt-1 w-64 bg-surface-0 border border-border-default rounded-lg shadow-2xl shadow-black/40 z-50 animate-fade-in-up overflow-hidden" style={{ animationDuration: '0.1s' }}>
      <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-text-tertiary font-medium border-b border-border-default">
        Retry with model
      </div>
      {MODELS.map((m) => (
        <button
          key={m.id}
          onClick={() => handleRetry(m.id)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-1 transition-colors cursor-pointer ${
            m.id === activeModel ? 'bg-surface-1' : ''
          }`}
        >
          <ProviderLogo provider={m.provider} size={13} className="text-text-tertiary shrink-0" />
          <span className="text-xs text-text-primary flex-1">{m.name}</span>
          {m.id === activeModel && <span className="text-[9px] text-text-tertiary font-mono">current</span>}
        </button>
      ))}
    </div>
  );
}

const FEEDBACK_TAGS = ['Wrong answer', 'Too slow', 'Code didn\'t work', 'Formatting issue', 'Other'];

function FeedbackPanel({ message }: { message: Message }) {
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
        <span className="text-[10px] text-accent font-medium animate-fade-in-up" style={{ animationDuration: '0.15s' }}>Thanks!</span>
      ) : (
        <>
          <button
            onClick={handleThumbsUp}
            title="Good response"
            className={`flex items-center gap-1 text-[10px] cursor-pointer transition-colors ${
              feedbackState === 'up' ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <ThumbsUp size={10} className={feedbackState === 'up' ? 'fill-current' : ''} />
          </button>
          <button
            onClick={handleThumbsDown}
            title="Bad response"
            className={`flex items-center gap-1 text-[10px] cursor-pointer transition-colors ${
              feedbackState === 'down' ? 'text-error' : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <ThumbsDown size={10} className={feedbackState === 'down' ? 'fill-current' : ''} />
          </button>
        </>
      )}
      {showForm && (
        <div className="absolute left-0 top-full mt-1.5 w-80 bg-surface-0 border border-border-default rounded-lg shadow-xl shadow-black/30 z-50 p-3 animate-fade-in-up" style={{ animationDuration: '0.12s' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">What went wrong?</span>
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
            placeholder="Optional: tell us more..."
            className="w-full bg-surface-1 border border-border-default rounded-lg p-2 text-xs text-text-primary placeholder:text-text-tertiary/50 focus:border-accent/30 outline-none resize-none mb-2"
            rows={2}
          />
          <button
            onClick={handleSubmitDown}
            className="w-full px-3 py-1.5 text-[11px] font-medium bg-accent text-bg rounded-lg hover:bg-accent-hover cursor-pointer transition-colors"
          >
            Submit feedback
          </button>
        </div>
      )}
    </>
  );
}

export default function MessageBubble({ message }: { message: Message }) {

  const activeConversationId = useStore((s) => s.activeConversationId);
  const isStreaming = useStore((s) => s.isStreaming);
  const sandboxId = useStore((s) => s.sandboxId);
  const [copied, setCopied] = useState(false);
  const [showBranchInput, setShowBranchInput] = useState(false);
  const [showRetryMenu, setShowRetryMenu] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const sourcePostProcess = useMemo(() => (html: string) => {
    return html.replace(
      /\[Source\s+(\d+)(?:\s*[—–-]\s*([^\]]+))?\]/gi,
      (_match: string, num: string, filename: string) => {
        const label = filename ? `${filename.trim()}` : `Source ${num}`;
        return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-mono bg-accent/10 text-accent border border-accent/20 align-middle" title="Source ${num}${filename ? `: ${filename.trim()}` : ''}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>${label}</span>`;
      },
    );
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(console.error);
  };

  const handleRegenerate = async () => {
    if (!activeConversationId || isStreaming) return;
    window.dispatchEvent(new CustomEvent('nexus:regenerate', {
      detail: { conversationId: activeConversationId, messageId: message.id },
    }));
  };

  const handleGenerateAudio = async () => {
    if (!message.content || isGeneratingAudio) return;
    setIsGeneratingAudio(true);
    try {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      const blob = await api.synthesizeAudio({ text: message.content });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (e) {
      console.error('Audio generation failed', e);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="group max-w-[95%] sm:max-w-[80%]">
          <SiblingNav message={message} />
          <div className="bg-surface-2 border border-border-default rounded-xl rounded-br-sm text-text-primary px-4 py-2.5 text-sm whitespace-pre-wrap">
            {message.content}
            {message.contexts && message.contexts.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border-default/30">
                {message.contexts.map((ctx) => (
                  <span key={ctx.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-accent bg-accent/10 border border-accent/20 rounded">
                    <MessageSquare size={9} />
                    {ctx.title}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => {
              // Load message content + contexts into the main chat input
              // branchFrom = parent of this message (we replace this message with a new sibling)
              // messageId = the message being edited (so we can trim it from the view)
              window.dispatchEvent(new CustomEvent('nexus:edit-message', {
                detail: {
                  content: message.content,
                  contexts: message.contexts || [],
                  branchFrom: message.parentId || undefined,
                  messageId: message.id,
                },
              }));
            }} className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary cursor-pointer">
              <Pencil size={10} /> Edit
            </button>
              <button onClick={handleCopy} className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary cursor-pointer">
                {copied ? <Check size={10} className="text-accent" /> : <Copy size={10} />} {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={() => setShowBranchInput(!showBranchInput)}
                className={`flex items-center gap-1 text-[10px] cursor-pointer transition-colors ${
                  showBranchInput
                    ? 'text-accent'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                <GitBranch size={10} /> Branch
              </button>
            </div>
          {showBranchInput && (
            <InlineBranchInput messageId={message.id} onClose={() => setShowBranchInput(false)} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="group max-w-[95%] sm:max-w-[85%]">
        <SiblingNav message={message} />
        {message.reasoning && <ReasoningTrace content={message.reasoning} tokenCount={message.reasoningTokens} />}
        {message.toolCalls?.filter((tool) => tool.name !== 'create_chart').map((tool) => <ExecBlock key={tool.id} tool={tool} />)}
        {message.images && message.images.length > 0 && (
          <div className="space-y-3 my-3">
            {message.images.map((img, i) => (
              <InlineImage key={i} img={img} />
            ))}
          </div>
        )}
        {message.files && message.files.length > 0 && (
          <div className="space-y-2 my-3">
            {message.files.map((file, i) => (
              <FileArtifactCard key={i} file={file} sandboxId={sandboxId} />
            ))}
          </div>
        )}
        {message.charts && message.charts.length > 0 && (
          <div className="space-y-3 my-3">
            {message.charts.map((chart, i) => (
              <div key={i} className="rounded-lg border border-border-default overflow-hidden bg-surface-0">
                <div className="px-3 py-2 bg-surface-1 text-[11px] font-mono text-text-secondary">
                  {chart.title || 'Interactive Chart'}
                </div>
                <VegaChart spec={chart.spec} className="overflow-x-auto p-2" />
              </div>
            ))}
          </div>
        )}
        {message.content && (
          <MarkdownContent
            text={message.content}
            className="markdown-content text-sm text-text-primary"
            postProcess={sourcePostProcess}
          />
        )}
        {message.citations && message.citations.length > 0 && (
          <CitationBar citations={message.citations} />
        )}
        {message.cost && <CostBadge data={message.cost} />}
        {audioUrl && (
          <div className="mt-3">
            <audio controls src={audioUrl} className="max-w-full" />
            <div className="mt-1">
              <a href={audioUrl} download="assistant-response.wav" className="text-[10px] text-text-tertiary hover:text-text-secondary">
                Download audio
              </a>
            </div>
          </div>
        )}
        <div className="relative flex items-center gap-3 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={handleCopy} className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary cursor-pointer">
            {copied ? <Check size={10} className="text-accent" /> : <Copy size={10} />} {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={handleRegenerate} className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary cursor-pointer">
            <RefreshCw size={10} /> Regenerate
          </button>
          {message.content && (
            <button onClick={() => void handleGenerateAudio()} className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary cursor-pointer">
              <Volume2 size={10} /> {isGeneratingAudio ? 'Audio...' : 'Audio'}
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowRetryMenu(!showRetryMenu)}
              className="flex items-center gap-0.5 text-[10px] text-text-tertiary hover:text-text-secondary cursor-pointer"
            >
              <ChevronUp size={9} />
            </button>
            {showRetryMenu && (
              <RetryWithModelMenu messageId={message.id} onClose={() => setShowRetryMenu(false)} />
            )}
          </div>
          <button
            onClick={() => setShowBranchInput(!showBranchInput)}
            className={`flex items-center gap-1 text-[10px] cursor-pointer transition-colors ${
              showBranchInput
                ? 'text-accent'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <GitBranch size={10} /> Branch
          </button>
          <FeedbackPanel message={message} />
        </div>
        {showBranchInput && (
          <InlineBranchInput messageId={message.id} onClose={() => setShowBranchInput(false)} />
        )}
      </div>
    </div>
  );
}
