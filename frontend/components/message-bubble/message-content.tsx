'use client';

import { stripFormSubmissionPayload } from '@/lib/form-submission';
import MarkdownContent from '../markdown-content';
import { useSourcePostProcess } from './citation-list';

export function MessageContent({ content }: { content?: string }) {
  const sourcePostProcess = useSourcePostProcess();

  if (!content) return null;
  const visibleContent = stripFormSubmissionPayload(content);
  if (!visibleContent) return null;
  return (
    <MarkdownContent
      text={visibleContent}
      className="markdown-content text-sm text-text-primary"
      postProcess={sourcePostProcess}
    />
  );
}
