import catalog from './landing-prompts.json';
import type { ModelOption, ModelProvider } from './types';

export type LandingPromptEndpoint = 'messages' | 'images';
export type LandingPromptComposeMode = 'chat' | 'image';
export type LandingPromptActionType = 'pending_prompt' | 'compare' | 'image';

export interface LandingPromptCatalogEntry {
  id: string;
  label: string;
  icon: string;
  prompt: string;
  endpoint: LandingPromptEndpoint;
  compose_mode: LandingPromptComposeMode;
  action_type?: LandingPromptActionType;
  compare_model_providers?: ModelProvider[];
  default_compare_models?: string[];
  test_type?: string;
  test_document_content?: string;
  test_document_filename?: string;
  test_expected_facts?: string[];
  test_followup_prompt?: string;
  expected_behaviors: string[];
  required_evidence: string[];
  judge_instructions: string;
}

export const LANDING_PROMPTS = catalog as LandingPromptCatalogEntry[];

export function resolveCompareModels(
  prompt: LandingPromptCatalogEntry,
  models: ModelOption[],
): string[] {
  if (prompt.action_type !== 'compare') return [];

  const nonLegacy = models.filter((model) => !model.legacy);
  const providers = prompt.compare_model_providers || [];
  const selected = providers
    .map((provider) => nonLegacy.find((model) => model.provider === provider))
    .filter((model): model is ModelOption => Boolean(model));

  if (selected.length >= 2) {
    return selected.slice(0, 2).map((model) => model.id);
  }

  if (prompt.default_compare_models && prompt.default_compare_models.length >= 2) {
    return prompt.default_compare_models.slice(0, 2);
  }

  return nonLegacy.slice(0, 2).map((model) => model.id);
}
