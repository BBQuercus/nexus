'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';
import { RefreshCw, ExternalLink } from 'lucide-react';

export default function PreviewPanel() {
  const t = useTranslations('previewPanel');
  const previewUrl = useStore((s) => s.previewUrl);
  const [refreshKey, setRefreshKey] = useState(0);

  if (!previewUrl) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-xs font-mono">
        {t('noPreviewActive')}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-default shrink-0">
        <input
          readOnly
          value={previewUrl}
          className="flex-1 text-[11px] bg-surface-1 border border-border-default px-2 py-1 text-text-secondary font-mono outline-none"
        />
        <button onClick={() => setRefreshKey((k) => k + 1)} className="text-text-tertiary hover:text-text-secondary cursor-pointer" title={t('refresh')}>
          <RefreshCw size={12} />
        </button>
        <button onClick={() => window.open(previewUrl, '_blank', 'noopener')} className="text-text-tertiary hover:text-text-secondary cursor-pointer" title={t('openInNewTab')}>
          <ExternalLink size={12} />
        </button>
      </div>
      <iframe key={refreshKey} src={previewUrl} sandbox="allow-scripts allow-same-origin" className="flex-1 w-full border-none bg-white" loading="lazy" />
    </div>
  );
}
