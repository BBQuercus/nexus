'use client';

import { useState, useEffect } from 'react';
import {
  Zap, BarChart3, Code2, Database, Globe, Terminal, Cpu,
  Sparkles, ClipboardList, Brain, Search, GitCompare,
  Image, Blocks, ArrowRight,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { IMAGE_MODELS, MODELS } from '@/lib/types';

const ACTION_CARDS = [
  {
    icon: <Terminal size={20} />,
    title: 'Sandbox & Execute',
    description: 'Run Python, Node, SQL — inspect outputs, generate artifacts, and iterate in a live environment',
    prompt: 'Spin up a sandbox and help me work through a real task end to end. Use Python or Node as needed, inspect files, run code, and produce useful artifacts I can review.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/5 hover:bg-emerald-400/10',
    border: 'border-emerald-400/10 hover:border-emerald-400/20',
  },
  {
    icon: <Code2 size={20} />,
    title: 'Build & Preview',
    description: 'Create apps with live preview, file diffs, and hot-reload — ship from chat',
    prompt: 'Help me build a polished app prototype. Set up the project, implement the first version, and keep the app ready to preview and iterate on quickly.',
    color: 'text-blue-400',
    bg: 'bg-blue-400/5 hover:bg-blue-400/10',
    border: 'border-blue-400/10 hover:border-blue-400/20',
  },
  {
    icon: <Search size={20} />,
    title: 'Research & Ground',
    description: 'Web search, knowledge bases, and cited sources — answers you can trace back',
    prompt: 'Help me answer a complex question using grounded sources. Search where needed, use knowledge bases if available, and clearly cite the evidence behind the answer.',
    color: 'text-purple-400',
    bg: 'bg-purple-400/5 hover:bg-purple-400/10',
    border: 'border-purple-400/10 hover:border-purple-400/20',
  },
  {
    icon: <ClipboardList size={20} />,
    title: 'Forms & Workflows',
    description: 'AI builds interactive forms, surveys, and decision frameworks — you fill them in',
    prompt: 'Create an interactive form that helps me make a decision. Include rating scales, conditional fields, and give me a structured recommendation based on my answers.',
    color: 'text-amber-400',
    bg: 'bg-amber-400/5 hover:bg-amber-400/10',
    border: 'border-amber-400/10 hover:border-amber-400/20',
  },
];

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

const QUICK_SUGGESTIONS = [
  'Analyze a CSV and create interactive charts',
  'Build a React dashboard with live preview',
  'Create a feedback survey with ratings and conditional questions',
  'Compare GPT vs Claude on a code review task',
  'Search the web and summarize with citations',
  'Debug a repo and explain the root cause',
];

const RETURNING_STARTERS = [
  { icon: <Terminal size={16} />, text: 'Run code in a sandbox, inspect files, and generate artifacts', color: 'text-emerald-400' },
  { icon: <Code2 size={16} />, text: 'Build a web app with live preview and hot-reload', color: 'text-blue-400' },
  { icon: <BarChart3 size={16} />, text: 'Analyze data with SQL, Python, and interactive charts', color: 'text-cyan-400' },
  { icon: <Search size={16} />, text: 'Research a topic with web search and cited sources', color: 'text-purple-400' },
];

export default function EmptyState() {
  const conversations = useStore((s) => s.conversations);
  const [loaded, setLoaded] = useState(false);

  // Wait one tick for sidebar to fetch conversations before deciding which screen to show.
  // This prevents the WelcomeScreen from flashing when the user has conversations.
  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 50);
    return () => clearTimeout(timer);
  }, []);

  if (!loaded) return <div className="flex-1" />;

  const isFirstTime = conversations.length === 0;
  if (isFirstTime) return <WelcomeScreen />;
  return <ReturningUserScreen />;
}

function WelcomeScreen() {
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
    <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 gap-6 sm:gap-8 overflow-y-auto py-6 sm:py-8 cascade-sections">
      {/* Hero */}
      <div className="relative flex flex-col items-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 w-16 h-16 -m-3 rounded-lg bg-accent/8 animate-pulse" />
          <div className="relative flex items-center gap-2.5 z-10">
            <Zap size={28} className="text-accent" />
            <span className="text-2xl sm:text-3xl font-bold tracking-[0.15em] uppercase">Nexus</span>
          </div>
        </div>

        <div className="relative w-40 h-px">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent to-transparent opacity-60 animate-pulse" />
        </div>

        <p className="text-text-secondary text-sm text-center max-w-md">
          Your AI workspace — agents, sandboxed execution, interactive tools, and grounded knowledge.
        </p>
      </div>

      {/* Action Cards — 2x2 grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
        {ACTION_CARDS.map((card) => (
          <button
            key={card.title}
            onClick={() => setPendingPrompt(card.prompt)}
            className={`relative flex items-start gap-3 p-4 ${card.bg} border ${card.border} rounded-lg text-left cursor-pointer transition-all group overflow-hidden`}
          >
            <span className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r bg-current scale-y-0 group-hover:scale-y-100 transition-transform origin-top" style={{ color: 'inherit' }} />
            <span className={`${card.color} mt-0.5 shrink-0`}>{card.icon}</span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                {card.title}
                <ArrowRight size={12} className="opacity-0 -translate-x-1 group-hover:opacity-50 group-hover:translate-x-0 transition-all" />
              </div>
              <div className="text-[11px] text-text-tertiary mt-0.5 leading-relaxed">{card.description}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Capabilities */}
      <div className="flex flex-wrap justify-center gap-1.5 max-w-2xl">
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

      {/* Quick suggestion chips */}
      <div className="flex flex-wrap justify-center gap-1.5 max-w-lg">
        {QUICK_SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setPendingPrompt(s)}
            className="px-2.5 py-1 text-[11px] bg-surface-0 border border-border-default rounded-full text-text-tertiary hover:text-text-secondary hover:border-border-focus transition-all cursor-pointer"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
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
    <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 gap-6 sm:gap-10 overflow-y-auto py-6 sm:py-8 cascade-sections">
      {/* Logo */}
      <div className="relative flex flex-col items-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 w-14 h-14 -m-2 rounded-lg bg-accent/5 animate-pulse" />
          <div className="relative flex items-center gap-2 z-10">
            <Zap size={24} className="text-accent" />
            <span className="text-2xl sm:text-3xl font-bold tracking-[0.15em] uppercase">Nexus</span>
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
