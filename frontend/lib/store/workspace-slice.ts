import type { StateCreator } from 'zustand';
import type { StoreState, ConfirmState } from './types';
import { emptyConfirm } from './types';

export interface WorkspaceSlice {
  rightPanelTab: 'terminal' | 'files' | 'preview' | 'artifacts' | 'tree' | 'sources';
  rightPanelOpen: boolean;
  previewUrl: string | null;
  diffView: { columns: { label: string; content: string }[] } | null;
  commandPaletteOpen: boolean;
  confirmDialog: ConfirmState;
  setRightPanelTab: (tab: WorkspaceSlice['rightPanelTab']) => void;
  setRightPanelOpen: (open: boolean) => void;
  setPreviewUrl: (url: string | null) => void;
  setDiffView: (diff: WorkspaceSlice['diffView']) => void;
  setCommandPaletteOpen: (open: boolean) => void;
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
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setPreviewUrl: (url) => set({ previewUrl: url }),
  setDiffView: (diff) => set({ diffView: diff }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
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
