'use client';

import { useState } from 'react';
import { Terminal, Play, Check, ChevronRight, ChevronDown, FileEdit, Clock, Coins, Cpu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ToolCall, CostData } from './types';

export function CostBadge({ data }: { data: CostData }) {
  const t = useTranslations('toolCall');
  const model = data.model.split('/').pop() || data.model;
  return (
    <div className="flex items-center gap-3 mt-3 text-[10px] font-mono text-text-tertiary">
      <span className="flex items-center gap-1"><Cpu size={9} />{model}</span>
      {(data.inputTokens + data.outputTokens) > 0 && (
        <span className="flex items-center gap-1"><Coins size={9} />{t('costTokens', { tokenCount: (data.inputTokens + data.outputTokens).toLocaleString() })}</span>
      )}
      {data.totalCost > 0 && (
        <span>{data.totalCost < 0.01 ? t('costLessThan') : t('costDollar', { cost: data.totalCost.toFixed(3) })}</span>
      )}
      {data.duration > 0 && (
        <span className="flex items-center gap-1"><Clock size={9} />{(data.duration / 1000).toFixed(1)}s</span>
      )}
    </div>
  );
}

export function ExecBlock({ tool }: { tool: ToolCall }) {
  const t = useTranslations('toolCall');
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
              <Play size={9} className="fill-current animate-pulse" /> {t('running')}
            </span>
          ) : tool.exitCode !== undefined ? (
            <span className={`flex items-center gap-1 ${tool.exitCode === 0 ? 'text-accent' : 'text-error'}`}>
              {tool.exitCode === 0 ? <Check size={10} /> : <span>{t('exitCode', { exitCode: tool.exitCode })}</span>}
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
              {t('output', { charCount: tool.output.length })}
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

export function ReasoningTrace({ content, tokenCount }: { content: string; tokenCount?: number }) {
  const t = useTranslations('toolCall');
  return (
    <details className="mb-2 group/reason">
      <summary className="flex items-center gap-1.5 cursor-pointer text-[11px] text-text-tertiary hover:text-text-secondary py-1 font-mono tracking-wide">
        <ChevronRight size={11} className="group-open/reason:rotate-90 transition-transform" />
        <span>{t('reasoning')}</span>
        {tokenCount && <span className="text-text-tertiary/60">{t('reasoningTokens', { tokenCount })}</span>}
      </summary>
      <div className="mt-1 pl-3 border-l-2 border-accent/20 text-xs text-text-tertiary whitespace-pre-wrap leading-relaxed">{content}</div>
    </details>
  );
}
