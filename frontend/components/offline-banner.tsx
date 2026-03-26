'use client';

import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);

    // Check initial state
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setOffline(true);
    }

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[80] flex items-center justify-center gap-2 py-1.5 bg-warning/15 border-b border-warning/20 text-xs text-warning">
      <WifiOff size={12} />
      <span>You&apos;re offline. Some features may not work until you reconnect.</span>
    </div>
  );
}
