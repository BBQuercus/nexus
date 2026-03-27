'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';

const FONT_SIZE_MAP = { sm: '13px', md: '15px', lg: '17px' } as const;

export default function ThemeProvider() {
  const userSettings = useStore((s) => s.userSettings);

  useEffect(() => {
    const root = document.documentElement;

    // Theme
    const theme = userSettings.theme ?? 'dark';
    root.setAttribute('data-theme', theme);

    // Font size
    const fontSize = FONT_SIZE_MAP[userSettings.fontSize ?? 'md'];
    root.style.fontSize = fontSize;

    // Reduce animations
    if (userSettings.reduceAnimations) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }
  }, [userSettings]);

  return null;
}
