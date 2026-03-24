'use client';

import { Zap, BarChart3, Bug, Code2 } from 'lucide-react';
import { useStore } from '@/lib/store';

const STARTERS = [
  { icon: <BarChart3 size={16} />, text: 'Analyze a dataset and create visualizations' },
  { icon: <Zap size={16} />, text: 'Build a REST API with FastAPI' },
  { icon: <Bug size={16} />, text: 'Debug code and explain the issue' },
];

const TEMPLATES = ['Python', 'Node.js', 'Data Analysis', 'Web App'];

export default function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 gap-6 sm:gap-10 overflow-y-auto py-6 sm:py-8">
      {/* Hero with animated accents */}
      <div className="relative flex flex-col items-center gap-4 animate-fade-in-up">
        {/* Glowing ring behind icon */}
        <div className="relative">
          <div className="absolute inset-0 w-14 h-14 -m-2 rounded-2xl bg-accent/5 animate-pulse" />
          <div className="relative flex items-center gap-2 z-10">
            <Zap size={24} className="text-accent" />
            <span className="text-2xl sm:text-3xl font-bold tracking-[0.15em] uppercase">Nexus</span>
          </div>
        </div>

        {/* Animated divider */}
        <div className="relative w-32 h-px">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent to-transparent opacity-60 animate-pulse" />
        </div>

        <p className="text-text-tertiary text-xs tracking-[0.2em] uppercase">
          AI workspace with sandboxed execution
        </p>
      </div>

      {/* Templates */}
      <div className="flex flex-wrap justify-center gap-1.5 stagger-children">
        {TEMPLATES.map((t) => (
          <button
            key={t}
            className="px-3.5 py-1.5 text-[11px] tracking-wide uppercase bg-surface-1 border border-border-default rounded-md text-text-tertiary hover:text-accent hover:border-accent/30 transition-all cursor-pointer glow-hover"
          >
            {t}
          </button>
        ))}
      </div>

      {/* Starters */}
      <div className="flex flex-col gap-2 w-full max-w-md stagger-children">
        {STARTERS.map((s) => (
          <StarterButton key={s.text} icon={s.icon} text={s.text} />
        ))}
      </div>
    </div>
  );
}

function StarterButton({ icon, text }: { icon: React.ReactNode; text: string }) {
  const handleClick = () => {
    useStore.getState().setPendingPrompt(text);
  };

  return (
    <button
      onClick={handleClick}
      className="relative flex items-center gap-3 px-4 py-3 bg-surface-0/80 border border-border-default rounded-lg text-sm text-text-secondary hover:text-text-primary hover:border-accent/20 hover:bg-surface-1 transition-all text-left cursor-pointer group overflow-hidden"
    >
      {/* Hover accent line */}
      <span className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r bg-accent scale-y-0 group-hover:scale-y-100 transition-transform origin-top" />
      <span className="text-text-tertiary group-hover:text-accent transition-colors">{icon}</span>
      <span>{text}</span>
    </button>
  );
}
