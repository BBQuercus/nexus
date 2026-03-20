// ============================================================
// Chat Component Helpers
// ============================================================

import type { Message, CostData, ToolCall } from '../state';
// Using 'any' for SSE event types since backend sends snake_case
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEvent = Record<string, any>;
import { renderMarkdown, postProcessMermaid } from './markdown';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderMessage(message: Message): HTMLElement {
  const div = document.createElement('div');
  div.className = `message message--${message.role}`;
  div.dataset.messageId = message.id;

  const content = document.createElement('div');
  content.className = 'message__content';

  if (message.role === 'user') {
    content.innerHTML = `<p>${escapeHtml(message.content)}</p>`;
  } else {
    // Render reasoning trace if present
    let html = '';
    if (message.reasoning) {
      html += renderReasoningTrace(message.reasoning, message.reasoningTokens);
    }

    // Render tool calls (execution blocks)
    if (message.toolCalls && message.toolCalls.length > 0) {
      for (const tool of message.toolCalls) {
        html += renderExecBlockFromTool(tool);
      }
    }

    // Render main content
    if (message.content) {
      html += renderMarkdown(message.content);
    }

    // Cost badge
    if (message.cost) {
      html += renderCostBadge(message.cost);
    }

    content.innerHTML = html;

    // Post-process mermaid diagrams
    setTimeout(() => postProcessMermaid(content), 0);
  }

  div.appendChild(content);

  // Message actions (for assistant messages)
  if (message.role === 'assistant') {
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = `
      <button class="message-actions__btn" data-action="copy" title="Copy">Copy</button>
      <button class="message-actions__btn" data-action="fork" title="Fork">Fork</button>
      <button class="message-actions__btn" data-action="regenerate" title="Regenerate">Regen</button>
    `;
    div.appendChild(actions);
  }

  if (message.role === 'user') {
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = `
      <button class="message-actions__btn" data-action="edit" title="Edit">Edit</button>
      <button class="message-actions__btn" data-action="copy" title="Copy">Copy</button>
    `;
    div.appendChild(actions);
  }

  return div;
}

function renderExecBlockFromTool(tool: ToolCall): string {
  const lang = tool.language || tool.name || 'code';
  const isRunning = tool.isRunning;
  const runningClass = isRunning ? ' exec-block--running' : '';

  let html = `<div class="exec-block${runningClass}" data-tool-id="${tool.id}">`;
  html += `<div class="exec-block__header">`;
  html += `<span class="exec-block__lang">${escapeHtml(lang)}</span>`;
  html += `<button class="exec-block__toggle" data-action="toggle-exec">Expand</button>`;
  html += `</div>`;

  if (tool.code) {
    html += `<div class="exec-block__code collapsed"><pre><code>${escapeHtml(tool.code)}</code></pre></div>`;
  }

  if (tool.output) {
    html += `<div class="exec-block__output exec-block__output--stdout">${escapeHtml(tool.output)}</div>`;
  }

  if (tool.stderr) {
    html += `<div class="exec-block__output exec-block__output--stderr">${escapeHtml(tool.stderr)}</div>`;
  }

  if (!isRunning && tool.exitCode !== undefined) {
    const exitClass = tool.exitCode === 0 ? '' : ' error';
    html += `<div class="exec-block__footer">`;
    html += `<span class="exec-block__exit-code${exitClass}">exit ${tool.exitCode}</span>`;
    if (tool.duration !== undefined) {
      html += `<span class="exec-block__duration">${(tool.duration / 1000).toFixed(2)}s</span>`;
    }
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

export function renderExecBlock(toolStart: AnyEvent, outputs: string[], toolEnd?: AnyEvent): string {
  const lang = toolStart.language || toolStart.name || 'code';
  const isRunning = !toolEnd;
  const runningClass = isRunning ? ' exec-block--running' : '';

  let html = `<div class="exec-block${runningClass}" data-tool-id="${toolStart.toolCallId}">`;
  html += `<div class="exec-block__header">`;
  html += `<span class="exec-block__lang">${escapeHtml(lang)}</span>`;
  html += `<button class="exec-block__toggle" data-action="toggle-exec">Expand</button>`;
  html += `</div>`;

  if (toolStart.code) {
    html += `<div class="exec-block__code collapsed"><pre><code>${escapeHtml(toolStart.code)}</code></pre></div>`;
  }

  if (outputs.length > 0) {
    html += `<div class="exec-block__output exec-block__output--stdout">${escapeHtml(outputs.join(''))}</div>`;
  }

  if (toolEnd) {
    const exitClass = toolEnd.exitCode === 0 ? '' : ' error';
    html += `<div class="exec-block__footer">`;
    html += `<span class="exec-block__exit-code${exitClass}">exit ${toolEnd.exitCode}</span>`;
    html += `<span class="exec-block__duration">${(toolEnd.duration / 1000).toFixed(2)}s</span>`;
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

export function renderImageEmbed(event: AnyEvent): string {
  return `<div class="image-embed">
    <img class="image-embed__img" src="${escapeHtml(event.url)}" alt="${escapeHtml(event.filename)}" data-action="lightbox" />
    <div class="image-embed__footer">
      <span>${escapeHtml(event.filename)} ${event.width ? `${event.width}x${event.height}` : ''} ${event.format}</span>
      <a class="image-embed__download" href="${escapeHtml(event.url)}" download="${escapeHtml(event.filename)}">Download</a>
    </div>
  </div>`;
}

export function renderPreviewEmbed(event: AnyEvent): string {
  return `<div class="preview-embed">
    <div class="preview-embed__bar">
      <span class="preview-embed__url">${escapeHtml(event.url)}</span>
      <a href="${escapeHtml(event.url)}" target="_blank" rel="noopener" style="font-size:0.7rem;color:var(--text-tertiary)">Open</a>
    </div>
    <iframe class="preview-embed__iframe" src="${escapeHtml(event.url)}" sandbox="allow-scripts allow-same-origin" loading="lazy"></iframe>
  </div>`;
}

export function renderSearchResults(event: AnyEvent): string {
  let html = `<div class="search-results">`;
  html += `<div class="search-results__header">Search: ${escapeHtml(event.query)}</div>`;
  for (const result of event.results) {
    html += `<a class="search-results__item" href="${escapeHtml(result.url)}" target="_blank" rel="noopener">
      <div class="search-results__title">${escapeHtml(result.title)}</div>
      <div class="search-results__snippet">${escapeHtml(result.snippet)}</div>
      <div class="search-results__url">${escapeHtml(result.url)}</div>
    </a>`;
  }
  html += `</div>`;
  return html;
}

export function renderDataTableHtml(event: AnyEvent): string {
  // Returns a placeholder; actual rendering with event listeners is done in workspace.ts
  return `<div class="data-table-placeholder" data-headers='${escapeHtml(JSON.stringify(event.headers))}' data-rows='${escapeHtml(JSON.stringify(event.rows))}' data-total="${event.totalRows}" data-source="${escapeHtml(event.source || '')}"></div>`;
}

export function renderMermaid(_source: string): string {
  // This is handled in markdown.ts via code block detection
  return '';
}

export function renderDiff(_oldContent: string, _newContent: string, _filename: string): string {
  // Diff rendering is handled by diff-viewer component directly
  return '';
}

export function renderReasoningTrace(content: string, tokenCount?: number): string {
  const tokens = tokenCount ? `${tokenCount} tokens` : '';
  return `<div class="reasoning-trace">
    <div class="reasoning-trace__header" data-action="toggle-reasoning">
      <span class="reasoning-trace__label">Reasoning</span>
      <span class="reasoning-trace__tokens">${tokens}</span>
      <span class="reasoning-trace__toggle">&#9654;</span>
    </div>
    <div class="reasoning-trace__content">${escapeHtml(content)}</div>
  </div>`;
}

export function renderCostBadge(data: CostData): string {
  const model = data.model.split('/').pop() || data.model;
  const totalTokens = data.inputTokens + data.outputTokens;

  // Always show model name
  const parts: string[] = [model];

  // Show tokens if available
  if (totalTokens > 0) {
    parts.push(`${totalTokens.toLocaleString()} tok`);
  }

  // Show cost if available
  if (data.totalCost > 0) {
    const cost = data.totalCost < 0.01 ? '<$0.01' : `$${data.totalCost.toFixed(3)}`;
    parts.push(cost);
  }

  // Show duration if available
  if (data.duration > 0) {
    parts.push(`${(data.duration / 1000).toFixed(1)}s`);
  }

  const inner = parts
    .map((p) => `<span class="cost-badge__item">${p}</span>`)
    .join('<span class="cost-badge__separator">/</span>');

  return `<div class="cost-badge">${inner}</div>`;
}

export function renderStepTracker(steps: { label: string; status: 'completed' | 'active' | 'pending'; duration?: number }[]): string {
  let html = `<div class="step-tracker">`;
  for (const step of steps) {
    const icon = step.status === 'completed' ? '&#10003;' : step.status === 'active' ? '&#9654;' : '&#9675;';
    const dur = step.duration ? `${(step.duration / 1000).toFixed(1)}s` : '';
    html += `<div class="step-tracker__item ${step.status}">
      <span class="step-tracker__icon">${icon}</span>
      <span class="step-tracker__label">${escapeHtml(step.label)}</span>
      <span class="step-tracker__duration">${dur}</span>
    </div>`;
  }
  html += `</div>`;
  return html;
}

// Live streaming helpers

export function createStreamingMessage(): HTMLElement {
  const div = document.createElement('div');
  div.className = 'message message--assistant';
  div.dataset.streaming = 'true';

  const content = document.createElement('div');
  content.className = 'message__content';
  content.innerHTML = '<span class="thinking-indicator">Thinking...</span><span class="streaming-cursor"></span>';
  div.appendChild(content);

  return div;
}

export function appendToStreamingMessage(el: HTMLElement, html: string): void {
  const content = el.querySelector('.message__content');
  if (!content) return;

  // Remove thinking indicator once content arrives
  const thinking = content.querySelector('.thinking-indicator');
  if (thinking) thinking.remove();

  // Set content
  content.innerHTML = html + '<span class="streaming-cursor"></span>';
}

export function finalizeStreamingMessage(el: HTMLElement): void {
  const cursor = el.querySelector('.streaming-cursor');
  cursor?.remove();
  el.removeAttribute('data-streaming');

  // Post-process mermaid
  const content = el.querySelector('.message__content');
  if (content) {
    postProcessMermaid(content as HTMLElement);
  }
}
