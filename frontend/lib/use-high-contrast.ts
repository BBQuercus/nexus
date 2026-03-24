import { useEffect, useState } from 'react'

/**
 * Hook that detects the user's high contrast preference via
 * the `prefers-contrast: more` media query.
 */
export function useHighContrast() {
  const [highContrast, setHighContrast] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-contrast: more)')
    setHighContrast(mq.matches)
    const handler = (e: MediaQueryListEvent) => setHighContrast(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return highContrast
}
