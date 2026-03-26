'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useStore } from '@/lib/store';
import { getCurrentUser } from '@/lib/api';
import {
  refreshAccessToken,
  startTokenRefreshTimer,
  stopTokenRefreshTimer,
  getLastProvider,
  getLoginUrl,
  type OAuthProvider,
} from '@/lib/auth';
import { toast } from '@/components/toast';
import { Zap } from 'lucide-react';

const PUBLIC_PATHS = ['/login'];

function TransitionScreen({ message }: { message: string }) {
  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-bg dot-texture overflow-hidden">
      <div className="absolute inset-0 scan-line pointer-events-none" />
      <div className="animate-fade-in-up flex flex-col items-center gap-4">
        <Zap size={20} className="text-accent" />
        <div className="w-32 h-0.5 shimmer" />
        <span className="text-[10px] text-text-tertiary font-mono tracking-widest uppercase">
          {message}
        </span>
      </div>
    </div>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  microsoft: 'Microsoft',
  github: 'GitHub',
};

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const setUser = useStore((s) => s.setUser);
  const setAuthStatus = useStore((s) => s.setAuthStatus);
  const authStatus = useStore((s) => s.authStatus);
  const [redirectingTo, setRedirectingTo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      // 1. Try the current session
      try {
        const user = await getCurrentUser();
        if (cancelled) return;
        setUser(user);
        setAuthStatus('authenticated');
        // Show welcome toast if returning from OAuth flow
        const justAuthenticated = sessionStorage.getItem('nexus_oauth_attempted');
        sessionStorage.removeItem('nexus_oauth_attempted');
        if (justAuthenticated) {
          const firstName = user.name?.split(' ')[0];
          toast.success(firstName ? `Welcome back, ${firstName}!` : 'Welcome back!');
        }
        return;
      } catch {
        // Session expired or missing — try silent refresh
      }

      // 2. Attempt silent refresh (valid refresh token cookie may exist)
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        try {
          const user = await getCurrentUser();
          if (cancelled) return;
          setUser(user);
          setAuthStatus('authenticated');
          sessionStorage.removeItem('nexus_oauth_attempted');
          return;
        } catch {
          // Refresh succeeded but /me failed — fall through
        }
      }

      // 3. Fully unauthenticated
      if (cancelled) return;
      setUser(null);
      setAuthStatus('unauthenticated');
    }

    checkAuth();
    return () => { cancelled = true; };
  }, [setUser, setAuthStatus]);

  // Redirect unauthenticated users — auto-redirect to last OAuth provider if known
  useEffect(() => {
    if (authStatus !== 'unauthenticated' || PUBLIC_PATHS.includes(pathname)) return;

    const lastProvider = getLastProvider();

    // Guard against redirect loops: if we already tried OAuth this session
    // and still ended up unauthenticated, don't try again automatically.
    const alreadyTried = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('nexus_oauth_attempted');

    if (lastProvider && lastProvider !== 'password' && !alreadyTried) {
      sessionStorage.setItem('nexus_oauth_attempted', '1');
      setRedirectingTo(PROVIDER_LABELS[lastProvider] || lastProvider);
      window.location.href = getLoginUrl(lastProvider as OAuthProvider);
    } else {
      router.replace('/login');
    }
  }, [authStatus, pathname, router]);

  // Token refresh timer
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    startTokenRefreshTimer();
    return () => stopTokenRefreshTimer();
  }, [authStatus]);

  // Public pages render immediately
  if (PUBLIC_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  // Auto OAuth re-redirect — show provider name
  if (redirectingTo) {
    return <TransitionScreen message={`Redirecting to ${redirectingTo}`} />;
  }

  // Loading state for protected pages
  if (authStatus === 'loading') {
    return <TransitionScreen message="Authenticating" />;
  }

  // Don't render protected content until authenticated
  if (authStatus !== 'authenticated') {
    return null;
  }

  return <>{children}</>;
}
