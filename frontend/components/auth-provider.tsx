'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useStore } from '@/lib/store';
import { getCurrentUser, getUserSettings } from '@/lib/api';
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

/**
 * Fake progress that crawls to ~85% over ~8s, then snaps to 100% when complete.
 * Gives the user a sense of forward movement while waiting for auth.
 */
function useFakeProgress(complete: boolean) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (complete) {
      // Snap to 100% quickly
      cancelAnimationFrame(rafRef.current);
      setProgress(100);
      return;
    }

    function tick() {
      const elapsed = Date.now() - startRef.current;
      // Asymptotic curve: fast start, slows down, never exceeds ~85%
      // progress = 85 * (1 - e^(-elapsed/4000))
      const p = 85 * (1 - Math.exp(-elapsed / 4000));
      setProgress(p);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [complete]);

  return progress;
}

function TransitionScreen({ message, complete = false }: { message: string; complete?: boolean }) {
  const progress = useFakeProgress(complete);

  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-bg dot-texture overflow-hidden">
      <div className="absolute inset-0 scan-line pointer-events-none" />
      <div className="animate-fade-in-up flex flex-col items-center gap-6">
        {/* Pulsing rings + icon */}
        <div className="relative w-16 h-16 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-accent/20 animate-[ping_2s_ease-in-out_infinite]" />
          <div className="absolute inset-2 rounded-full border border-accent/10 animate-[ping_2s_ease-in-out_0.4s_infinite]" />
          <div className="relative w-10 h-10 rounded-full bg-accent/5 border border-accent/20 flex items-center justify-center">
            <Zap size={18} className="text-accent transition-auth-icon" />
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-48 h-[3px] rounded-full overflow-hidden bg-surface-1">
          <div
            className="h-full rounded-full bg-accent"
            style={{
              width: `${progress}%`,
              transition: progress >= 100 ? 'width 0.3s ease-out' : 'none',
            }}
          />
        </div>

        {/* Message */}
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
  const setCurrentOrg = useStore((s) => s.setCurrentOrg);
  const setMemberships = useStore((s) => s.setMemberships);
  const setUserSettings = useStore((s) => s.setUserSettings);
  const authStatus = useStore((s) => s.authStatus);
  const [redirectingTo, setRedirectingTo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      // 1. Try the current session
      try {
        const [user, settings] = await Promise.all([getCurrentUser(), getUserSettings().catch(() => ({}))]);
        if (cancelled) return;
        setUser(user);
        setCurrentOrg(user.currentOrg || null);
        setMemberships(user.memberships || []);
        setUserSettings(settings);
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
          const [user, settings] = await Promise.all([getCurrentUser(), getUserSettings().catch(() => ({}))]);
          if (cancelled) return;
          setUser(user);
          setCurrentOrg(user.currentOrg || null);
          setMemberships(user.memberships || []);
          setUserSettings(settings);
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

  // Auto OAuth re-redirect — show provider name with progress bar
  if (redirectingTo) {
    return <TransitionScreen message={`Redirecting to ${redirectingTo}`} />;
  }

  // Loading state — render nothing (no intermediate "Authenticating" screen).
  // When returning from OAuth, the auth check is fast enough that flashing
  // a second transition screen feels jarring. Instead, the page simply appears.
  if (authStatus === 'loading') {
    return null;
  }

  // Don't render protected content until authenticated
  if (authStatus !== 'authenticated') {
    return null;
  }

  return <>{children}</>;
}
