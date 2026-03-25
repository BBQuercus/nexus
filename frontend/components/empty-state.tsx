'use client';

import { useState, useEffect } from 'react';
import {
  Zap, BarChart3, Code2, Database, Globe, Terminal,
  ClipboardList, Brain, Search, GitCompare, Image, Blocks,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { IMAGE_MODELS, MODELS } from '@/lib/types';

interface Capability {
  label: string;
  icon: React.ReactNode;
  prompt: string;
  action?: () => void; // If set, runs this instead of just setting prompt
}

function makeCapabilities(): Capability[] {
  return [
    { label: 'Python Sandbox', icon: <Terminal size={11} />, prompt: 'Start a Python sandbox workflow for data analysis, automation, or scripting. Use the terminal, create files as needed, and leave me with runnable output.' },
    { label: 'Knowledge Base', icon: <Database size={11} />, prompt: 'Help me structure a knowledge-grounded workflow. I want to work with uploaded documents, retrieve the right context, and produce answers with sources.' },
    { label: 'Live Preview', icon: <Globe size={11} />, prompt: 'Build a modern web app I can iterate on in live preview. Start with a strong foundation, implement the core experience, and keep the UI polished.' },
    { label: 'Charts', icon: <BarChart3 size={11} />, prompt: 'Create interactive data visualizations. Use Vega-Lite to build charts from data I provide or generate sample data to demonstrate different chart types.' },
    { label: 'SQL on Files', icon: <Blocks size={11} />, prompt: 'Load my CSV or Excel files into DuckDB and run SQL queries. Show the schema, suggest interesting queries, and visualize the results.' },
    { label: 'Interactive Forms', icon: <ClipboardList size={11} />, prompt: 'Create an interactive form with multiple field types: text, dropdowns, ratings, sliders, and conditional sections. Then analyze my responses.' },
    {
      label: 'Multi-Model Compare',
      icon: <GitCompare size={11} />,
      prompt: 'Tell me how to approach building a SaaS product from scratch',
      action: () => {
        // Pick first non-legacy models from two different providers
        const nonLegacy = MODELS.filter((m) => !m.legacy);
        const first = nonLegacy.find((m) => m.provider === 'anthropic') || nonLegacy[0];
        const second = nonLegacy.find((m) => m.provider === 'openai') || nonLegacy[1];
        const ids = first && second ? [first.id, second.id] : nonLegacy.slice(0, 2).map((m) => m.id);
        window.dispatchEvent(new CustomEvent('nexus:set-compose', {
          detail: { compareModels: ids, prompt: 'Tell me how to approach building a SaaS product from scratch' },
        }));
      },
    },
    {
      label: 'Image Generation',
      icon: <Image size={11} />,
      prompt: 'A futuristic cityscape at sunset with flying vehicles and holographic billboards, cinematic style',
      action: () => {
        window.dispatchEvent(new CustomEvent('nexus:set-compose', {
          detail: { mode: 'image', imageModel: IMAGE_MODELS[0]?.id, prompt: 'A futuristic cityscape at sunset with flying vehicles and holographic billboards, cinematic style' },
        }));
      },
    },
    { label: 'AI Memory', icon: <Brain size={11} />, prompt: 'Remember that I prefer concise answers, code examples over explanations, and that I work primarily with TypeScript and Python.' },
  ];
}

const RETURNING_STARTERS = [
  { icon: <Terminal size={16} />, text: 'Run code in a sandbox, inspect files, and generate artifacts', color: 'text-emerald-400' },
  { icon: <Code2 size={16} />, text: 'Build a web app with live preview and hot-reload', color: 'text-blue-400' },
  { icon: <BarChart3 size={16} />, text: 'Analyze data with SQL, Python, and interactive charts', color: 'text-cyan-400' },
  { icon: <Search size={16} />, text: 'Research a topic with web search and cited sources', color: 'text-purple-400' },
];

export default function EmptyState() {
  const [loaded, setLoaded] = useState(false);

  // Wait one tick for sidebar state to settle before rendering.
  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 50);
    return () => clearTimeout(timer);
  }, []);

  if (!loaded) return <div className="flex-1" />;
  return <ReturningUserScreen />;
}

function ReturningUserScreen() {
  const setPendingPrompt = useStore((s) => s.setPendingPrompt);
  const capabilities = makeCapabilities();

  const handleCapability = (cap: Capability) => {
    if (cap.action) {
      cap.action();
    } else {
      setPendingPrompt(cap.prompt);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-6 gap-6 md:gap-10 overflow-y-auto py-6 md:py-8 cascade-sections">
      {/* Logo */}
      <div className="relative flex flex-col items-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 w-14 h-14 -m-2 rounded-lg bg-accent/5 animate-pulse" />
          <div className="relative flex items-center gap-2 z-10">
            <Zap size={24} className="text-accent" />
            <span className="text-2xl md:text-3xl font-bold tracking-[0.15em] uppercase">Nexus</span>
          </div>
        </div>

        <div className="relative w-32 h-px">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent to-transparent opacity-60 animate-pulse" />
        </div>

        <p className="text-text-tertiary text-xs tracking-[0.2em] uppercase">
          Agents, tools, and sandboxed execution
        </p>
      </div>

      {/* Capabilities */}
      <div className="flex flex-wrap justify-center gap-1.5 max-w-xl">
        {capabilities.map((t) => (
          <button
            key={t.label}
            onClick={() => handleCapability(t)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-wide uppercase bg-surface-1 border border-border-default rounded-lg text-text-tertiary hover:text-accent hover:border-accent/30 transition-all cursor-pointer glow-hover"
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Starters */}
      <div className="flex flex-col gap-2 w-full max-w-md">
        {RETURNING_STARTERS.map((s) => (
          <button
            key={s.text}
            onClick={() => setPendingPrompt(s.text)}
            className="relative flex items-center gap-3 px-4 py-3 bg-surface-0/80 border border-border-default rounded-lg text-sm text-text-secondary hover:text-text-primary hover:border-accent/20 hover:bg-surface-1 transition-all text-left cursor-pointer group overflow-hidden"
          >
            <span className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r bg-accent scale-y-0 group-hover:scale-y-100 transition-transform origin-top" />
            <span className={`${s.color} group-hover:text-accent transition-colors shrink-0`}>{s.icon}</span>
            <span>{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
