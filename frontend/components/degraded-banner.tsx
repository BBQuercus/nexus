/**
 * Banner showing degraded service states.
 * Shows when LLM, sandbox, or retrieval services are degraded.
 *
 * This complements the existing HealthBanner (health-banner.tsx) which polls
 * the backend /health endpoint. DegradedBanner is meant for client-side
 * detection of degraded states (e.g., slow responses, partial failures).
 */

'use client'

import { AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'
import type { DegradedService } from '@/lib/request-types'

interface DegradedBannerProps {
  services: DegradedService[]
  onDismiss?: () => void
}

export function DegradedBanner({ services, onDismiss }: DegradedBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || services.length === 0) return null

  const statusColors = {
    unavailable: 'text-red-400 bg-red-500/10 border-red-500/20',
    slow: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    partial: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  }

  const worst = services.reduce((w, s) => {
    const priority = { unavailable: 3, slow: 2, partial: 1 }
    return priority[s.status] > priority[w.status] ? s : w
  })

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 text-xs border-b ${statusColors[worst.status]}`}>
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      <div className="flex-1 flex items-center gap-2 flex-wrap">
        {services.map(s => (
          <span key={s.name}>
            <strong>{s.name}</strong>: {s.message}
            {s.fallback && <span className="opacity-70"> ({s.fallback})</span>}
          </span>
        ))}
      </div>
      {onDismiss && (
        <button
          onClick={() => { setDismissed(true); onDismiss?.() }}
          className="p-0.5 hover:bg-white/10 rounded"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
