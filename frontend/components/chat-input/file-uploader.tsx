'use client';

import { useState, useEffect } from 'react';
import { X, FileImage, FileSpreadsheet, FileText, File as FileIcon } from 'lucide-react';
import { getFileCategory, getFileTypeBadge, formatFileSize } from './types';

export interface FilePreviewCardProps {
  file: File;
  onRemove: () => void;
}

export function FilePreviewCard({ file, onRemove }: FilePreviewCardProps) {
  const category = getFileCategory(file);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (category === 'image') {
      const url = URL.createObjectURL(file);
      setThumbUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file, category]);

  const icon = category === 'image' ? <FileImage size={16} className="text-blue-400" />
    : category === 'spreadsheet' ? <FileSpreadsheet size={16} className="text-green-400" />
    : category === 'pdf' ? <FileText size={16} className="text-red-400" />
    : <FileIcon size={16} className="text-text-tertiary" />;

  return (
    <div className="relative group/card flex items-center gap-2 px-2.5 py-2 bg-surface-1 border border-border-default rounded-lg text-[11px] min-w-0 max-w-[200px]">
      {category === 'image' && thumbUrl ? (
        <img src={thumbUrl} alt={file.name} className="w-8 h-8 rounded object-cover shrink-0 border border-border-default" />
      ) : (
        <div className="w-8 h-8 rounded bg-surface-2 border border-border-default flex items-center justify-center shrink-0">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-text-primary font-mono text-[11px] leading-tight">{file.name}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="px-1 py-0 text-[9px] font-bold uppercase rounded bg-surface-2 text-text-tertiary tracking-wide">
            {getFileTypeBadge(file)}
          </span>
          <span className="text-[9px] text-text-tertiary">{formatFileSize(file.size)}</span>
        </div>
      </div>
      <button
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center bg-surface-2 border border-border-default rounded-full text-text-tertiary hover:text-error hover:bg-error/10 cursor-pointer opacity-0 group-hover/card:opacity-100 transition-opacity"
      >
        <X size={8} />
      </button>
    </div>
  );
}

interface FilePreviewListProps {
  files: File[];
  onRemove: (index: number) => void;
}

export function FilePreviewList({ files, onRemove }: FilePreviewListProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {files.map((file, i) => (
        <FilePreviewCard key={i} file={file} onRemove={() => onRemove(i)} />
      ))}
    </div>
  );
}
