'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import type { Message } from '@/lib/types';
import { MODELS, IMAGE_MODELS } from '@/lib/types';
import { useStreaming, reloadConversation } from '@/lib/useStreaming';
import { toast } from '../toast';
import type { SlashCommand, AttachedContext, ComposeMode, Verbosity, Creativity, Tone } from './types';
import { saveDraft, loadDraft, CREATIVITY_TEMPERATURE } from './types';
import {
  Cpu, Trash2, HelpCircle, Download, ClipboardCopy, RefreshCw,
  Pin, Hash, GitCompare, ScrollText, FileText, Search,
} from 'lucide-react';

export interface UseChatSubmitOptions {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export interface UseChatSubmitReturn {
  content: string;
  setContent: React.Dispatch<React.SetStateAction<string>>;
  pendingFiles: File[];
  setPendingFiles: React.Dispatch<React.SetStateAction<File[]>>;
  numResponses: number;
  setNumResponses: React.Dispatch<React.SetStateAction<number>>;
  verbosity: Verbosity;
  setVerbosity: React.Dispatch<React.SetStateAction<Verbosity>>;
  creativity: Creativity;
  setCreativity: React.Dispatch<React.SetStateAction<Creativity>>;
  tone: Tone;
  setTone: React.Dispatch<React.SetStateAction<Tone>>;
  composeMode: ComposeMode;
  setComposeMode: React.Dispatch<React.SetStateAction<ComposeMode>>;
  imageModel: string;
  setImageModel: React.Dispatch<React.SetStateAction<string>>;
  isGeneratingImage: boolean;
  compareModels: string[];
  setCompareModels: React.Dispatch<React.SetStateAction<string[]>>;
  attachedContexts: AttachedContext[];
  setAttachedContexts: React.Dispatch<React.SetStateAction<AttachedContext[]>>;
  slashMenuOpen: boolean;
  setSlashMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  slashHighlightIndex: number;
  setSlashHighlightIndex: React.Dispatch<React.SetStateAction<number>>;
  mentionMenuOpen: boolean;
  setMentionMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  mentionHighlightIndex: number;
  setMentionHighlightIndex: React.Dispatch<React.SetStateAction<number>>;
  mentionResults: { id: string; title: string }[];
  filteredSlashCommands: SlashCommand[];
  activeSlashHint: SlashCommand | null;
  slashCommands: SlashCommand[];
  handleSend: () => void;
  handleGenerateImage: () => Promise<void>;
  executeSlashCommand: (cmd: SlashCommand) => void;
  insertMention: (conv: { id: string; title: string }) => void;
  removeFile: (index: number) => void;
  hasContent: string | boolean;
  canSend: boolean;
}

export function useChatSubmit({ textareaRef }: UseChatSubmitOptions): UseChatSubmitReturn {
  const [content, setContent] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [numResponses, setNumResponses] = useState<number>(1);
  const [verbosity, setVerbosity] = useState<Verbosity>('balanced');
  const [creativity, setCreativity] = useState<Creativity>('balanced');
  const [tone, setTone] = useState<Tone>('professional');
  const [composeMode, setComposeMode] = useState<ComposeMode>('chat');
  const [imageModel, setImageModel] = useState(IMAGE_MODELS[0].id);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [compareModels, setCompareModels] = useState<string[]>([]);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashHighlightIndex, setSlashHighlightIndex] = useState(0);
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [mentionHighlightIndex, setMentionHighlightIndex] = useState(0);
  const [mentionResults, setMentionResults] = useState<{ id: string; title: string }[]>([]);
  const [attachedContexts, setAttachedContexts] = useState<AttachedContext[]>([]);

  const draftTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevConvIdRef = useRef<string | null | undefined>(undefined);

  const isStreaming = useStore((s) => s.isStreaming);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const activeModel = useStore((s) => s.activeModel);
  const activePersona = useStore((s) => s.activePersona);
  const sandboxId = useStore((s) => s.sandboxId);
  const messages = useStore((s) => s.messages);
  const setConversationMessages = useStore((s) => s.setConversationMessages);
  const setActiveConversationId = useStore((s) => s.setActiveConversationId);
  const setMessages = useStore((s) => s.setMessages);
  const setConversations = useStore((s) => s.setConversations);
  const pendingPrompt = useStore((s) => s.pendingPrompt);
  const setPendingPrompt = useStore((s) => s.setPendingPrompt);
  const branchingFromId = useStore((s) => s.branchingFromId);
  const setBranchingFromId = useStore((s) => s.setBranchingFromId);

  const { streamSend, streamRegenerate } = useStreaming();

  // Slash commands definition
  const slashCommands: SlashCommand[] = useMemo(() => [
    {
      name: 'model',
      description: 'Switch model — /model <name>',
      icon: <Cpu size={13} />,
      hint: 'Type a model name, e.g. sonnet, opus, gpt-4o',
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
    {
      name: 'copy',
      description: 'Copy last response to clipboard',
      icon: <ClipboardCopy size={13} />,
      execute: () => {
        const msgs = useStore.getState().messages;
        const last = [...msgs].reverse().find((m) => m.role === 'assistant');
        if (!last) { toast.info('No assistant response to copy'); return; }
        navigator.clipboard.writeText(last.content).then(() => toast.success('Copied to clipboard')).catch(() => toast.error('Failed to copy'));
      },
    },
    {
      name: 'retry',
      description: 'Regenerate the last response',
      icon: <RefreshCw size={13} />,
      execute: () => {
        const { messages: msgs, activeConversationId: convId } = useStore.getState();
        const last = [...msgs].reverse().find((m) => m.role === 'assistant');
        if (!last || !convId) { toast.info('Nothing to regenerate'); return; }
        window.dispatchEvent(new CustomEvent('nexus:regenerate', { detail: { conversationId: convId, messageId: last.id } }));
      },
    },
    {
      name: 'pin',
      description: 'Pin or unpin the current conversation',
      icon: <Pin size={13} />,
      execute: () => {
        const convId = useStore.getState().activeConversationId;
        if (!convId) { toast.info('No active conversation'); return; }
        useStore.getState().togglePinConversation(convId);
        const conv = useStore.getState().conversations.find((c) => c.id === convId);
        toast.success(conv?.pinned ? 'Conversation pinned' : 'Conversation unpinned');
      },
    },
    {
      name: 'system',
      description: 'Set a system prompt — /system <prompt>',
      icon: <ScrollText size={13} />,
      hint: 'Type the system prompt for this conversation',
      execute: (args: string) => {
        const prompt = args.trim();
        if (!prompt) { toast.info('Usage: /system <prompt>'); return; }
        const convId = useStore.getState().activeConversationId;
        if (!convId) { toast.info('Start a conversation first'); return; }
        api.updateConversation(convId, { system_prompt: prompt })
          .then(() => toast.success('System prompt set'))
          .catch(() => toast.error('Failed to set system prompt'));
      },
    },
    {
      name: 'summarize',
      description: 'Summarize the conversation so far',
      icon: <FileText size={13} />,
      execute: () => {
        const msgs = useStore.getState().messages;
        if (msgs.length === 0) { toast.info('No messages to summarize'); return; }
        const summary = msgs.map((m) => `${m.role}: ${m.content}`).join('\n').slice(0, 12000);
        setContent(`Please provide a concise summary of our conversation so far:\n\n${summary}`);
        setTimeout(() => {
          const btn = document.querySelector('[data-send-button]') as HTMLButtonElement;
          btn?.click();
        }, 50);
      },
    },
    {
      name: 'search',
      description: 'Search messages — /search <query>',
      icon: <Search size={13} />,
      hint: 'Type a search term to find in messages',
      execute: (args: string) => {
        const query = args.trim().toLowerCase();
        if (!query) { toast.info('Usage: /search <query>'); return; }
        const msgs = useStore.getState().messages;
        const matches = msgs.filter((m) => m.content.toLowerCase().includes(query));
        if (matches.length === 0) { toast.info(`No matches for "${args.trim()}"`); return; }
        const firstMatch = matches[0];
        const el = document.querySelector(`[data-message-id="${firstMatch.id}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('search-highlight');
          setTimeout(() => el.classList.remove('search-highlight'), 2000);
        }
        toast.success(`Found ${matches.length} match${matches.length === 1 ? '' : 'es'}`);
      },
    },
    {
      name: 'tokens',
      description: 'Show token usage for this conversation',
      icon: <Hash size={13} />,
      execute: () => {
        const msgs = useStore.getState().messages;
        if (msgs.length === 0) { toast.info('No messages yet'); return; }
        let inputTokens = 0, outputTokens = 0, totalCost = 0;
        let counted = 0;
        for (const m of msgs) {
          if (m.cost) {
            inputTokens += m.cost.inputTokens;
            outputTokens += m.cost.outputTokens;
            totalCost += m.cost.totalCost || 0;
            counted++;
          }
        }
        if (counted === 0) { toast.info('No token usage data available'); return; }
        const parts = [
          `${(inputTokens + outputTokens).toLocaleString()} tokens`,
          `(${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out)`,
        ];
        if (totalCost > 0) parts.push(`· $${totalCost.toFixed(4)}`);
        toast.info(parts.join(' '));
      },
    },
    {
      name: 'diff',
      description: 'Compare branched responses side-by-side',
      icon: <GitCompare size={13} />,
      execute: () => {
        const { conversationTree: tree, messages: msgs, activeConversationId: convId } = useStore.getState();
        if (!convId) { toast.info('No active conversation'); return; }

        const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
        if (!lastAssistant) { toast.info('No assistant responses'); return; }

        const treeNodes = tree?.nodes || [];
        const parentId = lastAssistant.parentId;
        const siblings = parentId ? treeNodes.filter((n) => n.parentId === parentId && n.role === 'assistant') : [];

        if (siblings.length < 2) { toast.info('No branched responses to compare — use /compare to generate multi-model responses'); return; }

        toast.info('Loading branches...');
        api.getMessageSiblings(convId, lastAssistant.id).then((raw) => {
          const siblingMsgs = raw.filter((m) => (m.role as string) === 'assistant');
          if (siblingMsgs.length < 2) { toast.info('No branched responses to compare'); return; }
          useStore.getState().setDiffView({
            columns: siblingMsgs.map((m, i) => ({
              label: ((m.model as string) || '').split('/').pop() || `Response ${i + 1}`,
              content: (m.content as string) || '',
            })),
          });
        }).catch(() => toast.error('Failed to load branches'));
      },
    },
    {
      name: 'compare',
      description: 'Compare models — /compare model1, model2, ...',
      icon: <GitCompare size={13} />,
      hint: 'List models separated by commas, e.g. sonnet, opus, gpt-4o',
      execute: (args: string) => {
        const names = args.split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
        if (names.length < 2) { toast.info('Usage: /compare sonnet, opus, gpt-4o'); return; }
        const resolved: string[] = [];
        for (const q of names) {
          const match = MODELS.find((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
          if (!match) { toast.error(`Model "${q}" not found`); return; }
          resolved.push(match.id);
        }
        setCompareModels(resolved);
        toast.success(`Compare mode: ${resolved.map((id) => id.split('/').pop()).join(' vs ')}`);
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

  // Detect active slash command with hint
  const activeSlashHint = useMemo(() => {
    const match = content.match(/^\/(\S+)\s/);
    if (!match) return null;
    const cmd = slashCommands.find((c) => c.name === match[1]);
    return cmd?.hint ? cmd : null;
  }, [content, slashCommands]);

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
    const match = content.match(/@(\S*)$/);
    if (match) {
      const query = match[1];
      setMentionMenuOpen(true);
      setMentionHighlightIndex(0);
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

  const insertMention = useCallback((conv: { id: string; title: string }) => {
    const newContent = content.replace(/@\S*$/, '');
    setContent(newContent);
    setMentionMenuOpen(false);
    setAttachedContexts((prev) =>
      prev.some((c) => c.id === conv.id) ? prev : [...prev, conv]
    );
  }, [content]);

  // Pick up pending prompt from empty state starters
  useEffect(() => {
    if (pendingPrompt) {
      setContent(pendingPrompt);
      setPendingPrompt(null);
      textareaRef.current?.focus();
    }
  }, [pendingPrompt, setPendingPrompt, textareaRef]);

  // Draft persistence: restore on conversation switch, save previous
  useEffect(() => {
    if (prevConvIdRef.current !== undefined) {
      saveDraft(prevConvIdRef.current, content);
    }
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
  }, [activeConversationId, isStreaming, textareaRef]);

  // Re-focus after streaming ends
  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      textareaRef.current?.focus();
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, textareaRef]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, [content, textareaRef]);

  const executeSlashCommand = useCallback((cmd: SlashCommand) => {
    const match = content.match(/^\/(\S+)\s*(.*)/);
    const args = match ? match[2] : '';
    cmd.execute(args);
    setContent('');
    setSlashMenuOpen(false);
  }, [content]);

  const handleSend = useCallback(async () => {
    if (isStreaming) return;
    const text = content.trim();

    // Check if it's a slash command with args
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

    // Convert image files to base64 BEFORE creating conversation to avoid race conditions
    const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

    const convertImageToDataUrl = (file: File): Promise<{ filename: string; dataUrl: string }> =>
      new Promise((resolve) => {
        if (SUPPORTED_IMAGE_TYPES.has(file.type)) {
          const reader = new FileReader();
          reader.onload = () => resolve({ filename: file.name, dataUrl: reader.result as string });
          reader.readAsDataURL(file);
        } else {
          // Re-encode unsupported formats (avif, bmp, tiff, svg) to JPEG via canvas
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            URL.revokeObjectURL(url);
            resolve({ filename: file.name.replace(/\.[^.]+$/, '.jpg'), dataUrl });
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            const reader = new FileReader();
            reader.onload = () => resolve({ filename: file.name, dataUrl: reader.result as string });
            reader.readAsDataURL(file);
          };
          img.src = url;
        }
      });

    let imageDataUrls: { filename: string; dataUrl: string }[] | undefined;
    let attachmentIds: string[] | undefined;
    if (pendingFiles.length > 0) {
      const imageFiles = pendingFiles.filter((f) => f.type.startsWith('image/'));
      const otherFiles = pendingFiles.filter((f) => !f.type.startsWith('image/'));

      if (imageFiles.length > 0) {
        imageDataUrls = await Promise.all(imageFiles.map(convertImageToDataUrl));
      }

      // Upload non-image files to sandbox if available
      if (otherFiles.length > 0 && sandboxId) {
        try {
          const result = await api.uploadSandboxFiles(sandboxId, otherFiles);
          attachmentIds = result.ids;
        } catch {
          toast.error('Failed to upload files');
        }
      }
    }

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
      try {
        await api.updateConversation(convId, { agent_persona_id: activePersona.id });
      } catch (e) {
        console.error('Failed to attach persona to conversation:', e);
      }
    }

    const parentId = branchingFromId || undefined;
    setBranchingFromId(null);
    setContent('');
    setPendingFiles([]);
    setAttachedContexts([]);
    saveDraft(convId, '');
    saveDraft(activeConversationId, '');

    // Add user message optimistically (include image previews)
    const userMsg: Message = {
      id: `temp-${Date.now()}`, conversationId: convId, role: 'user',
      content: text || '[File upload]', createdAt: new Date().toISOString(),
      parentId,
      ...(attachedContexts.length > 0 ? { contexts: [...attachedContexts] } : {}),
      ...(imageDataUrls ? { images: imageDataUrls.map((img) => ({ filename: img.filename, url: img.dataUrl })) } : {}),
    };
    if (parentId) {
      const branchIdx = messages.findIndex((m) => m.id === parentId);
      setConversationMessages(convId, branchIdx !== -1 ? [...messages.slice(0, branchIdx + 1), userMsg] : [...messages, userMsg]);
    } else {
      setConversationMessages(convId, [...messages, userMsg]);
    }

    const currentKBIds = useStore.getState().activeKnowledgeBaseIds;
    await streamSend(text, convId, {
      attachmentIds,
      images: imageDataUrls,
      model: activePersona?.defaultModel || activeModel,
      parentId,
      numResponses,
      contextIds: contextIds.length > 0 ? contextIds : undefined,
      agentPersonaId: activePersona?.id,
      knowledgeBaseIds: currentKBIds,
      compareModels: compareModels.length > 1 ? compareModels : undefined,
      temperature: CREATIVITY_TEMPERATURE[creativity],
      verbosity: verbosity !== 'balanced' ? verbosity : undefined,
      tone: tone !== 'professional' ? tone : undefined,
    });
    if (compareModels.length > 0) setCompareModels([]);
  }, [content, pendingFiles, attachedContexts, isStreaming, activeConversationId, activeModel, activePersona, sandboxId, messages,
    setActiveConversationId, setMessages, setConversations, branchingFromId, setBranchingFromId,
    numResponses, verbosity, creativity, tone, setConversationMessages, streamSend, slashCommands, compareModels]);

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
      setContent(detail.content || '');
      if (detail.contexts && detail.contexts.length > 0) {
        setAttachedContexts(detail.contexts);
      }
      if (branchFrom) {
        setBranchingFromId(branchFrom);
      }
      const msgs = useStore.getState().messages;
      if (messageId) {
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
      setTimeout(() => textareaRef.current?.focus(), 50);
    };
    window.addEventListener('nexus:edit-message', handler);
    return () => window.removeEventListener('nexus:edit-message', handler);
  }, [setBranchingFromId, textareaRef]);

  // Handle compose mode changes (e.g. switch to image mode from landing page)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.mode) setComposeMode(detail.mode);
      if (detail?.imageModel) setImageModel(detail.imageModel);
      if (detail?.compareModels) setCompareModels(detail.compareModels);
      if (detail?.prompt) {
        setPendingPrompt(detail.prompt);
        setContent(detail.prompt);
      }
    };
    window.addEventListener('nexus:set-compose', handler);
    return () => window.removeEventListener('nexus:set-compose', handler);
  }, [setPendingPrompt]);

  // Handle form submissions and other programmatic message sends
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail?.text as string | undefined;
      if (!text || isStreaming) return;
      setContent(text);
      // Trigger send on next tick after content is set
      setTimeout(() => {
        const sendBtn = document.querySelector('[data-send-button]') as HTMLButtonElement;
        sendBtn?.click();
      }, 50);
    };
    window.addEventListener('nexus:send-message', handler);
    return () => window.removeEventListener('nexus:send-message', handler);
  }, [isStreaming]);

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

  const handleGenerateImage = useCallback(async () => {
    const prompt = content.trim();
    if (!prompt || isGeneratingImage || isStreaming) return;
    setIsGeneratingImage(true);
    try {
      let convId = activeConversationId;
      if (!convId) {
        const conv = await api.createConversation({ title: 'New conversation', model: activeModel });
        convId = conv.id;
        setActiveConversationId(conv.id);
        const list = await api.listConversations();
        setConversations(list.conversations);
      }
      await api.generateConversationImage(convId, { prompt, model: imageModel });
      await reloadConversation(convId);
      const artifacts = await api.getArtifacts(convId);
      useStore.getState().setArtifacts(artifacts);
      setContent('');
      setComposeMode('chat');
    } catch (e) {
      console.error('Image generation failed', e);
    } finally {
      setIsGeneratingImage(false);
    }
  }, [content, isGeneratingImage, isStreaming, activeConversationId, activeModel, imageModel, setActiveConversationId, setConversations]);

  const removeFile = useCallback((index: number) => setPendingFiles((prev) => prev.filter((_, i) => i !== index)), []);
  const hasContent = content.trim() || pendingFiles.length > 0;
  const canSend = composeMode === 'image'
    ? !!content.trim() && !isGeneratingImage
    : !!hasContent;

  return {
    content,
    setContent,
    pendingFiles,
    setPendingFiles,
    numResponses,
    setNumResponses,
    verbosity,
    setVerbosity,
    creativity,
    setCreativity,
    tone,
    setTone,
    composeMode,
    setComposeMode,
    imageModel,
    setImageModel,
    isGeneratingImage,
    compareModels,
    setCompareModels,
    attachedContexts,
    setAttachedContexts,
    slashMenuOpen,
    setSlashMenuOpen,
    slashHighlightIndex,
    setSlashHighlightIndex,
    mentionMenuOpen,
    setMentionMenuOpen,
    mentionHighlightIndex,
    setMentionHighlightIndex,
    mentionResults,
    filteredSlashCommands,
    activeSlashHint,
    slashCommands,
    handleSend,
    handleGenerateImage,
    executeSlashCommand,
    insertMention,
    removeFile,
    hasContent,
    canSend,
  };
}
