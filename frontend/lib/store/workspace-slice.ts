import type { StateCreator } from 'zustand';
import type { StoreState, ConfirmState } from './types';
import type { Project } from '../types';
import { emptyConfirm } from './types';

export interface WorkspaceSlice {
  rightPanelTab: 'terminal' | 'files' | 'preview' | 'artifacts' | 'tree' | 'sources' | 'memory';
  rightPanelOpen: boolean;
  previewUrl: string | null;
  diffView: { columns: { label: string; content: string }[] } | null;
  commandPaletteOpen: boolean;
  confirmDialog: ConfirmState;
  projects: Project[];
  activeProjectId: string | null;
  searchPanelOpen: boolean;
  shortcutsOpen: boolean;
  bugReportOpen: boolean;
  lightboxUrl: string | null;
  setRightPanelTab: (tab: WorkspaceSlice['rightPanelTab']) => void;
  setRightPanelOpen: (open: boolean) => void;
  setPreviewUrl: (url: string | null) => void;
  setDiffView: (diff: WorkspaceSlice['diffView']) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setProjects: (projects: Project[]) => void;
  setActiveProjectId: (id: string | null) => void;
  setSearchPanelOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setBugReportOpen: (open: boolean) => void;
  setLightboxUrl: (url: string | null) => void;
  showConfirm: (opts: { title: string; message?: string; confirmLabel?: string; variant?: 'danger' | 'default' }) => Promise<boolean>;
  resolveConfirm: (confirmed: boolean) => void;
}

export const createWorkspaceSlice: StateCreator<StoreState, [], [], WorkspaceSlice> = (set, get) => ({
  rightPanelTab: 'terminal',
  rightPanelOpen: false,
  previewUrl: null,
  diffView: null,
  commandPaletteOpen: false,
  confirmDialog: { ...emptyConfirm },
  projects: [],
  activeProjectId: null,
  searchPanelOpen: false,
  shortcutsOpen: false,
  bugReportOpen: false,
  lightboxUrl: null,
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setPreviewUrl: (url) => set({ previewUrl: url }),
  setDiffView: (diff) => set({ diffView: diff }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setProjects: (projects) => set({ projects }),
  setActiveProjectId: (id) => {
    set({ activeProjectId: id });
    try {
      if (id) localStorage.setItem('nexus:activeProjectId', id);
      else localStorage.removeItem('nexus:activeProjectId');
    } catch {}
  },
  setSearchPanelOpen: (open) => set({ searchPanelOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  setBugReportOpen: (open) => set({ bugReportOpen: open }),
  setLightboxUrl: (url) => set({ lightboxUrl: url }),
  showConfirm: (opts) =>
    new Promise<boolean>((resolve) => {
      set({
        confirmDialog: {
          open: true,
          title: opts.title,
          message: opts.message,
          confirmLabel: opts.confirmLabel,
          variant: opts.variant,
          resolve,
        },
      });
    }),
  resolveConfirm: (confirmed) => {
    const { confirmDialog } = get();
    if (confirmDialog.resolve) confirmDialog.resolve(confirmed);
    set({ confirmDialog: { ...emptyConfirm } });
  },
});
