'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Zap, BarChart3, Database, Globe, Terminal,
  ClipboardList, Brain, GitCompare, Image, Blocks,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { IMAGE_MODELS, MODELS } from '@/lib/types';
import { LANDING_PROMPTS, resolveCompareModels } from '@/lib/landing-prompts';

interface Capability {
  id: string;
  label: string;
  icon: React.ReactNode;
  prompt: string;
  action?: () => void;
}

function makeCapabilities(): Capability[] {
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
      label: entry.label,
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


const GREETINGS_MORNING = [
  (name: string) => `Morning, ${name}. Coffee first or code first?`,
  (name: string) => `Good morning, ${name}. What are we building today?`,
  (name: string) => `Rise and shine, ${name}. Let\u2019s get to work.`,
  (name: string) => `Hey ${name}, fresh start today. What\u2019s the plan?`,
  (name: string) => `Top of the morning, ${name}.`,
  (name: string) => `New day, new code. What\u2019s first, ${name}?`,
  (name: string) => `Morning, ${name}. Let\u2019s ship something.`,
  (name: string) => `Hey ${name}, the IDE is warm. Let\u2019s go.`,
];

const GREETINGS_AFTERNOON = [
  (name: string) => `Good afternoon, ${name}. What\u2019s next?`,
  (name: string) => `Hey ${name}, ready for round two?`,
  (name: string) => `Afternoon, ${name}. Let\u2019s keep the momentum going.`,
  (name: string) => `What are we tackling this afternoon, ${name}?`,
  (name: string) => `Back at it, ${name}. What do you need?`,
  (name: string) => `Hey ${name}, halfway through the day. Let\u2019s make it count.`,
  (name: string) => `Afternoon, ${name}. Pick up where you left off?`,
  (name: string) => `Post-lunch productivity, ${name}. What\u2019s the move?`,
];

const GREETINGS_EVENING = [
  (name: string) => `Good evening, ${name}. Burning the midnight oil?`,
  (name: string) => `Evening, ${name}. One more thing before you call it?`,
  (name: string) => `Hey ${name}, still going strong.`,
  (name: string) => `Late night session, ${name}? Let\u2019s make it count.`,
  (name: string) => `Evening, ${name}. Quick fix or deep dive?`,
  (name: string) => `Hey ${name}, the best code is written after dark.`,
  (name: string) => `Night owl mode, ${name}. What are we working on?`,
  (name: string) => `Quiet hours, ${name}. Perfect time to focus.`,
];

const GREETINGS_LATE_NIGHT = [
  (name: string) => `Still up, ${name}? Respect.`,
  (name: string) => `${name}, it\u2019s past midnight. This better be good.`,
  (name: string) => `The witching hour, ${name}. Let\u2019s debug something.`,
  (name: string) => `Can\u2019t sleep, ${name}? Might as well ship.`,
  (name: string) => `3 AM energy, ${name}. What\u2019s keeping you up?`,
  (name: string) => `Late night, ${name}. No judgement, just code.`,
  (name: string) => `${name}, you and the servers are the only ones awake.`,
  (name: string) => `Midnight ${name}. Peak focus time.`,
];

function pickGreeting(name: string): string {
  const hour = new Date().getHours();
  const pool =
    hour < 4 ? GREETINGS_LATE_NIGHT :
    hour < 12 ? GREETINGS_MORNING :
    hour < 18 ? GREETINGS_AFTERNOON :
    GREETINGS_EVENING;
  return pool[Math.floor(Math.random() * pool.length)](name);
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
  const setPendingPrompt = useStore((s) => s.setPendingPrompt);
  const user = useStore((s) => s.user);
  const capabilities = makeCapabilities();

  const firstName = user?.name
    ? user.name.split(/[\s.\-_]/)[0].replace(/^./, (c) => c.toUpperCase())
    : null;

  const greeting = useMemo(
    () => firstName ? pickGreeting(firstName) : null,
    [firstName],
  );

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
        <Zap size={32} className="text-accent animate-[glow-pulse_3s_ease-in-out_infinite]" />
        {greeting ? (
          <p className="text-2xl md:text-3xl font-bold tracking-tight text-text-primary text-center">{greeting}</p>
        ) : (
          <p className="text-2xl md:text-3xl font-bold tracking-tight text-text-primary text-center">
            What are we building today?
          </p>
        )}
      </div>

      {/* Capabilities */}
      <div className="flex flex-wrap justify-center gap-1.5 max-w-xl">
        {capabilities.map((t) => (
          <button
            key={t.id}
            onClick={() => handleCapability(t)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-wide uppercase bg-surface-1 border border-border-default rounded-lg text-text-tertiary hover:text-accent hover:border-accent/30 transition-all cursor-pointer glow-hover"
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

    </div>
  );
}
