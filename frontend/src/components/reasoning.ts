// ============================================================
// Reasoning Trace Component
// ============================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderReasoningTrace(content: string, tokenCount?: number): HTMLElement {
  const container = document.createElement('div');
  container.className = 'reasoning-trace';

  const tokens = tokenCount ? `${tokenCount.toLocaleString()} tokens` : '';

  container.innerHTML = `
    <div class="reasoning-trace__header" data-action="toggle-reasoning">
      <span class="reasoning-trace__label">Reasoning</span>
      <span class="reasoning-trace__tokens">${tokens}</span>
      <span class="reasoning-trace__toggle">&#9654;</span>
    </div>
    <div class="reasoning-trace__content">${escapeHtml(content)}</div>
  `;

  const header = container.querySelector('.reasoning-trace__header');
  header?.addEventListener('click', () => {
    container.classList.toggle('open');
  });

  return container;
}
