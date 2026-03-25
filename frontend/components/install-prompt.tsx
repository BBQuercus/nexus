'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Download, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'nexus:install-prompt-dismissed';

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true);
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosBanner, setShowIosBanner] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (isStandalone()) return;

    try {
      const d = localStorage.getItem(DISMISSED_KEY);
      if (d) {
        const dismissedAt = parseInt(d, 10);
        // Show again after 7 days
        if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
      }
    } catch {}

    setDismissed(false);

    if (isIos()) {
      // Delay showing the iOS banner
      const timeout = setTimeout(() => setShowIosBanner(true), 3000);
      return () => clearTimeout(timeout);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
    dismiss();
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIosBanner(false);
    try {
      localStorage.setItem(DISMISSED_KEY, Date.now().toString());
    } catch {}
  }, []);

  if (dismissed || (!deferredPrompt && !showIosBanner)) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm animate-slide-up">
      <div className="bg-surface-1 border border-border-default rounded-xl p-4 shadow-lg backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
            {showIosBanner ? <Share size={18} className="text-accent" /> : <Download size={18} className="text-accent" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">Install Nexus</p>
            {showIosBanner ? (
              <p className="text-xs text-text-secondary mt-1">
                Tap <Share size={12} className="inline text-accent" /> then &ldquo;Add to Home Screen&rdquo; for the best experience.
              </p>
            ) : (
              <p className="text-xs text-text-secondary mt-1">
                Add Nexus to your home screen for quick access.
              </p>
            )}
          </div>
          <button
            onClick={dismiss}
            className="text-text-tertiary hover:text-text-secondary p-1 -mt-1 -mr-1 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
        {deferredPrompt && (
          <button
            onClick={handleInstall}
            className="mt-3 w-full py-2 px-3 bg-accent text-bg text-sm font-medium rounded-lg hover:bg-accent/90 transition-colors cursor-pointer"
          >
            Install
          </button>
        )}
      </div>
    </div>
  );
}
