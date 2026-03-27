'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Zap, BarChart3, Database, Globe, Terminal,
  ClipboardList, Brain, GitCompare, Image, Blocks,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { IMAGE_MODELS, MODELS } from '@/lib/types';
import { LANDING_PROMPTS, resolveCompareModels } from '@/lib/landing-prompts';
import { useTranslations } from 'next-intl';

interface Capability {
  id: string;
  label: string;
  icon: React.ReactNode;
  prompt: string;
  action?: () => void;
}

function kebabToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function makeCapabilities(tl: (key: string) => string): Capability[] {
  const iconMap: Record<string, React.ReactNode> = {
    Terminal: <Terminal size={11} />,
    Database: <Database size={11} />,
    Globe: <Globe size={11} />,
    BarChart3: <BarChart3 size={11} />,
    Blocks: <Blocks size={11} />,
    ClipboardList: <ClipboardList size={11} />,
    GitCompare: <GitCompare size={11} />,
    Image: <Image size={11} />,
    Brain: <Brain size={11} />,
  };

  return LANDING_PROMPTS.map((entry) => {
    const capability: Capability = {
      id: entry.id,
      label: tl(kebabToCamel(entry.id)),
      icon: iconMap[entry.icon] || <Zap size={11} />,
      prompt: entry.prompt,
    };

    if (entry.action_type === 'compare') {
      capability.action = () => {
        window.dispatchEvent(new CustomEvent('nexus:set-compose', {
          detail: {
            compareModels: resolveCompareModels(entry, MODELS),
            prompt: entry.prompt,
          },
        }));
      };
    } else if (entry.action_type === 'image') {
      capability.action = () => {
        window.dispatchEvent(new CustomEvent('nexus:set-compose', {
          detail: {
            mode: 'image',
            imageModel: IMAGE_MODELS[0]?.id,
            prompt: entry.prompt,
          },
        }));
      };
    }

    return capability;
  });
}

function pickGreetingKey(name: string): { key: string; params: { name: string } } {
  const hour = new Date().getHours();
  const period =
    hour < 4 ? 'lateNight' :
    hour < 12 ? 'morning' :
    hour < 18 ? 'afternoon' :
    'evening';
  const index = Math.floor(Math.random() * 12);
  return { key: `${period}.${index}`, params: { name } };
}

export default function EmptyState() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 50);
    return () => clearTimeout(timer);
  }, []);

  if (!loaded) return <div className="flex-1" />;
  return <ReturningUserScreen />;
}

function ReturningUserScreen() {
  const t = useTranslations('emptyState');
  const tl = useTranslations('landingPrompts');
  const setPendingPrompt = useStore((s) => s.setPendingPrompt);
  const user = useStore((s) => s.user);
  const capabilities = makeCapabilities(tl);

  const firstName = user?.name
    ? user.name.split(/[\s.\-_]/)[0].replace(/^./, (c) => c.toUpperCase())
    : null;

  const greeting = useMemo(() => {
    if (!firstName) return null;
    const { key, params } = pickGreetingKey(firstName);
    return t(key, params);
  }, [firstName, t]);

  const handleCapability = (cap: Capability) => {
    if (cap.action) {
      cap.action();
    } else {
      setPendingPrompt(cap.prompt);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-6 gap-6 md:gap-10 overflow-y-auto py-6 md:py-8 cascade-sections">
      {/* Logo + greeting */}
      <div className="flex flex-col items-center gap-5">
        <Zap size={32} className="text-accent animate-[glow-pulse_4s_ease-in-out_infinite]" />
        {greeting ? (
          <p className="text-2xl md:text-3xl font-bold tracking-tight text-text-primary text-center">{greeting}</p>
        ) : (
          <p className="text-2xl md:text-3xl font-bold tracking-tight text-text-primary text-center">
            {t('fallbackGreeting')}
          </p>
        )}
      </div>

      {/* Capabilities */}
      <div className="flex flex-wrap justify-center gap-1.5 max-w-xl">
        {capabilities.map((cap) => (
          <button
            key={cap.id}
            onClick={() => handleCapability(cap)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-wide uppercase bg-surface-1 border border-border-default rounded-lg text-text-tertiary hover:text-accent hover:border-accent/30 transition-all cursor-pointer glow-hover"
          >
            {cap.icon}
            {cap.label}
          </button>
        ))}
      </div>

    </div>
  );
}
