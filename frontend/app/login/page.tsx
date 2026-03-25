'use client';

import { useSearchParams } from 'next/navigation';
import { getLoginUrl } from '@/lib/auth';
import { ArrowRight, Zap, AlertCircle } from 'lucide-react';
import { Suspense } from 'react';

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div className="relative flex items-center justify-center h-screen bg-bg dot-texture overflow-hidden">
      {/* Scan line effect */}
      <div className="absolute inset-0 scan-line pointer-events-none" />

      <div className="relative noise-overlay corner-accents animate-fade-in-up flex flex-col items-center gap-8 p-12 bg-surface-0 border border-border-default w-[380px]">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <Zap size={20} className="text-accent" />
            <span className="text-2xl font-bold tracking-[0.15em] uppercase text-text-primary">
              Nexus
            </span>
          </div>
          <div className="w-12 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
          <p className="text-text-tertiary text-xs tracking-wide uppercase">Sign in to continue</p>
        </div>

        {error && (
          <div className="w-full flex items-center gap-2 px-3 py-2 bg-error/10 border border-error/20 rounded text-xs text-error">
            <AlertCircle size={14} className="shrink-0" />
            <span>
              {error === 'auth_failed'
                ? 'Authentication failed. Please try again.'
                : 'Something went wrong. Please try again.'}
            </span>
          </div>
        )}

        <button
          onClick={() => { window.location.href = getLoginUrl(); }}
          className="group w-full relative flex items-center justify-center gap-2 px-6 py-2.5 bg-accent text-bg text-sm font-medium tracking-wide hover:bg-accent-hover transition-all cursor-pointer overflow-hidden"
        >
          <span className="relative z-10">Sign In</span>
          <ArrowRight size={14} className="relative z-10 transition-transform group-hover:translate-x-0.5" />
        </button>

        <div className="text-[10px] text-text-tertiary font-mono tracking-widest">v1.0</div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-bg">
        <Zap size={20} className="text-accent animate-pulse" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
