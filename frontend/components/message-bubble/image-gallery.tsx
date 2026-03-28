'use client';

import { Download, FileSpreadsheet, FileText, Presentation, File as FileIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'avi']);

function isVideoFile(filename: string): boolean {
  return VIDEO_EXTENSIONS.has(filename.split('.').pop()?.toLowerCase() ?? '');
}

export function InlineVideo({ img }: { img: { filename: string; url: string } }) {
  const t = useTranslations('imageGallery');
  return (
    <div className="rounded-lg border border-border-default overflow-hidden">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video src={img.url} controls className="w-full max-h-[500px] bg-bg" />
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-1 text-[11px] font-mono text-text-tertiary">
        <span className="truncate">{img.filename}</span>
        <a href={img.url} download={img.filename} className="flex items-center gap-1 text-text-tertiary hover:text-accent transition-colors shrink-0 ml-2">
          <Download size={10} /> {t('save')}
        </a>
      </div>
    </div>
  );
}

export function InlineImage({ img }: { img: { filename: string; url: string } }) {
  const t = useTranslations('imageGallery');
  if (isVideoFile(img.filename)) return <InlineVideo img={img} />;
  return (
    <div className="rounded-lg border border-border-default overflow-hidden">
      <img src={img.url} alt={img.filename} className="w-full max-h-[500px] min-h-[120px] object-contain bg-bg" />
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-1 text-[11px] font-mono text-text-tertiary">
        <span className="truncate">{img.filename}</span>
        <a href={img.url} download={img.filename} className="flex items-center gap-1 text-text-tertiary hover:text-accent transition-colors shrink-0 ml-2">
          <Download size={10} /> {t('save')}
        </a>
      </div>
    </div>
  );
}

export function ImageGallery({ images }: { images?: { filename: string; url: string }[] }) {
  if (!images || images.length === 0) return null;
  return (
    <div className="space-y-3 my-3">
      {images.map((img, i) => (
        <InlineImage key={i} img={img} />
      ))}
    </div>
  );
}

export function FileArtifactCard({ file, sandboxId }: { file: { filename: string; fileType: string; sandboxId?: string }; sandboxId: string | null }) {
  const t = useTranslations('imageGallery');
  const ext = file.filename.split('.').pop()?.toLowerCase() || '';
  const resolvedSandboxId = file.sandboxId || sandboxId;

  const icon = ext === 'xlsx' || ext === 'xls' ? <FileSpreadsheet size={18} className="text-green-400" />
    : ext === 'pptx' || ext === 'ppt' ? <Presentation size={18} className="text-orange-400" />
    : ext === 'pdf' ? <FileText size={18} className="text-red-400" />
    : <FileIcon size={18} className="text-text-tertiary" />;

  const badgeColor = ext === 'xlsx' || ext === 'xls' ? 'bg-green-500/15 text-green-400 border-green-500/20'
    : ext === 'pptx' || ext === 'ppt' ? 'bg-orange-500/15 text-orange-400 border-orange-500/20'
    : ext === 'pdf' ? 'bg-red-500/15 text-red-400 border-red-500/20'
    : 'bg-surface-2 text-text-tertiary border-border-default';

  const downloadUrl = resolvedSandboxId
    ? `/api/sandboxes/${resolvedSandboxId}/files/read?path=${encodeURIComponent(`/home/daytona/output/${file.filename}`)}`
    : undefined;

  const handleDownload = () => {
    if (!downloadUrl) return;
    window.open(downloadUrl, '_blank');
  };

  return (
    <div className="my-2 flex items-center gap-3 p-3 bg-surface-1 border border-border-default rounded-lg hover:border-border-focus transition-colors">
      <div className="w-10 h-10 rounded-lg bg-surface-2 border border-border-default flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary truncate font-medium">{file.filename}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`px-1.5 py-0 text-[9px] font-bold uppercase rounded border tracking-wide ${badgeColor}`}>
            {ext.toUpperCase() || file.fileType.toUpperCase()}
          </span>
          {file.fileType && file.fileType !== ext && (
            <span className="text-[10px] text-text-tertiary">{file.fileType}</span>
          )}
        </div>
      </div>
      {downloadUrl && (
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg bg-accent text-bg hover:bg-accent-hover cursor-pointer transition-colors shrink-0"
        >
          <Download size={12} /> {t('download')}
        </button>
      )}
    </div>
  );
}

export function FileGallery({ files, sandboxId }: { files?: { filename: string; fileType: string; sandboxId?: string }[]; sandboxId: string | null }) {
  if (!files || files.length === 0) return null;
  return (
    <div className="space-y-2 my-3">
      {files.map((file, i) => (
        <FileArtifactCard key={i} file={file} sandboxId={sandboxId} />
      ))}
    </div>
  );
}
