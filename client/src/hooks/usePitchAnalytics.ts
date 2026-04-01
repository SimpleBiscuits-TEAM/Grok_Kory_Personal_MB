/**
 * usePitchAnalytics — Hook for tracking Pitch tab engagement events.
 *
 * Tracks: tab_view (on mount), chat_message (on send), prompt_click (on suggested prompt),
 * and session_end (on unmount with duration).
 */
import { useEffect, useRef, useCallback } from 'react';
import { trpc } from '@/lib/trpc';

function generateSessionId(): string {
  return `ps_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function usePitchAnalytics() {
  const sessionIdRef = useRef(generateSessionId());
  const mountTimeRef = useRef(Date.now());
  const logMut = trpc.pitch.logEvent.useMutation();

  // Log tab_view on mount
  useEffect(() => {
    mountTimeRef.current = Date.now();
    sessionIdRef.current = generateSessionId();
    logMut.mutate({
      eventType: 'tab_view',
      sessionId: sessionIdRef.current,
    });

    // Log session_end on unmount
    return () => {
      const durationSec = Math.round((Date.now() - mountTimeRef.current) / 1000);
      logMut.mutate({
        eventType: 'session_end',
        sessionId: sessionIdRef.current,
        metadata: { durationSec },
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trackChatMessage = useCallback((messageLength: number) => {
    logMut.mutate({
      eventType: 'chat_message',
      sessionId: sessionIdRef.current,
      metadata: { messageLength },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trackPromptClick = useCallback((promptText: string) => {
    logMut.mutate({
      eventType: 'prompt_click',
      sessionId: sessionIdRef.current,
      metadata: { promptText },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { trackChatMessage, trackPromptClick };
}
