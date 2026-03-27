import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('errors');

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center">
      <div className="text-center">
        <div className="text-[80px] font-bold text-border-default leading-none select-none">{t('notFoundCode')}</div>
        <p className="mt-3 text-sm text-text-tertiary">{t('notFoundMessage')}</p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-accent border border-accent/25 rounded-lg hover:border-accent/50 hover:bg-accent/8 transition-all"
        >
          {t('goHome')}
        </Link>
      </div>
    </div>
  );
}
