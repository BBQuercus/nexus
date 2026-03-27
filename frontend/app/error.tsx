'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center">
      <div className="text-center">
        <div className="text-[80px] font-bold text-border-default leading-none select-none">{t('errorCode')}</div>
        <p className="mt-3 text-sm text-text-tertiary">{t('errorMessage')}</p>
        <button
          onClick={reset}
          className="mt-6 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-accent border border-accent/25 rounded-lg hover:border-accent/50 hover:bg-accent/8 transition-all cursor-pointer"
        >
          {t('tryAgain')}
        </button>
      </div>
    </div>
  );
}
