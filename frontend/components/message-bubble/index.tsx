'use client';

import { useEffect, useState, useMemo } from 'react';
import { MessageSquare, Check } from 'lucide-react';
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
import { ExecutionTimeline } from '../execution-timeline';
import { RunSummaryPanel } from '../run-summary';
import { ConfidenceDot } from '../confidence-indicator';
import { ProvenanceRow } from '../provenance-indicator';
import type { ExecutionStep } from '@/lib/execution-types';
import type { RunSummary as RunSummaryType } from '@/lib/execution-types';
import { buildFormSubmissionMessage, parseFormSubmission } from '@/lib/form-submission';

export default function MessageBubble({ message }: { message: Message }) {

  const activeConversationId = useStore((s) => s.activeConversationId);
  const isStreaming = useStore((s) => s.isStreaming);
  const sandboxId = useStore((s) => s.sandboxId);
  const setMessages = useStore((s) => s.setMessages);
  const [copied, setCopied] = useState(false);
  const [showBranchInput, setShowBranchInput] = useState(false);
  const [showRetryMenu, setShowRetryMenu] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const allMessages = useStore((s) => s.messages);
  const submittedFormTitles = useMemo(() => {
    const titles = new Set<string>();
    if (!message.forms?.length) return titles;
    const msgIdx = allMessages.findIndex((m) => m.id === message.id);
    if (msgIdx === -1) return titles;
    for (let i = msgIdx + 1; i < allMessages.length; i++) {
      const currentMessage = allMessages[i];
      if (currentMessage.role !== 'user') continue;
      const submission = parseFormSubmission(currentMessage.content);
      if (submission) titles.add(submission.title);
    }
    return titles;
  }, [message.id, message.forms, allMessages]);

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
    const formSubmission = parseFormSubmission(message.content);

    return (
      <div className="flex justify-end" data-message-id={message.id}>
        <div className="group max-w-[95%] sm:max-w-[80%]">
          <SiblingNav message={message} />
          {formSubmission ? (
            <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <Check size={12} className="text-accent" />
                </div>
                <span className="text-sm font-medium text-text-primary">
                  Submitted &ldquo;{formSubmission.title}&rdquo;
                </span>
              </div>
              <div className="space-y-0.5 pl-7">
                {Object.entries(formSubmission.data).map(([key, value]) => (
                  <div key={key} className="text-xs">
                    <span className="text-text-tertiary">{key}: </span>
                    <span className="text-text-secondary">
                      {Array.isArray(value) ? value.join(', ') : String(value ?? '')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
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
          )}
          <UserMessageActions
            message={message}
            copied={copied}
            onCopy={handleCopy}
            showBranchInput={showBranchInput}
            onToggleBranch={() => setShowBranchInput(!showBranchInput)}
            onEdit={formSubmission ? () => {
              // Save messages before truncating so cancel can restore them
              const msgs = allMessages;
              const editIdx = msgs.findIndex((currentMessage) => currentMessage.id === message.id);
              if (editIdx !== -1) {
                setMessages(msgs.slice(0, editIdx));
              }
              // Reopen the form pre-filled with previous responses and scroll to it
              window.dispatchEvent(new CustomEvent('nexus:reopen-form', {
                detail: { title: formSubmission.title, data: formSubmission.data, savedMessages: msgs },
              }));
            } : undefined}
          />
          {showBranchInput && (
            <InlineBranchInput messageId={message.id} onClose={() => setShowBranchInput(false)} />
          )}
        </div>
      </div>
    );
  }

  // Build execution steps from tool calls
  const executionSteps: ExecutionStep[] = (message.toolCalls || []).map((tc) => ({
    id: tc.id,
    type: 'tool_call' as const,
    name: tc.name,
    description: tc.name,
    status: tc.isRunning ? ('running' as const) : tc.output !== undefined || tc.exitCode !== undefined ? (tc.exitCode !== undefined && tc.exitCode !== 0 ? ('failed' as const) : ('success' as const)) : ('success' as const),
    startedAt: Date.now(),
    durationMs: tc.duration ?? 0,
    result: tc.output,
    error: tc.exitCode !== undefined && tc.exitCode !== 0 ? (tc.stderr || `Exit code ${tc.exitCode}`) : undefined,
  }));

  // Determine confidence level
  const hasFailedTools = executionSteps.some((s) => s.status === 'failed');
  const hasRetrieval = (message.toolCalls || []).some((tc) => ['retrieval', 'rag_query', 'file_search', 'search'].includes(tc.name));
  const confidenceLevel = hasFailedTools ? ('low' as const) : hasRetrieval ? ('medium' as const) : ('high' as const);

  // Build run summary
  const runSummary: RunSummaryType | null = executionSteps.length > 0 ? {
    steps: executionSteps,
    totalDurationMs: executionSteps.reduce((acc, s) => acc + (s.durationMs ?? 0), 0),
    totalTokens: (message.cost?.inputTokens ?? 0) + (message.cost?.outputTokens ?? 0),
    totalCostUsd: message.cost?.totalCost,
    artifactsCreated: (message.charts?.length ?? 0) + (message.images?.length ?? 0) + (message.files?.length ?? 0),
    toolsUsed: [...new Set((message.toolCalls || []).map((tc) => tc.name))],
    retrievalUsed: hasRetrieval,
    sandboxUsed: (message.toolCalls || []).some((tc) => ['code_exec', 'execute_code', 'run_code'].includes(tc.name)),
    warnings: [],
    uncertainResults: [],
  } : null;

  // Build provenance sources
  const provenanceSources = [
    { source: 'model' as const, label: 'Model answer' },
    ...(message.citations && message.citations.length > 0 ? [{ source: 'citation' as const, label: 'Cited source' }] : []),
    ...(hasRetrieval ? [{ source: 'retrieval' as const, label: 'Retrieved context' }] : []),
    ...((message.toolCalls || []).some((tc) => ['code_exec', 'execute_code', 'run_code'].includes(tc.name)) ? [{ source: 'sandbox' as const, label: 'Sandbox output' }] : []),
  ];

  return (
    <div className="flex justify-start" data-message-id={message.id}>
      <div className="group max-w-[95%] sm:max-w-[85%]">
        <SiblingNav message={message} />
        {message.reasoning && <ReasoningTrace content={message.reasoning} tokenCount={message.reasoningTokens} />}
        {message.toolCalls?.filter((tool) => tool.name !== 'create_chart' && tool.name !== 'create_ui').map((tool) => <ExecBlock key={tool.id} tool={tool} />)}
        {executionSteps.length > 0 && <ExecutionTimeline steps={executionSteps} />}
        {runSummary && <RunSummaryPanel summary={runSummary} />}
        <ImageGallery images={message.images} />
        <FileGallery files={message.files} sandboxId={sandboxId} />
        <ChartDisplay charts={message.charts} />
        {message.forms?.map((form, i) => (
          <FormRenderer key={i} spec={form} alreadySubmitted={submittedFormTitles.has(form.title)} onSubmit={(data) => {
            window.dispatchEvent(new CustomEvent('nexus:send-message', {
              detail: { text: buildFormSubmissionMessage(form.title, data) },
            }));
          }} />
        ))}
        <MessageContent content={message.content} />
        {provenanceSources.length > 1 && <ProvenanceRow sources={provenanceSources} />}
        <CitationSection citations={message.citations} />
        {message.cost && <CostBadge data={message.cost} />}
        {confidenceLevel !== 'high' && executionSteps.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1">
            <ConfidenceDot level={confidenceLevel} />
            <span className="text-[10px] text-text-tertiary font-mono">
              {confidenceLevel === 'medium' ? 'Results may vary — retrieval used' : 'Low confidence — tool failures detected'}
            </span>
          </div>
        )}
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
