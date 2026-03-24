import { reportError } from './api';

let initialized = false;

export function initErrorReporter() {
  if (typeof window === 'undefined' || initialized) return;
  initialized = true;

  window.addEventListener('error', (event) => {
    reportError({
      message: event.message || 'Unknown error',
      stack: event.error?.stack,
      url: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : window.location.href,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportError({
      message: reason?.message || String(reason) || 'Unhandled promise rejection',
      stack: reason?.stack,
      url: window.location.href,
    });
  });
}
