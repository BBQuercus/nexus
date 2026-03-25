import { useState, useEffect } from 'react';

/**
 * Tracks the visual viewport height, which shrinks when the mobile soft keyboard opens.
 * Sets a CSS custom property --viewport-height that components can use instead of h-dvh.
 */
export function useVisualViewport(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      document.documentElement.style.setProperty('--viewport-height', `${vv.height}px`);
      document.documentElement.style.setProperty('--viewport-offset-top', `${vv.offsetTop}px`);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      document.documentElement.style.removeProperty('--viewport-height');
      document.documentElement.style.removeProperty('--viewport-offset-top');
    };
  }, []);
}

/**
 * Returns true when the mobile keyboard is likely open (viewport significantly shorter than window).
 */
export function useIsKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const check = () => {
      // Keyboard is "open" when viewport shrinks by more than 150px
      setOpen(window.innerHeight - vv.height > 150);
    };

    check();
    vv.addEventListener('resize', check);
    return () => vv.removeEventListener('resize', check);
  }, []);

  return open;
}
