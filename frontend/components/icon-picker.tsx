'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Search, X } from 'lucide-react';
import * as icons from 'lucide-react';

// Curated set of icons suitable for agent personas, grouped by category
const ICON_ENTRIES: { name: string; keywords: string[] }[] = [
  // People / Roles
  { name: 'Bot', keywords: ['bot', 'robot', 'ai', 'assistant'] },
  { name: 'User', keywords: ['user', 'person', 'human'] },
  { name: 'UserCog', keywords: ['user', 'settings', 'admin'] },
  { name: 'BrainCircuit', keywords: ['brain', 'ai', 'intelligence', 'neural'] },
  { name: 'Brain', keywords: ['brain', 'think', 'smart'] },
  { name: 'Sparkles', keywords: ['sparkle', 'magic', 'creative', 'ai'] },
  { name: 'Wand2', keywords: ['wand', 'magic', 'creative'] },
  // Tech
  { name: 'Code2', keywords: ['code', 'programming', 'developer'] },
  { name: 'Terminal', keywords: ['terminal', 'cli', 'shell', 'console'] },
  { name: 'Cpu', keywords: ['cpu', 'processor', 'compute'] },
  { name: 'Database', keywords: ['database', 'data', 'storage', 'sql'] },
  { name: 'Server', keywords: ['server', 'backend', 'infrastructure'] },
  { name: 'Globe', keywords: ['globe', 'web', 'internet', 'world'] },
  { name: 'Cloud', keywords: ['cloud', 'deploy', 'hosting'] },
  { name: 'GitBranch', keywords: ['git', 'branch', 'version'] },
  { name: 'Blocks', keywords: ['blocks', 'components', 'build'] },
  // Creative
  { name: 'Palette', keywords: ['palette', 'design', 'art', 'color'] },
  { name: 'PenTool', keywords: ['pen', 'draw', 'design', 'illustrate'] },
  { name: 'Image', keywords: ['image', 'photo', 'picture'] },
  { name: 'Music', keywords: ['music', 'audio', 'sound'] },
  { name: 'Film', keywords: ['film', 'video', 'movie'] },
  { name: 'BookOpen', keywords: ['book', 'read', 'learn', 'knowledge'] },
  { name: 'GraduationCap', keywords: ['education', 'learn', 'teach', 'school'] },
  // Science / Analysis
  { name: 'FlaskConical', keywords: ['flask', 'science', 'experiment', 'lab'] },
  { name: 'Microscope', keywords: ['microscope', 'research', 'science'] },
  { name: 'BarChart3', keywords: ['chart', 'analytics', 'data', 'stats'] },
  { name: 'LineChart', keywords: ['chart', 'trend', 'graph'] },
  { name: 'Calculator', keywords: ['calculator', 'math', 'numbers'] },
  // Communication
  { name: 'MessageCircle', keywords: ['message', 'chat', 'conversation'] },
  { name: 'Mail', keywords: ['mail', 'email', 'message'] },
  { name: 'Megaphone', keywords: ['megaphone', 'announce', 'marketing'] },
  { name: 'Languages', keywords: ['language', 'translate', 'i18n'] },
  // Tools / Utility
  { name: 'Wrench', keywords: ['wrench', 'tool', 'fix', 'repair'] },
  { name: 'Settings', keywords: ['settings', 'config', 'gear'] },
  { name: 'Shield', keywords: ['shield', 'security', 'protect'] },
  { name: 'Lock', keywords: ['lock', 'security', 'private'] },
  { name: 'Search', keywords: ['search', 'find', 'lookup'] },
  { name: 'FileText', keywords: ['file', 'document', 'text', 'write'] },
  { name: 'ClipboardList', keywords: ['clipboard', 'list', 'tasks', 'todo'] },
  // Nature / Symbols
  { name: 'Zap', keywords: ['zap', 'lightning', 'fast', 'power', 'energy'] },
  { name: 'Flame', keywords: ['flame', 'fire', 'hot'] },
  { name: 'Star', keywords: ['star', 'favorite', 'important'] },
  { name: 'Heart', keywords: ['heart', 'love', 'health'] },
  { name: 'Target', keywords: ['target', 'goal', 'focus', 'aim'] },
  { name: 'Rocket', keywords: ['rocket', 'launch', 'fast', 'startup'] },
  { name: 'Compass', keywords: ['compass', 'navigate', 'direction', 'explore'] },
  { name: 'Lightbulb', keywords: ['lightbulb', 'idea', 'insight'] },
  { name: 'Trophy', keywords: ['trophy', 'win', 'achievement'] },
  { name: 'Puzzle', keywords: ['puzzle', 'solve', 'problem'] },
];

function getIconComponent(name: string): icons.LucideIcon | null {
  return (icons as unknown as Record<string, icons.LucideIcon>)[name] || null;
}

interface IconPickerProps {
  value: string; // icon name like "Bot"
  onChange: (iconName: string) => void;
}

export default function IconPicker({ value, onChange }: IconPickerProps) {
  const t = useTranslations('iconPicker');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return ICON_ENTRIES;
    const q = search.toLowerCase();
    return ICON_ENTRIES.filter(
      (e) => e.name.toLowerCase().includes(q) || e.keywords.some((k) => k.includes(q)),
    );
  }, [search]);

  const SelectedIcon = getIconComponent(value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(!open); setSearch(''); }}
        className="flex items-center gap-2 px-3 py-2 bg-surface-1 border border-border-default rounded-lg hover:border-border-focus transition-colors cursor-pointer"
      >
        <div className="w-6 h-6 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center">
          {SelectedIcon ? <SelectedIcon size={14} className="text-accent" /> : <icons.Bot size={14} className="text-accent" />}
        </div>
        <span className="text-xs text-text-secondary">{value || 'Bot'}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-72 bg-surface-0 border border-border-default rounded-lg shadow-2xl shadow-black/40 z-50 overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border-default">
            <Search size={12} className="text-text-tertiary shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-text-tertiary hover:text-text-secondary cursor-pointer">
                <X size={10} />
              </button>
            )}
          </div>

          {/* Icon grid */}
          <div className="p-2 max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-4 text-center text-[11px] text-text-tertiary">{t('noIconsFound')}</div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {filtered.map((entry) => {
                  const Icon = getIconComponent(entry.name);
                  if (!Icon) return null;
                  const isActive = value === entry.name;
                  return (
                    <button
                      key={entry.name}
                      onClick={() => { onChange(entry.name); setOpen(false); }}
                      title={entry.name}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-accent/15 border border-accent/30 text-accent'
                          : 'border border-transparent text-text-secondary hover:bg-surface-1 hover:text-text-primary'
                      }`}
                    >
                      <Icon size={15} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
