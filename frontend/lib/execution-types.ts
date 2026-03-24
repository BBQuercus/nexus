// ── Execution Legibility Types ──
// Shared types for execution timeline, provenance, run summaries, confidence.

export type ExecutionStepType = 'tool_call' | 'retrieval' | 'sandbox' | 'reasoning' | 'artifact'

export type ExecutionStepStatus = 'running' | 'success' | 'failed' | 'timeout' | 'skipped'

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface ExecutionStep {
  id: string
  type: ExecutionStepType
  name: string
  description: string
  status: ExecutionStepStatus
  startedAt: number
  completedAt?: number
  durationMs?: number
  tokensUsed?: number
  result?: unknown
  error?: string
  confidence?: ConfidenceLevel
}

export interface RunSummary {
  steps: ExecutionStep[]
  totalDurationMs: number
  totalTokens: number
  totalCostUsd?: number
  artifactsCreated: number
  toolsUsed: string[]
  retrievalUsed: boolean
  sandboxUsed: boolean
  warnings: string[]
  uncertainResults: string[]
}

export type ProvenanceSource = 'model' | 'citation' | 'retrieval' | 'artifact' | 'sandbox' | 'user'

export interface ProvenanceInfo {
  source: ProvenanceSource
  label?: string
  confidence?: ConfidenceLevel
  sourceId?: string
}
