'use client';

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { MODELS } from '@/lib/types';
import { ChevronDown, Check } from 'lucide-react';

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

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer font-mono"
      >
        {displayName}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-72 bg-surface-0 border border-border-default rounded-lg shadow-lg overflow-hidden z-50">
          {MODELS.map((model) => (
            <button
              key={model.id}
              onClick={() => { setActiveModel(model.id); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-surface-1 transition-colors cursor-pointer ${
                model.id === activeModel ? 'bg-surface-1' : ''
              }`}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-text-primary">{model.name}</span>
                <span className="text-[10px] text-text-tertiary font-mono">{model.id}</span>
              </div>
              {model.id === activeModel && <Check size={12} className="text-accent shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
