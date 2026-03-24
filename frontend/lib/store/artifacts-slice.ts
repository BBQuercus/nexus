import type { StateCreator } from 'zustand';
import type { StoreState } from './types';
import type { Artifact } from '../types';

export interface ArtifactsSlice {
  artifacts: Artifact[];
  setArtifacts: (artifacts: Artifact[]) => void;
}

export const createArtifactsSlice: StateCreator<StoreState, [], [], ArtifactsSlice> = (set) => ({
  artifacts: [],
  setArtifacts: (artifacts) => set({ artifacts }),
});
