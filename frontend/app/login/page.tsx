'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getLoginUrl, setLastProvider, type OAuthProvider } from '@/lib/auth';
import { passwordLogin, registerAccount, getCurrentUser } from '@/lib/api';
import { useStore } from '@/lib/store';
import { Zap, AlertCircle, Loader2 } from 'lucide-react';
import { Suspense } from 'react';

function signInOAuth(provider: OAuthProvider) {
  setLastProvider(provider);
  window.location.href = getLoginUrl(provider);
}

function MicrosoftIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" fill="none">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get('error');
  const setUser = useStore((s) => s.setUser);
  const setAuthStatus = useStore((s) => s.setAuthStatus);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        await registerAccount(email, password, name || undefined);
      } else {
        await passwordLogin(email, password);
      }
      // Cookies are set — remember provider, fetch user, redirect
      setLastProvider('password');
      const user = await getCurrentUser();
      setUser(user);
      setAuthStatus('authenticated');
      router.replace('/');
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Something went wrong';
      setFormError(msg);
    } finally {
      setLoading(false);
    }
  }

  const displayError = formError || (error === 'auth_failed' ? 'Authentication failed. Please try again.' : error ? 'Something went wrong. Please try again.' : '');

  return (
    <div className="relative flex items-center justify-center h-screen bg-bg dot-texture overflow-hidden">
      <div className="absolute inset-0 scan-line pointer-events-none" />

      <div className="relative noise-overlay corner-accents animate-fade-in-up flex flex-col items-center gap-6 p-12 bg-surface-0 border border-border-default w-[380px]">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <Zap size={20} className="text-accent" />
            <span className="text-2xl font-bold tracking-[0.15em] uppercase text-text-primary">
              Nexus
            </span>
          </div>
          <div className="w-12 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
        </div>

        {displayError && (
          <div className="w-full flex items-center gap-2 px-3 py-2 bg-error/10 border border-error/20 rounded text-xs text-error">
            <AlertCircle size={14} className="shrink-0" />
            <span>{displayError}</span>
          </div>
        )}

        {/* OAuth buttons */}
        <div className="w-full flex flex-col gap-2">
          <button
            onClick={() => signInOAuth('microsoft')}
            className="w-full flex items-center justify-center gap-2.5 px-6 py-2.5 bg-surface-1 border border-border-default text-sm text-text-primary font-medium hover:bg-surface-2 transition-all cursor-pointer"
          >
            <MicrosoftIcon size={18} />
            <span>Continue with Microsoft</span>
          </button>

          <button
            onClick={() => signInOAuth('github')}
            className="w-full flex items-center justify-center gap-2.5 px-6 py-2.5 bg-surface-1 border border-border-default text-sm text-text-primary font-medium hover:bg-surface-2 transition-all cursor-pointer"
          >
            <GitHubIcon size={18} />
            <span>Continue with GitHub</span>
          </button>
        </div>

        {/* Divider */}
        <div className="w-full flex items-center gap-3">
          <div className="flex-1 h-px bg-border-default" />
          <span className="text-[10px] text-text-tertiary uppercase tracking-widest">or</span>
          <div className="flex-1 h-px bg-border-default" />
        </div>

        {/* Email/password form */}
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-2.5">
          {mode === 'register' && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-bg border border-border-default text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 bg-bg border border-border-default text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2 bg-bg border border-border-default text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-6 py-2.5 bg-accent text-bg text-sm font-medium hover:bg-accent-hover transition-all cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <span>{mode === 'register' ? 'Create Account' : 'Sign In'}</span>
            )}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setFormError(''); }}
          className="text-xs text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
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
