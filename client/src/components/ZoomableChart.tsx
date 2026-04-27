/**
 * ZoomableChart — Drop-in wrapper that adds zoom/pan to any Recharts chart.
 *
 * Wrap your <ResponsiveContainer> + chart inside <ZoomableChart data={chartData}>
 * and it will:
 *   - Slice the data array based on zoom state
 *   - Handle wheel: horizontal pan by default; Ctrl/Cmd + wheel zooms at cursor (capture phase so Recharts cannot eat events)
 *   - Handle +/- buttons zoom anchored to last cursor position over the chart
 *   - Handle click-drag horizontal pan (left or right mouse button; right-drag suppresses context menu)
 *   - Handle touch pinch-zoom (anchored to pinch center) and drag-pan
 *   - Render zoom in/out/reset controls
 *
 * Usage:
 *   <ZoomableChart data={chartData} height={300}>
 *     {(visibleData) => (
 *       <ResponsiveContainer width="100%" height="100%">
 *         <ComposedChart data={visibleData}>
 *           ...
 *         </ComposedChart>
 *       </ResponsiveContainer>
 *     )}
 *   </ZoomableChart>
 */

import { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect } from 'react';

const MIN_VISIBLE_POINTS = 8;
const ZOOM_WHEEL_FACTOR = 0.15;
const ZOOM_BUTTON_FACTOR = 0.3;

interface ZoomableChartProps<T> {
  data: T[];
  height?: number | string;
  hideControls?: boolean;
  children: (visibleData: T[]) => React.ReactNode;
}

/** Map client X to 0..1 fraction of element width */
function clientXToFrac(el: HTMLElement, clientX: number): number {
  const rect = el.getBoundingClientRect();
  const w = rect.width || 1;
  return Math.max(0, Math.min(1, (clientX - rect.left) / w));
}

export function ZoomableChart<T>({ data, height = 300, hideControls = false, children }: ZoomableChartProps<T>) {
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(Math.max(0, data.length - 1));

  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartRange = useRef({ start: 0, end: 0 });
  const touchRef = useRef<{ startX: number; pinchDist: number; zoomLevel: number } | null>(null);

  const rangeRef = useRef({ start: 0, end: Math.max(0, data.length - 1) });
  const dataLenRef = useRef(data.length);
  const cursorFracRef = useRef(0.5);

  useEffect(() => {
    rangeRef.current = { start: startIndex, end: endIndex };
  }, [startIndex, endIndex]);

  useEffect(() => {
    dataLenRef.current = data.length;
  }, [data.length]);

  // Reset when data changes
  useEffect(() => {
    setStartIndex(0);
    setEndIndex(Math.max(0, data.length - 1));
  }, [data.length]);

  const isZoomed = startIndex > 0 || endIndex < data.length - 1;
  const visibleCount = endIndex - startIndex + 1;

  const visibleData = useMemo(() => {
    if (data.length === 0) return [];
    return data.slice(Math.max(0, startIndex), Math.min(data.length, endIndex + 1));
  }, [data, startIndex, endIndex]);

  const resetZoom = useCallback(() => {
    const len = dataLenRef.current;
    setStartIndex(0);
    setEndIndex(Math.max(0, len - 1));
  }, []);

  /**
   * Zoom in (shrink window by delta indices) or out (grow by delta) while keeping the
   * data index under cursor fraction `frac` fixed on screen.
   */
  const applyZoomAtFracRef = useRef<(zoomIn: boolean, frac: number, deltaIndices: number) => void>(() => {});

  const applyZoomAtFrac = useCallback((zoomIn: boolean, frac: number, deltaIndices: number) => {
    const { start: s, end: e } = rangeRef.current;
    const len = dataLenRef.current;
    if (len < 2) return;

    const count = e - s + 1;
    const k = Math.max(1, deltaIndices);
    const anchor = s + frac * Math.max(1, count - 1);

    if (zoomIn) {
      const newCount = count - k;
      if (newCount < MIN_VISIBLE_POINTS) return;
      let ns = Math.round(anchor - frac * (newCount - 1));
      let ne = ns + newCount - 1;
      if (ns < 0) {
        ns = 0;
        ne = newCount - 1;
      }
      if (ne > len - 1) {
        ne = len - 1;
        ns = Math.max(0, ne - newCount + 1);
      }
      if (ne - ns + 1 < MIN_VISIBLE_POINTS) return;
      setStartIndex(ns);
      setEndIndex(ne);
    } else {
      const newCount = Math.min(len, count + k);
      let ns = Math.round(anchor - frac * (newCount - 1));
      let ne = ns + newCount - 1;
      if (ns < 0) {
        ns = 0;
        ne = Math.min(len - 1, newCount - 1);
      }
      if (ne > len - 1) {
        ne = len - 1;
        ns = Math.max(0, ne - newCount + 1);
      }
      setStartIndex(ns);
      setEndIndex(ne);
    }
  }, []);

  applyZoomAtFracRef.current = applyZoomAtFrac;

  const zoomIn = useCallback(() => {
    const count = rangeRef.current.end - rangeRef.current.start + 1;
    const shrink = Math.max(1, Math.floor(count * ZOOM_BUTTON_FACTOR / 2));
    applyZoomAtFrac(true, cursorFracRef.current, shrink * 2);
  }, [applyZoomAtFrac]);

  const zoomOut = useCallback(() => {
    const count = rangeRef.current.end - rangeRef.current.start + 1;
    const shrink = Math.max(1, Math.floor(count * ZOOM_BUTTON_FACTOR / 2));
    applyZoomAtFrac(false, cursorFracRef.current, shrink * 2);
  }, [applyZoomAtFrac]);

  const trackPointerFrac = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    cursorFracRef.current = clientXToFrac(el, clientX);
  }, []);

  // Wheel: capture phase + layout effect so listeners attach after the DOM node exists and run before Recharts stops propagation.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      const live = containerRef.current;
      if (!live) return;

      const target = e.target as Node | null;
      if (target && !live.contains(target)) return;

      e.preventDefault();
      e.stopPropagation();

      if (dataLenRef.current < 2) return;

      const { start: s, end: e2 } = rangeRef.current;
      const count = e2 - s + 1;
      const rect = live.getBoundingClientRect();
      const w = Math.max(1, rect.width);

      // Ctrl/Cmd + wheel (incl. trackpad pinch) → zoom; plain wheel → horizontal pan only
      if (e.ctrlKey || e.metaKey) {
        const frac = clientXToFrac(live, e.clientX);
        cursorFracRef.current = frac;
        const zoomInWheel = e.deltaY < 0;
        const delta = Math.max(1, Math.floor(count * ZOOM_WHEEL_FACTOR));
        applyZoomAtFracRef.current(zoomInWheel, frac, delta);
        return;
      }

      let dx = e.deltaX;
      let dy = e.deltaY;
      if (e.deltaMode === 1) {
        dx *= 16;
        dy *= 16;
      } else if (e.deltaMode === 2) {
        dx *= w;
        dy *= rect.height || w;
      }

      const combined = dx - dy;
      const indexDelta = Math.round((combined / w) * count);
      if (indexDelta === 0) return;

      let ns = s + indexDelta;
      let ne = e2 + indexDelta;
      if (ns < 0) {
        ns = 0;
        ne = count - 1;
      }
      if (ne > dataLenRef.current - 1) {
        ne = dataLenRef.current - 1;
        ns = Math.max(0, ne - count + 1);
      }
      setStartIndex(ns);
      setEndIndex(ne);
    };

    el.addEventListener('wheel', handler, { passive: false, capture: true });
    return () => el.removeEventListener('wheel', handler, true);
    // Empty deps: re-bind after every mount (Strict Mode remount / same data.length left the old node without listeners).
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const t = e.target as Element | null;
    if (t && typeof t.closest === 'function' && t.closest('[data-zoom-toolbar]')) return;

    trackPointerFrac(e.clientX);
    // 0 = left, 2 = right (right-click + drag pans like many CAD / data tools)
    if (e.button !== 0 && e.button !== 2) return;
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartRange.current = { start: startIndex, end: endIndex };
    e.preventDefault();
  }, [startIndex, endIndex, trackPointerFrac]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    trackPointerFrac(e.clientX);
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - dragStartX.current;
    const count = dragStartRange.current.end - dragStartRange.current.start + 1;
    const indexDelta = Math.round((dx / rect.width) * count);
    if (indexDelta === 0) return;

    // Drag right → advance in time (later samples); drag left → earlier samples (natural map-style pan)
    let ns = dragStartRange.current.start + indexDelta;
    let ne = dragStartRange.current.end + indexDelta;

    if (ns < 0) { ns = 0; ne = count - 1; }
    if (ne > data.length - 1) { ne = data.length - 1; ns = Math.max(0, ne - count + 1); }

    setStartIndex(ns);
    setEndIndex(ne);
  }, [data.length, trackPointerFrac]);

  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);

  const handleMouseLeave = useCallback((e: React.MouseEvent) => {
    isDragging.current = false;
    trackPointerFrac(e.clientX);
  }, [trackPointerFrac]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!containerRef.current) return;
    if (e.touches.length === 1) {
      touchRef.current = { startX: e.touches[0].clientX, pinchDist: 0, zoomLevel: 1 };
      dragStartRange.current = { start: startIndex, end: endIndex };
      cursorFracRef.current = clientXToFrac(containerRef.current, e.touches[0].clientX);
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const count = endIndex - startIndex + 1;
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      touchRef.current = {
        startX: cx,
        pinchDist: Math.sqrt(dx * dx + dy * dy),
        zoomLevel: data.length / count,
      };
      dragStartRange.current = { start: startIndex, end: endIndex };
      if (containerRef.current) {
        cursorFracRef.current = clientXToFrac(containerRef.current, cx);
      }
    }
  }, [startIndex, endIndex, data.length]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current || !containerRef.current) return;
    e.preventDefault();

    if (e.touches.length === 1 && touchRef.current.pinchDist === 0) {
      const rect = containerRef.current.getBoundingClientRect();
      const dx = e.touches[0].clientX - touchRef.current.startX;
      const count = dragStartRange.current.end - dragStartRange.current.start + 1;
      const indexDelta = Math.round((dx / rect.width) * count);
      let ns = dragStartRange.current.start + indexDelta;
      let ne = dragStartRange.current.end + indexDelta;
      if (ns < 0) { ns = 0; ne = count - 1; }
      if (ne > data.length - 1) { ne = data.length - 1; ns = Math.max(0, ne - count + 1); }
      setStartIndex(ns);
      setEndIndex(ne);
    } else if (e.touches.length === 2 && touchRef.current.pinchDist > 0) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / touchRef.current.pinchDist;
      const newZoom = touchRef.current.zoomLevel * scale;
      const newCount = Math.max(MIN_VISIBLE_POINTS, Math.min(data.length, Math.round(data.length / newZoom)));
      const frac = cursorFracRef.current;
      const { start: s, end: rangeEnd } = dragStartRange.current;
      const count0 = rangeEnd - s + 1;
      const anchor = s + frac * Math.max(1, count0 - 1);
      let ns = Math.round(anchor - frac * (newCount - 1));
      let ne = ns + newCount - 1;
      if (ns < 0) { ns = 0; ne = newCount - 1; }
      if (ne > data.length - 1) { ne = data.length - 1; ns = Math.max(0, ne - newCount + 1); }
      setStartIndex(ns);
      setEndIndex(ne);
    }
  }, [data.length]);

  const handleTouchEnd = useCallback(() => { touchRef.current = null; }, []);

  useEffect(() => {
    const h = () => { isDragging.current = false; };
    window.addEventListener('mouseup', h);
    return () => window.removeEventListener('mouseup', h);
  }, []);

  const pct = data.length > 0 ? Math.round((visibleCount / data.length) * 100) : 100;

  return (
    <div
      ref={containerRef}
      onMouseDownCapture={handleMouseDown}
      onContextMenu={(e) => e.preventDefault()}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'relative',
        height: typeof height === 'number' ? `${height}px` : height,
        cursor: isZoomed ? 'grab' : 'default',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <div
        data-zoom-toolbar
        style={{
        position: 'absolute',
        top: 6,
        right: 6,
        display: hideControls ? 'none' : 'flex',
        gap: 3,
        alignItems: 'center',
        zIndex: 20,
        background: 'rgba(13,15,20,0.88)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 5,
        padding: '2px 5px',
        backdropFilter: 'blur(4px)',
      }}>
        {isZoomed && (
          <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#ff4d00', marginRight: 3, letterSpacing: 0.5 }}>
            {pct}%
          </span>
        )}
        <ZoomBtn label="−" title="Zoom out (or Ctrl/Cmd + scroll)" onClick={(e) => { e.stopPropagation(); zoomOut(); }} />
        <ZoomBtn label="+" title="Zoom in (or Ctrl/Cmd + scroll)" onClick={(e) => { e.stopPropagation(); zoomIn(); }} />
        {isZoomed && (
          <ZoomBtn label="↺" title="Reset zoom" onClick={(e) => { e.stopPropagation(); resetZoom(); }} accent />
        )}
        <span style={{ fontFamily: 'monospace', fontSize: 7, color: '#333', marginLeft: 2, letterSpacing: 0.5 }}>
          AT CURSOR
        </span>
      </div>

      {isZoomed && data.length > 0 && !hideControls && (
        <div style={{
          position: 'absolute',
          bottom: 2,
          left: '10%',
          right: '10%',
          height: 6,
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 3,
          zIndex: 20,
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            left: `${(startIndex / data.length) * 100}%`,
            width: `${Math.max(2, (visibleCount / data.length) * 100)}%`,
            height: '100%',
            background: 'rgba(255,77,0,0.4)',
            borderRadius: 3,
          }} />
        </div>
      )}

      {children(visibleData)}
    </div>
  );
}

function ZoomBtn({ label, title, onClick, accent }: {
  label: string; title: string; onClick: (e: React.MouseEvent) => void; accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      title={title}
      style={{
        width: 20,
        height: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: accent ? 'rgba(255,77,0,0.15)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${accent ? 'rgba(255,77,0,0.4)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 3,
        color: accent ? '#ff4d00' : '#666',
        fontFamily: 'monospace',
        fontSize: 13,
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
