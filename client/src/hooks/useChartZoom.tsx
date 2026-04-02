/**
 * useChartZoom — Reusable hook for zoom/pan on Recharts-based charts.
 *
 * Features:
 * - Mouse wheel zoom (zooms into cursor position on X-axis)
 * - Click-drag horizontal pan
 * - Zoom In / Zoom Out / Reset buttons
 * - Touch pinch-zoom and drag-pan
 *
 * Usage:
 *   const zoom = useChartZoom(fullData);
 *   // Use zoom.visibleData as the data prop for your Recharts chart
 *   // Wrap your chart div with zoom.bindContainer (ref + event handlers)
 *   // Render zoom.ZoomControls component for buttons
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';

export interface ChartZoomState {
  /** Start index (inclusive) of the visible window */
  startIndex: number;
  /** End index (inclusive) of the visible window */
  endIndex: number;
}

interface TouchState {
  /** For single-finger drag */
  startX: number;
  /** For pinch-zoom: initial distance between two fingers */
  initialPinchDist: number;
  /** Zoom level at pinch start */
  initialZoomLevel: number;
}

const MIN_VISIBLE_POINTS = 8;
const ZOOM_WHEEL_FACTOR = 0.15; // % of visible range per wheel tick
const ZOOM_BUTTON_FACTOR = 0.3; // % zoom per button click

export function useChartZoom<T>(data: T[]) {
  const [zoomState, setZoomState] = useState<ChartZoomState>({
    startIndex: 0,
    endIndex: Math.max(0, data.length - 1),
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartState = useRef<ChartZoomState>({ startIndex: 0, endIndex: 0 });
  const touchRef = useRef<TouchState | null>(null);

  // Reset zoom when data changes (new file loaded)
  useEffect(() => {
    setZoomState({ startIndex: 0, endIndex: Math.max(0, data.length - 1) });
  }, [data.length]);

  const isZoomed = zoomState.startIndex > 0 || zoomState.endIndex < data.length - 1;

  const visibleData = useMemo(() => {
    if (data.length === 0) return [];
    const start = Math.max(0, zoomState.startIndex);
    const end = Math.min(data.length - 1, zoomState.endIndex);
    return data.slice(start, end + 1);
  }, [data, zoomState.startIndex, zoomState.endIndex]);

  const resetZoom = useCallback(() => {
    setZoomState({ startIndex: 0, endIndex: Math.max(0, data.length - 1) });
  }, [data.length]);

  const zoomIn = useCallback(() => {
    setZoomState(prev => {
      const visibleCount = prev.endIndex - prev.startIndex + 1;
      const shrinkBy = Math.max(1, Math.floor(visibleCount * ZOOM_BUTTON_FACTOR / 2));
      const newStart = prev.startIndex + shrinkBy;
      const newEnd = prev.endIndex - shrinkBy;
      if (newEnd - newStart + 1 < MIN_VISIBLE_POINTS) return prev;
      return { startIndex: newStart, endIndex: newEnd };
    });
  }, []);

  const zoomOut = useCallback(() => {
    setZoomState(prev => {
      const visibleCount = prev.endIndex - prev.startIndex + 1;
      const expandBy = Math.max(1, Math.floor(visibleCount * ZOOM_BUTTON_FACTOR / 2));
      const newStart = Math.max(0, prev.startIndex - expandBy);
      const newEnd = Math.min(data.length - 1, prev.endIndex + expandBy);
      return { startIndex: newStart, endIndex: newEnd };
    });
  }, [data.length]);

  // Mouse wheel handler
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const container = containerRef.current;
    if (!container || data.length < 2) return;

    const rect = container.getBoundingClientRect();
    // Cursor position as fraction of container width (0 = left, 1 = right)
    const cursorFraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

    setZoomState(prev => {
      const visibleCount = prev.endIndex - prev.startIndex + 1;
      const delta = Math.sign(e.deltaY); // +1 = scroll down = zoom out, -1 = scroll up = zoom in
      const changeCount = Math.max(1, Math.floor(visibleCount * ZOOM_WHEEL_FACTOR));

      if (delta < 0) {
        // Zoom in: shrink window around cursor position
        const shrinkLeft = Math.round(changeCount * cursorFraction);
        const shrinkRight = changeCount - shrinkLeft;
        const newStart = prev.startIndex + shrinkLeft;
        const newEnd = prev.endIndex - shrinkRight;
        if (newEnd - newStart + 1 < MIN_VISIBLE_POINTS) return prev;
        return { startIndex: newStart, endIndex: newEnd };
      } else {
        // Zoom out: expand window, biased by cursor position
        const expandLeft = Math.round(changeCount * cursorFraction);
        const expandRight = changeCount - expandLeft;
        return {
          startIndex: Math.max(0, prev.startIndex - expandLeft),
          endIndex: Math.min(data.length - 1, prev.endIndex + expandRight),
        };
      }
    });
  }, [data.length]);

  // Mouse drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only left button
    if (e.button !== 0) return;
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartState.current = { ...zoomState };
    e.preventDefault();
  }, [zoomState]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - dragStartX.current;
    const visibleCount = dragStartState.current.endIndex - dragStartState.current.startIndex + 1;
    // Convert pixel delta to index delta
    const indexDelta = Math.round((dx / rect.width) * visibleCount);

    if (indexDelta === 0) return;

    // Dragging right = moving backward in data (pan left), dragging left = pan right
    const newStart = dragStartState.current.startIndex - indexDelta;
    const newEnd = dragStartState.current.endIndex - indexDelta;

    if (newStart < 0) {
      setZoomState({ startIndex: 0, endIndex: visibleCount - 1 });
    } else if (newEnd > data.length - 1) {
      setZoomState({ startIndex: data.length - visibleCount, endIndex: data.length - 1 });
    } else {
      setZoomState({ startIndex: newStart, endIndex: newEnd });
    }
  }, [data.length]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Touch handlers for pinch-zoom and drag-pan
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchRef.current = {
        startX: e.touches[0].clientX,
        initialPinchDist: 0,
        initialZoomLevel: 1,
      };
      dragStartState.current = { ...zoomState };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const visibleCount = zoomState.endIndex - zoomState.startIndex + 1;
      touchRef.current = {
        startX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        initialPinchDist: dist,
        initialZoomLevel: data.length / visibleCount,
      };
      dragStartState.current = { ...zoomState };
    }
  }, [zoomState, data.length]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current || !containerRef.current) return;
    e.preventDefault();

    if (e.touches.length === 1 && touchRef.current.initialPinchDist === 0) {
      // Single finger drag = pan
      const rect = containerRef.current.getBoundingClientRect();
      const dx = e.touches[0].clientX - touchRef.current.startX;
      const visibleCount = dragStartState.current.endIndex - dragStartState.current.startIndex + 1;
      const indexDelta = Math.round((dx / rect.width) * visibleCount);

      const newStart = dragStartState.current.startIndex - indexDelta;
      const newEnd = dragStartState.current.endIndex - indexDelta;

      if (newStart < 0) {
        setZoomState({ startIndex: 0, endIndex: visibleCount - 1 });
      } else if (newEnd > data.length - 1) {
        setZoomState({ startIndex: data.length - visibleCount, endIndex: data.length - 1 });
      } else {
        setZoomState({ startIndex: newStart, endIndex: newEnd });
      }
    } else if (e.touches.length === 2 && touchRef.current.initialPinchDist > 0) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / touchRef.current.initialPinchDist;
      const newZoomLevel = touchRef.current.initialZoomLevel * scale;
      const newVisibleCount = Math.max(MIN_VISIBLE_POINTS, Math.min(data.length, Math.round(data.length / newZoomLevel)));

      const center = (dragStartState.current.startIndex + dragStartState.current.endIndex) / 2;
      let newStart = Math.round(center - newVisibleCount / 2);
      let newEnd = newStart + newVisibleCount - 1;

      if (newStart < 0) { newStart = 0; newEnd = newVisibleCount - 1; }
      if (newEnd > data.length - 1) { newEnd = data.length - 1; newStart = Math.max(0, newEnd - newVisibleCount + 1); }

      setZoomState({ startIndex: newStart, endIndex: newEnd });
    }
  }, [data.length]);

  const handleTouchEnd = useCallback(() => {
    touchRef.current = null;
  }, []);

  // Attach wheel listener with { passive: false } to allow preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Attach global mouseup to handle drag release outside container
  useEffect(() => {
    const handleGlobalMouseUp = () => { isDragging.current = false; };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  return {
    visibleData,
    isZoomed,
    zoomState,
    resetZoom,
    zoomIn,
    zoomOut,
    containerRef,
    /** Spread these onto the chart container div */
    containerProps: {
      ref: containerRef,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      style: { cursor: isDragging.current ? 'grabbing' : 'grab', touchAction: 'none' } as React.CSSProperties,
    },
  };
}

/**
 * Zoom control buttons overlay — renders zoom in/out/reset buttons.
 * Place inside the chart container, positioned absolutely.
 */
export function ZoomControls({
  isZoomed,
  onZoomIn,
  onZoomOut,
  onReset,
  visibleCount,
  totalCount,
}: {
  isZoomed: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  visibleCount: number;
  totalCount: number;
}) {
  const pct = totalCount > 0 ? Math.round((visibleCount / totalCount) * 100) : 100;
  return (
    <div style={{
      position: 'absolute',
      top: 8,
      right: 8,
      display: 'flex',
      gap: 4,
      alignItems: 'center',
      zIndex: 20,
      background: 'rgba(13,15,20,0.85)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 6,
      padding: '3px 6px',
      backdropFilter: 'blur(4px)',
    }}>
      {isZoomed && (
        <span style={{
          fontFamily: 'monospace',
          fontSize: 9,
          color: '#ff4d00',
          marginRight: 4,
          letterSpacing: 0.5,
        }}>
          {pct}%
        </span>
      )}
      <ZoomBtn label="−" title="Zoom out (or scroll down)" onClick={onZoomOut} />
      <ZoomBtn label="+" title="Zoom in (or scroll up)" onClick={onZoomIn} />
      {isZoomed && (
        <ZoomBtn label="↺" title="Reset zoom" onClick={onReset} accent />
      )}
      <span style={{
        fontFamily: 'monospace',
        fontSize: 8,
        color: '#333',
        marginLeft: 2,
        letterSpacing: 0.5,
      }}>
        SCROLL TO ZOOM · DRAG TO PAN
      </span>
    </div>
  );
}

function ZoomBtn({ label, title, onClick, accent }: { label: string; title: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseDown={(e) => e.stopPropagation()}
      title={title}
      style={{
        width: 22,
        height: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: accent ? 'rgba(255,77,0,0.15)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${accent ? 'rgba(255,77,0,0.4)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 4,
        color: accent ? '#ff4d00' : '#666',
        fontFamily: 'monospace',
        fontSize: 14,
        fontWeight: 'bold',
        cursor: 'pointer',
        lineHeight: 1,
        padding: 0,
        transition: 'all 0.12s',
      }}
    >
      {label}
    </button>
  );
}
