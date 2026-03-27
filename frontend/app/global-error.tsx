'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-surface-0 flex items-center justify-center" style={{ background: '#18181B' }}>
        <div className="text-center" style={{ fontFamily: 'sans-serif' }}>
          <div style={{ fontSize: 80, fontWeight: 700, color: '#333338', lineHeight: 1 }}>{t('errorCode')}</div>
          <p style={{ marginTop: 12, fontSize: 14, color: '#71717A' }}>{t('errorMessage')}</p>
          <button
            onClick={reset}
            style={{ marginTop: 24, padding: '6px 12px', fontSize: 12, color: '#00E599', border: '1px solid rgba(0,229,153,0.25)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}
          >
            {t('tryAgain')}
          </button>
        </div>
      </body>
    </html>
  );
}
