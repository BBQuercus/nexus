'use client';

import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, WifiOff } from 'lucide-react';
import { getHealth, type HealthCheck } from '@/lib/api';

export default function HealthBanner() {
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [offline, setOffline] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      try {
        const result = await getHealth();
        if (!mounted) return;
        setHealth(result);
        setOffline(false);

        // Poll faster when degraded (every 10s), slower when ok (every 60s)
        clearInterval(intervalRef.current);
        intervalRef.current = setInterval(check, result.status === 'ok' ? 60_000 : 10_000);
      } catch {
        if (mounted) setOffline(true);
      }
    };

    check();
    return () => { mounted = false; clearInterval(intervalRef.current); };
  }, []);

  // Browser online/offline
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

  const degraded = Object.entries(health.checks)
    .filter(([, v]) => v.status !== 'ok' && v.status !== 'unconfigured')
    .map(([k]) => k === 'db' ? 'Database' : k === 'llm' ? 'AI models' : 'Sandbox');

  if (degraded.length === 0) return null;

  return (
    <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-warning/10 border-b border-warning/20 text-warning text-xs">
      <AlertTriangle size={12} />
      <span>Some services are experiencing issues: {degraded.join(', ')}</span>
    </div>
  );
}
