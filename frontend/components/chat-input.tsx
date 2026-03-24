'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import type { Message } from '@/lib/types';
import { MODELS } from '@/lib/types';
import { ArrowUp, Square, Paperclip, X, Terminal, Trash2, HelpCircle, Download, Cpu, FileSpreadsheet, FileImage, FileText, File, Settings2, MessageSquare } from 'lucide-react';
import ModelPicker from './model-picker';
import AgentPicker from './agent-picker';
import { toast } from './toast';
import { useStreaming } from '@/lib/useStreaming';

const RESPONSE_COUNTS = [1, 3, 5] as const;
const CONTEXT_WINDOW = 128_000;

function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English text
  return Math.ceil(text.length / 4);
}

function TokenIndicator({ messages }: { messages: Message[] }) {
  const totalTokens = useMemo(() => {
    return messages.reduce((sum, msg) => {
      // Use actual token counts from cost data if available
      if (msg.cost) {
        return sum + msg.cost.inputTokens + msg.cost.outputTokens;
      }
      return sum + estimateTokens(msg.content);
    }, 0);
  }, [messages]);

  if (messages.length === 0) return null;

  const pct = totalTokens / CONTEXT_WINDOW;
  const colorClass = pct > 0.8
    ? 'text-error'
    : pct > 0.5
      ? 'text-yellow-500'
      : 'text-text-tertiary';

  const formatted = totalTokens >= 1000
    ? `~${(totalTokens / 1000).toFixed(1)}K`
    : `~${totalTokens}`;

  return (
    <span className={`text-[10px] font-mono ${colorClass} transition-colors`} title={`${totalTokens.toLocaleString()} tokens (~${(pct * 100).toFixed(0)}% of 128K context)`}>
      {formatted} tokens
    </span>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileCategory(file: File): 'image' | 'spreadsheet' | 'pdf' | 'other' {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext) || file.type.includes('spreadsheet') || file.type === 'text/csv') return 'spreadsheet';
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
  return 'other';
}

function getFileTypeBadge(file: File): string {
  const ext = file.name.split('.').pop()?.toUpperCase() || '';
  const cat = getFileCategory(file);
  if (cat === 'image') return ext || 'IMAGE';
  if (cat === 'spreadsheet') return ext || 'SHEET';
  if (cat === 'pdf') return 'PDF';
  return ext || 'FILE';
}

function FilePreviewCard({ file, onRemove }: { file: File; onRemove: () => void }) {
  const category = getFileCategory(file);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (category === 'image') {
      const url = URL.createObjectURL(file);
      setThumbUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file, category]);

  const icon = category === 'image' ? <FileImage size={16} className="text-blue-400" />
    : category === 'spreadsheet' ? <FileSpreadsheet size={16} className="text-green-400" />
    : category === 'pdf' ? <FileText size={16} className="text-red-400" />
    : <File size={16} className="text-text-tertiary" />;

  return (
    <div className="relative group/card flex items-center gap-2 px-2.5 py-2 bg-surface-1 border border-border-default rounded-lg text-[11px] min-w-0 max-w-[200px]">
      {category === 'image' && thumbUrl ? (
        <img src={thumbUrl} alt={file.name} className="w-8 h-8 rounded object-cover shrink-0 border border-border-default" />
      ) : (
        <div className="w-8 h-8 rounded bg-surface-2 border border-border-default flex items-center justify-center shrink-0">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-text-primary font-mono text-[11px] leading-tight">{file.name}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="px-1 py-0 text-[9px] font-bold uppercase rounded bg-surface-2 text-text-tertiary tracking-wide">
            {getFileTypeBadge(file)}
          </span>
          <span className="text-[9px] text-text-tertiary">{formatFileSize(file.size)}</span>
        </div>
      </div>
      <button
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center bg-surface-2 border border-border-default rounded-full text-text-tertiary hover:text-error hover:bg-error/10 cursor-pointer opacity-0 group-hover/card:opacity-100 transition-opacity"
      >
        <X size={8} />
      </button>
    </div>
  );
}

interface SlashCommand {
  name: string;
  description: string;
  icon: React.ReactNode;
  execute: (args: string) => void;
}

function getDraftKey(conversationId: string | null): string {
  return conversationId ? `nexus:draft:${conversationId}` : 'nexus:draft:__global__';
}

function loadDraft(conversationId: string | null): string {
  try {
    return localStorage.getItem(getDraftKey(conversationId)) || '';
  } catch {
    return '';
  }
}

function saveDraft(conversationId: string | null, content: string) {
  try {
    const key = getDraftKey(conversationId);
    if (content) localStorage.setItem(key, content);
    else localStorage.removeItem(key);
  } catch {}
}

function ChatSettings({ numResponses, setNumResponses }: { numResponses: number; setNumResponses: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative ml-auto hidden sm:block">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center justify-center w-7 h-7 rounded-lg border transition-all cursor-pointer ${
          open || numResponses > 1
            ? 'text-accent bg-accent/10 border-accent/30'
            : 'text-text-tertiary bg-surface-1 border-border-default hover:border-border-focus hover:text-text-secondary'
        }`}
        title="Chat settings"
      >
        <Settings2 size={13} />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-1.5 w-48 bg-surface-0 border border-border-default rounded-lg shadow-2xl shadow-black/40 z-50 p-3">
          <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-2">Responses per turn</div>
          <div className="flex items-center gap-1.5">
            {RESPONSE_COUNTS.map((n) => (
              <button
                key={n}
                onClick={() => setNumResponses(n)}
                className={`flex-1 px-2 py-1.5 text-xs font-mono rounded-lg border cursor-pointer transition-all ${
                  numResponses === n
                    ? 'text-accent bg-accent/10 border-accent/30'
                    : 'text-text-tertiary bg-surface-1 border-border-default hover:border-border-focus hover:text-text-secondary'
                }`}
              >
                {n}x
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatInput() {
  const [content, setContent] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [numResponses, setNumResponses] = useState<number>(1);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashHighlightIndex, setSlashHighlightIndex] = useState(0);
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [mentionHighlightIndex, setMentionHighlightIndex] = useState(0);
  const [mentionResults, setMentionResults] = useState<{ id: string; title: string }[]>([]);
  const [attachedContexts, setAttachedContexts] = useState<{ id: string; title: string }[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevConvIdRef = useRef<string | null | undefined>(undefined);

  const isStreaming = useStore((s) => s.isStreaming);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const activeModel = useStore((s) => s.activeModel);
  const activePersona = useStore((s) => s.activePersona);
  const sandboxId = useStore((s) => s.sandboxId);
  const messages = useStore((s) => s.messages);
  const setActiveConversationId = useStore((s) => s.setActiveConversationId);
  const setMessages = useStore((s) => s.setMessages);
  const setConversations = useStore((s) => s.setConversations);
  const pendingPrompt = useStore((s) => s.pendingPrompt);
  const setPendingPrompt = useStore((s) => s.setPendingPrompt);
  const branchingFromId = useStore((s) => s.branchingFromId);
  const setBranchingFromId = useStore((s) => s.setBranchingFromId);
  const abortStreaming = useStore((s) => s.abortStreaming);

  const { streamSend, streamRegenerate } = useStreaming();

  // Slash commands definition
  const slashCommands: SlashCommand[] = useMemo(() => [
    {
      name: 'model',
      description: 'Switch model — /model <name>',
      icon: <Cpu size={13} />,
      execute: (args: string) => {
        const q = args.trim().toLowerCase();
        if (!q) {
          toast.info('Available models: ' + MODELS.map((m) => m.name).join(', '));
          return;
        }
        const match = MODELS.find(
          (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
        );
        if (match) {
          useStore.getState().setActiveModel(match.id);
          toast.success(`Switched to ${match.name}`);
        } else {
          toast.error(`Model "${args.trim()}" not found`);
        }
      },
    },
    {
      name: 'clear',
      description: 'Start a new conversation',
      icon: <Trash2 size={13} />,
      execute: () => {
        (async () => {
          try {
            const conv = await api.createConversation({
              model: useStore.getState().activeModel,
            });
            useStore.getState().setActiveConversationId(conv.id);
            useStore.getState().setMessages([]);
            const r = await api.listConversations();
            useStore.getState().setConversations(r.conversations);
          } catch {
            toast.error('Failed to create conversation');
          }
        })();
      },
    },
    {
      name: 'help',
      description: 'Show keyboard shortcuts',
      icon: <HelpCircle size={13} />,
      execute: () => {
        // Dispatch a custom event that workspace listens for
        window.dispatchEvent(new CustomEvent('nexus:open-shortcuts'));
      },
    },
    {
      name: 'export',
      description: 'Export conversation as markdown',
      icon: <Download size={13} />,
      execute: () => {
        const msgs = useStore.getState().messages;
        if (msgs.length === 0) {
          toast.info('No messages to export');
          return;
        }
        const md = msgs
          .map((m) => {
            const role = m.role === 'user' ? '**You**' : m.role === 'assistant' ? '**Assistant**' : '**System**';
            return `### ${role}\n\n${m.content}`;
          })
          .join('\n\n---\n\n');
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'conversation.md';
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Conversation exported');
      },
    },
  ], []);

  // Filter slash commands based on input
  const filteredSlashCommands = useMemo(() => {
    if (!slashMenuOpen) return [];
    const match = content.match(/^\/(\S*)$/);
    if (!match) return [];
    const query = match[1].toLowerCase();
    if (!query) return slashCommands;
    return slashCommands.filter(
      (cmd) => cmd.name.toLowerCase().includes(query) || cmd.description.toLowerCase().includes(query)
    );
  }, [content, slashMenuOpen, slashCommands]);

  // Update slash menu state on content change
  useEffect(() => {
    if (content.match(/^\/\S*$/) && !content.includes(' ')) {
      setSlashMenuOpen(true);
      setSlashHighlightIndex(0);
    } else {
      setSlashMenuOpen(false);
    }
  }, [content]);

  // Detect @ mentions for conversation context injection
  useEffect(() => {
    // Check if the cursor is right after an @query pattern
    const match = content.match(/@(\S*)$/);
    if (match) {
      const query = match[1];
      setMentionMenuOpen(true);
      setMentionHighlightIndex(0);
      // Search conversations
      const conversations = useStore.getState().conversations;
      const filtered = conversations
        .filter((c) => c.title && c.id !== activeConversationId)
        .filter((c) => !query || c.title.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8)
        .map((c) => ({ id: c.id, title: c.title || 'Untitled' }));
      setMentionResults(filtered);
    } else {
      setMentionMenuOpen(false);
    }
  }, [content, activeConversationId]);

  const insertMention = (conv: { id: string; title: string }) => {
    // Replace @query with clean text, track context as a chip
    const newContent = content.replace(/@\S*$/, '');
    setContent(newContent);
    setMentionMenuOpen(false);
    // Add to attached contexts (avoid duplicates)
    setAttachedContexts((prev) =>
      prev.some((c) => c.id === conv.id) ? prev : [...prev, conv]
    );
  };

  // Pick up pending prompt from empty state starters
  useEffect(() => {
    if (pendingPrompt) {
      setContent(pendingPrompt);
      setPendingPrompt(null);
      textareaRef.current?.focus();
    }
  }, [pendingPrompt, setPendingPrompt]);

  // Draft persistence: restore on conversation switch, save previous
  useEffect(() => {
    if (prevConvIdRef.current !== undefined) {
      // Save draft for previous conversation
      saveDraft(prevConvIdRef.current, content);
    }
    // Restore draft for new conversation
    const restored = loadDraft(activeConversationId);
    setContent(restored);
    prevConvIdRef.current = activeConversationId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  // Debounced save to localStorage on content change
  useEffect(() => {
    clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      saveDraft(activeConversationId, content);
    }, 300);
    return () => clearTimeout(draftTimerRef.current);
  }, [content, activeConversationId]);

  // Auto-focus textarea on conversation switch
  useEffect(() => {
    if (!isStreaming) {
      const t = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [activeConversationId, isStreaming]);

  // Re-focus after streaming ends
  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      textareaRef.current?.focus();
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, [content]);

  // Clipboard image paste support
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        setPendingFiles((prev) => [...prev, ...imageFiles]);
      }
    };
    ta.addEventListener('paste', handlePaste);
    return () => ta.removeEventListener('paste', handlePaste);
  }, []);

  const executeSlashCommand = useCallback((cmd: SlashCommand) => {
    // Extract args after the command name
    const match = content.match(/^\/(\S+)\s*(.*)/);
    const args = match ? match[2] : '';
    cmd.execute(args);
    setContent('');
    setSlashMenuOpen(false);
  }, [content]);

  const handleSend = useCallback(async () => {
    if (isStreaming) return;
    const text = content.trim();

    // Check if it's a slash command with args (e.g., "/model gpt-5")
    const cmdMatch = text.match(/^\/(\S+)(?:\s+(.*))?$/);
    if (cmdMatch) {
      const cmdName = cmdMatch[1].toLowerCase();
      const cmd = slashCommands.find((c) => c.name === cmdName);
      if (cmd) {
        cmd.execute(cmdMatch[2] || '');
        setContent('');
        setSlashMenuOpen(false);
        return;
      }
    }

    if (!text && pendingFiles.length === 0 && attachedContexts.length === 0) return;

    const contextIds = attachedContexts.map((c) => c.id);

    let convId = activeConversationId;
    if (!convId) {
      try {
        const conv = await api.createConversation({
          model: activePersona?.defaultModel || activeModel,
          ...(activePersona ? { agent_persona_id: activePersona.id } : {}),
        });
        convId = conv.id;
        setActiveConversationId(convId);
        api.listConversations().then((r) => setConversations(r.conversations));
      } catch (e) {
        console.error('Failed to create conversation:', e);
        toast.error('Failed to create conversation');
        return;
      }
    } else if (activePersona) {
      // Attach persona to existing conversation so the backend uses its system prompt
      try {
        await api.updateConversation(convId, { agent_persona_id: activePersona.id });
      } catch (e) {
        console.error('Failed to attach persona to conversation:', e);
      }
    }

    let attachmentIds: string[] | undefined;
    if (pendingFiles.length > 0 && sandboxId) {
      try {
        const result = await api.uploadSandboxFiles(sandboxId, pendingFiles);
        attachmentIds = result.ids;
      } catch {
        toast.error('Failed to upload files');
      }
    }

    const parentId = branchingFromId || undefined;
    setBranchingFromId(null);
    setContent('');
    setPendingFiles([]);
    setAttachedContexts([]);
    saveDraft(convId, '');
    saveDraft(activeConversationId, '');

    // Add user message optimistically (show only user's text, not context blob)
    const userMsg: Message = {
      id: `temp-${Date.now()}`, conversationId: convId, role: 'user',
      content: text || '[File upload]', createdAt: new Date().toISOString(),
      parentId,
      ...(attachedContexts.length > 0 ? { contexts: [...attachedContexts] } : {}),
    };
    if (parentId) {
      const branchIdx = messages.findIndex((m) => m.id === parentId);
      setMessages(branchIdx !== -1 ? [...messages.slice(0, branchIdx + 1), userMsg] : [...messages, userMsg]);
    } else {
      setMessages([...messages, userMsg]);
    }

    await streamSend(text, convId, {
      attachmentIds,
      model: activePersona?.defaultModel || activeModel,
      parentId,
      numResponses,
      contextIds: contextIds.length > 0 ? contextIds : undefined,
      agentPersonaId: activePersona?.id,
    });
  }, [content, pendingFiles, attachedContexts, isStreaming, activeConversationId, activeModel, activePersona, sandboxId, messages,
    setActiveConversationId, setMessages, setConversations, branchingFromId, setBranchingFromId,
    numResponses, streamSend, slashCommands]);

  // Handle regenerate events from message bubbles
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.conversationId || !detail?.messageId || isStreaming) return;
      await streamRegenerate(detail.conversationId, detail.messageId);
    };
    window.addEventListener('nexus:regenerate', handler);
    return () => window.removeEventListener('nexus:regenerate', handler);
  }, [isStreaming, streamRegenerate]);

  // Handle retry-with-model events
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.conversationId || !detail?.messageId || !detail?.model || isStreaming) return;
      await streamRegenerate(detail.conversationId, detail.messageId, detail.model);
    };
    window.addEventListener('nexus:regenerate-with-model', handler);
    return () => window.removeEventListener('nexus:regenerate-with-model', handler);
  }, [isStreaming, streamRegenerate]);

  // Handle branch-send events from the inline branch input card
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.content || !detail?.parentId) return;
      setBranchingFromId(detail.parentId);
      setContent(detail.content);
      setTimeout(() => {
        const sendBtn = document.querySelector('[data-send-button]') as HTMLButtonElement;
        sendBtn?.click();
      }, 50);
    };
    window.addEventListener('nexus:branch-send', handler);
    return () => window.removeEventListener('nexus:branch-send', handler);
  }, [setBranchingFromId]);

  // Handle edit-message events from message bubble Edit button
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const branchFrom = detail.branchFrom as string | undefined;
      const messageId = detail.messageId as string | undefined;
      // Load content into the input
      setContent(detail.content || '');
      // Restore context references
      if (detail.contexts && detail.contexts.length > 0) {
        setAttachedContexts(detail.contexts);
      }
      // Set branching point and trim messages: remove the edited message and everything after it
      if (branchFrom) {
        setBranchingFromId(branchFrom);
      }
      const msgs = useStore.getState().messages;
      if (messageId) {
        // Find the edited message and remove it + everything after
        const editIdx = msgs.findIndex((m) => m.id === messageId);
        if (editIdx !== -1) {
          useStore.getState().setMessages(msgs.slice(0, editIdx));
        }
      } else if (branchFrom) {
        const branchIdx = msgs.findIndex((m) => m.id === branchFrom);
        if (branchIdx !== -1) {
          useStore.getState().setMessages(msgs.slice(0, branchIdx + 1));
        }
      }
      // Focus the textarea
      setTimeout(() => textareaRef.current?.focus(), 50);
    };
    window.addEventListener('nexus:edit-message', handler);
    return () => window.removeEventListener('nexus:edit-message', handler);
  }, [setBranchingFromId]);

  // Listen for file drops from the workspace-level drop zone
  useEffect(() => {
    const handler = (e: Event) => {
      const files = (e as CustomEvent).detail?.files as File[] | undefined;
      if (files && files.length > 0) {
        setPendingFiles((prev) => [...prev, ...files]);
      }
    };
    window.addEventListener('nexus:drop-files', handler);
    return () => window.removeEventListener('nexus:drop-files', handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // @ mention navigation
    if (mentionMenuOpen && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionHighlightIndex((i) => Math.min(i + 1, mentionResults.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionHighlightIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionResults[mentionHighlightIndex]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMentionMenuOpen(false); return; }
    }
    if (slashMenuOpen && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashHighlightIndex((i) => Math.min(i + 1, filteredSlashCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashHighlightIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        executeSlashCommand(filteredSlashCommands[slashHighlightIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenuOpen(false);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const cmd = filteredSlashCommands[slashHighlightIndex];
        setContent(`/${cmd.name} `);
        setSlashMenuOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const removeFile = (index: number) => setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  const hasContent = content.trim() || pendingFiles.length > 0;

  return (
    <div className="shrink-0 bg-surface-0 px-3 sm:px-5 pt-4 sm:pt-5 safe-bottom"
      style={{ '--safe-bottom-pad': '1.25rem' } as React.CSSProperties}
    >
    <div className="max-w-4xl mx-auto w-full">
      {attachedContexts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {attachedContexts.map((ctx) => (
            <div key={ctx.id} className="flex items-center gap-1.5 px-2 py-1 bg-accent/10 border border-accent/20 rounded-lg text-[11px] text-accent">
              <MessageSquare size={10} />
              <span className="truncate max-w-[160px]">{ctx.title}</span>
              <button onClick={() => setAttachedContexts((prev) => prev.filter((c) => c.id !== ctx.id))} className="text-accent/60 hover:text-accent cursor-pointer">
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {pendingFiles.map((file, i) => (
            <FilePreviewCard key={i} file={file} onRemove={() => removeFile(i)} />
          ))}
        </div>
      )}

      <div className="relative">
        {/* @ mention dropdown */}
        {mentionMenuOpen && mentionResults.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-surface-0 border border-border-default rounded-lg shadow-xl overflow-hidden z-20 animate-fade-in-up" style={{ animationDuration: '0.1s' }}>
            <div className="py-1">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-text-tertiary font-mono">
                Reference a conversation
              </div>
              {mentionResults.map((conv, idx) => (
                <button
                  key={conv.id}
                  onClick={() => insertMention(conv)}
                  onMouseEnter={() => setMentionHighlightIndex(idx)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer transition-colors ${
                    idx === mentionHighlightIndex ? 'bg-accent/10 text-text-primary' : 'text-text-secondary hover:bg-surface-1'
                  }`}
                >
                  <MessageSquare size={12} className="text-text-tertiary shrink-0" />
                  <span className="truncate">{conv.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Slash command dropdown */}
        {slashMenuOpen && filteredSlashCommands.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-surface-0 border border-border-default rounded-lg shadow-xl overflow-hidden z-20 animate-fade-in-up" style={{ animationDuration: '0.1s' }}>
            <div className="py-1">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-text-tertiary font-mono">
                Slash Commands
              </div>
              {filteredSlashCommands.map((cmd, idx) => (
                <button
                  key={cmd.name}
                  onClick={() => executeSlashCommand(cmd)}
                  onMouseEnter={() => setSlashHighlightIndex(idx)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer transition-colors ${
                    idx === slashHighlightIndex
                      ? 'bg-accent/10 text-text-primary'
                      : 'text-text-secondary hover:bg-surface-1'
                  }`}
                >
                  <span className="text-text-tertiary w-4 shrink-0">{cmd.icon}</span>
                  <span className="font-mono text-accent">/{cmd.name}</span>
                  <span className="text-text-tertiary ml-1">{cmd.description.replace(/^[^—]*— ?/, '')}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          className="flex items-center gap-2 bg-surface-1 border border-border-default rounded-lg px-3 py-2 min-h-[44px] focus-within:border-accent/30 focus-within:shadow-[0_0_16px_-4px_var(--color-accent-dim)] transition-all"
        >
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? 'Waiting for response...' : 'Message Nexus... (/ for commands)'}
            disabled={isStreaming}
            rows={1}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary resize-none outline-none disabled:opacity-50 max-h-[200px] self-center"
          />

          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) setPendingFiles((prev) => [...prev, ...Array.from(e.target.files!)]); }} />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 text-text-tertiary hover:text-text-secondary shrink-0 cursor-pointer rounded-lg hover:bg-surface-2 transition-colors"
            title="Attach files"
          >
            <Paperclip size={14} />
          </button>

          {isStreaming ? (
            <button
              onClick={abortStreaming}
              className="w-7 h-7 flex items-center justify-center text-sm shrink-0 cursor-pointer rounded-lg transition-all bg-error/80 text-white hover:bg-error"
              title="Stop generation"
            >
              <Square size={12} />
            </button>
          ) : (
            <button
              data-send-button
              onClick={handleSend}
              disabled={!hasContent}
              className={`w-7 h-7 flex items-center justify-center text-sm shrink-0 cursor-pointer rounded-lg transition-all ${
                hasContent ? 'bg-accent text-bg hover:bg-accent-hover scale-100' : 'bg-surface-2 text-text-tertiary scale-95'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <ArrowUp size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 pb-0.5">
        <ModelPicker />
        <AgentPicker />
        <div className="flex-1" />
        {!isStreaming && (
          <ChatSettings numResponses={numResponses} setNumResponses={setNumResponses} />
        )}
      </div>
    </div>
    </div>
  );
}
