'use client';

import { useState, useEffect } from 'react';
import { X, FileImage, FileSpreadsheet, FileText, File as FileIcon, Presentation } from 'lucide-react';
import { getFileCategory, getFileTypeBadge, formatFileSize } from './types';

/** Lightweight metadata extracted client-side from the file. */
interface FileMeta {
  /** Image dimensions */
  width?: number;
  height?: number;
  /** CSV/TSV: column count from header row */
  columns?: number;
  /** CSV/TSV: row count (excluding header) */
  rows?: number;
  /** CSV/TSV: column names from header */
  columnNames?: string[];
}

/** Read first ~8KB of a text file to extract CSV/TSV metadata. */
async function extractSpreadsheetMeta(file: File): Promise<FileMeta> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  // Only parse CSV/TSV client-side; XLSX needs a library
  if (ext !== 'csv' && ext !== 'tsv') return {};

  try {
    const slice = file.slice(0, 8192);
    const text = await slice.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return {};

    const sep = ext === 'tsv' ? '\t' : ',';
    const headerCols = lines[0].split(sep);
    // Estimate total rows from file size and average line length
    const avgLineLen = text.length / lines.length;
    const estimatedRows = Math.max(0, Math.round(file.size / avgLineLen) - 1);

    return {
      columns: headerCols.length,
      rows: estimatedRows,
      columnNames: headerCols.slice(0, 6).map((c) => c.trim().replace(/^["']|["']$/g, '')),
    };
  } catch {
    return {};
  }
}

/** Extract image dimensions by loading into an HTMLImageElement. */
function extractImageMeta(file: File, url: string): Promise<FileMeta> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({});
    img.src = url;
  });
}

export interface FilePreviewCardProps {
  file: File;
  onRemove: () => void;
}

export function FilePreviewCard({ file, onRemove }: FilePreviewCardProps) {
  const category = getFileCategory(file);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<FileMeta>({});

  useEffect(() => {
    if (category === 'image') {
      const url = URL.createObjectURL(file);
      setThumbUrl(url);
      extractImageMeta(file, url).then(setMeta);
      return () => URL.revokeObjectURL(url);
    }
    if (category === 'spreadsheet') {
      extractSpreadsheetMeta(file).then(setMeta);
    }
  }, [file, category]);

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const icon = category === 'image' ? <FileImage size={16} className="text-blue-400" />
    : category === 'spreadsheet' ? <FileSpreadsheet size={16} className="text-green-400" />
    : category === 'pdf' ? <FileText size={16} className="text-red-400" />
    : (ext === 'pptx' || ext === 'ppt') ? <Presentation size={16} className="text-orange-400" />
    : <FileIcon size={16} className="text-text-tertiary" />;

  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Build metadata summary line
  const metaParts: string[] = [formatFileSize(file.size)];
  if (meta.width && meta.height) metaParts.push(`${meta.width}×${meta.height}`);
  if (meta.columns) metaParts.push(`${meta.columns} cols`);
  if (meta.rows !== undefined) metaParts.push(`~${meta.rows.toLocaleString()} rows`);

  return (
    <div className="relative group/card flex items-center gap-2 px-2.5 py-2 bg-surface-1 border border-border-default rounded-lg text-[11px] min-w-0 max-w-[240px]">
      {category === 'image' && thumbUrl ? (
        <>
          <img
            src={thumbUrl}
            alt={file.name}
            className="w-8 h-8 rounded object-cover shrink-0 border border-border-default cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setLightboxOpen(true)}
          />
          {lightboxOpen && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
              onClick={() => setLightboxOpen(false)}
            >
              <img src={thumbUrl} alt={file.name} className="max-w-[90vw] max-h-[90vh] rounded-lg object-contain shadow-2xl" />
            </div>
          )}
        </>
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
          <span className="text-[9px] text-text-tertiary">{metaParts.join(' · ')}</span>
        </div>
        {meta.columnNames && meta.columnNames.length > 0 && (
          <div className="text-[9px] text-text-tertiary mt-0.5 truncate">
            {meta.columnNames.join(', ')}{meta.columns && meta.columns > 6 ? ', …' : ''}
          </div>
        )}
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
