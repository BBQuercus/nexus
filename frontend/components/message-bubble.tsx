'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import type { Message, CostData, ToolCall } from '@/lib/types';
import { renderMarkdown } from '@/lib/markdown';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import { Copy, GitBranch, RefreshCw, ChevronRight, ChevronDown, ChevronLeft, Terminal, Play, Check, Download, Clock, Coins, Cpu, ArrowRight, X, Link } from 'lucide-react';

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
  const lang = tool.language || tool.name || 'code';
  const [collapsed, setCollapsed] = useState(!tool.isRunning && !!tool.output && tool.output.length > 200);

  return (
    <div className={`my-2 rounded-lg border overflow-hidden ${tool.isRunning ? 'border-accent/30' : 'border-border-default'}`}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-1 text-[11px] font-mono">
        <div className="flex items-center gap-1.5 text-text-secondary">
          <Terminal size={11} className="text-text-tertiary" />
          <span>{lang}</span>
        </div>
        <div className="flex items-center gap-2">
          {tool.isRunning ? (
            <span className="flex items-center gap-1 text-accent">
              <Play size={9} className="fill-current animate-pulse" /> running
            </span>
          ) : tool.exitCode !== undefined ? (
            <span className={`flex items-center gap-1 ${tool.exitCode === 0 ? 'text-accent' : 'text-error'}`}>
              {tool.exitCode === 0 ? <Check size={10} /> : null}
              exit {tool.exitCode}
              {tool.duration !== undefined && <span className="ml-1 text-text-tertiary">{(tool.duration / 1000).toFixed(2)}s</span>}
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
    // Walk down from the sibling to find its deepest leaf (follow first child)
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
      const mapped: Message[] = (result.messages || []).map((m: Record<string, unknown>) => ({
        id: (m.id as string) || '',
        conversationId: activeConversationId,
        role: (m.role as 'user' | 'assistant' | 'system') || 'user',
        content: (m.content as string) || '',
        createdAt: (m.created_at as string) || '',
        reasoning: (m.reasoning as string) || undefined,
        toolCalls: (m.tool_calls as Message['toolCalls']) || undefined,
        images: (m.images as Message['images']) || undefined,
        feedback: (m.feedback as Message['feedback']) || undefined,
        parentId: (m.parent_id as string) || undefined,
        branchIndex: (m.branch_index as number) ?? undefined,
      }));
      setMessages(mapped);
      setActiveLeafId(result.active_leaf_id);
      // Refresh tree
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

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const text = branchText.trim();
    if (!text || !activeConversationId || isStreaming) return;
    // Dispatch to chat-input via the store + custom event
    useStore.getState().setBranchingFromId(messageId);
    window.dispatchEvent(new CustomEvent('nexus:branch-send', {
      detail: { content: text, parentId: messageId },
    }));
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="relative flex gap-0 mt-3">
      {/* Connector line */}
      <div className="flex flex-col items-center w-8 shrink-0 pt-3">
        <div className="w-full h-[2px] bg-border-default/40" />
        <div className="w-[2px] flex-1 border-l border-dashed border-border-default/50" />
      </div>
      {/* Branch card */}
      <div className="bg-surface-0 border border-border-default rounded-xl p-4 shadow-xl shadow-black/20 w-80 animate-fade-in-up" style={{ animationDuration: '0.15s' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Branch Thread</span>
          <span className="h-[1px] flex-1 bg-border-default/30" />
          <button onClick={onClose} className="text-text-tertiary hover:text-text-secondary cursor-pointer">
            <X size={12} />
          </button>
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
                className="p-1.5 rounded-md bg-accent text-bg hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
            <span className="flex items-center gap-1">
              <Link size={9} /> Context locked
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MessageBubble({ message }: { message: Message }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const isStreaming = useStore((s) => s.isStreaming);
  const [copied, setCopied] = useState(false);
  const [showBranchInput, setShowBranchInput] = useState(false);

  const renderedHtml = useMemo(() => {
    if (message.role === 'user') return null;
    return message.content ? renderMarkdown(message.content) : '';
  }, [message.content, message.role]);

  // Post-process mermaid
  useEffect(() => {
    if (!contentRef.current || message.role === 'user') return;
    const mermaidContainers = contentRef.current.querySelectorAll('[data-mermaid-source]');
    if (mermaidContainers.length === 0) return;
    (async () => {
      try {
        const mermaid = await import('mermaid');
        mermaid.default.initialize({ startOnLoad: false, theme: 'dark', darkMode: true, themeVariables: { primaryColor: '#1A1A1A', primaryTextColor: '#ECECEC', primaryBorderColor: '#2A2A2A', lineColor: '#555555' }, securityLevel: 'loose' });
        for (const el of mermaidContainers) {
          const source = el.getAttribute('data-mermaid-source');
          if (source) { const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`; const { svg } = await mermaid.default.render(id, source); el.innerHTML = svg; el.removeAttribute('data-mermaid-source'); }
        }
      } catch (e) { console.warn('Mermaid rendering failed:', e); }
    })();
  }, [renderedHtml, message.role]);

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

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="group max-w-[80%]">
          <SiblingNav message={message} />
          <div className="bg-surface-2 border border-border-default rounded-2xl rounded-br-sm text-text-primary px-4 py-2.5 text-sm whitespace-pre-wrap">
            {message.content}
          </div>
          <div className="flex justify-end gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={handleCopy} className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary cursor-pointer">
              {copied ? <Check size={10} className="text-accent" /> : <Copy size={10} />} {copied ? 'Copied' : 'Copy'}
            </button>
            <div className="h-3 w-[1px] bg-border-default/30 mx-0.5" />
            <button
              onClick={() => setShowBranchInput(!showBranchInput)}
              className={`flex items-center gap-1.5 text-[10px] font-bold py-0.5 px-2 rounded transition-all cursor-pointer ${
                showBranchInput
                  ? 'text-accent bg-accent/10 border border-accent/20'
                  : 'text-accent bg-accent/5 border border-accent/15 hover:bg-accent/10'
              }`}
            >
              <GitBranch size={10} /> New Branch
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
      <div className="group max-w-[85%]">
        <SiblingNav message={message} />
        {message.reasoning && <ReasoningTrace content={message.reasoning} tokenCount={message.reasoningTokens} />}
        {message.toolCalls?.map((tool) => <ExecBlock key={tool.id} tool={tool} />)}
        {message.images && message.images.length > 0 && (
          <div className="space-y-3 my-3">
            {message.images.map((img, i) => (
              <InlineImage key={i} img={img} />
            ))}
          </div>
        )}
        {renderedHtml && (
          <div ref={contentRef} className="markdown-content text-sm text-text-primary" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        )}
        {message.cost && <CostBadge data={message.cost} />}
        <div className="flex items-center gap-3 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={handleCopy} className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary cursor-pointer">
            {copied ? <Check size={10} className="text-accent" /> : <Copy size={10} />} {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={handleRegenerate} className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary cursor-pointer">
            <RefreshCw size={10} /> Regenerate
          </button>
          <div className="h-3 w-[1px] bg-border-default/30 mx-0.5" />
          <button
            onClick={() => setShowBranchInput(!showBranchInput)}
            className={`flex items-center gap-1.5 text-[10px] font-bold py-0.5 px-2 rounded transition-all cursor-pointer ${
              showBranchInput
                ? 'text-accent bg-accent/10 border border-accent/20'
                : 'text-accent bg-accent/5 border border-accent/15 hover:bg-accent/10'
            }`}
          >
            <GitBranch size={10} /> New Branch
          </button>
        </div>
        {showBranchInput && (
          <InlineBranchInput messageId={message.id} onClose={() => setShowBranchInput(false)} />
        )}
      </div>
    </div>
  );
}
