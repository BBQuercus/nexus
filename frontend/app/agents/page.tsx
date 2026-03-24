'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearToken } from '@/lib/auth';
import { getCurrentUser } from '@/lib/api';
import { useStore } from '@/lib/store';
import AgentsView from '@/components/agents-view';

export default function AgentsPage() {
  const router = useRouter();
  const setUser = useStore((s) => s.setUser);
  const user = useStore((s) => s.user);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const u = await getCurrentUser();
        setUser(u);
      } catch {
        clearToken();
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    }
    if (!user) checkAuth();
    else setLoading(false);
  }, [router, setUser, user]);

  if (loading || !user) {
    return <div className="flex items-center justify-center h-screen bg-bg text-text-secondary">Loading...</div>;
  }

  return <AgentsView />;
}
