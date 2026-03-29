/**
 * SpeechToTextButton — Reusable microphone button for speech-to-text in any chat input.
 *
 * Drop this next to any chat textarea to add voice input. Records audio via MediaRecorder,
 * sends to server for Whisper transcription, and calls onTranscript with the result text.
 *
 * Usage:
 *   <SpeechToTextButton onTranscript={(text) => setInput(prev => prev + text)} />
 */

import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';

export type SpeechToTextState = 'idle' | 'listening' | 'processing' | 'error';

interface SpeechToTextButtonProps {
  /** Called with the transcribed text when transcription completes */
  onTranscript: (text: string) => void;
  /** Optional: called when an error occurs */
  onError?: (error: string) => void;
  /** Button size variant */
  size?: 'sm' | 'md';
  /** Custom className */
  className?: string;
  /** Whether the parent is in a loading state (disables the button) */
  disabled?: boolean;
  /** Color scheme for dark backgrounds */
  variant?: 'default' | 'dark';
}

export function SpeechToTextButton({
  onTranscript,
  onError,
  size = 'md',
  className = '',
  disabled = false,
  variant = 'default',
}: SpeechToTextButtonProps) {
  const [state, setState] = useState<SpeechToTextState>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const transcribeMutation = trpc.voice.transcribeOnly.useMutation();

  const blobToBase64 = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }, []);

  const startListening = useCallback(async () => {
    if (disabled) return;
    try {
      setState('listening');
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;

        if (audioChunksRef.current.length === 0) {
          setState('idle');
          return;
        }

        setState('processing');

        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          const audioBase64 = await blobToBase64(audioBlob);

          const result = await transcribeMutation.mutateAsync({
            audioBase64,
            mimeType: mimeType.split(';')[0],
          });

          if (result.text && result.text.trim()) {
            onTranscript(result.text.trim());
          }
          setState('idle');
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Transcription failed';
          setState('error');
          onError?.(msg);
          setTimeout(() => setState('idle'), 2000);
        }
      };

      recorder.start(250);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied';
      setState('error');
      onError?.(msg);
      setTimeout(() => setState('idle'), 2000);
    }
  }, [disabled, blobToBase64, transcribeMutation, onTranscript, onError]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const handleClick = useCallback(() => {
    if (state === 'listening') {
      stopListening();
    } else if (state === 'idle') {
      startListening();
    }
  }, [state, startListening, stopListening]);

  const isSmall = size === 'sm';
  const btnSize = isSmall ? 'h-[30px] w-[30px]' : 'h-[38px] w-[38px]';
  const iconSize = isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4';

  const isListening = state === 'listening';
  const isProcessing = state === 'processing';
  const isError = state === 'error';

  // Color styles based on variant
  const baseStyles = variant === 'dark'
    ? 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
    : 'border-input text-muted-foreground hover:text-foreground hover:border-foreground/30';

  const listeningStyles = variant === 'dark'
    ? 'border-red-500 bg-red-500/20 text-red-400'
    : 'border-red-500 bg-red-500/10 text-red-500';

  const errorStyles = variant === 'dark'
    ? 'border-amber-500/50 text-amber-400'
    : 'border-amber-500/50 text-amber-500';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isProcessing}
      title={
        isListening ? 'Click to stop recording'
          : isProcessing ? 'Transcribing...'
            : isError ? 'Error - try again'
              : 'Click to speak'
      }
      className={`
        ${btnSize} shrink-0 rounded-md border flex items-center justify-center
        transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
        ${isListening ? listeningStyles : isError ? errorStyles : baseStyles}
        ${isListening ? 'animate-pulse' : ''}
        ${className}
      `}
    >
      {isProcessing ? (
        <Loader2 className={`${iconSize} animate-spin`} />
      ) : isListening ? (
        <MicOff className={iconSize} />
      ) : isError ? (
        <Mic className={iconSize} />
      ) : (
        <Mic className={iconSize} />
      )}
    </button>
  );
}
