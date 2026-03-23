'use client';

import { useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { Zap, Terminal, Play, Download, Check, ChevronDown } from 'lucide-react';
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

export default function StreamingBubble() {
  const content = useStore((s) => s.streaming.content);
  const reasoning = useStore((s) => s.streaming.reasoning);
  const toolCalls = useStore((s) => s.streaming.toolCalls);
  const images = useStore((s) => s.streaming.images);
  const isStreaming = useStore((s) => s.isStreaming);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [content, toolCalls, images]);

  if (!isStreaming) return null;

  const hasContent = content || reasoning || toolCalls.length > 0 || images.length > 0;

  return (
    <div className="flex justify-start animate-fade-in-up">
      <div className="max-w-[85%] w-full">
        {/* Waiting state */}
        {!hasContent && (
          <div className="flex items-center gap-3 py-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center border border-accent/20 bg-accent/5">
              <Zap size={13} className="text-accent animate-pulse" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-accent tracking-widest uppercase">Thinking</span>
                <div className="flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reasoning */}
        {reasoning && (
          <details open className="mb-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-[11px] text-text-tertiary py-1 font-mono tracking-wide">
              <ChevronDown size={10} />
              reasoning...
            </summary>
            <div className="mt-1 pl-3 border-l-2 border-accent/20 text-xs text-text-tertiary whitespace-pre-wrap leading-relaxed">
              {reasoning}
            </div>
          </details>
        )}

        {/* Tool calls */}
        {toolCalls.map((tool) => (
          <StreamingExecBlock key={tool.id} tool={tool} />
        ))}

        {/* Inline images */}
        {images.map((img, i) => (
          <StreamingImage key={i} filename={img.filename} url={img.url} />
        ))}

        {/* Streaming text */}
        {content && (
          <div className="text-sm text-text-primary whitespace-pre-wrap break-words leading-relaxed">
            {content}
            <span className="inline-block w-0.5 h-4 bg-accent ml-0.5 align-text-bottom animate-pulse" />
          </div>
        )}

        {/* Accent shimmer bar */}
        {hasContent && (
          <div className="h-px mt-3 rounded-full overflow-hidden">
            <div className="h-full w-full shimmer" style={{ background: 'linear-gradient(90deg, transparent, var(--color-accent), transparent)', backgroundSize: '200% 100%' }} />
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
