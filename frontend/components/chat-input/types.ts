import type { Message } from '@/lib/types';

export interface SlashCommand {
  name: string;
  description: string;
  icon: React.ReactNode;
  execute: (args: string) => void;
  hint?: string;
}

export interface AttachedContext {
  id: string;
  title: string;
}

export type ComposeMode = 'chat' | 'image';

export const RESPONSE_COUNTS = [1, 3, 5] as const;
export const CONTEXT_WINDOW = 128_000;

// ── Utility functions ──

export function getDraftKey(conversationId: string | null): string {
  return conversationId ? `nexus:draft:${conversationId}` : 'nexus:draft:__global__';
}

export function loadDraft(conversationId: string | null): string {
  try {
    return localStorage.getItem(getDraftKey(conversationId)) || '';
  } catch {
    return '';
  }
}

export function saveDraft(conversationId: string | null, content: string) {
  try {
    const key = getDraftKey(conversationId);
    if (content) localStorage.setItem(key, content);
    else localStorage.removeItem(key);
  } catch {}
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileCategory(file: File): 'image' | 'spreadsheet' | 'pdf' | 'other' {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext) || file.type.includes('spreadsheet') || file.type === 'text/csv') return 'spreadsheet';
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
  return 'other';
}

export function getFileTypeBadge(file: File): string {
  const ext = file.name.split('.').pop()?.toUpperCase() || '';
  const cat = getFileCategory(file);
  if (cat === 'image') return ext || 'IMAGE';
  if (cat === 'spreadsheet') return ext || 'SHEET';
  if (cat === 'pdf') return 'PDF';
  return ext || 'FILE';
}

// ── Token indicator props ──

export interface TokenIndicatorProps {
  messages: Message[];
}
