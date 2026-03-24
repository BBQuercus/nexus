'use client';

import { Zap, BarChart3, Code2, MessageCircle, Database, Globe, Terminal, Cpu, Sparkles } from 'lucide-react';
import { useStore } from '@/lib/store';

const ACTION_CARDS = [
  {
    icon: <BarChart3 size={22} />,
    title: 'Analyze Data',
    description: 'Upload datasets, create visualizations, and extract insights',
    prompt: 'I have a CSV dataset I\'d like to analyze. Help me load it, explore the data with summary statistics, and create meaningful visualizations using matplotlib and pandas.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/5 hover:bg-emerald-400/10',
    border: 'border-emerald-400/10 hover:border-emerald-400/20',
  },
  {
    icon: <Code2 size={22} />,
    title: 'Write Code',
    description: 'Build applications, debug issues, and refactor code',
    prompt: 'Help me build a well-structured application. I\'d like to start with a project scaffold, implement core features, and follow best practices for code quality.',
    color: 'text-blue-400',
    bg: 'bg-blue-400/5 hover:bg-blue-400/10',
    border: 'border-blue-400/10 hover:border-blue-400/20',
  },
  {
    icon: <MessageCircle size={22} />,
    title: 'Ask Anything',
    description: 'Get explanations, brainstorm ideas, and solve problems',
    prompt: 'I have a question and would like a thorough, well-explained answer with examples where relevant.',
    color: 'text-purple-400',
    bg: 'bg-purple-400/5 hover:bg-purple-400/10',
    border: 'border-purple-400/10 hover:border-purple-400/20',
  },
];

const TEMPLATES = [
  { label: 'Python', icon: <Terminal size={12} />, prompt: 'Create a Python project with a clean structure: a main module, utility helpers, and a requirements.txt. Set up basic logging and error handling.' },
  { label: 'Node.js', icon: <Cpu size={12} />, prompt: 'Set up a Node.js project with Express, including routes, middleware for error handling, and a basic package.json with scripts for dev and production.' },
  { label: 'Data Analysis', icon: <Database size={12} />, prompt: 'Set up a data analysis environment with pandas, numpy, and matplotlib. Create a Jupyter-style workflow that loads a sample dataset and generates summary statistics and charts.' },
  { label: 'Web App', icon: <Globe size={12} />, prompt: 'Build a simple web application with HTML, CSS, and JavaScript. Include a responsive layout, a navigation bar, and interactive elements.' },
];

const QUICK_SUGGESTIONS = [
  'Explain how async/await works',
  'Write a REST API with FastAPI',
  'Debug a stack trace',
  'Convert JSON to CSV',
  'Create a React component',
  'Write unit tests',
];

const RETURNING_STARTERS = [
  { icon: <BarChart3 size={16} />, text: 'Analyze a dataset and create visualizations' },
  { icon: <Zap size={16} />, text: 'Build a REST API with FastAPI' },
  { icon: <Code2 size={16} />, text: 'Debug code and explain the issue' },
  { icon: <Sparkles size={16} />, text: 'Refactor and optimize existing code' },
];

export default function EmptyState() {
  const conversations = useStore((s) => s.conversations);
  const isFirstTime = conversations.length === 0;

  if (isFirstTime) return <WelcomeScreen />;
  return <ReturningUserScreen />;
}

function WelcomeScreen() {
  const setPendingPrompt = useStore((s) => s.setPendingPrompt);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 gap-6 sm:gap-8 overflow-y-auto py-6 sm:py-8">
      {/* Hero */}
      <div className="relative flex flex-col items-center gap-4 animate-fade-in-up">
        <div className="relative">
          <div className="absolute inset-0 w-16 h-16 -m-3 rounded-2xl bg-accent/8 animate-pulse" />
          <div className="relative flex items-center gap-2.5 z-10">
            <Zap size={28} className="text-accent" />
            <span className="text-2xl sm:text-3xl font-bold tracking-[0.15em] uppercase">Nexus</span>
          </div>
        </div>

        <div className="relative w-40 h-px">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent to-transparent opacity-60 animate-pulse" />
        </div>

        <p className="text-text-secondary text-sm text-center max-w-sm">
          Your AI workspace with sandboxed code execution.
          <br />
          <span className="text-text-tertiary text-xs">Pick a starting point or type anything below.</span>
        </p>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl stagger-children">
        {ACTION_CARDS.map((card) => (
          <button
            key={card.title}
            onClick={() => setPendingPrompt(card.prompt)}
            className={`relative flex flex-col items-start gap-2.5 p-4 ${card.bg} border ${card.border} rounded-xl text-left cursor-pointer transition-all group overflow-hidden`}
          >
            <span className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r bg-current scale-y-0 group-hover:scale-y-100 transition-transform origin-top" style={{ color: 'inherit' }} />
            <span className={card.color}>{card.icon}</span>
            <div>
              <div className="text-sm font-medium text-text-primary">{card.title}</div>
              <div className="text-[11px] text-text-tertiary mt-0.5 leading-relaxed">{card.description}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Templates */}
      <div className="flex flex-wrap justify-center gap-1.5 stagger-children">
        {TEMPLATES.map((t) => (
          <button
            key={t.label}
            onClick={() => setPendingPrompt(t.prompt)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] tracking-wide uppercase bg-surface-1 border border-border-default rounded-md text-text-tertiary hover:text-accent hover:border-accent/30 transition-all cursor-pointer glow-hover"
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

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 gap-6 sm:gap-10 overflow-y-auto py-6 sm:py-8">
      {/* Logo */}
      <div className="relative flex flex-col items-center gap-4 animate-fade-in-up">
        <div className="relative">
          <div className="absolute inset-0 w-14 h-14 -m-2 rounded-2xl bg-accent/5 animate-pulse" />
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
          AI workspace with sandboxed execution
        </p>
      </div>

      {/* Templates */}
      <div className="flex flex-wrap justify-center gap-1.5 stagger-children">
        {TEMPLATES.map((t) => (
          <button
            key={t.label}
            onClick={() => setPendingPrompt(t.prompt)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] tracking-wide uppercase bg-surface-1 border border-border-default rounded-md text-text-tertiary hover:text-accent hover:border-accent/30 transition-all cursor-pointer glow-hover"
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Starters */}
      <div className="flex flex-col gap-2 w-full max-w-md stagger-children">
        {RETURNING_STARTERS.map((s) => (
          <button
            key={s.text}
            onClick={() => setPendingPrompt(s.text)}
            className="relative flex items-center gap-3 px-4 py-3 bg-surface-0/80 border border-border-default rounded-lg text-sm text-text-secondary hover:text-text-primary hover:border-accent/20 hover:bg-surface-1 transition-all text-left cursor-pointer group overflow-hidden"
          >
            <span className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r bg-accent scale-y-0 group-hover:scale-y-100 transition-transform origin-top" />
            <span className="text-text-tertiary group-hover:text-accent transition-colors">{s.icon}</span>
            <span>{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
