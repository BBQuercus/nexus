'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { clearToken } from '@/lib/auth';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    clearToken();
    router.replace('/');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen bg-bg text-text-secondary">
      Authenticating...
    </div>
  );
}
