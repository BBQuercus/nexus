/**
 * Hook for respecting prefers-reduced-motion.
 */
import { useEffect, useState } from 'react'

export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReduced(mq.matches)

    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return prefersReduced
}

/**
 * Returns animation duration — 0 if reduced motion is preferred.
 */
export function useAnimationDuration(defaultMs: number = 200): number {
  const prefersReduced = usePrefersReducedMotion()
  return prefersReduced ? 0 : defaultMs
}
