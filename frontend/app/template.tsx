'use client';

/**
 * Next.js template — re-mounts on every route change, providing a fresh
 * animation wrapper for each page transition. This gives us a smooth
 * fade-in on every navigation without any client-side transition library.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-page-enter">
      {children}
    </div>
  );
}
