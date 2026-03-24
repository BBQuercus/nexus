'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearToken } from '@/lib/auth';
import { getCurrentUser } from '@/lib/api';
import { useStore } from '@/lib/store';
import Workspace from '@/components/workspace';
import { Zap } from 'lucide-react';

export default function HomePage() {
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
    checkAuth();
  }, [router, setUser]);

  if (loading || !user) {
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

  return <Workspace />;
}
