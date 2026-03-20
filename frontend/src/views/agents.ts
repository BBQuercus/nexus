// ============================================================
// Agents / Persona Browser + Editor View
// ============================================================

import type { AgentPersona } from '../state';
import { getState, setState } from '../state';
import * as api from '../services/api';
import { navigateTo } from '../router';

const EMOJI_OPTIONS = [
  '\uD83E\uDD16', '\uD83E\uDDD1\u200D\uD83D\uDCBB', '\uD83D\uDC68\u200D\uD83D\uDD2C',
  '\uD83D\uDC69\u200D\uD83C\uDFA8', '\u2699\uFE0F', '\uD83D\uDCDA', '\uD83D\uDE80',
  '\uD83E\uDDE0', '\uD83D\uDD2E', '\uD83C\uDFAF', '\uD83D\uDCA1', '\uD83D\uDD25',
  '\uD83C\uDF1F', '\u26A1', '\uD83E\uDDD9', '\uD83D\uDC7E',
];

let agents: AgentPersona[] = [];
let selectedAgent: AgentPersona | null = null;
let editorOpen = false;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function renderAgentsView(container: HTMLElement): Promise<void> {
  container.innerHTML = '';

  // Top bar (simplified for agents view)
  const topBar = document.createElement('div');
  topBar.className = 'top-bar';
  topBar.innerHTML = `
    <div class="top-bar__brand" id="agents-brand">NEXUS<span class="top-bar__brand-dot">.</span></div>
    <div class="top-bar__spacer"></div>
    <button class="cmd-trigger" id="agents-back">\u2190 Workspace</button>
  `;
  container.appendChild(topBar);

  topBar.querySelector('#agents-brand')?.addEventListener('click', () => {
    navigateTo('/');
  });
  topBar.querySelector('#agents-back')?.addEventListener('click', () => {
    navigateTo('/');
  });

  // Main content
  const main = document.createElement('div');
  main.style.cssText = 'display: flex; flex-direction: column; height: calc(100vh - var(--top-bar-height));';

  const view = document.createElement('div');
  view.className = 'agents-view editor-closed';
  view.id = 'agents-view';
  main.appendChild(view);
  container.appendChild(main);

  // Load agents
  try {
    agents = await api.listAgents();
  } catch {
    agents = [];
  }

  renderAgentsGrid(view);
}

function renderAgentsGrid(view: HTMLElement): void {
  view.innerHTML = '';

  // Grid
  const grid = document.createElement('div');
  grid.className = 'agents-grid';

  // Header
  const header = document.createElement('div');
  header.className = 'agents-grid__header';
  header.innerHTML = `
    <span class="agents-grid__title">Agent Personas</span>
    <button class="agents-grid__new-btn" id="new-agent-btn">+ New Persona</button>
  `;
  grid.appendChild(header);

  // Cards
  for (const agent of agents) {
    const card = document.createElement('div');
    card.className = `persona-card${selectedAgent?.id === agent.id ? ' selected' : ''}`;
    card.dataset.agentId = agent.id;

    card.innerHTML = `
      <div class="persona-card__icon">${agent.icon || '\uD83E\uDD16'}</div>
      <div class="persona-card__name">${escapeHtml(agent.name)}</div>
      <div class="persona-card__description">${escapeHtml(agent.description || '')}</div>
      <div class="persona-card__meta">
        <span>${agent.defaultModel || 'Default model'}</span>
        <span>${agent.isPublic ? 'Public' : 'Private'}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      selectedAgent = agent;
      editorOpen = true;
      view.classList.remove('editor-closed');
      renderAgentsGrid(view);
    });

    grid.appendChild(card);
  }

  view.appendChild(grid);

  // Editor
  if (editorOpen && selectedAgent) {
    const editor = renderEditor(selectedAgent, view);
    view.appendChild(editor);
  }

  // New agent button
  grid.querySelector('#new-agent-btn')?.addEventListener('click', () => {
    selectedAgent = {
      id: '',
      name: '',
      icon: '\uD83E\uDD16',
      description: '',
      systemPrompt: '',
      defaultModel: 'azure_ai/claude-sonnet-4-5-swc',
      defaultMode: 'chat',
      isPublic: false,
    };
    editorOpen = true;
    view.classList.remove('editor-closed');
    renderAgentsGrid(view);
  });
}

function renderEditor(agent: AgentPersona, view: HTMLElement): HTMLElement {
  const editor = document.createElement('div');
  editor.className = 'agent-editor';

  let editState = { ...agent };

  editor.innerHTML = `
    <div class="agent-editor__header">
      <span class="agent-editor__title">${agent.id ? 'Edit Persona' : 'New Persona'}</span>
      <button class="agent-editor__close" id="close-editor">\u2715</button>
    </div>

    <div class="agent-editor__field">
      <label class="agent-editor__label">Icon</label>
      <div class="agent-editor__icon-picker" id="icon-picker">
        ${EMOJI_OPTIONS.map((e) => `<button class="agent-editor__icon-option${e === editState.icon ? ' selected' : ''}" data-icon="${e}">${e}</button>`).join('')}
      </div>
    </div>

    <div class="agent-editor__field">
      <label class="agent-editor__label">Name</label>
      <input class="agent-editor__input" id="agent-name" value="${escapeHtml(editState.name)}" placeholder="Persona name" />
    </div>

    <div class="agent-editor__field">
      <label class="agent-editor__label">Description</label>
      <input class="agent-editor__input" id="agent-description" value="${escapeHtml(editState.description || '')}" placeholder="Brief description" />
    </div>

    <div class="agent-editor__field">
      <label class="agent-editor__label">System Prompt</label>
      <textarea class="agent-editor__textarea" id="agent-prompt" placeholder="Instructions for the AI...">${escapeHtml(editState.systemPrompt || '')}</textarea>
    </div>

    <div class="agent-editor__field">
      <label class="agent-editor__label">Default Model</label>
      <select class="agent-editor__input" id="agent-model">
        <option value="azure_ai/claude-sonnet-4-5-swc" ${editState.defaultModel === 'azure_ai/claude-sonnet-4-5-swc' ? 'selected' : ''}>Claude Sonnet 4.5</option>
        <option value="azure_ai/claude-opus-4-5-swc" ${editState.defaultModel === 'azure_ai/claude-opus-4-5-swc' ? 'selected' : ''}>Claude Opus 4.5</option>
        <option value="gpt-5-gwc" ${editState.defaultModel === 'gpt-5-gwc' ? 'selected' : ''}>GPT-5</option>
        <option value="gpt-5-mini-gwc" ${editState.defaultModel === 'gpt-5-mini-gwc' ? 'selected' : ''}>GPT-5 Mini</option>
        <option value="gpt-4.1-chn" ${editState.defaultModel === 'gpt-4.1-chn' ? 'selected' : ''}>GPT-4.1</option>
        <option value="gpt-4o-swc" ${editState.defaultModel === 'gpt-4o-swc' ? 'selected' : ''}>GPT-4o</option>
        <option value="Llama-3.3-70B-Instruct" ${editState.defaultModel === 'Llama-3.3-70B-Instruct' ? 'selected' : ''}>Llama 3.3 70B</option>
      </select>
    </div>

    <div class="agent-editor__field">
      <label class="agent-editor__label">Default Mode</label>
      <select class="agent-editor__input" id="agent-mode">
        <option value="chat" ${editState.defaultMode === 'chat' ? 'selected' : ''}>Chat</option>
        <option value="code" ${editState.defaultMode === 'code' ? 'selected' : ''}>Code</option>
        <option value="architect" ${editState.defaultMode === 'architect' ? 'selected' : ''}>Architect</option>
      </select>
    </div>

    <div class="agent-editor__field">
      <div class="agent-editor__toggle-row">
        <label class="agent-editor__label">Public</label>
        <button class="agent-editor__toggle${editState.isPublic ? ' active' : ''}" id="agent-public"></button>
      </div>
    </div>

    <div class="agent-editor__actions">
      <button class="agent-editor__save-btn" id="save-agent">Save</button>
      ${agent.id ? '<button class="agent-editor__try-btn" id="try-agent">Try</button>' : ''}
      ${agent.id ? '<button class="agent-editor__delete-btn" id="delete-agent">Delete</button>' : ''}
    </div>
  `;

  // Icon picker
  editor.querySelectorAll('[data-icon]').forEach((el) => {
    el.addEventListener('click', () => {
      editState.icon = (el as HTMLElement).dataset.icon || '';
      editor.querySelectorAll('.agent-editor__icon-option').forEach((o) => o.classList.remove('selected'));
      el.classList.add('selected');
    });
  });

  // Public toggle
  editor.querySelector('#agent-public')?.addEventListener('click', () => {
    editState.isPublic = !editState.isPublic;
    editor.querySelector('#agent-public')?.classList.toggle('active', editState.isPublic);
  });

  // Close
  editor.querySelector('#close-editor')?.addEventListener('click', () => {
    editorOpen = false;
    selectedAgent = null;
    view.classList.add('editor-closed');
    renderAgentsGrid(view);
  });

  // Save
  editor.querySelector('#save-agent')?.addEventListener('click', async () => {
    const name = (editor.querySelector('#agent-name') as HTMLInputElement).value.trim();
    const description = (editor.querySelector('#agent-description') as HTMLInputElement).value.trim();
    const systemPrompt = (editor.querySelector('#agent-prompt') as HTMLTextAreaElement).value;
    const defaultModel = (editor.querySelector('#agent-model') as HTMLSelectElement).value;
    const defaultMode = (editor.querySelector('#agent-mode') as HTMLSelectElement).value as 'chat' | 'code' | 'architect';

    if (!name) return;

    const data: Partial<AgentPersona> = {
      name,
      icon: editState.icon,
      description,
      systemPrompt,
      defaultModel,
      defaultMode,
      isPublic: editState.isPublic,
    };

    try {
      if (agent.id) {
        await api.updateAgent(agent.id, data);
      } else {
        await api.createAgent(data);
      }
      agents = await api.listAgents();
      editorOpen = false;
      selectedAgent = null;
      view.classList.add('editor-closed');
      renderAgentsGrid(view);
    } catch (e) {
      console.error('Failed to save agent:', e);
    }
  });

  // Delete
  editor.querySelector('#delete-agent')?.addEventListener('click', async () => {
    if (!agent.id) return;
    if (!confirm(`Delete "${agent.name}"?`)) return;

    try {
      await api.deleteAgent(agent.id);
      agents = await api.listAgents();
      editorOpen = false;
      selectedAgent = null;
      view.classList.add('editor-closed');
      renderAgentsGrid(view);
    } catch (e) {
      console.error('Failed to delete agent:', e);
    }
  });

  // Try
  editor.querySelector('#try-agent')?.addEventListener('click', () => {
    setState({
      activePersona: agent,
      activeModel: agent.defaultModel || getState().activeModel,
      activeMode: agent.defaultMode || getState().activeMode,
    });
    navigateTo('/');
  });

  return editor;
}
