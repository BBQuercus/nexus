'use client';

import { useTranslations } from 'next-intl';
import ModelPicker from '../model-picker';
import type { ComposeMode } from './types';

interface ModelPickerTriggerProps {
  composeMode: ComposeMode;
}

export function ModelPickerTrigger({ composeMode }: ModelPickerTriggerProps) {
  const t = useTranslations('chatInput');
  return (
    <ModelPicker disabled={composeMode === 'image'} disabledReason={t('lockedImageMode')} />
  );
}
