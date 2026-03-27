'use client';

import { useTranslations } from 'next-intl';
import {
  Brain,
  BookOpen,
  Database,
  Sparkles,
  Terminal,
  User,
} from 'lucide-react';
import type { ProvenanceSource, ProvenanceInfo } from '@/lib/execution-types';

// ── Configuration per source type ──

type SourceConfig = {
  icon: React.ElementType;
  labelKey: 'provenanceModel' | 'provenanceCitation' | 'provenanceRetrieval' | 'provenanceArtifact' | 'provenanceSandbox' | 'provenanceUser';
  color: string;
  bg: string;
  border: string;
};

const SOURCE_CONFIG: Record<ProvenanceSource, SourceConfig> = {
  model: {
    icon: Brain,
    labelKey: 'provenanceModel',
    color: 'text-violet-400',
    bg: 'bg-violet-400/10',
    border: 'border-violet-400/20',
  },
  citation: {
    icon: BookOpen,
    labelKey: 'provenanceCitation',
    color: 'text-sky-400',
    bg: 'bg-sky-400/10',
    border: 'border-sky-400/20',
  },
  retrieval: {
    icon: Database,
    labelKey: 'provenanceRetrieval',
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
  },
  artifact: {
    icon: Sparkles,
    labelKey: 'provenanceArtifact',
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
  },
  sandbox: {
    icon: Terminal,
    labelKey: 'provenanceSandbox',
    color: 'text-accent',
    bg: 'bg-accent/10',
    border: 'border-accent/20',
  },
  user: {
    icon: User,
    labelKey: 'provenanceUser',
    color: 'text-text-secondary',
    bg: 'bg-surface-2',
    border: 'border-border-default',
  },
};

// ── Inline badge (icon only, with tooltip) ──

export function ProvenanceBadge({
  source,
  label,
  size = 'sm',
}: {
  source: ProvenanceSource;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const t = useTranslations('message');
  const config = SOURCE_CONFIG[source];
  const Icon = config.icon;
  const iconSize = size === 'sm' ? 10 : 13;

  return (
    <span
      title={label || t(config.labelKey)}
      className={`inline-flex items-center justify-center rounded ${config.color} ${config.bg} border ${config.border} ${
        size === 'sm' ? 'w-[18px] h-[18px]' : 'w-[22px] h-[22px]'
      }`}
    >
      <Icon size={iconSize} />
    </span>
  );
}

// ── Labeled badge (icon + text) ──

export function ProvenanceLabel({
  source,
  label,
}: {
  source: ProvenanceSource;
  label?: string;
}) {
  const t = useTranslations('message');
  const config = SOURCE_CONFIG[source];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono ${config.color} ${config.bg} border ${config.border}`}
    >
      <Icon size={10} />
      {label || t(config.labelKey)}
    </span>
  );
}

// ── Row of provenance indicators ──

export function ProvenanceRow({ sources }: { sources: ProvenanceInfo[] }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {sources.map((s, i) => (
        <ProvenanceLabel key={`${s.source}-${s.sourceId ?? i}`} source={s.source} label={s.label} />
      ))}
    </div>
  );
}

// ── Legend showing all provenance source types ──

export function ProvenanceLegend() {
  const t = useTranslations('message');

  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(SOURCE_CONFIG) as ProvenanceSource[]).map((key) => {
        const config = SOURCE_CONFIG[key];
        const Icon = config.icon;
        return (
          <span
            key={key}
            className="inline-flex items-center gap-1 text-[10px] text-text-tertiary font-mono"
          >
            <Icon size={10} className={config.color} />
            {t(config.labelKey)}
          </span>
        );
      })}
    </div>
  );
}
