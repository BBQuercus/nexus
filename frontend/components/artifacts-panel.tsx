'use client';

import { useStore } from '@/lib/store';
import { Pin, Code2, Image, BarChart3, Table, FileText, GitBranch } from 'lucide-react';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  code: <Code2 size={11} />,
  image: <Image size={11} />,
  chart: <BarChart3 size={11} />,
  table: <Table size={11} />,
  document: <FileText size={11} />,
  diagram: <GitBranch size={11} />,
};

export default function ArtifactsPanel() {
  const artifacts = useStore((s) => s.artifacts);

  if (artifacts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-xs font-mono">
        no artifacts
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-2 space-y-1">
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="text-[10px] text-text-tertiary font-mono tracking-wide uppercase">
          Artifacts · {artifacts.length}
        </span>
      </div>

      {artifacts.map((artifact) => (
        <div
          key={artifact.id}
          className="p-2.5 bg-surface-1 border border-border-default hover:border-border-focus transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-surface-2 text-text-tertiary uppercase font-mono tracking-wide">
              {TYPE_ICONS[artifact.type] || <Code2 size={11} />}
              {artifact.type}
            </span>
            {artifact.pinned && <Pin size={10} className="text-accent" />}
          </div>
          <div className="text-xs text-text-primary truncate">{artifact.label}</div>
          <div className="text-[10px] text-text-tertiary font-mono mt-1">
            {new Date(artifact.createdAt).toLocaleTimeString()}
          </div>
        </div>
      ))}
    </div>
  );
}
