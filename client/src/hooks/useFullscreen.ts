import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Reusable fullscreen hook — wraps the browser Fullscreen API.
 * Attach `containerRef` to the element you want to go fullscreen.
 * Call `toggleFullscreen()` to enter/exit.
 * `isFullscreen` reflects current state.
 * Automatically exits fullscreen on unmount (prevents broken state when switching tabs).
 */
export function useFullscreen<T extends HTMLElement = HTMLDivElement>() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<T>(null);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Sync state with browser fullscreen changes (including ESC key)
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Exit fullscreen on unmount to prevent broken state when switching tabs
  useEffect(() => {
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  return { isFullscreen, containerRef, toggleFullscreen };
}
