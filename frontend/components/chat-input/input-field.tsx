'use client';

import { useRef, useEffect } from 'react';
import { ArrowUp, Square, Paperclip, ImagePlus } from 'lucide-react';
import type { SlashCommand, ComposeMode } from './types';
import { validateFileSize } from './types';
import { VoiceInputButton } from './voice-input';

interface InputFieldProps {
  content: string;
  setContent: (value: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isStreaming: boolean;
  isGeneratingImage: boolean;
  isRecording: boolean;
  composeMode: ComposeMode;
  canSend: boolean;
  // Menu state for keyboard handling
  slashMenuOpen: boolean;
  setSlashMenuOpen: (open: boolean) => void;
  slashHighlightIndex: number;
  setSlashHighlightIndex: React.Dispatch<React.SetStateAction<number>>;
  filteredSlashCommands: SlashCommand[];
  executeSlashCommand: (cmd: SlashCommand) => void;
  mentionMenuOpen: boolean;
  setMentionMenuOpen: (open: boolean) => void;
  mentionHighlightIndex: number;
  setMentionHighlightIndex: React.Dispatch<React.SetStateAction<number>>;
  mentionResults: { id: string; title: string }[];
  insertMention: (conv: { id: string; title: string }) => void;
  // Actions
  handleSend: () => void;
  handleGenerateImage: () => Promise<void>;
  abortStreaming: () => void;
  onToggleRecording: () => void;
  onToggleComposeMode: () => void;
  onAttachFiles: () => void;
  setPendingFiles: React.Dispatch<React.SetStateAction<File[]>>;
}

export function InputField({
  content,
  setContent,
  textareaRef,
  fileInputRef,
  isStreaming,
  isGeneratingImage,
  isRecording,
  composeMode,
  canSend,
  slashMenuOpen,
  setSlashMenuOpen,
  slashHighlightIndex,
  setSlashHighlightIndex,
  filteredSlashCommands,
  executeSlashCommand,
  mentionMenuOpen,
  setMentionMenuOpen,
  mentionHighlightIndex,
  setMentionHighlightIndex,
  mentionResults,
  insertMention,
  handleSend,
  handleGenerateImage,
  abortStreaming,
  onToggleRecording,
  onToggleComposeMode,
  onAttachFiles,
  setPendingFiles,
}: InputFieldProps) {
  // Clipboard image paste support
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const err = validateFileSize(file);
            if (err) {
              import('@/components/toast').then(m => m.toast.error(err));
            } else {
              imageFiles.push(file);
            }
          }
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        setPendingFiles((prev) => [...prev, ...imageFiles]);
      }
    };
    ta.addEventListener('paste', handlePaste);
    return () => ta.removeEventListener('paste', handlePaste);
  }, [textareaRef, setPendingFiles]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // @ mention navigation
    if (mentionMenuOpen && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionHighlightIndex((i) => Math.min(i + 1, mentionResults.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionHighlightIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionResults[mentionHighlightIndex]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMentionMenuOpen(false); return; }
    }
    if (slashMenuOpen && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashHighlightIndex((i) => Math.min(i + 1, filteredSlashCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashHighlightIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filteredSlashCommands[slashHighlightIndex];
        if (cmd.hint) {
          setContent(`/${cmd.name} `);
          setSlashMenuOpen(false);
        } else {
          executeSlashCommand(cmd);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenuOpen(false);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const cmd = filteredSlashCommands[slashHighlightIndex];
        setContent(`/${cmd.name} `);
        setSlashMenuOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (composeMode === 'image') {
        void handleGenerateImage();
      } else {
        handleSend();
      }
    }
  };

  return (
    <div
      className="flex items-center gap-2 bg-surface-1 border border-border-default rounded-lg px-3 py-2 min-h-[44px] focus-within:border-accent/30 focus-within:shadow-[0_0_16px_-4px_var(--color-accent-dim)] transition-all"
    >
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          isStreaming
            ? 'Waiting for response...'
            : composeMode === 'image'
              ? 'Describe the image you want to generate...'
              : isRecording
                ? ''
                : 'Message Nexus... (/ for commands)'
        }
        disabled={isStreaming || isGeneratingImage}
        rows={1}
        className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary resize-none outline-none disabled:opacity-50 max-h-[200px] self-center"
      />

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => {
        if (!e.target.files) return;
        const files = Array.from(e.target.files);
        const valid: File[] = [];
        for (const f of files) {
          const err = validateFileSize(f);
          if (err) {
            import('@/components/toast').then(m => m.toast.error(err));
          } else {
            valid.push(f);
          }
        }
        if (valid.length > 0) setPendingFiles((prev) => [...prev, ...valid]);
        e.target.value = ''; // reset so same file can be re-selected
      }} />

      <button
        onClick={onAttachFiles}
        className="p-1.5 text-text-tertiary hover:text-text-secondary shrink-0 cursor-pointer rounded-lg hover:bg-surface-2 transition-colors"
        title="Attach files (max 25MB, data files 100MB)"
      >
        <Paperclip size={14} />
      </button>

      <button
        onClick={onToggleComposeMode}
        className={`p-1.5 shrink-0 cursor-pointer rounded-lg transition-colors ${
          composeMode === 'image'
            ? 'text-accent bg-accent/10 hover:bg-accent/15'
            : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2'
        }`}
        title="Image mode"
      >
        <ImagePlus size={14} />
      </button>

      <VoiceInputButton onToggleRecording={onToggleRecording} isRecording={isRecording} />

      {isStreaming ? (
        <button
          onClick={() => abortStreaming()}
          className="w-7 h-7 flex items-center justify-center text-sm shrink-0 cursor-pointer rounded-lg transition-all bg-error/80 text-white hover:bg-error"
          title="Stop generation"
        >
          <Square size={12} />
        </button>
      ) : (
        <button
          data-send-button
          onClick={composeMode === 'image' ? () => void handleGenerateImage() : handleSend}
          disabled={!canSend}
          className={`w-7 h-7 flex items-center justify-center text-sm shrink-0 cursor-pointer rounded-lg transition-all ${
            canSend ? 'bg-accent text-bg hover:bg-accent-hover scale-100' : 'bg-surface-2 text-text-tertiary scale-95'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <ArrowUp size={14} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
