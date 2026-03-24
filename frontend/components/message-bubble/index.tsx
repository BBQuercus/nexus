'use client';

import { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import type { Message } from './types';
import { SiblingNav } from './branch-indicator';
import { ExecBlock, ReasoningTrace, CostBadge } from './tool-call-display';
import { ImageGallery, FileGallery } from './image-gallery';
import { ChartDisplay } from './chart-display';
import FormRenderer from '../form-renderer';
import { MessageContent } from './message-content';
import { CitationSection } from './citation-list';
import {
  UserMessageActions,
  AssistantMessageActions,
  InlineBranchInput,
  AudioPlayer,
} from './message-actions';

export default function MessageBubble({ message }: { message: Message }) {

  const activeConversationId = useStore((s) => s.activeConversationId);
  const isStreaming = useStore((s) => s.isStreaming);
  const sandboxId = useStore((s) => s.sandboxId);
  const [copied, setCopied] = useState(false);
  const [showBranchInput, setShowBranchInput] = useState(false);
  const [showRetryMenu, setShowRetryMenu] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(console.error);
  };

  const handleRegenerate = async () => {
    if (!activeConversationId || isStreaming) return;
    window.dispatchEvent(new CustomEvent('nexus:regenerate', {
      detail: { conversationId: activeConversationId, messageId: message.id },
    }));
  };

  const handleGenerateAudio = async () => {
    if (!message.content || isGeneratingAudio) return;
    setIsGeneratingAudio(true);
    try {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      const blob = await api.synthesizeAudio({ text: message.content });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (e) {
      console.error('Audio generation failed', e);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  if (message.role === 'user') {
    return (
      <div className="flex justify-end" data-message-id={message.id}>
        <div className="group max-w-[95%] sm:max-w-[80%]">
          <SiblingNav message={message} />
          <div className="bg-surface-2 border border-border-default rounded-xl rounded-br-sm text-text-primary px-4 py-2.5 text-sm whitespace-pre-wrap">
            {message.content}
            {message.contexts && message.contexts.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border-default/30">
                {message.contexts.map((ctx) => (
                  <span key={ctx.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-accent bg-accent/10 border border-accent/20 rounded">
                    <MessageSquare size={9} />
                    {ctx.title}
                  </span>
                ))}
              </div>
            )}
          </div>
          <UserMessageActions
            message={message}
            copied={copied}
            onCopy={handleCopy}
            showBranchInput={showBranchInput}
            onToggleBranch={() => setShowBranchInput(!showBranchInput)}
          />
          {showBranchInput && (
            <InlineBranchInput messageId={message.id} onClose={() => setShowBranchInput(false)} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start" data-message-id={message.id}>
      <div className="group max-w-[95%] sm:max-w-[85%]">
        <SiblingNav message={message} />
        {message.reasoning && <ReasoningTrace content={message.reasoning} tokenCount={message.reasoningTokens} />}
        {message.toolCalls?.filter((tool) => tool.name !== 'create_chart' && tool.name !== 'create_ui').map((tool) => <ExecBlock key={tool.id} tool={tool} />)}
        <ImageGallery images={message.images} />
        <FileGallery files={message.files} sandboxId={sandboxId} />
        <ChartDisplay charts={message.charts} />
        {message.forms?.map((form, i) => (
          <FormRenderer key={i} spec={form} onSubmit={(data) => {
            // Send form response as a user message
            const formattedResponse = `Form response for "${form.title}":\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
            window.dispatchEvent(new CustomEvent('nexus:send-message', { detail: { text: formattedResponse } }));
          }} />
        ))}
        <MessageContent content={message.content} />
        <CitationSection citations={message.citations} />
        {message.cost && <CostBadge data={message.cost} />}
        {audioUrl && (
          <AudioPlayer src={audioUrl} onClose={() => { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }} />
        )}
        <AssistantMessageActions
          message={message}
          copied={copied}
          onCopy={handleCopy}
          onRegenerate={handleRegenerate}
          onGenerateAudio={() => void handleGenerateAudio()}
          isGeneratingAudio={isGeneratingAudio}
          showRetryMenu={showRetryMenu}
          onToggleRetryMenu={() => setShowRetryMenu(!showRetryMenu)}
          showBranchInput={showBranchInput}
          onToggleBranch={() => setShowBranchInput(!showBranchInput)}
        />
        {showBranchInput && (
          <InlineBranchInput messageId={message.id} onClose={() => setShowBranchInput(false)} />
        )}
      </div>
    </div>
  );
}

export { MessageBubble };
