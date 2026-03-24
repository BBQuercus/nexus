'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, LoaderCircle } from 'lucide-react';
import * as api from '@/lib/api';
import { toast } from '../toast';

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    SpeechRecognition?: new () => BrowserSpeechRecognition;
  }
}

/**
 * Real-time microphone waveform rendered as a mirrored amplitude bar chart.
 */
function LiveWaveform({ stream }: { stream: MediaStream | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<{
    analyser: AnalyserNode;
    audioCtx: AudioContext;
    freq: Uint8Array<ArrayBuffer>;
    smoothed: Float32Array;
  } | null>(null);

  useEffect(() => {
    if (!stream) return;
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);
    const freq = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    const smoothed = new Float32Array(analyser.frequencyBinCount);
    stateRef.current = { analyser, audioCtx, freq, smoothed };

    const BARS = 64;
    const LERP = 0.25;
    let accent = '';
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const state = stateRef.current;
      if (!canvas || !state) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      state.analyser.getByteFrequencyData(state.freq);

      if (!accent) accent = getComputedStyle(canvas).getPropertyValue('color').trim() || '#6366f1';

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const binCount = state.freq.length;
      const gap = 1.5;
      const barW = Math.max(1, (w - gap * (BARS - 1)) / BARS);
      const midY = h / 2;

      for (let i = 0; i < BARS; i++) {
        const lo = Math.floor((i / BARS) ** 1.4 * binCount);
        const hi = Math.max(lo + 1, Math.floor(((i + 1) / BARS) ** 1.4 * binCount));
        let sum = 0;
        for (let j = lo; j < hi; j++) sum += state.freq[j];
        const raw = sum / (hi - lo) / 255;

        state.smoothed[i] += (raw - state.smoothed[i]) * LERP;
        const amp = state.smoothed[i];

        const barH = Math.max(1, amp * midY * 0.92);
        const x = i * (barW + gap);

        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.35 + amp * 0.65;
        ctx.beginPath();
        ctx.roundRect(x, midY - barH, barW, barH, barW / 2);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(x, midY, barW, barH, barW / 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      void audioCtx.close();
      stateRef.current = null;
    };
  }, [stream]);

  return <canvas ref={canvasRef} className="h-6 flex-1 text-accent" />;
}

interface VoiceInputProps {
  content: string;
  setContent: React.Dispatch<React.SetStateAction<string>>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function VoiceInputButton({ onToggleRecording, isRecording }: { onToggleRecording: () => void; isRecording: boolean }) {
  return (
    <button
      onClick={onToggleRecording}
      className={`p-1.5 shrink-0 cursor-pointer rounded-lg transition-colors ${
        isRecording
          ? 'text-error bg-error/10 hover:bg-error/15'
          : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2'
      }`}
      title={isRecording ? 'Stop listening' : 'Start listening'}
    >
      {isRecording ? <MicOff size={14} /> : <Mic size={14} />}
    </button>
  );
}

export function useVoiceInput({ content, setContent, textareaRef }: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingBaseContentRef = useRef('');
  const transcriptionChunksRef = useRef<Blob[]>([]);
  const isProcessingChunkRef = useRef(false);
  const recordingMimeTypeRef = useRef('audio/webm');

  useEffect(() => () => {
    mediaRecorderRef.current?.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const flushTranscription = useCallback(async () => {
    const chunks = transcriptionChunksRef.current;
    transcriptionChunksRef.current = [];
    if (chunks.length === 0) return;

    const mimeType = recordingMimeTypeRef.current;
    const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
    const blob = new Blob(chunks, { type: mimeType });
    const file = new File([blob], `recording.${ext}`, { type: mimeType });

    setIsTranscribing(true);
    try {
      const result = await api.transcribeAudio(file);
      const transcript = result.text.trim();
      if (transcript) {
        setContent(() => {
          const base = recordingBaseContentRef.current.trim();
          return [base, transcript].filter(Boolean).join(base ? ' ' : '');
        });
        recordingBaseContentRef.current = [recordingBaseContentRef.current.trim(), transcript].filter(Boolean).join(recordingBaseContentRef.current.trim() ? ' ' : '');
      }
    } catch (e) {
      console.error('Transcription failed', e);
    } finally {
      setIsTranscribing(false);
    }
  }, [setContent]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Microphone recording is not supported in this browser');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      transcriptionChunksRef.current = [];
      recordingBaseContentRef.current = content.trim();
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      recordingMimeTypeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          transcriptionChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        setTimeout(() => {
          void flushTranscription();
          textareaRef.current?.focus();
        }, 0);
      };
      recorder.start();
      setIsRecording(true);
    } catch (e) {
      console.error('Recording failed', e);
      toast.error('Could not access microphone');
    }
  }, [content, flushTranscription, isRecording, textareaRef]);

  return {
    isRecording,
    isTranscribing,
    mediaStreamRef,
    toggleRecording,
  };
}

export function RecordingIndicator({ stream, onStop }: { stream: MediaStream | null; onStop: () => void }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 px-3 py-2.5 bg-accent/10 border border-accent/20 rounded-lg">
      <LiveWaveform stream={stream} />
      <button
        onClick={onStop}
        className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-error text-white hover:bg-error/90 cursor-pointer shrink-0"
        title="Stop listening"
      >
        Stop
      </button>
    </div>
  );
}

export function TranscribingIndicator() {
  return (
    <div className="mb-2 flex items-center gap-2.5 px-3 py-2.5 bg-surface-1 border border-border-default rounded-lg">
      <LoaderCircle size={14} className="text-accent animate-spin" />
      <span className="text-[11px] text-text-secondary">Transcribing audio...</span>
    </div>
  );
}
