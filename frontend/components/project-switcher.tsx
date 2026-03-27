'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import type { Project } from '@/lib/types';
import { toast } from './toast';
import { ChevronDown, FolderOpen, Plus, Inbox, Settings, Archive } from 'lucide-react';

export default function ProjectSwitcher() {
  const t = useTranslations('projectSwitcher');
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const setProjects = useStore((s) => s.setProjects);
  const setActiveProjectId = useStore((s) => s.setActiveProjectId);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  // Load projects on mount
  useEffect(() => {
    (async () => {
      try {
        const ps = await api.listProjects();
        setProjects(ps);
      } catch {
        // Silently fail — projects are optional
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus input when creating
  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const project = await api.createProject({ name: trimmed });
      setProjects([project, ...projects]);
      setActiveProjectId(project.id);
      setNewName('');
      setCreating(false);
      setOpen(false);
      toast.success(t('createdToast', { name: trimmed }));
    } catch {
      toast.error(t('createError'));
    }
  };

  const handleSelect = (id: string | null) => {
    setActiveProjectId(id);
    setOpen(false);
  };

  const projectColor = (p: Project) => p.color || '#6366f1';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-[11px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-1 rounded-lg transition-colors cursor-pointer"
      >
        {activeProject ? (
          <>
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: projectColor(activeProject) }}
            />
            <span className="truncate flex-1 text-left">{activeProject.name}</span>
          </>
        ) : (
          <>
            <Inbox size={12} className="text-text-tertiary shrink-0" />
            <span className="truncate flex-1 text-left">{t('allConversations')}</span>
          </>
        )}
        <ChevronDown size={11} className={`text-text-tertiary transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-surface-0 border border-border-default rounded-lg shadow-xl shadow-black/20 z-50 overflow-hidden animate-fade-in-up" style={{ animationDuration: '0.1s' }}>
          {/* All Conversations */}
          <button
            onClick={() => handleSelect(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-colors ${
              !activeProjectId ? 'bg-accent/8 text-text-primary' : 'text-text-secondary hover:bg-surface-1'
            }`}
          >
            <Inbox size={12} className="text-text-tertiary shrink-0" />
            <span className="flex-1 text-left">{t('allConversations')}</span>
          </button>

          {/* Divider */}
          {projects.length > 0 && <div className="border-t border-border-default" />}

          {/* Projects */}
          <div className="max-h-48 overflow-y-auto">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelect(p.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-colors ${
                  activeProjectId === p.id ? 'bg-accent/8 text-text-primary' : 'text-text-secondary hover:bg-surface-1'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: projectColor(p) }}
                />
                <span className="flex-1 text-left truncate">{p.name}</span>
                {p.conversation_count != null && p.conversation_count > 0 && (
                  <span className="text-[10px] text-text-tertiary font-mono">{p.conversation_count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-border-default" />

          {/* New Project */}
          {creating ? (
            <div className="px-3 py-2">
              <input
                ref={inputRef}
                type="text"
                placeholder={t('placeholder')}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') { setCreating(false); setNewName(''); }
                }}
                className="w-full bg-surface-1 border border-border-default rounded px-2 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/50"
              />
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-tertiary hover:text-accent hover:bg-surface-1 cursor-pointer transition-colors"
            >
              <Plus size={12} className="shrink-0" />
              <span>{t('newProject')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
