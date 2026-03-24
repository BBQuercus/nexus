'use client';

import ModelPicker from '../model-picker';
import type { ComposeMode } from './types';

interface ModelPickerTriggerProps {
  composeMode: ComposeMode;
}

export function ModelPickerTrigger({ composeMode }: ModelPickerTriggerProps) {
  return (
    <ModelPicker disabled={composeMode === 'image'} disabledReason="Locked while in image mode" />
  );
}
