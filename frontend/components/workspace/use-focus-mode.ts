import { useState, useCallback, useRef } from 'react';

export function useFocusMode() {
  const [focusMode, setFocusMode] = useState(false);
  const focusModeRef = useRef(false);
  focusModeRef.current = focusMode;

  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => !prev);
  }, []);

  return { focusMode, focusModeRef, toggleFocusMode };
}
