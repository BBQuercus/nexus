'use client';

import { useRef } from 'react';
import { useStore } from '@/lib/store';
import { useChatSubmit } from './use-chat-submit';
import { useVoiceInput, RecordingIndicator, TranscribingIndicator } from './voice-input';
import { FilePreviewList } from './file-uploader';
import { InputField } from './input-field';
import {
  ContextChips,
  ImageGeneratingIndicator,
  CompareModelsBanner,
  SlashMenu,
  MentionMenu,
  SlashHintBar,
  InputActionsBar,
} from './input-actions';

export default function ChatInput() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStreaming = useStore((s) => s.isStreaming);
  const activeKBIds = useStore((s) => s.activeKnowledgeBaseIds);
  const abortStreaming = useStore((s) => s.abortStreaming);

  const submit = useChatSubmit({ textareaRef });
  const voice = useVoiceInput({ content: submit.content, setContent: submit.setContent, textareaRef });

  return (
    <div data-tour="chat-input" className="shrink-0 bg-surface-0 px-3 md:px-6 pt-4 md:pt-5 safe-bottom"
      style={{ '--safe-bottom-pad': '1.25rem' } as React.CSSProperties}
    >
    <div className="max-w-4xl mx-auto w-full">
      <ContextChips
        activeKBIds={activeKBIds}
        attachedContexts={submit.attachedContexts}
        onRemoveContext={(id) => submit.setAttachedContexts((prev) => prev.filter((c) => c.id !== id))}
      />

      <FilePreviewList files={submit.pendingFiles} onRemove={submit.removeFile} />

      {submit.isGeneratingImage && (
        <ImageGeneratingIndicator imageModel={submit.imageModel} />
      )}

      {voice.isRecording && (
        <RecordingIndicator stream={voice.mediaStreamRef.current} onStop={() => void voice.toggleRecording()} />
      )}

      {voice.isTranscribing && <TranscribingIndicator />}

      <CompareModelsBanner compareModels={submit.compareModels} onCancel={() => submit.setCompareModels([])} />

      <div className="relative">
        <MentionMenu
          open={submit.mentionMenuOpen}
          results={submit.mentionResults}
          highlightIndex={submit.mentionHighlightIndex}
          onSelect={submit.insertMention}
          onHover={submit.setMentionHighlightIndex}
        />

        <SlashMenu
          open={submit.slashMenuOpen}
          commands={submit.filteredSlashCommands}
          highlightIndex={submit.slashHighlightIndex}
          onSelect={submit.executeSlashCommand}
          onHover={submit.setSlashHighlightIndex}
          setContent={submit.setContent}
          setSlashMenuOpen={submit.setSlashMenuOpen}
          textareaRef={textareaRef}
        />

        <SlashHintBar command={submit.activeSlashHint} />

        <InputField
          content={submit.content}
          setContent={submit.setContent}
          textareaRef={textareaRef}
          fileInputRef={fileInputRef}
          isStreaming={isStreaming}
          isGeneratingImage={submit.isGeneratingImage}
          isRecording={voice.isRecording}
          composeMode={submit.composeMode}
          canSend={submit.canSend}
          slashMenuOpen={submit.slashMenuOpen}
          setSlashMenuOpen={submit.setSlashMenuOpen}
          slashHighlightIndex={submit.slashHighlightIndex}
          setSlashHighlightIndex={submit.setSlashHighlightIndex}
          filteredSlashCommands={submit.filteredSlashCommands}
          executeSlashCommand={submit.executeSlashCommand}
          mentionMenuOpen={submit.mentionMenuOpen}
          setMentionMenuOpen={submit.setMentionMenuOpen}
          mentionHighlightIndex={submit.mentionHighlightIndex}
          setMentionHighlightIndex={submit.setMentionHighlightIndex}
          mentionResults={submit.mentionResults}
          insertMention={submit.insertMention}
          handleSend={submit.handleSend}
          handleGenerateImage={submit.handleGenerateImage}
          abortStreaming={abortStreaming}
          onToggleRecording={() => void voice.toggleRecording()}
          onToggleComposeMode={() => submit.setComposeMode((mode) => mode === 'image' ? 'chat' : 'image')}
          onAttachFiles={() => fileInputRef.current?.click()}
          setPendingFiles={submit.setPendingFiles}
        />
      </div>

      <InputActionsBar
        composeMode={submit.composeMode}
        imageModel={submit.imageModel}
        setImageModel={submit.setImageModel}
        numResponses={submit.numResponses}
        setNumResponses={submit.setNumResponses}
        verbosity={submit.verbosity}
        setVerbosity={submit.setVerbosity}
        creativity={submit.creativity}
        setCreativity={submit.setCreativity}
        tone={submit.tone}
        setTone={submit.setTone}
        isStreaming={isStreaming}
      />
    </div>
    </div>
  );
}
