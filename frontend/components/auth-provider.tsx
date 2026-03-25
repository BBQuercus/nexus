'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useStore } from '@/lib/store';
import { getCurrentUser } from '@/lib/api';
import { startTokenRefreshTimer, stopTokenRefreshTimer } from '@/lib/auth';
import { toast } from '@/components/toast';
import { Zap } from 'lucide-react';

const PUBLIC_PATHS = ['/login'];

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const setUser = useStore((s) => s.setUser);
  const setAuthStatus = useStore((s) => s.setAuthStatus);
  const authStatus = useStore((s) => s.authStatus);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const user = await getCurrentUser();
        if (cancelled) return;
        setUser(user);
        setAuthStatus('authenticated');
      } catch {
        if (cancelled) return;
        setUser(null);
        setAuthStatus('unauthenticated');
      }
    }

    checkAuth();
    return () => { cancelled = true; };
  }, [setUser, setAuthStatus]);

  // Redirect unauthenticated users away from protected pages
  useEffect(() => {
    if (authStatus === 'unauthenticated' && !PUBLIC_PATHS.includes(pathname)) {
      router.replace('/login');
    }
  }, [authStatus, pathname, router]);

  // Token refresh timer
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    startTokenRefreshTimer(() => {
      toast.warning('Session expiring soon. Please save your work.');
    });
    return () => stopTokenRefreshTimer();
  }, [authStatus]);

  // Public pages render immediately
  if (PUBLIC_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  // Loading state for protected pages
  if (authStatus === 'loading') {
    return (
      <div className="relative flex flex-col items-center justify-center h-screen bg-bg dot-texture overflow-hidden">
        <div className="absolute inset-0 scan-line pointer-events-none" />
        <div className="animate-fade-in-up flex flex-col items-center gap-4">
          <Zap size={20} className="text-accent" />
          <div className="w-32 h-0.5 shimmer" />
          <span className="text-[10px] text-text-tertiary font-mono tracking-widest uppercase">Initializing</span>
        </div>
      </div>
    );
  }

  // Don't render protected content until authenticated
  if (authStatus !== 'authenticated') {
    return null;
  }

  return <>{children}</>;
}
