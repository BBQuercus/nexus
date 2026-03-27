'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';
import { MODELS } from '@/lib/types';
import type { ModelProvider } from '@/lib/types';
import { ChevronDown, Check } from 'lucide-react';
import { ProviderLogo } from './provider-logos';
import type { ModelOption } from '@/lib/types';

const PROVIDER_KEYS: Record<ModelProvider, string> = {
  anthropic: 'providerAnthropic',
  openai: 'providerOpenAI',
  meta: 'providerMeta',
  microsoft: 'providerMicrosoft',
  xai: 'providerXAI',
  moonshot: 'providerMoonshot',
  deepseek: 'providerDeepSeek',
  mistral: 'providerMistral',
};

export default function ModelPicker({
  models = MODELS,
  value,
  onChange,
  disabled = false,
  disabledReason,
}: {
  models?: ModelOption[];
  value?: string;
  onChange?: (model: string) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const t = useTranslations('modelPicker');
  const activeModel = useStore((s) => s.activeModel);
  const setActiveModel = useStore((s) => s.setActiveModel);
  const [open, setOpen] = useState(false);
  const [showDisabledHint, setShowDisabledHint] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedModel = value ?? activeModel;
  const handleChange = onChange ?? setActiveModel;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowDisabledHint(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const current = models.find((m) => m.id === selectedModel);
  const displayName = current?.name || selectedModel?.split('/').pop() || selectedModel || t('selectModel');

  const groupByProvider = (modelList: ModelOption[]) => modelList.reduce((acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = [];
    acc[model.provider].push(model);
    return acc;
  }, {} as Record<ModelProvider, ModelOption[]>);

  const primaryModels = models.filter((model) => !model.legacy);
  const legacyModels = models.filter((model) => model.legacy);
  const grouped = groupByProvider(primaryModels);
  const legacyGrouped = groupByProvider(legacyModels);

  const providerOrder: ModelProvider[] = ['anthropic', 'openai', 'meta', 'microsoft', 'mistral', 'xai', 'moonshot', 'deepseek'];

  const getProviderLabel = (provider: ModelProvider): string => {
    const key = PROVIDER_KEYS[provider];
    return key ? t(key as Parameters<typeof t>[0]) : provider;
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          if (disabled && disabledReason) setShowDisabledHint((v) => !v);
          else setOpen(!open);
        }}
        className={`flex items-center gap-2 px-2.5 py-1.5 text-xs bg-surface-1 border rounded-lg transition-all glow-hover ${
          disabled
            ? 'text-text-tertiary/50 border-border-default cursor-default opacity-60'
            : 'text-text-secondary hover:text-text-primary border-border-default hover:border-border-focus cursor-pointer'
        }`}
      >
        {current && (
          <ProviderLogo provider={current.provider} size={14} className="text-text-tertiary shrink-0" />
        )}
        <span className="truncate">{displayName}</span>
        <ChevronDown size={12} className={`text-text-tertiary transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {showDisabledHint && disabledReason && (
        <div className="absolute bottom-full left-0 mb-1.5 px-2.5 py-1.5 bg-surface-0 border border-border-default rounded-lg shadow-lg shadow-black/30 z-50 whitespace-nowrap text-[11px] text-text-secondary">
          {disabledReason}
        </div>
      )}

      {open && !disabled && (
        <div className="absolute bottom-full left-0 mb-1.5 w-72 max-h-80 overflow-y-auto bg-surface-0 border border-border-default rounded-lg shadow-2xl shadow-black/40 z-50">
          {providerOrder.filter((p) => grouped[p]?.length).map((provider, gi) => (
            <div key={provider}>
              {gi > 0 && <div className="h-px bg-border-subtle mx-3" />}
              <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
                <ProviderLogo provider={provider} size={12} className="text-text-tertiary" />
                <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">{getProviderLabel(provider)}</span>
              </div>
              {grouped[provider].map((model) => (
                <button
                  key={model.id}
                  onClick={() => { handleChange(model.id); setOpen(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-surface-1 transition-colors cursor-pointer ${
                    model.id === selectedModel ? 'bg-surface-1' : ''
                  }`}
                >
                  <span className="text-xs text-text-primary">{model.name}</span>
                  {model.id === selectedModel && <Check size={13} className="text-accent shrink-0" />}
                </button>
              ))}
            </div>
          ))}
          {legacyModels.length > 0 && (
            <div>
              <div className="h-px bg-border-subtle mx-3 mt-1" />
              <div className="px-3 pt-2.5 pb-1.5">
                <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">{t('legacyGroup')}</span>
              </div>
              {providerOrder.filter((p) => legacyGrouped[p]?.length).map((provider) => (
                <div key={`legacy-${provider}`}>
                  <div className="flex items-center gap-2 px-3 pt-1.5 pb-1">
                    <ProviderLogo provider={provider} size={12} className="text-text-tertiary/70" />
                    <span className="text-[10px] font-medium text-text-tertiary/80 uppercase tracking-wider">
                      {getProviderLabel(provider)}
                    </span>
                  </div>
                  {legacyGrouped[provider].map((model) => (
                    <button
                      key={model.id}
                      onClick={() => { handleChange(model.id); setOpen(false); }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-surface-1 transition-colors cursor-pointer ${
                        model.id === selectedModel ? 'bg-surface-1' : ''
                      }`}
                    >
                      <span className="text-xs text-text-secondary">{model.name}</span>
                      {model.id === selectedModel && <Check size={13} className="text-accent shrink-0" />}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
