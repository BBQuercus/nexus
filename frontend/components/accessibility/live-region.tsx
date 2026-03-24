/**
 * Screen reader live region for announcing dynamic content.
 * Use for: streaming messages, tool execution status, errors.
 */
import { useEffect, useRef, useState } from 'react'

interface LiveRegionProps {
  message: string
  politeness?: 'polite' | 'assertive'
}

export function LiveRegion({ message, politeness = 'polite' }: LiveRegionProps) {
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    if (message) {
      setAnnouncement('')
      // Small delay to ensure screen reader picks up the change
      const timer = setTimeout(() => setAnnouncement(message), 100)
      return () => clearTimeout(timer)
    }
  }, [message])

  return (
    <div
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
      role="status"
    >
      {announcement}
    </div>
  )
}

/**
 * Hook for programmatic screen reader announcements.
 */
export function useAnnounce() {
  const [message, setMessage] = useState('')

  const announce = (text: string) => {
    setMessage('')
    setTimeout(() => setMessage(text), 50)
  }

  return { message, announce }
}
