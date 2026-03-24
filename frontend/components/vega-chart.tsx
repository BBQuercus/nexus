'use client';

import { useEffect, useRef, useState } from 'react';

interface VegaViewHandle {
  toImageURL: (type: string) => Promise<string>;
  finalize?: () => void;
}

interface VegaChartProps {
  spec: Record<string, unknown>;
  className?: string;
  onViewReady?: (view: VegaViewHandle | null) => void;
}

export default function VegaChart({ spec, className, onViewReady }: VegaChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let viewInstance: VegaViewHandle | null = null;

    async function render() {
      if (!containerRef.current) return;
      try {
        const embed = (await import('vega-embed')).default;
        // Make chart responsive: fit container width, enable tooltips
        const responsiveSpec = {
          ...spec,
          width: 'container',
          autosize: { type: 'fit', contains: 'padding' },
        };
        const result = await embed(containerRef.current, responsiveSpec as Record<string, unknown>, {
          actions: false,
          renderer: 'canvas',
          theme: 'dark',
          tooltip: { theme: 'dark' },
        });
        viewInstance = result.view;
        if (mounted) {
          setError(null);
          onViewReady?.(viewInstance);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to render chart');
          onViewReady?.(null);
        }
      }
    }

    render();
    return () => {
      mounted = false;
      onViewReady?.(null);
      viewInstance?.finalize?.();
    };
  }, [spec, onViewReady]);

  if (error) {
    return (
      <div className={`rounded-lg border border-border-default bg-surface-0 p-3 text-xs text-error ${className || ''}`}>
        {error}
      </div>
    );
  }

  return <div ref={containerRef} className={className} />;
}
