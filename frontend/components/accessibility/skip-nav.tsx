'use client';
/**
 * Skip navigation link — allows keyboard users to skip to main content.
 * Completely hidden until focused via Tab key.
 */
export function SkipNav() {
  return (
    <a
      href="#main-content"
      className="fixed -top-full left-2 z-[9999] px-4 py-2 bg-blue-600 text-white rounded-lg outline-none text-sm font-medium focus:top-2 transition-[top]"
    >
      Skip to main content
    </a>
  )
}
