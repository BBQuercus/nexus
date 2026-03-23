'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setToken } from '@/lib/auth';
import { Suspense } from 'react';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Token can come via query string (?token=...) or hash fragment (#/auth/callback?token=...)
    let token = searchParams.get('token');

    // Fallback: check the hash fragment (old SPA-style redirect from backend)
    if (!token && typeof window !== 'undefined') {
      const hash = window.location.hash;
      const match = hash.match(/[?&]token=([^&]+)/);
      if (match) {
        token = decodeURIComponent(match[1]);
      }
    }

    if (token) {
      setToken(token);
      router.replace('/');
    } else {
      router.replace('/login');
    }
  }, [searchParams, router]);

  return (
    <div className="flex items-center justify-center h-screen bg-bg text-text-secondary">
      Authenticating...
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen bg-bg text-text-secondary">Loading...</div>}>
      <CallbackHandler />
    </Suspense>
  );
}
