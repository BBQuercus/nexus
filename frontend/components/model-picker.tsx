'use client';

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { MODELS } from '@/lib/types';
import type { ModelProvider } from '@/lib/types';
import { ChevronDown, Check } from 'lucide-react';
import { ProviderLogo } from './provider-logos';

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  meta: 'Meta',
};

export default function ModelPicker() {
  const activeModel = useStore((s) => s.activeModel);
  const setActiveModel = useStore((s) => s.setActiveModel);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const current = MODELS.find((m) => m.id === activeModel);
  const displayName = current?.name || activeModel.split('/').pop() || activeModel;

  // Group models by provider
  const grouped = MODELS.reduce((acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = [];
    acc[model.provider].push(model);
    return acc;
  }, {} as Record<ModelProvider, typeof MODELS>);

  const providerOrder: ModelProvider[] = ['anthropic', 'openai', 'meta'];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary bg-surface-1 border border-border-default rounded-lg hover:border-border-focus transition-all cursor-pointer glow-hover"
      >
        {current && (
          <ProviderLogo provider={current.provider} size={14} className="text-text-tertiary shrink-0" />
        )}
        <span className="truncate">{displayName}</span>
        <ChevronDown size={12} className={`text-text-tertiary transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 w-72 max-h-80 overflow-y-auto bg-surface-0 border border-border-default rounded-lg shadow-2xl shadow-black/40 z-50">
          {providerOrder.filter((p) => grouped[p]?.length).map((provider, gi) => (
            <div key={provider}>
              {gi > 0 && <div className="h-px bg-border-subtle mx-3" />}
              <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
                <ProviderLogo provider={provider} size={12} className="text-text-tertiary" />
                <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">{PROVIDER_LABELS[provider]}</span>
              </div>
              {grouped[provider].map((model) => (
                <button
                  key={model.id}
                  onClick={() => { setActiveModel(model.id); setOpen(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-surface-1 transition-colors cursor-pointer ${
                    model.id === activeModel ? 'bg-surface-1' : ''
                  }`}
                >
                  <span className="text-xs text-text-primary">{model.name}</span>
                  {model.id === activeModel && <Check size={13} className="text-accent shrink-0" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
