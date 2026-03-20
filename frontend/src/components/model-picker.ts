// ============================================================
// Model Picker Component
// ============================================================

export interface ModelOption {
  name: string;
  id: string;
}

export const MODELS: ModelOption[] = [
  { name: 'Claude Sonnet 4.5', id: 'azure_ai/claude-sonnet-4-5-swc' },
  { name: 'Claude Opus 4.5', id: 'azure_ai/claude-opus-4-5-swc' },
  { name: 'GPT-5', id: 'gpt-5-gwc' },
  { name: 'GPT-5 Mini', id: 'gpt-5-mini-gwc' },
  { name: 'GPT-4.1', id: 'gpt-4.1-chn' },
  { name: 'GPT-4o', id: 'gpt-4o-swc' },
  { name: 'Llama 3.3 70B', id: 'Llama-3.3-70B-Instruct' },
];

export function renderModelPicker(
  currentModel: string,
  onChange: (modelId: string) => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'model-picker';

  const current = MODELS.find((m) => m.id === currentModel);
  const displayName = current?.name || currentModel.split('/').pop() || currentModel;

  const trigger = document.createElement('button');
  trigger.className = 'model-picker__trigger';
  trigger.textContent = displayName;

  const dropdown = document.createElement('div');
  dropdown.className = 'model-picker__dropdown';

  for (const model of MODELS) {
    const option = document.createElement('button');
    option.className = `model-picker__option${model.id === currentModel ? ' active' : ''}`;
    option.innerHTML = `
      <span class="model-picker__option-name">${escapeHtml(model.name)}</span>
      <span class="model-picker__option-id">${escapeHtml(model.id)}</span>
    `;

    option.addEventListener('click', () => {
      dropdown.classList.remove('open');
      onChange(model.id);

      // Update trigger text
      trigger.textContent = model.name;

      // Update active state
      dropdown.querySelectorAll('.model-picker__option').forEach((el) => {
        el.classList.toggle('active', el === option);
      });
    });

    dropdown.appendChild(option);
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  // Close on outside click
  document.addEventListener('click', () => {
    dropdown.classList.remove('open');
  });

  container.appendChild(trigger);
  container.appendChild(dropdown);

  return container;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
