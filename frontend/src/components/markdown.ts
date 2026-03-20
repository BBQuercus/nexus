// ============================================================
// Markdown Rendering Pipeline
// ============================================================

import { marked, type TokenizerAndRendererExtension, Renderer } from 'marked';
import katex from 'katex';

let shikiHighlighter: Awaited<ReturnType<typeof import('shiki')['createHighlighter']>> | null = null;
let shikiLoading: Promise<void> | null = null;

export async function initMarkdown(): Promise<void> {
  if (shikiHighlighter || shikiLoading) return;

  shikiLoading = (async () => {
    try {
      const shiki = await import('shiki');
      shikiHighlighter = await shiki.createHighlighter({
        themes: ['vitesse-dark'],
        langs: [
          'javascript', 'typescript', 'python', 'bash', 'shell', 'json',
          'html', 'css', 'sql', 'yaml', 'toml', 'markdown', 'rust',
          'go', 'java', 'c', 'cpp', 'ruby', 'php', 'swift', 'kotlin',
          'dockerfile', 'xml', 'r', 'lua', 'perl', 'scala',
        ],
      });
    } catch (e) {
      console.warn('Shiki init failed, falling back to plain code blocks:', e);
    }
  })();

  await shikiLoading;
}

export function highlightCode(code: string, language: string): string {
  if (!shikiHighlighter) {
    const escaped = escapeHtml(code);
    return `<pre class="shiki" style="background-color:#121212"><code>${escaped}</code></pre>`;
  }

  try {
    const loadedLangs = shikiHighlighter.getLoadedLanguages();
    const lang = loadedLangs.includes(language as never) ? language : 'text';
    return shikiHighlighter.codeToHtml(code, {
      lang: lang || 'text',
      theme: 'vitesse-dark',
    });
  } catch {
    const escaped = escapeHtml(code);
    return `<pre class="shiki" style="background-color:#121212"><code>${escaped}</code></pre>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderKatex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      trust: true,
    });
  } catch {
    return `<code>${escapeHtml(tex)}</code>`;
  }
}

export function renderMarkdown(text: string): string {
  // Pre-process: extract LaTeX before marked processes it
  // Display math: $$...$$
  let processed = text.replace(/\$\$([\s\S]*?)\$\$/g, (_match, tex: string) => {
    return `<div class="katex-display">${renderKatex(tex.trim(), true)}</div>`;
  });

  // Inline math: $...$  (but not currency like $100)
  processed = processed.replace(/(?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$)/g, (_match, tex: string) => {
    return renderKatex(tex, false);
  });

  const renderer = new Renderer();

  renderer.code = function ({ text: code, lang }: { text: string; lang?: string | undefined }) {
    const language = lang || '';

    // Mermaid diagrams
    if (language === 'mermaid') {
      const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
      return `<div class="mermaid-embed"><div class="mermaid-embed__container" data-mermaid-id="${id}" data-mermaid-source="${escapeHtml(code)}">${escapeHtml(code)}</div><div class="mermaid-embed__actions"><button class="mermaid-embed__btn" data-action="copy-mermaid" data-source="${escapeHtml(code)}">Copy</button><button class="mermaid-embed__btn" data-action="download-svg" data-mermaid-id="${id}">Download SVG</button></div></div>`;
    }

    // Syntax highlighted code
    const highlighted = highlightCode(code, language);
    return highlighted;
  };

  renderer.link = function ({ href, title, text }: { href: string; title?: string | null | undefined; text: string }) {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return `<a href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  };

  marked.setOptions({
    renderer,
    gfm: true,
    breaks: true,
  });

  return marked.parse(processed) as string;
}

// Post-process rendered markdown to initialize mermaid diagrams
export async function postProcessMermaid(container: HTMLElement): Promise<void> {
  const mermaidContainers = container.querySelectorAll('[data-mermaid-source]');
  if (mermaidContainers.length === 0) return;

  try {
    const { renderMermaidDiagram } = await import('./mermaid');
    for (const el of mermaidContainers) {
      const source = el.getAttribute('data-mermaid-source');
      if (source) {
        await renderMermaidDiagram(source, el as HTMLElement);
      }
    }
  } catch (e) {
    console.warn('Mermaid rendering failed:', e);
  }
}
