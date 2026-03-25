import { marked, Renderer } from 'marked';

let shikiHighlighter: Awaited<ReturnType<typeof import('shiki')['createHighlighter']>> | null = null;
let katexModule: typeof import('katex')['default'] | null = null;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sanitizeUrl(url: string, { allowData = false }: { allowData?: boolean } = {}): string {
  const trimmed = url.trim();
  if (!trimmed) return '#';
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return trimmed;
  if (trimmed.startsWith('./') || trimmed.startsWith('../')) return trimmed;
  if (allowData && (trimmed.startsWith('data:') || trimmed.startsWith('blob:'))) return trimmed;

  try {
    const parsed = new URL(trimmed, 'https://nexus.local');
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') {
      return trimmed;
    }
  } catch {
    return '#';
  }

  return '#';
}

let markdownLoading: Promise<void> | null = null;

export async function initMarkdown(): Promise<void> {
  if (markdownLoading) return markdownLoading;
  markdownLoading = (async () => {
    const results = await Promise.allSettled([
      // Load shiki highlighter
      (async () => {
        if (shikiHighlighter) return;
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
      })(),
      // Load katex
      (async () => {
        if (katexModule) return;
        const [katex] = await Promise.all([
          import('katex'),
          import('katex/dist/katex.min.css'),
        ]);
        katexModule = katex.default;
      })(),
    ]);
    for (const r of results) {
      if (r.status === 'rejected') console.warn('Markdown init partial failure:', r.reason);
    }
  })();
  await markdownLoading;
}

export function highlightCode(code: string, language: string): string {
  if (!shikiHighlighter) {
    return `<pre class="shiki" style="background-color:#18181B"><code>${escapeHtml(code)}</code></pre>`;
  }
  try {
    const loadedLangs = shikiHighlighter.getLoadedLanguages();
    const lang = loadedLangs.includes(language as never) ? language : 'text';
    return shikiHighlighter.codeToHtml(code, { lang: lang || 'text', theme: 'vitesse-dark' });
  } catch {
    return `<pre class="shiki" style="background-color:#18181B"><code>${escapeHtml(code)}</code></pre>`;
  }
}

function renderKatex(tex: string, displayMode: boolean): string {
  if (!katexModule) return `<code>${escapeHtml(tex)}</code>`;
  try {
    return katexModule.renderToString(tex, { displayMode, throwOnError: false, trust: false });
  } catch {
    return `<code>${escapeHtml(tex)}</code>`;
  }
}

function normalizeEmbeddedKatexHtml(text: string): string {
  if (typeof DOMParser === 'undefined' || !/class=["'][^"']*katex/.test(text)) {
    return text;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="__nexus_katex_root__">${text}</div>`, 'text/html');
    const root = doc.getElementById('__nexus_katex_root__');
    if (!root) return text;

    const katexNodes = Array.from(root.querySelectorAll('.katex-display, .katex')).filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      return !node.parentElement?.closest('.katex-display, .katex');
    });

    for (const node of katexNodes) {
      if (!(node instanceof HTMLElement)) continue;
      const tex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
      if (!tex) continue;
      const displayMode = node.classList.contains('katex-display');
      node.outerHTML = displayMode
        ? `\n\n$$${tex}$$\n\n`
        : `$${tex}$`;
    }

    return root.innerHTML;
  } catch {
    return text;
  }
}

export function enhanceRenderedMarkdown(root: HTMLElement): () => void {
  const handleCodeCopy = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('.code-copy-btn');
    if (!(button instanceof HTMLButtonElement)) return;
    const code = button.dataset.code || '';
    navigator.clipboard.writeText(code).then(() => {
      const previous = button.textContent;
      button.textContent = 'Copied!';
      window.setTimeout(() => {
        button.textContent = previous || 'Copy';
      }, 1500);
    }).catch(console.error);
  };

  root.addEventListener('click', handleCodeCopy);

  return () => {
    root.removeEventListener('click', handleCodeCopy);
  };
}

export type MermaidBlock = { index: number; source: string };

const MERMAID_PH = '\x00MERMAID';

export function renderMarkdown(text: string): { html: string; mermaidBlocks: MermaidBlock[] } {
  let processed = normalizeEmbeddedKatexHtml(text);

  // Replace KaTeX expressions with placeholders so marked doesn't escape the HTML
  const katexSlots: string[] = [];
  const KATEX_PH = '\x00KATEX';

  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_m, tex: string) => {
    const idx = katexSlots.length;
    katexSlots.push(`<div class="katex-display">${renderKatex(tex.trim(), true)}</div>`);
    return `${KATEX_PH}${idx}\x00`;
  });
  processed = processed.replace(/(?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$)/g, (_m, tex: string) => {
    const idx = katexSlots.length;
    katexSlots.push(renderKatex(tex, false));
    return `${KATEX_PH}${idx}\x00`;
  });

  // Collect mermaid blocks as placeholders — they'll be rendered by React components
  const mermaidBlocks: MermaidBlock[] = [];

  const renderer = new Renderer();
  renderer.html = function ({ raw, text }: { raw?: string; text?: string }) {
    return escapeHtml(raw || text || '');
  };
  renderer.code = function ({ text: code, lang }: { text: string; lang?: string | undefined }) {
    const language = lang || '';
    if (language === 'mermaid') {
      const idx = mermaidBlocks.length;
      mermaidBlocks.push({ index: idx, source: code });
      return `${MERMAID_PH}${idx}\x00`;
    }
    const highlighted = highlightCode(code, language);
    const langLabel = language ? `<span class="code-lang-label">${escapeHtml(language)}</span>` : '';
    return `<div class="code-block-wrapper"><div class="code-block-header">${langLabel}<button type="button" class="code-copy-btn" data-code="${escapeHtml(code)}">Copy</button></div>${highlighted}</div>`;
  };
  renderer.image = function ({ href, title, text }: { href: string; title?: string | null | undefined; text: string }) {
    const alt = text || '';
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    const safeHref = sanitizeUrl(href, { allowData: true });
    return `<div class="my-3 border border-[var(--color-border-default)] overflow-hidden">
      <img src="${escapeHtml(safeHref)}" alt="${escapeHtml(alt)}"${titleAttr} class="w-full max-h-[500px] object-contain" style="background:#121214" loading="lazy" />
      ${alt ? `<div class="flex items-center justify-between px-3 py-1.5 text-[11px] font-mono" style="background:var(--color-surface-1);color:var(--color-text-tertiary)">
        <span>${escapeHtml(alt)}</span>
        <a href="${escapeHtml(safeHref)}" download="${escapeHtml(alt)}" style="color:var(--color-text-tertiary)">Save</a>
      </div>` : ''}
    </div>`;
  };
  renderer.link = function ({ href, title, text }: { href: string; title?: string | null | undefined; text: string }) {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return `<a href="${escapeHtml(sanitizeUrl(href))}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  };

  marked.setOptions({ renderer, gfm: true, breaks: true });
  let html = marked.parse(processed) as string;

  // Restore KaTeX HTML from placeholders
  if (katexSlots.length > 0) {
    html = html.replace(/\x00KATEX(\d+)\x00/g, (_m, idx: string) => katexSlots[parseInt(idx, 10)] || '');
  }

  return { html, mermaidBlocks };
}

export type MarkdownSegment =
  | { type: 'html'; content: string }
  | { type: 'mermaid'; source: string };

export function splitMarkdownSegments(html: string, mermaidBlocks: MermaidBlock[]): MarkdownSegment[] {
  if (mermaidBlocks.length === 0) return [{ type: 'html', content: html }];

  const segments: MarkdownSegment[] = [];
  const regex = /\x00MERMAID(\d+)\x00/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'html', content: html.slice(lastIndex, match.index) });
    }
    const idx = parseInt(match[1], 10);
    const block = mermaidBlocks[idx];
    if (block) {
      segments.push({ type: 'mermaid', source: block.source });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < html.length) {
    segments.push({ type: 'html', content: html.slice(lastIndex) });
  }

  return segments;
}
