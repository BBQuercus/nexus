'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      }).catch(() => {
        // Ignore unregister failures in development
      });
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failed — app works fine without it
    });
  }, []);

  return null;
}
