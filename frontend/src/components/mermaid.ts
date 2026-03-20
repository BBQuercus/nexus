// ============================================================
// Mermaid Diagram Renderer
// ============================================================

let mermaidModule: typeof import('mermaid') | null = null;
let mermaidLoading: Promise<typeof import('mermaid')> | null = null;
let initialized = false;

async function loadMermaid(): Promise<typeof import('mermaid')> {
  if (mermaidModule) return mermaidModule;
  if (mermaidLoading) return mermaidLoading;

  mermaidLoading = import('mermaid').then((mod) => {
    mermaidModule = mod;
    return mod;
  });

  return mermaidLoading;
}

function initMermaid(mermaid: typeof import('mermaid')): void {
  if (initialized) return;
  initialized = true;

  mermaid.default.initialize({
    startOnLoad: false,
    theme: 'dark',
    darkMode: true,
    themeVariables: {
      primaryColor: '#1A1A1A',
      primaryTextColor: '#ECECEC',
      primaryBorderColor: '#2A2A2A',
      lineColor: '#555555',
      secondaryColor: '#222222',
      tertiaryColor: '#111111',
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '14px',
      nodeBorder: '#2A2A2A',
      mainBkg: '#1A1A1A',
      clusterBkg: '#111111',
      clusterBorder: '#2A2A2A',
      edgeLabelBackground: '#0A0A0A',
      nodeTextColor: '#ECECEC',
    },
    flowchart: {
      htmlLabels: true,
      curve: 'basis',
    },
    securityLevel: 'loose',
  });
}

export async function renderMermaidDiagram(source: string, container: HTMLElement): Promise<void> {
  try {
    const mermaid = await loadMermaid();
    initMermaid(mermaid);

    const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
    const { svg } = await mermaid.default.render(id, source);
    container.innerHTML = svg;
    container.removeAttribute('data-mermaid-source');
  } catch (e) {
    console.warn('Mermaid diagram failed to render:', e);
    // Fallback to source code display
    const escaped = source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    container.innerHTML = `<pre style="color: var(--text-tertiary); font-size: 0.8rem; padding: 12px; margin: 0;"><code>${escaped}</code></pre>`;
    container.removeAttribute('data-mermaid-source');
  }
}

export function copyMermaidSource(source: string): void {
  navigator.clipboard.writeText(source).catch(console.error);
}

export function downloadMermaidSvg(containerId: string): void {
  const container = document.querySelector(`[data-mermaid-id="${containerId}"]`);
  if (!container) return;

  const svg = container.querySelector('svg');
  if (!svg) return;

  const svgData = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgData], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `diagram-${containerId}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}
