// ============================================================
// Keyboard Shortcut Registry
// ============================================================

export type ShortcutHandler = () => void;

interface ShortcutEntry {
  key: string;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  handler: ShortcutHandler;
  description?: string;
}

const shortcuts: Map<string, ShortcutEntry> = new Map();

function makeKey(key: string, meta: boolean, shift: boolean, alt: boolean): string {
  const parts: string[] = [];
  if (meta) parts.push('meta');
  if (shift) parts.push('shift');
  if (alt) parts.push('alt');
  parts.push(key.toLowerCase());
  return parts.join('+');
}

export interface ShortcutModifiers {
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export function registerShortcut(
  key: string,
  modifiers: ShortcutModifiers,
  handler: ShortcutHandler,
  description?: string
): () => void {
  const id = makeKey(key, !!modifiers.meta, !!modifiers.shift, !!modifiers.alt);
  shortcuts.set(id, {
    key: key.toLowerCase(),
    meta: !!modifiers.meta,
    shift: !!modifiers.shift,
    alt: !!modifiers.alt,
    handler,
    description,
  });
  return () => {
    shortcuts.delete(id);
  };
}

export function unregisterShortcut(key: string, modifiers: ShortcutModifiers): void {
  const id = makeKey(key, !!modifiers.meta, !!modifiers.shift, !!modifiers.alt);
  shortcuts.delete(id);
}

export function getRegisteredShortcuts(): { key: string; modifiers: ShortcutModifiers; description?: string }[] {
  return Array.from(shortcuts.values()).map((s) => ({
    key: s.key,
    modifiers: { meta: s.meta, shift: s.shift, alt: s.alt },
    description: s.description,
  }));
}

// Global keydown listener
function handleKeyDown(e: KeyboardEvent): void {
  const meta = e.metaKey || e.ctrlKey;
  const id = makeKey(e.key, meta, e.shiftKey, e.altKey);

  const entry = shortcuts.get(id);
  if (entry) {
    e.preventDefault();
    e.stopPropagation();
    entry.handler();
  }
}

let initialized = false;

export function initShortcuts(): void {
  if (initialized) return;
  initialized = true;
  document.addEventListener('keydown', handleKeyDown, true);
}

// Pre-register default shortcuts (call from main.ts after views are ready)
export function registerDefaultShortcuts(handlers: {
  openCommandPalette: ShortcutHandler;
  newConversation: ShortcutHandler;
  search: ShortcutHandler;
  switchToChat: ShortcutHandler;
  switchToCode: ShortcutHandler;
  switchToArchitect: ShortcutHandler;
  closeOverlay: ShortcutHandler;
  sendMessage: ShortcutHandler;
  snapshot: ShortcutHandler;
}): void {
  registerShortcut('k', { meta: true }, handlers.openCommandPalette, 'Command Palette');
  registerShortcut('n', { meta: true }, handlers.newConversation, 'New Conversation');
  registerShortcut('f', { meta: true, shift: true }, handlers.search, 'Search Conversations');
  registerShortcut('1', { meta: true }, handlers.switchToChat, 'Switch to Chat');
  registerShortcut('2', { meta: true }, handlers.switchToCode, 'Switch to Code');
  registerShortcut('3', { meta: true }, handlers.switchToArchitect, 'Switch to Architect');
  registerShortcut('Escape', {}, handlers.closeOverlay, 'Close');
  registerShortcut('Enter', { meta: true }, handlers.sendMessage, 'Send Message');
  registerShortcut('s', { meta: true, shift: true }, handlers.snapshot, 'Snapshot Sandbox');
}
