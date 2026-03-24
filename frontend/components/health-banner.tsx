'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { getHealth, type HealthCheck } from '@/lib/api';

export default function HealthBanner() {
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [offline, setOffline] = useState(false);

  // Poll health every 60 seconds
  useEffect(() => {
    let mounted = true;

    const check = async () => {
      try {
        const result = await getHealth();
        if (mounted) {
          setHealth(result);
          setOffline(false);
        }
      } catch {
        if (mounted) setOffline(true);
      }
    };

    check();
    const interval = setInterval(check, 60_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Also detect browser online/offline
  useEffect(() => {
    const handleOffline = () => setOffline(true);
    const handleOnline = () => setOffline(false);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (offline) {
    return (
      <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-error/10 border-b border-error/20 text-error text-xs">
        <WifiOff size={12} />
        <span>You are offline. Some features may be unavailable.</span>
      </div>
    );
  }

  if (!health || health.status === 'ok') return null;

  // Build degraded service list
  const degraded = Object.entries(health.checks)
    .filter(([, v]) => v.status !== 'ok' && v.status !== 'unconfigured')
    .map(([k]) => k === 'db' ? 'Database' : k === 'llm' ? 'AI models' : 'Sandbox');

  return (
    <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-warning/10 border-b border-warning/20 text-warning text-xs">
      <AlertTriangle size={12} />
      <span>Some services are experiencing issues: {degraded.join(', ')}</span>
    </div>
  );
}
