'use client'

/**
 * Side-by-side comparison of multi-agent runs.
 * Shows two model outputs with diff highlighting, stats, scores, and adopt buttons.
 */

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Trophy, Clock, Coins, Hash, ChevronLeft, ChevronRight, Star } from 'lucide-react'

// ── Types ──

interface RunData {
  id: string
  model: string
  status: string
  result: string
  tokens: number
  cost: number
  durationMs: number
  score: number | null
  selected: boolean
}

interface RunComparisonProps {
  runs: RunData[]
  onAdopt?: (runId: string) => void
  onScore?: (runId: string, score: number) => void
}

// ── Diff helpers ──

interface DiffSegment {
  text: string
  type: 'equal' | 'added' | 'removed'
}

/**
 * Simple word-level diff between two strings.
 * Uses longest-common-subsequence on word arrays.
 */
function computeWordDiff(a: string, b: string): { left: DiffSegment[]; right: DiffSegment[] } {
  const wordsA = a.split(/(\s+)/)
  const wordsB = b.split(/(\s+)/)

  // Build LCS table
  const m = wordsA.length
  const n = wordsB.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (wordsA[i - 1] === wordsB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to find diff
  const left: DiffSegment[] = []
  const right: DiffSegment[] = []
  let i = m
  let j = n

  const leftStack: DiffSegment[] = []
  const rightStack: DiffSegment[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wordsA[i - 1] === wordsB[j - 1]) {
      leftStack.push({ text: wordsA[i - 1], type: 'equal' })
      rightStack.push({ text: wordsB[j - 1], type: 'equal' })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rightStack.push({ text: wordsB[j - 1], type: 'added' })
      j--
    } else if (i > 0) {
      leftStack.push({ text: wordsA[i - 1], type: 'removed' })
      i--
    }
  }

  // Reverse stacks and merge consecutive segments of same type
  const merge = (segments: DiffSegment[]): DiffSegment[] => {
    const reversed = segments.reverse()
    const merged: DiffSegment[] = []
    for (const seg of reversed) {
      const last = merged[merged.length - 1]
      if (last && last.type === seg.type) {
        last.text += seg.text
      } else {
        merged.push({ ...seg })
      }
    }
    return merged
  }

  return { left: merge(leftStack), right: merge(rightStack) }
}

// ── Sub-components ──

function StatBadge({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
      <Icon size={12} />
      <span className="text-zinc-500">{label}:</span>
      <span className="font-mono text-zinc-300">{value}</span>
    </div>
  )
}

function ScoreStars({ score, onScore, runId }: { score: number | null; onScore?: (runId: string, score: number) => void; runId: string }) {
  const t = useTranslations('runComparison')
  const [hover, setHover] = useState(0)
  const stars = score != null ? Math.round(score * 5) : 0

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className="p-0.5 hover:scale-110 transition-transform"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onScore?.(runId, n / 5)}
          aria-label={t('rateAriaLabel', { n })}
        >
          <Star
            size={14}
            className={
              (hover ? n <= hover : n <= stars)
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-zinc-600'
            }
          />
        </button>
      ))}
      {score != null && (
        <span className="ml-1 text-[10px] text-zinc-500 font-mono">{(score * 100).toFixed(0)}%</span>
      )}
    </div>
  )
}

function DiffBlock({ segments }: { segments: DiffSegment[] }) {
  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap font-mono">
      {segments.map((seg, i) => {
        if (seg.type === 'equal') return <span key={i}>{seg.text}</span>
        if (seg.type === 'added')
          return (
            <span key={i} className="bg-green-500/20 text-green-300 rounded px-0.5">
              {seg.text}
            </span>
          )
        return (
          <span key={i} className="bg-red-500/20 text-red-400 line-through rounded px-0.5">
            {seg.text}
          </span>
        )
      })}
    </div>
  )
}

// ── Main component ──

export default function RunComparison({ runs, onAdopt, onScore }: RunComparisonProps) {
  const t = useTranslations('runComparison')
  const [leftIdx, setLeftIdx] = useState(0)
  const [rightIdx, setRightIdx] = useState(Math.min(1, runs.length - 1))
  const [showDiff, setShowDiff] = useState(true)

  const leftRun = runs[leftIdx]
  const rightRun = runs[rightIdx]

  const diff = useMemo(() => {
    if (!showDiff || !leftRun?.result || !rightRun?.result) return null
    return computeWordDiff(leftRun.result, rightRun.result)
  }, [showDiff, leftRun?.result, rightRun?.result])

  if (runs.length < 2) {
    return (
      <div className="p-6 text-center text-zinc-500 text-sm">
        {t('minRunsMessage')}
      </div>
    )
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const formatCost = (usd: number) => {
    if (usd < 0.01) return `$${(usd * 100).toFixed(2)}c`
    return `$${usd.toFixed(4)}`
  }

  const renderPanel = (run: RunData, side: 'left' | 'right', segments?: DiffSegment[]) => (
    <div className="flex-1 min-w-0 flex flex-col border border-zinc-700/50 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/60 border-b border-zinc-700/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-200 truncate">{run.model}</span>
          {run.selected && (
            <span className="flex items-center gap-1 text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">
              <Trophy size={10} /> {t('adopted')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Run selector */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="p-0.5 text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
              disabled={side === 'left' ? leftIdx === 0 : rightIdx === 0}
              onClick={() =>
                side === 'left'
                  ? setLeftIdx((i) => Math.max(0, i - 1))
                  : setRightIdx((i) => Math.max(0, i - 1))
              }
              aria-label={t('previousRun')}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[10px] text-zinc-500 font-mono">
              {(side === 'left' ? leftIdx : rightIdx) + 1}/{runs.length}
            </span>
            <button
              type="button"
              className="p-0.5 text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
              disabled={
                side === 'left' ? leftIdx >= runs.length - 1 : rightIdx >= runs.length - 1
              }
              onClick={() =>
                side === 'left'
                  ? setLeftIdx((i) => Math.min(runs.length - 1, i + 1))
                  : setRightIdx((i) => Math.min(runs.length - 1, i + 1))
              }
              aria-label={t('nextRun')}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 px-3 py-1.5 bg-zinc-800/30 border-b border-zinc-700/30">
        <StatBadge icon={Hash} label={t('tokensLabel')} value={run.tokens.toLocaleString()} />
        <StatBadge icon={Coins} label={t('costLabel')} value={formatCost(run.cost)} />
        <StatBadge icon={Clock} label={t('timeLabel')} value={formatDuration(run.durationMs)} />
      </div>

      {/* Score row */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/20 border-b border-zinc-700/30">
        <ScoreStars score={run.score} onScore={onScore} runId={run.id} />
        {!run.selected && onAdopt && (
          <button
            type="button"
            onClick={() => onAdopt(run.id)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
          >
            <Check size={12} />
            {t('adopt')}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 text-sm text-zinc-300 leading-relaxed">
        {segments ? (
          <DiffBlock segments={segments} />
        ) : (
          <div className="whitespace-pre-wrap font-mono">{run.result || t('noOutput')}</div>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700/50">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          {t('headerTitle')}
        </span>
        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showDiff}
            onChange={(e) => setShowDiff(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/30 w-3.5 h-3.5"
          />
          {t('showDiff')}
        </label>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 flex gap-2 p-2 min-h-0">
        {renderPanel(leftRun, 'left', diff?.left)}
        {renderPanel(rightRun, 'right', diff?.right)}
      </div>
    </div>
  )
}
