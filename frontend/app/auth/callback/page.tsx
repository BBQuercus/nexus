'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setToken, setRefreshToken } from '@/lib/auth';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Parse tokens from URL — use window.location directly for reliability
    // (useSearchParams can be unreliable with long JWT query params)
    const params = new URLSearchParams(window.location.search);
    let token = params.get('token');

    // Fallback: check the hash fragment (old SPA-style redirect from backend)
    if (!token) {
      const hash = window.location.hash;
      const match = hash.match(/[?&]token=([^&]+)/);
      if (match) token = decodeURIComponent(match[1]);
    }

    if (token) {
      setToken(token);
      const refreshToken = params.get('refresh_token');
      if (refreshToken) setRefreshToken(refreshToken);
      router.replace('/');
    } else {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen bg-bg text-text-secondary">
      Authenticating...
    </div>
  );
}
