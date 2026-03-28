import { useState, useCallback, useRef, useEffect } from 'react';

export function useFocusMode() {
  const [focusMode, setFocusMode] = useState(false);
  const focusModeRef = useRef(false);
  focusModeRef.current = focusMode;

  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => !prev);
  }, []);

  // Listen for global toggle event from keyboard shortcuts
  useEffect(() => {
    const handler = () => toggleFocusMode();
    window.addEventListener('nexus:toggle-focus-mode', handler);
    return () => window.removeEventListener('nexus:toggle-focus-mode', handler);
  }, [toggleFocusMode]);

  // Escape key exits focus mode
  useEffect(() => {
    if (!focusMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleFocusMode();
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [focusMode, toggleFocusMode]);

  return { focusMode, focusModeRef, toggleFocusMode };
}
