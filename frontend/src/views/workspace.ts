// ============================================================
// Workspace View — Main 3-Column Layout
// ============================================================

import { getState, setState, subscribe } from '../state';
import type { Conversation, Message } from '../state';
import * as api from '../services/api';
import { streamSSE } from '../services/sse';
import type { SSEEvent, ToolStartEvent, ToolOutputEvent, ToolEndEvent } from '../services/sse';
import {
  renderMessage,
  createStreamingMessage,
  appendToStreamingMessage,
  finalizeStreamingMessage,
  renderCostBadge,
  renderExecBlock,
  renderReasoningTrace,
  renderStepTracker,
} from '../components/chat';
import { renderMarkdown, initMarkdown, postProcessMermaid } from '../components/markdown';
import { renderModelPicker, MODELS } from '../components/model-picker';
import { renderSandboxBar } from '../components/sandbox-bar';
import { initTerminal, connectToSandbox, disposeTerminal, showTerminalPlaceholder } from '../components/terminal';
import { renderFileTree } from '../components/file-tree';
import { renderFileViewer } from '../components/file-viewer';
import { renderPreviewPanel } from '../components/preview';
import { renderArtifactsPanel } from '../components/artifacts';
import { openCommandPalette, closeCommandPalette, registerActions } from '../components/command-palette';
import { initUploadZone, renderFileChips, createFileInput } from '../components/upload';
import { renderImageEmbed, openLightbox } from '../components/image-embed';
import { renderDataTable } from '../components/data-table';
import { initShortcuts, registerDefaultShortcuts } from '../services/shortcuts';
import { logout } from '../auth';

let pendingFiles: File[] = [];
let messagesContainer: HTMLElement | null = null;
let inputTextarea: HTMLTextAreaElement | null = null;
let fileChipsContainer: HTMLElement | null = null;
let sidebarList: HTMLElement | null = null;
let rightPanelContent: HTMLElement | null = null;
let markdownRenderTimeout: ReturnType<typeof setTimeout> | null = null;
let streamingEl: HTMLElement | null = null;
let streamingContent = '';
let hiddenFileInput: HTMLInputElement | null = null;

// ── Render ─────────────────────────────────────────────────

export async function renderWorkspaceView(container: HTMLElement): Promise<void> {
  container.innerHTML = '';

  // Init markdown highlighter
  await initMarkdown();

  const layout = document.createElement('div');
  layout.className = 'app-layout';
  layout.innerHTML = `
    <!-- Top Bar -->
    <div class="top-bar" id="top-bar">
      <div class="top-bar__brand" id="brand">NEXUS<span class="top-bar__brand-dot">.</span></div>
      <div class="top-bar__section">
        <div class="mode-toggle" id="mode-toggle">
          <button class="mode-toggle__btn active" data-mode="chat">Chat</button>
          <button class="mode-toggle__btn" data-mode="code">Code</button>
          <button class="mode-toggle__btn" data-mode="architect">Architect</button>
        </div>
      </div>
      <div class="top-bar__spacer"></div>
      <div class="top-bar__section" id="sandbox-bar-slot"></div>
      <button class="cmd-trigger" id="cmd-trigger">\u2318K</button>
      <div class="user-avatar" id="user-avatar"></div>
    </div>

    <!-- Sidebar -->
    <div class="sidebar" id="sidebar">
      <div class="sidebar__header">
        <input class="sidebar__search" placeholder="Search conversations..." id="sidebar-search" />
        <button class="sidebar__new-btn" id="new-conv-btn">+</button>
      </div>
      <div class="sidebar__list" id="sidebar-list"></div>
    </div>

    <!-- Main Panel -->
    <div class="main-panel" id="main-panel">
      <div class="chat-messages" id="chat-messages"></div>
      <div class="empty-state" id="empty-state">
        <div class="empty-state__brand">NEXUS<span class="empty-state__brand-dot">.</span></div>
        <p class="empty-state__tagline">AI-powered workspace with sandboxed code execution</p>
        <div class="empty-state__templates">
          <button class="empty-state__template" data-template="python">Python</button>
          <button class="empty-state__template" data-template="node">Node.js</button>
          <button class="empty-state__template" data-template="data">Data Analysis</button>
          <button class="empty-state__template" data-template="web">Web App</button>
        </div>
        <div class="empty-state__starters">
          <button class="empty-state__starter" data-starter="Analyze this dataset and create visualizations">
            <span class="empty-state__starter-icon">\uD83D\uDCCA</span>
            Analyze a dataset and create visualizations
          </button>
          <button class="empty-state__starter" data-starter="Help me build a REST API with FastAPI">
            <span class="empty-state__starter-icon">\u26A1</span>
            Build a REST API with FastAPI
          </button>
          <button class="empty-state__starter" data-starter="Debug this code and explain what went wrong">
            <span class="empty-state__starter-icon">\uD83D\uDD0D</span>
            Debug code and explain the issue
          </button>
        </div>
      </div>
      <div class="chat-input" id="chat-input">
        <div class="chat-input__model-row" id="model-picker-slot"></div>
        <div class="chat-input__container" id="chat-input-container">
          <div class="chat-input__chips" id="file-chips"></div>
          <textarea class="chat-input__textarea" id="chat-textarea" placeholder="Message Nexus..." rows="1"></textarea>
          <div class="chat-input__actions">
            <button class="chat-input__action-btn" id="attach-btn" title="Attach files">\uD83D\uDCCE</button>
            <button class="chat-input__send" id="send-btn">\u2191</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Panel (hidden by default, shown when sandbox is active) -->
    <div class="right-panel" id="right-panel" style="display: none;">
      <div class="right-panel__tabs">
        <button class="right-panel__tab active" data-tab="terminal">Terminal</button>
        <button class="right-panel__tab" data-tab="files">Files</button>
        <button class="right-panel__tab" data-tab="preview">Preview</button>
        <button class="right-panel__tab" data-tab="artifacts">Artifacts</button>
      </div>
      <div class="right-panel__content" id="right-panel-content">
        <div class="right-panel__pane active" data-pane="terminal" id="terminal-pane">
          <div class="terminal-container" id="terminal-container"></div>
        </div>
        <div class="right-panel__pane" data-pane="files" id="files-pane"></div>
        <div class="right-panel__pane" data-pane="preview" id="preview-pane"></div>
        <div class="right-panel__pane" data-pane="artifacts" id="artifacts-pane"></div>
      </div>
    </div>
  `;

  container.appendChild(layout);

  // Cache DOM references
  messagesContainer = layout.querySelector('#chat-messages');
  inputTextarea = layout.querySelector('#chat-textarea');
  fileChipsContainer = layout.querySelector('#file-chips');
  sidebarList = layout.querySelector('#sidebar-list');
  rightPanelContent = layout.querySelector('#right-panel-content');

  // Initialize components
  initTopBar(layout);
  initSidebar(layout);
  initChatInput(layout);
  initRightPanel(layout);
  initKeyboardShortcuts();
  initCommandPaletteActions();

  // Load initial data
  await loadConversations();

  // Check if we should show empty state or load active conversation
  const state = getState();
  if (state.activeConversationId) {
    await loadConversation(state.activeConversationId);
  } else {
    showEmptyState();
  }

  // Subscribe to state changes
  subscribe(
    (s) => s.activeConversationId,
    async (id) => {
      // Skip loading during streaming — handleSend manages the UI directly
      if (getState().isStreaming) return;
      if (id) {
        await loadConversation(id);
      } else {
        showEmptyState();
      }
    }
  );

  subscribe(
    (s) => s.sandboxStatus,
    (status) => {
      refreshSandboxBar(layout);
      // Show/hide right panel based on sandbox status
      const rightPanel = layout.querySelector('#right-panel') as HTMLElement;
      if (rightPanel) {
        rightPanel.style.display = (status !== 'none') ? '' : 'none';
      }
    }
  );

  subscribe(
    (s) => s.rightPanelTab,
    (tab) => switchRightPanelTab(layout, tab)
  );

  subscribe(
    (s) => s.isStreaming,
    (streaming) => {
      const brand = layout.querySelector('.top-bar__brand');
      if (streaming) {
        brand?.classList.add('processing');
      } else {
        brand?.classList.remove('processing');
      }
    }
  );
}

// ── Top Bar ────────────────────────────────────────────────

function initTopBar(layout: HTMLElement): void {
  const state = getState();

  // Model picker
  const modelSlot = layout.querySelector('#model-picker-slot');
  if (modelSlot) {
    const picker = renderModelPicker(state.activeModel, (modelId) => {
      setState({ activeModel: modelId });
    });
    modelSlot.appendChild(picker);
  }

  // Mode toggle
  const modeToggle = layout.querySelector('#mode-toggle');
  modeToggle?.querySelectorAll('.mode-toggle__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.mode as 'chat' | 'code' | 'architect';
      setState({ activeMode: mode });
      modeToggle.querySelectorAll('.mode-toggle__btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Sandbox bar
  refreshSandboxBar(layout);

  // Command palette trigger
  layout.querySelector('#cmd-trigger')?.addEventListener('click', () => {
    openCommandPalette();
  });

  // User avatar
  const avatar = layout.querySelector('#user-avatar');
  if (avatar && state.user) {
    if (state.user.avatarUrl) {
      avatar.innerHTML = `<img src="${state.user.avatarUrl}" alt="" />`;
    } else {
      avatar.textContent = state.user.name?.charAt(0)?.toUpperCase() || 'U';
    }
    avatar.addEventListener('click', () => {
      if (confirm('Log out?')) {
        logout();
      }
    });
  }

  // Brand click = go to empty state
  layout.querySelector('#brand')?.addEventListener('click', () => {
    setState({ activeConversationId: null, messages: [] });
  });
}

function refreshSandboxBar(layout: HTMLElement): void {
  const state = getState();
  const slot = layout.querySelector('#sandbox-bar-slot');
  if (slot) {
    slot.innerHTML = '';
    slot.appendChild(renderSandboxBar(state.sandboxStatus, state.sandboxId));
  }
}

// ── Sidebar ────────────────────────────────────────────────

function initSidebar(layout: HTMLElement): void {
  const search = layout.querySelector('#sidebar-search') as HTMLInputElement;
  let searchTimeout: ReturnType<typeof setTimeout>;

  search?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      loadConversations(search.value || undefined);
    }, 300);
  });

  layout.querySelector('#new-conv-btn')?.addEventListener('click', () => {
    createNewConversation();
  });
}

async function loadConversations(search?: string): Promise<void> {
  try {
    const result = await api.listConversations(search);
    setState({ conversations: result.conversations });
    renderSidebarList();
  } catch (e) {
    console.error('Failed to load conversations:', e);
  }
}

function renderSidebarList(): void {
  if (!sidebarList) return;

  const state = getState();
  const conversations = state.conversations;

  if (conversations.length === 0) {
    sidebarList.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-tertiary); font-size: 0.85rem;">No conversations yet</div>`;
    return;
  }

  // Group by date
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; items: Conversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'This Week', items: [] },
    { label: 'Older', items: [] },
  ];

  for (const conv of conversations) {
    const date = new Date(conv.updatedAt || conv.createdAt);
    if (date >= today) groups[0].items.push(conv);
    else if (date >= yesterday) groups[1].items.push(conv);
    else if (date >= weekAgo) groups[2].items.push(conv);
    else groups[3].items.push(conv);
  }

  let html = '';
  for (const group of groups) {
    if (group.items.length === 0) continue;
    html += `<div class="conv-group">`;
    html += `<div class="conv-group__label">${group.label}</div>`;
    for (const conv of group.items) {
      const active = conv.id === state.activeConversationId ? ' active' : '';
      const title = conv.title
        ? escapeHtml(conv.title)
        : '<em style="color:var(--text-tertiary)">Untitled</em>';
      html += `<div class="conv-item${active}" data-conv-id="${conv.id}">
        <span class="conv-item__title">${title}</span>
        <button class="conv-item__delete" data-delete-id="${conv.id}">\u2715</button>
      </div>`;
    }
    html += `</div>`;
  }

  sidebarList.innerHTML = html;

  // Click handlers
  sidebarList.querySelectorAll('.conv-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.dataset.deleteId) return;
      const convId = (el as HTMLElement).dataset.convId;
      if (convId) {
        setState({ activeConversationId: convId });
      }
    });
  });

  // Delete handlers
  sidebarList.querySelectorAll('.conv-item__delete').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = (el as HTMLElement).dataset.deleteId;
      if (!id) return;
      try {
        await api.deleteConversation(id);
        const state = getState();
        if (state.activeConversationId === id) {
          setState({ activeConversationId: null, messages: [] });
        }
        await loadConversations();
      } catch (err) {
        console.error('Failed to delete conversation:', err);
      }
    });
  });
}

// ── Chat Input ─────────────────────────────────────────────

function initChatInput(layout: HTMLElement): void {
  const textarea = layout.querySelector('#chat-textarea') as HTMLTextAreaElement;
  const sendBtn = layout.querySelector('#send-btn') as HTMLButtonElement;
  const attachBtn = layout.querySelector('#attach-btn') as HTMLButtonElement;
  const inputContainer = layout.querySelector('#chat-input-container') as HTMLElement;

  if (!textarea || !sendBtn) return;

  // Auto-resize textarea
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';

    // Update send button state
    const hasContent = textarea.value.trim().length > 0 || pendingFiles.length > 0;
    sendBtn.classList.toggle('active', hasContent);
  });

  // Send on Enter (not Shift+Enter)
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  sendBtn.addEventListener('click', handleSend);

  // File upload
  hiddenFileInput = createFileInput((files) => {
    pendingFiles = [...pendingFiles, ...files];
    renderPendingFiles();
  });
  layout.appendChild(hiddenFileInput);

  attachBtn.addEventListener('click', () => {
    hiddenFileInput?.click();
  });

  // Drag and drop
  if (inputContainer) {
    initUploadZone(inputContainer, (files) => {
      pendingFiles = [...pendingFiles, ...files];
      renderPendingFiles();
    });
  }

  // Empty state starters
  layout.querySelectorAll('[data-starter]').forEach((el) => {
    el.addEventListener('click', async () => {
      const text = (el as HTMLElement).dataset.starter;
      if (text && textarea) {
        // Switch to code mode for starter chips
        setState({ activeMode: 'code' });
        layout.querySelectorAll('.mode-toggle__btn').forEach((b) => {
          b.classList.toggle('active', (b as HTMLElement).dataset.mode === 'code');
        });
        textarea.value = text;
        textarea.dispatchEvent(new Event('input'));
        await handleSend();
      }
    });
  });

  // Template buttons
  layout.querySelectorAll('[data-template]').forEach((el) => {
    el.addEventListener('click', async () => {
      const template = (el as HTMLElement).dataset.template;
      if (template) {
        await createNewConversation(`New ${template} project`);
      }
    });
  });
}

function renderPendingFiles(): void {
  if (!fileChipsContainer) return;
  fileChipsContainer.innerHTML = '';

  if (pendingFiles.length > 0) {
    const chips = renderFileChips(pendingFiles, (index) => {
      pendingFiles.splice(index, 1);
      renderPendingFiles();
    });
    fileChipsContainer.appendChild(chips);
  }

  // Update send button
  const sendBtn = document.querySelector('#send-btn');
  const textarea = document.querySelector('#chat-textarea') as HTMLTextAreaElement;
  const hasContent = (textarea?.value.trim().length || 0) > 0 || pendingFiles.length > 0;
  sendBtn?.classList.toggle('active', hasContent);
}

async function handleSend(): Promise<void> {
  const state = getState();
  if (state.isStreaming) return;

  const textarea = document.querySelector('#chat-textarea') as HTMLTextAreaElement;
  const content = textarea?.value.trim();
  if (!content && pendingFiles.length === 0) return;

  // Mark streaming early to prevent subscribe from interfering
  setState({ isStreaming: true });

  // Ensure we have a conversation
  let convId = state.activeConversationId;
  if (!convId) {
    try {
      const conv = await api.createConversation({
        model: state.activeModel,
        agent_mode: state.activeMode,
      } as any);
      convId = conv.id;
      setState({ activeConversationId: convId, isStreaming: true });
      loadConversations(); // Don't await — just refresh sidebar in background
    } catch (e) {
      console.error('Failed to create conversation:', e);
      setState({ isStreaming: false });
      return;
    }
  }

  // Upload files first
  let attachmentIds: string[] | undefined;
  if (pendingFiles.length > 0 && state.sandboxId) {
    try {
      const result = await api.uploadSandboxFiles(state.sandboxId, pendingFiles);
      attachmentIds = result.ids;
    } catch (e) {
      console.error('Failed to upload files:', e);
    }
  }

  // Clear input
  if (textarea) {
    textarea.value = '';
    textarea.style.height = 'auto';
  }
  pendingFiles = [];
  renderPendingFiles();

  // Hide empty state, show messages
  hideEmptyState();

  // Add user message to UI
  const userMsg: Message = {
    id: `temp-${Date.now()}`,
    conversationId: convId,
    role: 'user',
    content: content || '[File upload]',
    createdAt: new Date().toISOString(),
  };
  appendMessageToUI(userMsg);

  // Create streaming assistant message
  streamingEl = createStreamingMessage();
  messagesContainer?.appendChild(streamingEl);
  scrollToBottom();

  // Disable input during streaming
  const sendBtn = document.querySelector('#send-btn') as HTMLButtonElement | null;
  const chatTextarea = document.querySelector('#chat-textarea') as HTMLTextAreaElement | null;
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = '\u25A0'; // Stop icon
    sendBtn.classList.add('active');
  }
  if (chatTextarea) {
    chatTextarea.disabled = true;
    chatTextarea.placeholder = 'Waiting for response...';
  }

  // Send and stream
  streamingContent = '';
  let reasoningContent = '';
  let currentToolStart: ToolStartEvent | null = null;
  let currentToolOutputs: string[] = [];

  try {
    const currentState = getState();
    const response = await api.sendMessage(convId, content, attachmentIds, currentState.activeModel, currentState.activeMode);

    for await (const event of streamSSE(response)) {
      handleSSEEvent(event, streamingEl!);
    }
  } catch (e) {
    console.error('Stream error:', e);
    if (streamingEl) {
      appendToStreamingMessage(
        streamingEl,
        `<div style="color: var(--error); padding: 8px;">Error: ${(e as Error).message}</div>`
      );
      finalizeStreamingMessage(streamingEl);
    }
  } finally {
    setState({ isStreaming: false });
    if (streamingEl) {
      finalizeStreamingMessage(streamingEl);
    }
    streamingEl = null;
    streamingContent = '';

    // Re-enable input
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = '\u2191';
      sendBtn.classList.remove('active');
    }
    if (chatTextarea) {
      chatTextarea.disabled = false;
      chatTextarea.placeholder = 'Message Nexus...';
      chatTextarea.focus();
    }

    // Reload conversation to show persisted messages
    if (convId) {
      loadConversations();
    }
  }
}

function handleSSEEvent(event: SSEEvent, el: HTMLElement): void {
  // Use 'any' access for backend snake_case field names
  const e = event as unknown as Record<string, unknown>;

  switch (event.type) {
    case 'token': {
      // Remove thinking indicator on first token
      const thinkingToken = el.querySelector('.thinking-indicator');
      if (thinkingToken) thinkingToken.remove();
      streamingContent += (e.content as string) || '';
      debounceRenderStreaming(el);
      break;
    }

    case 'reasoning':
      streamingContent = renderReasoningTrace((e.content as string) || '', undefined) + streamingContent;
      debounceRenderStreaming(el);
      break;

    case 'tool_start': {
      // Flush any pending markdown content first
      if (streamingContent.trim()) {
        debounceRenderStreaming(el);
      }
      const toolId = (e.tool_call_id as string) || '';
      const toolName = (e.tool as string) || '';
      const args = e.arguments as Record<string, string> | undefined;
      const lang = args?.language || toolName;
      const code = args?.code || '';

      // Remove thinking indicator when tool starts
      const thinkingEl = el.querySelector('.thinking-indicator');
      if (thinkingEl) thinkingEl.remove();

      // Show sandbox creation status for execute_code when no sandbox exists
      const content = el.querySelector('.message__content');
      if (toolName === 'execute_code' && !getState().sandboxId && content) {
        const statusEl = document.createElement('span');
        statusEl.className = 'sandbox-status';
        statusEl.textContent = 'Creating sandbox...';
        const cursor = content.querySelector('.streaming-cursor');
        if (cursor) {
          content.insertBefore(statusEl, cursor);
        } else {
          content.appendChild(statusEl);
        }
      }

      // Insert exec block directly into DOM (not via streamingContent/markdown)
      if (content) {
        const block = document.createElement('div');
        block.className = 'exec-block exec-block--running';
        block.dataset.toolId = toolId;
        block.innerHTML = `
          <div class="exec-block__header">
            <span class="exec-block__lang">${escapeHtml(lang)}</span>
            <span class="exec-block__status">Running...</span>
          </div>
          ${code ? `<pre class="exec-block__code"><code>${escapeHtml(code)}</code></pre>` : ''}
        `;
        // Insert before the streaming cursor
        const cursor = content.querySelector('.streaming-cursor');
        if (cursor) {
          content.insertBefore(block, cursor);
        } else {
          content.appendChild(block);
        }
        scrollToBottom();
      }
      break;
    }

    case 'tool_output': {
      const toolId = (e.tool_call_id as string) || '';
      const output = (e.output as string) || '';
      const execBlock = el.querySelector(`[data-tool-id="${toolId}"]`) as HTMLElement;
      if (execBlock) {
        let outputEl = execBlock.querySelector('.exec-block__output');
        if (!outputEl) {
          outputEl = document.createElement('pre');
          outputEl.className = 'exec-block__output';
          execBlock.appendChild(outputEl);
        }
        outputEl.textContent += output;
      }
      break;
    }

    case 'tool_end': {
      const toolId = (e.tool_call_id as string) || '';
      const execBlock = el.querySelector(`[data-tool-id="${toolId}"]`) as HTMLElement;
      if (execBlock) {
        execBlock.classList.remove('exec-block--running');
        const statusEl = execBlock.querySelector('.exec-block__status');
        if (statusEl) statusEl.textContent = 'Done';
      }
      // Remove sandbox status message if present
      const sandboxStatus = el.querySelector('.sandbox-status');
      if (sandboxStatus) sandboxStatus.remove();
      break;
    }

    case 'image_output': {
      const filename = (e.filename as string) || '';
      const url = (e.url as string) || '';
      if (url) {
        // Insert image directly into DOM (not via streamingContent/markdown)
        const content = el.querySelector('.message__content');
        if (content) {
          const imgDiv = document.createElement('div');
          imgDiv.className = 'image-embed';
          imgDiv.innerHTML = `
            <img class="image-embed__img" src="${url}" alt="${escapeHtml(filename)}" loading="lazy" />
            <div class="image-embed__footer">
              <span>${escapeHtml(filename)}</span>
              <a class="image-embed__download" href="${url}" download="${escapeHtml(filename)}">Download</a>
            </div>
          `;
          const cursor = content.querySelector('.streaming-cursor');
          if (cursor) content.insertBefore(imgDiv, cursor);
          else content.appendChild(imgDiv);
          scrollToBottom();
        }
      }
      break;
    }

    case 'table_output': {
      const rows = (e.rows as string[][]) || [];
      if (rows.length >= 2) {
        const tableContainer = renderDataTable(rows[0], rows.slice(1), rows.length - 1, '');
        const content = el.querySelector('.message__content');
        if (content) content.appendChild(tableContainer);
      }
      break;
    }

    case 'preview': {
      const url = (e.url as string) || '';
      setState({ previewUrl: url, rightPanelTab: 'preview' });
      const previewHtml = `<div class="preview-embed">
        <div class="preview-embed__bar">
          <span class="preview-embed__url">${escapeHtml(url)}</span>
        </div>
        <iframe class="preview-embed__iframe" src="${escapeHtml(url)}" sandbox="allow-scripts allow-same-origin" loading="lazy"></iframe>
      </div>`;
      streamingContent += previewHtml;
      debounceRenderStreaming(el);
      break;
    }

    case 'search_results': {
      const results = (e.results as { title: string; url: string; snippet: string }[]) || [];
      const query = (e.query as string) || '';
      let html = `<div class="search-results">`;
      html += `<div class="search-results__header">Search: ${escapeHtml(query)}</div>`;
      for (const result of results) {
        html += `<a class="search-results__item" href="${escapeHtml(result.url)}" target="_blank" rel="noopener">
          <div class="search-results__title">${escapeHtml(result.title)}</div>
          <div class="search-results__snippet">${escapeHtml(result.snippet)}</div>
          <div class="search-results__url">${escapeHtml(result.url)}</div>
        </a>`;
      }
      html += `</div>`;
      streamingContent += html;
      debounceRenderStreaming(el);
      break;
    }

    case 'title': {
      const title = (e.title as string) || '';
      if (title) {
        // Update conversation title in sidebar
        const state = getState();
        if (state.activeConversationId) {
          const convs = state.conversations.map(c =>
            c.id === state.activeConversationId ? { ...c, title } : c
          );
          setState({ conversations: convs });
          renderSidebarList();
        }
      }
      break;
    }

    case 'done': {
      const costHtml = renderCostBadge({
        inputTokens: (e.input_tokens as number) || 0,
        outputTokens: (e.output_tokens as number) || 0,
        totalCost: 0,
        model: getState().activeModel,
        duration: 0,
      });
      const content = el.querySelector('.message__content');
      if (content) {
        const badge = document.createElement('div');
        badge.innerHTML = costHtml;
        content.appendChild(badge.firstElementChild!);
      }
      scrollToBottom();
      break;
    }

    case 'error': {
      const content = el.querySelector('.message__content');
      if (content) {
        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'color: var(--error); padding: 8px; font-size: 0.85rem;';
        errDiv.textContent = `Error: ${(e.message as string) || 'Unknown error'}`;
        content.appendChild(errDiv);
      }
      break;
    }
  }

  scrollToBottom();
}

function debounceRenderStreaming(el: HTMLElement): void {
  if (markdownRenderTimeout) {
    clearTimeout(markdownRenderTimeout);
  }
  markdownRenderTimeout = setTimeout(() => {
    const rendered = renderMarkdown(streamingContent);
    appendToStreamingMessage(el, rendered);
    scrollToBottom();
  }, 50);
}

// ── Messages ───────────────────────────────────────────────

async function loadConversation(convId: string): Promise<void> {
  try {
    const conv = await api.getConversation(convId) as unknown as Record<string, unknown>;
    // Map backend messages to frontend Message type
    const rawMessages = (conv.messages as Array<Record<string, unknown>>) || [];
    const messages: Message[] = rawMessages.map((m) => ({
      id: (m.id as string) || '',
      conversationId: convId,
      role: (m.role as 'user' | 'assistant' | 'system') || 'user',
      content: (m.content as string) || '',
      createdAt: (m.created_at as string) || (m.createdAt as string) || '',
      reasoning: (m.reasoning as string) || undefined,
    }));
    setState({
      messages,
      sandboxId: (conv.sandbox_id as string) || null,
      sandboxStatus: conv.sandbox_id ? 'running' : 'none',
    });
    hideEmptyState();
    renderMessages(messages);
    updateSidebarActive(convId);

    // Load artifacts
    try {
      const artifacts = await api.getArtifacts(convId);
      setState({ artifacts });
      refreshArtifactsPane();
    } catch {
      // Artifacts endpoint may not exist yet
    }
  } catch (e) {
    console.error('Failed to load conversation:', e);
  }
}

function renderMessages(messages: Message[]): void {
  if (!messagesContainer) return;
  messagesContainer.innerHTML = '';

  for (const msg of messages) {
    appendMessageToUI(msg);
  }

  scrollToBottom();
  setupMessageActions();
}

function appendMessageToUI(message: Message): void {
  if (!messagesContainer) return;

  const el = renderMessage(message);
  messagesContainer.appendChild(el);

  // Wire up actions
  el.querySelectorAll('[data-action]').forEach((btn) => {
    const action = (btn as HTMLElement).dataset.action;
    btn.addEventListener('click', () => handleMessageAction(action!, message, el));
  });

  scrollToBottom();
}

function handleMessageAction(action: string, message: Message, el: HTMLElement): void {
  switch (action) {
    case 'copy':
      navigator.clipboard.writeText(message.content).catch(console.error);
      showToast('Copied to clipboard', 'success');
      break;
    case 'fork': {
      const convId = getState().activeConversationId;
      if (convId) {
        api.forkMessage(convId, message.id).then((newConv) => {
          setState({ activeConversationId: newConv.id });
          loadConversations();
        }).catch(console.error);
      }
      break;
    }
    case 'regenerate': {
      const convId = getState().activeConversationId;
      if (convId) {
        el.remove();
        streamingEl = createStreamingMessage();
        messagesContainer?.appendChild(streamingEl);
        streamingContent = '';
        setState({ isStreaming: true });

        api.regenerateMessage(convId, message.id).then(async (response) => {
          for await (const event of streamSSE(response)) {
            handleSSEEvent(event, streamingEl!);
          }
        }).catch(console.error).finally(() => {
          setState({ isStreaming: false });
          if (streamingEl) finalizeStreamingMessage(streamingEl);
          streamingEl = null;
          streamingContent = '';
        });
      }
      break;
    }
    case 'toggle-exec': {
      const codeBlock = el.querySelector('.exec-block__code');
      if (codeBlock) {
        codeBlock.classList.toggle('collapsed');
        const toggle = el.querySelector('.exec-block__toggle');
        if (toggle) {
          toggle.textContent = codeBlock.classList.contains('collapsed') ? 'Expand' : 'Collapse';
        }
      }
      break;
    }
    case 'toggle-reasoning': {
      const trace = (el.closest('.reasoning-trace') || el.querySelector('.reasoning-trace'));
      trace?.classList.toggle('open');
      break;
    }
    case 'lightbox': {
      const img = el as HTMLImageElement;
      if (img.src) openLightbox(img.src);
      break;
    }
  }
}

function setupMessageActions(): void {
  if (!messagesContainer) return;

  messagesContainer.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Toggle exec blocks
    if (target.dataset.action === 'toggle-exec') {
      const execBlock = target.closest('.exec-block');
      const codeBlock = execBlock?.querySelector('.exec-block__code');
      if (codeBlock) {
        codeBlock.classList.toggle('collapsed');
        target.textContent = codeBlock.classList.contains('collapsed') ? 'Expand' : 'Collapse';
      }
    }

    // Toggle reasoning
    if (target.closest('[data-action="toggle-reasoning"]')) {
      const trace = target.closest('.reasoning-trace');
      trace?.classList.toggle('open');
    }

    // Lightbox
    if (target.dataset.action === 'lightbox') {
      const img = target as HTMLImageElement;
      if (img.src) openLightbox(img.src);
    }

    // Mermaid actions
    if (target.dataset.action === 'copy-mermaid') {
      const source = target.dataset.source;
      if (source) navigator.clipboard.writeText(source).catch(console.error);
    }
  });
}

// ── Right Panel ────────────────────────────────────────────

function initRightPanel(layout: HTMLElement): void {
  const tabs = layout.querySelectorAll('.right-panel__tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab as typeof getState extends () => infer S ? S extends { rightPanelTab: infer T } ? T : never : never;
      setState({ rightPanelTab: tabName });
    });
  });

  // Init terminal — only create xterm when a sandbox is active
  const terminalContainer = layout.querySelector('#terminal-container') as HTMLElement;
  if (terminalContainer) {
    const state = getState();
    if (state.sandboxId) {
      try {
        initTerminal(terminalContainer);
        connectToSandbox(state.sandboxId);
      } catch (e) {
        console.warn('Terminal init failed:', e);
      }
    } else {
      showTerminalPlaceholder(terminalContainer);
    }
  }
}

function switchRightPanelTab(layout: HTMLElement, tab: string): void {
  // Update tab buttons
  layout.querySelectorAll('.right-panel__tab').forEach((el) => {
    el.classList.toggle('active', (el as HTMLElement).dataset.tab === tab);
  });

  // Update panes
  layout.querySelectorAll('.right-panel__pane').forEach((el) => {
    el.classList.toggle('active', (el as HTMLElement).dataset.pane === tab);
  });

  // Refresh content for specific tabs
  if (tab === 'files') {
    refreshFilesPane(layout);
  } else if (tab === 'preview') {
    refreshPreviewPane(layout);
  } else if (tab === 'artifacts') {
    refreshArtifactsPane();
  }
}

async function refreshFilesPane(layout: HTMLElement): Promise<void> {
  const filesPane = layout.querySelector('#files-pane');
  if (!filesPane) return;

  const state = getState();
  if (!state.sandboxId) {
    filesPane.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-tertiary);">No sandbox active</div>';
    return;
  }

  try {
    const files = await api.listSandboxFiles(state.sandboxId);
    filesPane.innerHTML = '';
    const tree = renderFileTree(files, async (path, node) => {
      if (node.type === 'file' && state.sandboxId) {
        try {
          const { content, language } = await api.readSandboxFile(state.sandboxId, path);
          filesPane.innerHTML = '';
          const viewer = renderFileViewer(path, content, language, () => {
            refreshFilesPane(layout);
          });
          filesPane.appendChild(viewer);
        } catch (e) {
          console.error('Failed to read file:', e);
        }
      }
    });
    filesPane.appendChild(tree);
  } catch (e) {
    console.error('Failed to load files:', e);
    filesPane.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-tertiary);">Failed to load files</div>';
  }
}

function refreshPreviewPane(layout: HTMLElement): void {
  const previewPane = layout.querySelector('#preview-pane');
  if (!previewPane) return;

  const state = getState();
  previewPane.innerHTML = '';
  const panel = renderPreviewPanel(state.previewUrl);
  previewPane.appendChild(panel);
}

function refreshArtifactsPane(): void {
  const artifactsPane = document.querySelector('#artifacts-pane');
  if (!artifactsPane) return;

  const state = getState();
  artifactsPane.innerHTML = '';
  const panel = renderArtifactsPanel(state.artifacts);
  artifactsPane.appendChild(panel);
}

// ── Helpers ────────────────────────────────────────────────

async function createNewConversation(title?: string): Promise<void> {
  const state = getState();
  try {
    const conv = await api.createConversation({
      title: title || 'New conversation',
      model: state.activeModel,
      mode: state.activeMode,
    });
    setState({
      activeConversationId: conv.id,
      messages: [],
    });
    await loadConversations();
    showEmptyState();
    inputTextarea?.focus();
  } catch (e) {
    console.error('Failed to create conversation:', e);
  }
}

function showEmptyState(): void {
  const empty = document.querySelector('#empty-state') as HTMLElement;
  const messages = document.querySelector('#chat-messages') as HTMLElement;
  if (empty) empty.style.display = 'flex';
  if (messages) messages.style.display = 'none';
}

function hideEmptyState(): void {
  const empty = document.querySelector('#empty-state') as HTMLElement;
  const messages = document.querySelector('#chat-messages') as HTMLElement;
  if (empty) empty.style.display = 'none';
  if (messages) messages.style.display = 'flex';
}

function scrollToBottom(): void {
  if (messagesContainer) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

function updateSidebarActive(convId: string): void {
  sidebarList?.querySelectorAll('.conv-item').forEach((el) => {
    el.classList.toggle('active', (el as HTMLElement).dataset.convId === convId);
  });
}

function showToast(message: string, type: 'error' | 'success' = 'success'): void {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 150);
  }, 2000);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Keyboard Shortcuts ─────────────────────────────────────

function initKeyboardShortcuts(): void {
  initShortcuts();
  registerDefaultShortcuts({
    openCommandPalette: () => {
      if (getState().commandPaletteOpen) {
        closeCommandPalette();
      } else {
        openCommandPalette();
      }
    },
    newConversation: () => createNewConversation(),
    search: () => {
      const search = document.querySelector('#sidebar-search') as HTMLInputElement;
      search?.focus();
    },
    switchToChat: () => {
      setState({ activeMode: 'chat' });
      document.querySelectorAll('.mode-toggle__btn').forEach((b) => {
        b.classList.toggle('active', (b as HTMLElement).dataset.mode === 'chat');
      });
    },
    switchToCode: () => {
      setState({ activeMode: 'code' });
      document.querySelectorAll('.mode-toggle__btn').forEach((b) => {
        b.classList.toggle('active', (b as HTMLElement).dataset.mode === 'code');
      });
    },
    switchToArchitect: () => {
      setState({ activeMode: 'architect' });
      document.querySelectorAll('.mode-toggle__btn').forEach((b) => {
        b.classList.toggle('active', (b as HTMLElement).dataset.mode === 'architect');
      });
    },
    closeOverlay: () => {
      if (getState().commandPaletteOpen) {
        closeCommandPalette();
      }
    },
    sendMessage: () => handleSend(),
    snapshot: () => {
      console.log('Snapshot not yet implemented');
    },
  });
}

// ── Command Palette Actions ────────────────────────────────

function initCommandPaletteActions(): void {
  registerActions([
    {
      id: 'new-conversation',
      label: 'New Conversation',
      icon: '+',
      shortcut: '\u2318N',
      category: 'Conversations',
      handler: () => createNewConversation(),
    },
    {
      id: 'search-conversations',
      label: 'Search Conversations',
      icon: '\uD83D\uDD0D',
      shortcut: '\u2318\u21E7F',
      category: 'Conversations',
      handler: () => {
        const search = document.querySelector('#sidebar-search') as HTMLInputElement;
        search?.focus();
      },
    },
    {
      id: 'mode-chat',
      label: 'Switch to Chat Mode',
      shortcut: '\u23181',
      category: 'Modes',
      handler: () => setState({ activeMode: 'chat' }),
    },
    {
      id: 'mode-code',
      label: 'Switch to Code Mode',
      shortcut: '\u23182',
      category: 'Modes',
      handler: () => setState({ activeMode: 'code' }),
    },
    {
      id: 'mode-architect',
      label: 'Switch to Architect Mode',
      shortcut: '\u23183',
      category: 'Modes',
      handler: () => setState({ activeMode: 'architect' }),
    },
    ...MODELS.map((m) => ({
      id: `model-${m.id}`,
      label: `Use ${m.name}`,
      category: 'Models',
      handler: () => setState({ activeModel: m.id }),
    })),
    {
      id: 'toggle-panel',
      label: 'Toggle Right Panel',
      category: 'Navigation',
      handler: () => {
        const layout = document.querySelector('.app-layout');
        layout?.classList.toggle('right-panel-collapsed');
        setState({ rightPanelOpen: !getState().rightPanelOpen });
      },
    },
    {
      id: 'view-terminal',
      label: 'Show Terminal',
      category: 'Navigation',
      handler: () => setState({ rightPanelTab: 'terminal' }),
    },
    {
      id: 'view-files',
      label: 'Show Files',
      category: 'Navigation',
      handler: () => setState({ rightPanelTab: 'files' }),
    },
    {
      id: 'view-preview',
      label: 'Show Preview',
      category: 'Navigation',
      handler: () => setState({ rightPanelTab: 'preview' }),
    },
    {
      id: 'view-artifacts',
      label: 'Show Artifacts',
      category: 'Navigation',
      handler: () => setState({ rightPanelTab: 'artifacts' }),
    },
    {
      id: 'agents',
      label: 'Manage Personas',
      category: 'Navigation',
      handler: () => {
        window.location.hash = '#/agents';
      },
    },
    {
      id: 'logout',
      label: 'Log Out',
      category: 'Account',
      handler: () => logout(),
    },
  ]);
}
