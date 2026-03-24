'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface VegaViewHandle {
  toImageURL: (type: string) => Promise<string>;
  finalize?: () => void;
  resize?: () => Promise<unknown>;
  width?: (w: number) => unknown;
  run?: () => unknown;
}

interface VegaChartProps {
  spec: Record<string, unknown>;
  className?: string;
  onViewReady?: (view: VegaViewHandle | null) => void;
}

export default function VegaChart({ spec, className, onViewReady }: VegaChartProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<VegaViewHandle | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stable callback ref so effect doesn't re-run on every render
  const onViewReadyRef = useRef(onViewReady);
  onViewReadyRef.current = onViewReady;

  const renderChart = useCallback(async () => {
    const wrapper = wrapperRef.current;
    const container = chartRef.current;
    if (!wrapper || !container) return;

    // Measure available width from the wrapper (padding-aware)
    const availableWidth = wrapper.clientWidth;
    if (availableWidth <= 0) return;

    // Clean up previous
    viewRef.current?.finalize?.();
    viewRef.current = null;
    container.innerHTML = '';

    try {
      const embed = (await import('vega-embed')).default;
      const responsiveSpec = {
        ...spec,
        width: availableWidth - 40, // account for padding
        autosize: { type: 'fit', contains: 'padding' },
      };
      const result = await embed(container, responsiveSpec as Record<string, unknown>, {
        actions: false,
        renderer: 'canvas',
        theme: 'dark',
        tooltip: { theme: 'dark' },
      });
      viewRef.current = result.view;
      setError(null);
      onViewReadyRef.current?.(result.view);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to render chart');
      onViewReadyRef.current?.(null);
    }
  }, [spec]);

  useEffect(() => {
    renderChart();
    return () => {
      onViewReadyRef.current?.(null);
      viewRef.current?.finalize?.();
      viewRef.current = null;
    };
  }, [renderChart]);

  // Re-render on resize
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(() => renderChart());
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [renderChart]);

  if (error) {
    return (
      <div className={`rounded-lg border border-border-default bg-surface-0 p-3 text-xs text-error ${className || ''}`}>
        {error}
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className={`w-full ${className || ''}`}>
      <div ref={chartRef} />
    </div>
  );
}
