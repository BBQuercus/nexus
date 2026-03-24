'use client';

import { useRef, useEffect, useState, useMemo, memo } from 'react';
import { enhanceRenderedMarkdown, renderMarkdown, splitMarkdownSegments } from '@/lib/markdown';

const MERMAID_THEME = {
  startOnLoad: false,
  theme: 'dark' as const,
  darkMode: true,
  themeVariables: {
    primaryColor: '#222225',
    primaryTextColor: '#F0F0F2',
    primaryBorderColor: '#333338',
    lineColor: '#636369',
  },
  securityLevel: 'strict' as const,
};

const MermaidDiagram = memo(function MermaidDiagram({ source }: { source: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = await import('mermaid');
        if (cancelled) return;
        mermaid.default.initialize(MERMAID_THEME);
        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
        const { svg: rendered } = await mermaid.default.render(id, source);
        if (!cancelled) setSvg(rendered);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [source]);

  if (error) {
    return (
      <div className="mermaid-embed">
        <pre className="px-3 py-2 text-xs text-text-secondary overflow-x-auto bg-surface-0 rounded-lg border border-border-default">
          <code>{source}</code>
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="mermaid-embed">
        <div className="flex items-center justify-center py-8 text-text-tertiary text-xs bg-surface-0 rounded-lg border border-border-default">
          <span className="animate-pulse">Rendering diagram...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mermaid-embed">
      <div className="mermaid-container" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
});

function HtmlSegment({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return enhanceRenderedMarkdown(ref.current);
  }, [html]);

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function MarkdownContent({
  text,
  className,
  postProcess,
}: {
  text: string;
  className?: string;
  postProcess?: (html: string) => string;
}) {
  const { segments } = useMemo(() => {
    const { html, mermaidBlocks } = renderMarkdown(text);
    const finalHtml = postProcess ? postProcess(html) : html;
    return { segments: splitMarkdownSegments(finalHtml, mermaidBlocks) };
  }, [text, postProcess]);

  // Fast path: no mermaid, single HTML segment
  if (segments.length === 1 && segments[0].type === 'html') {
    return (
      <div className={className}>
        <HtmlSegment html={segments[0].content} />
      </div>
    );
  }

  return (
    <div className={className}>
      {segments.map((seg, i) =>
        seg.type === 'mermaid' ? (
          <MermaidDiagram key={`m-${i}`} source={seg.source} />
        ) : (
          <HtmlSegment key={`h-${i}`} html={seg.content} />
        ),
      )}
    </div>
  );
}
