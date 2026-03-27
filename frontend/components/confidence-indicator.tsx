'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, AlertCircle, AlertTriangle, XCircle, ChevronRight } from 'lucide-react';
import type { ConfidenceLevel } from '@/lib/execution-types';

// ── Configuration per confidence level ──

type ConfidenceConfig = {
  icon: React.ElementType;
  dotColor: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  labelKey: 'high' | 'medium' | 'low' | 'failed';
  hintKey: '' | 'mediumHint' | 'lowHint' | 'failedHint';
};

const CONFIDENCE_CONFIG: Record<ConfidenceLevel | 'failed', ConfidenceConfig> = {
  high: {
    icon: CheckCircle2,
    dotColor: 'bg-emerald-400',
    textColor: 'text-emerald-400',
    bgColor: 'bg-emerald-400/10',
    borderColor: 'border-emerald-400/20',
    labelKey: 'high',
    hintKey: '',
  },
  medium: {
    icon: AlertCircle,
    dotColor: 'bg-amber-400',
    textColor: 'text-amber-400',
    bgColor: 'bg-amber-400/10',
    borderColor: 'border-amber-400/20',
    labelKey: 'medium',
    hintKey: 'mediumHint',
  },
  low: {
    icon: AlertTriangle,
    dotColor: 'bg-orange-400',
    textColor: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
    borderColor: 'border-orange-400/20',
    labelKey: 'low',
    hintKey: 'lowHint',
  },
  failed: {
    icon: XCircle,
    dotColor: 'bg-red-500',
    textColor: 'text-error',
    bgColor: 'bg-error/10',
    borderColor: 'border-error/20',
    labelKey: 'failed',
    hintKey: 'failedHint',
  },
};

// ── Dot-only indicator (minimal) ──

export function ConfidenceDot({
  level,
  size = 'sm',
}: {
  level: ConfidenceLevel | 'failed';
  size?: 'sm' | 'md';
}) {
  const t = useTranslations('confidenceIndicator');
  const config = CONFIDENCE_CONFIG[level];
  const px = size === 'sm' ? 'w-[7px] h-[7px]' : 'w-[9px] h-[9px]';

  return (
    <span
      title={t(config.labelKey)}
      className={`inline-block rounded-full ${config.dotColor} ${px}`}
    />
  );
}

// ── Icon-based indicator ──

export function ConfidenceIcon({
  level,
  size = 12,
}: {
  level: ConfidenceLevel | 'failed';
  size?: number;
}) {
  const t = useTranslations('confidenceIndicator');
  const config = CONFIDENCE_CONFIG[level];
  const Icon = config.icon;

  return (
    <span title={t(config.labelKey)}>
      <Icon size={size} className={config.textColor} />
    </span>
  );
}

// ── Inline badge with label ──

export function ConfidenceBadge({
  level,
  label,
}: {
  level: ConfidenceLevel | 'failed';
  label?: string;
}) {
  const t = useTranslations('confidenceIndicator');
  const config = CONFIDENCE_CONFIG[level];

  // High confidence: don't show badge to avoid noise
  if (level === 'high') return null;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono ${config.textColor} ${config.bgColor} border ${config.borderColor}`}
    >
      <span className={`inline-block w-[6px] h-[6px] rounded-full ${config.dotColor}`} />
      {label || t(config.labelKey)}
    </span>
  );
}

// ── Expandable confidence banner (for message-level confidence) ──

export interface ConfidenceBannerProps {
  level: ConfidenceLevel | 'failed';
  message?: string;
  details?: string;
}

export function ConfidenceBanner({ level, message, details }: ConfidenceBannerProps) {
  const t = useTranslations('confidenceIndicator');
  const [expanded, setExpanded] = useState(false);
  const config = CONFIDENCE_CONFIG[level];
  const Icon = config.icon;

  // High confidence: don't render anything
  if (level === 'high') return null;

  const displayMessage = message || (config.hintKey ? t(config.hintKey) : '');
  if (!displayMessage) return null;

  return (
    <div
      className={`my-1.5 rounded-md border ${config.borderColor} ${config.bgColor} overflow-hidden`}
    >
      <button
        onClick={() => details && setExpanded(!expanded)}
        className={`flex items-center gap-2 w-full px-2.5 py-1.5 text-left ${details ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <Icon size={13} className={`${config.textColor} shrink-0`} />
        <span className={`text-xs ${config.textColor}`}>{displayMessage}</span>
        {details && (
          <ChevronRight
            size={11}
            className={`ml-auto text-text-tertiary shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        )}
      </button>

      {expanded && details && (
        <div className="px-2.5 pb-2 text-[11px] text-text-secondary leading-relaxed">
          {details}
        </div>
      )}
    </div>
  );
}
