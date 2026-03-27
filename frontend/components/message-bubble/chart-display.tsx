'use client';

import { useTranslations } from 'next-intl';
import VegaChart from '../vega-chart';

export function ChartDisplay({ charts }: { charts?: { spec: Record<string, unknown>; title?: string }[] }) {
  const t = useTranslations('chartDisplay');
  if (!charts || charts.length === 0) return null;
  return (
    <div className="space-y-3 my-3">
      {charts.map((chart, i) => (
        <div key={i} className="rounded-lg border border-border-default overflow-hidden bg-surface-0">
          <div className="px-3 py-2 bg-surface-1 text-[11px] font-mono text-text-secondary">
            {chart.title || t('defaultTitle')}
          </div>
          <VegaChart spec={chart.spec} className="overflow-hidden p-2" />
        </div>
      ))}
    </div>
  );
}
