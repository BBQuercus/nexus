'use client';

import { useMemo } from 'react';

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: DiffLine[] = [];

  // Simple LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  let i = m, j = n;
  const stack: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: 'unchanged', content: oldLines[i - 1], oldLineNo: i, newLineNo: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: 'added', content: newLines[j - 1], newLineNo: j });
      j--;
    } else {
      stack.push({ type: 'removed', content: oldLines[i - 1], oldLineNo: i });
      i--;
    }
  }
  stack.reverse();

  // Collapse long unchanged sections
  let lastContext = -1;
  for (let k = 0; k < stack.length; k++) {
    if (stack[k].type !== 'unchanged') {
      // Include up to 3 lines of context before
      const contextStart = Math.max(lastContext + 1, k - 3);
      if (contextStart > lastContext + 1 && lastContext >= 0) {
        result.push({ type: 'unchanged', content: `... ${contextStart - lastContext - 1} lines hidden ...` });
      }
      for (let c = contextStart; c < k; c++) {
        result.push(stack[c]);
      }
      result.push(stack[k]);
      // Include up to 3 lines of context after
      let end = k + 1;
      while (end < stack.length && end <= k + 3 && stack[end].type === 'unchanged') {
        result.push(stack[end]);
        end++;
      }
      lastContext = end - 1;
      k = end - 1;
    }
  }

  // If no changes, just show it's identical
  if (result.length === 0 && stack.length > 0) {
    result.push({ type: 'unchanged', content: '(no changes)' });
  }

  return result.length > 0 ? result : stack;
}

const LINE_COLORS = {
  added: 'bg-accent/8 text-accent',
  removed: 'bg-error/8 text-error',
  unchanged: 'text-text-tertiary',
};

const GUTTER_COLORS = {
  added: 'text-accent/50',
  removed: 'text-error/50',
  unchanged: 'text-text-tertiary/30',
};

const PREFIX = {
  added: '+',
  removed: '-',
  unchanged: ' ',
};

export default function DiffViewer({
  oldContent,
  newContent,
  filename,
}: {
  oldContent: string;
  newContent: string;
  filename?: string;
}) {
  const lines = useMemo(() => computeDiff(oldContent, newContent), [oldContent, newContent]);

  const stats = useMemo(() => {
    const added = lines.filter((l) => l.type === 'added').length;
    const removed = lines.filter((l) => l.type === 'removed').length;
    return { added, removed };
  }, [lines]);

  return (
    <div className="my-2 rounded-lg border border-border-default overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-1 text-[11px] font-mono border-b border-border-subtle">
        <span className="text-text-secondary truncate">{filename || 'diff'}</span>
        <div className="flex items-center gap-2 text-[10px]">
          {stats.added > 0 && <span className="text-accent">+{stats.added}</span>}
          {stats.removed > 0 && <span className="text-error">-{stats.removed}</span>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <pre className="text-xs leading-5">
          {lines.map((line, i) => (
            <div key={i} className={`flex ${LINE_COLORS[line.type]}`}>
              <span className={`select-none w-5 text-right shrink-0 pr-1 ${GUTTER_COLORS[line.type]}`}>
                {PREFIX[line.type]}
              </span>
              <span className="px-2 flex-1 whitespace-pre">{line.content}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
