'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useStore } from '@/lib/store';
import type { StreamingState } from '@/lib/store';
import { Zap, Terminal, Play, Download, Check, ChevronDown, Loader2, FileSpreadsheet, FileText, Presentation, File as FileIcon } from 'lucide-react';
import type { ToolCall } from '@/lib/types';

function StreamingExecBlock({ tool }: { tool: ToolCall }) {
  const lang = tool.language || tool.name || 'code';
  return (
    <div className={`my-2 rounded-lg border overflow-hidden ${tool.isRunning ? 'border-accent/30' : 'border-border-default'}`}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-1 text-[11px] font-mono">
        <div className="flex items-center gap-1.5 text-text-secondary">
          <Terminal size={11} className="text-text-tertiary" />
          <span>{lang}</span>
        </div>
        {tool.isRunning && (
          <span className="flex items-center gap-1 text-accent">
            <Play size={9} className="fill-current animate-pulse" /> running
          </span>
        )}
        {!tool.isRunning && tool.exitCode !== undefined && (
          <span className={`flex items-center gap-1 ${tool.exitCode === 0 ? 'text-accent' : 'text-error'}`}>
            {tool.exitCode === 0 ? <Check size={10} /> : null}
            exit {tool.exitCode}
          </span>
        )}
      </div>
      {tool.isRunning && <div className="h-px shimmer" />}
      {tool.code && (
        <pre className="px-3 py-2 bg-surface-0 text-xs overflow-x-auto max-h-48 border-t border-border-subtle">
          <code>{tool.code}</code>
        </pre>
      )}
      {tool.output && (
        <pre className="px-3 py-2 bg-bg text-xs text-text-secondary overflow-x-auto max-h-40 border-t border-border-subtle">
          {tool.output}
        </pre>
      )}
    </div>
  );
}

function StreamingImage({ filename, url }: { filename: string; url: string }) {
  return (
    <div className="my-3 rounded-lg border border-border-default overflow-hidden animate-fade-in-up">
      <img
        src={url}
        alt={filename}
        className="w-full max-h-[500px] object-contain bg-bg"
        loading="eager"
      />
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-1 text-[11px] font-mono text-text-tertiary">
        <span className="truncate">{filename}</span>
        <a href={url} download={filename} className="flex items-center gap-1 text-text-tertiary hover:text-accent transition-colors shrink-0 ml-2">
          <Download size={10} /> Save
        </a>
      </div>
    </div>
  );
}

function StreamingFileCard({ filename, fileType }: { filename: string; fileType: string }) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const icon = ext === 'xlsx' || ext === 'xls' ? <FileSpreadsheet size={16} className="text-green-400" />
    : ext === 'pptx' || ext === 'ppt' ? <Presentation size={16} className="text-orange-400" />
    : ext === 'pdf' ? <FileText size={16} className="text-red-400" />
    : <FileIcon size={16} className="text-text-tertiary" />;
  const badgeColor = ext === 'xlsx' || ext === 'xls' ? 'bg-green-500/15 text-green-400'
    : ext === 'pptx' || ext === 'ppt' ? 'bg-orange-500/15 text-orange-400'
    : ext === 'pdf' ? 'bg-red-500/15 text-red-400'
    : 'bg-surface-2 text-text-tertiary';

  return (
    <div className="my-2 flex items-center gap-3 p-3 bg-surface-1 border border-border-default rounded-lg animate-fade-in-up">
      <div className="w-9 h-9 rounded-lg bg-surface-2 border border-border-default flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-text-primary truncate font-medium">{filename}</div>
        <span className={`px-1.5 py-0 text-[9px] font-bold uppercase rounded tracking-wide ${badgeColor}`}>
          {ext.toUpperCase() || fileType.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

/**
 * Reveals text smoothly character-by-character using requestAnimationFrame.
 * As new content arrives from SSE, it drains the buffer at a steady rate
 * so the text appears to flow naturally rather than arriving in chunks.
 */
function SmoothText({ text, showCursor }: { text: string; showCursor: boolean }) {
  const [displayed, setDisplayed] = useState('');
  const targetRef = useRef(text);
  const displayedRef = useRef('');
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);

  // Characters to reveal per millisecond (tune for feel)
  // ~120 chars/sec feels fast but readable
  const CHARS_PER_MS = 0.15;

  targetRef.current = text;

  const tick = useCallback((time: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = time;
    const dt = time - lastTimeRef.current;
    lastTimeRef.current = time;

    const target = targetRef.current;
    const current = displayedRef.current;

    if (current.length < target.length) {
      // Reveal proportional to elapsed time, minimum 1 char
      const charsToAdd = Math.max(1, Math.floor(dt * CHARS_PER_MS));
      const nextLen = Math.min(current.length + charsToAdd, target.length);
      const next = target.slice(0, nextLen);
      displayedRef.current = next;
      setDisplayed(next);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  // If target jumps ahead significantly (e.g. large chunk), catch up
  useEffect(() => {
    if (text.length < displayedRef.current.length) {
      // Content was reset
      displayedRef.current = '';
      setDisplayed('');
    }
  }, [text]);

  return (
    <div className="text-sm text-text-primary whitespace-pre-wrap break-words leading-relaxed">
      {displayed}
      {showCursor && <span className="inline-block w-0.5 h-4 bg-accent ml-0.5 align-text-bottom animate-pulse" />}
    </div>
  );
}

function BranchContent({ state, showCursor }: { state: StreamingState; showCursor: boolean }) {
  const hasContent = state.content || state.reasoning || state.toolCalls.length > 0 || state.images.length > 0 || state.files.length > 0;

  if (!hasContent) {
    return (
      <div className="flex items-center gap-3 py-3 animate-fade-in-up" style={{ animationDuration: '0.2s' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center border border-accent/20 bg-accent/5">
          <Zap size={13} className="text-accent animate-pulse" />
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-accent tracking-widest uppercase">Thinking</span>
            <div className="flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
          <span className="text-[10px] text-text-tertiary thinking-indicator">Nexus is thinking...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {state.reasoning && (
        <details open className="mb-2">
          <summary className="flex items-center gap-1.5 cursor-pointer text-[11px] text-text-tertiary py-1 font-mono tracking-wide">
            <ChevronDown size={10} />
            reasoning...
          </summary>
          <div className="mt-1 pl-3 border-l-2 border-accent/20 text-xs text-text-tertiary whitespace-pre-wrap leading-relaxed">
            {state.reasoning}
          </div>
        </details>
      )}
      {state.toolCalls.map((tool) => (
        <StreamingExecBlock key={tool.id} tool={tool} />
      ))}
      {state.images.map((img, i) => (
        <StreamingImage key={i} filename={img.filename} url={img.url} />
      ))}
      {state.files.map((f, i) => (
        <StreamingFileCard key={i} filename={f.filename} fileType={f.fileType} />
      ))}
      {state.content && (
        <SmoothText text={state.content} showCursor={showCursor} />
      )}
    </>
  );
}

export default function StreamingBubble() {
  const singleStream = useStore((s) => s.streaming);
  const isStreaming = useStore((s) => s.isStreaming);
  const multi = useStore((s) => s.multiStreaming);
  const setActiveBranchView = useStore((s) => s.setActiveBranchView);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeState = multi
    ? multi.branches[multi.activeBranchIndex] || singleStream
    : singleStream;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeState.content, activeState.toolCalls, activeState.images]);

  if (!isStreaming) return null;

  const isMulti = multi !== null && multi.branchCount > 1;

  return (
    <div className="flex justify-start animate-fade-in-up">
      <div className="max-w-[95%] sm:max-w-[85%] w-full">
        {/* Multi-response branch tab bar */}
        {isMulti && (
          <div className="flex items-center gap-1 mb-3 p-1 bg-surface-1 border border-border-default rounded-lg">
            {multi.branches.map((_, i) => {
              const isActive = i === multi.activeBranchIndex;
              const isDone = multi.completedBranches.includes(i);
              return (
                <button
                  key={i}
                  onClick={() => setActiveBranchView(i)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all cursor-pointer ${
                    isActive
                      ? 'bg-accent/10 text-accent border border-accent/20'
                      : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2 border border-transparent'
                  }`}
                >
                  {isDone ? (
                    <Check size={10} className="text-accent" />
                  ) : (
                    <Loader2 size={10} className="animate-spin" />
                  )}
                  <span>Response {i + 1}</span>
                </button>
              );
            })}
          </div>
        )}

        <BranchContent
          state={activeState}
          showCursor={isMulti ? !multi.completedBranches.includes(multi.activeBranchIndex) : true}
        />

        {/* Accent shimmer bar */}
        {(activeState.content || activeState.toolCalls.length > 0) && (
          <div className="h-px mt-3 rounded-full overflow-hidden">
            <div className="h-full w-full shimmer" style={{ background: 'linear-gradient(90deg, transparent, var(--color-accent), transparent)', backgroundSize: '200% 100%' }} />
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
