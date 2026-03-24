'use client';

import MarkdownContent from '../markdown-content';
import { useSourcePostProcess } from './citation-list';

export function MessageContent({ content }: { content?: string }) {
  const sourcePostProcess = useSourcePostProcess();

  if (!content) return null;
  return (
    <MarkdownContent
      text={content}
      className="markdown-content text-sm text-text-primary"
      postProcess={sourcePostProcess}
    />
  );
}
