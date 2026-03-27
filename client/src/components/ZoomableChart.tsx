/**
 * ZoomableChart — Drop-in wrapper that adds zoom/pan to any Recharts chart.
 *
 * Wrap your <ResponsiveContainer> + chart inside <ZoomableChart data={...}>
 * and it will:
 *   - Slice the data array based on zoom state
 *   - Handle mouse wheel zoom (into cursor position)
 *   - Handle click-drag horizontal pan
 *   - Handle touch pinch-zoom and drag-pan
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

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';

const MIN_VISIBLE_POINTS = 8;
const ZOOM_WHEEL_FACTOR = 0.15;
const ZOOM_BUTTON_FACTOR = 0.3;

interface ZoomableChartProps<T> {
  data: T[];
  height?: number | string;
  children: (visibleData: T[]) => React.ReactNode;
}

export function ZoomableChart<T>({ data, height = 300, children }: ZoomableChartProps<T>) {
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(Math.max(0, data.length - 1));

  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartRange = useRef({ start: 0, end: 0 });
  const touchRef = useRef<{ startX: number; pinchDist: number; zoomLevel: number } | null>(null);

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
    setStartIndex(0);
    setEndIndex(Math.max(0, data.length - 1));
  }, [data.length]);

  const zoomIn = useCallback(() => {
    const count = endIndex - startIndex + 1;
    const shrink = Math.max(1, Math.floor(count * ZOOM_BUTTON_FACTOR / 2));
    const ns = startIndex + shrink;
    const ne = endIndex - shrink;
    if (ne - ns + 1 < MIN_VISIBLE_POINTS) return;
    setStartIndex(ns);
    setEndIndex(ne);
  }, [startIndex, endIndex]);

  const zoomOut = useCallback(() => {
    const count = endIndex - startIndex + 1;
    const expand = Math.max(1, Math.floor(count * ZOOM_BUTTON_FACTOR / 2));
    setStartIndex(Math.max(0, startIndex - expand));
    setEndIndex(Math.min(data.length - 1, endIndex + expand));
  }, [startIndex, endIndex, data.length]);

  // Mouse wheel
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (data.length < 2) return;

      const rect = el.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

      setStartIndex(prev => {
        // We need both start and end, so we'll use a functional update trick
        return prev; // no-op, real logic below
      });

      // Use refs to get current values synchronously
      const curStart = startIndex;
      const curEnd = endIndex;
      const count = curEnd - curStart + 1;
      const change = Math.max(1, Math.floor(count * ZOOM_WHEEL_FACTOR));
      const delta = Math.sign(e.deltaY);

      if (delta < 0) {
        // Zoom in
        const shrinkLeft = Math.round(change * frac);
        const shrinkRight = change - shrinkLeft;
        const ns = curStart + shrinkLeft;
        const ne = curEnd - shrinkRight;
        if (ne - ns + 1 < MIN_VISIBLE_POINTS) return;
        setStartIndex(ns);
        setEndIndex(ne);
      } else {
        // Zoom out
        const expandLeft = Math.round(change * frac);
        const expandRight = change - expandLeft;
        setStartIndex(Math.max(0, curStart - expandLeft));
        setEndIndex(Math.min(data.length - 1, curEnd + expandRight));
      }
    };

    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [data.length, startIndex, endIndex]);

  // Mouse drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartRange.current = { start: startIndex, end: endIndex };
    e.preventDefault();
  }, [startIndex, endIndex]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - dragStartX.current;
    const count = dragStartRange.current.end - dragStartRange.current.start + 1;
    const indexDelta = Math.round((dx / rect.width) * count);
    if (indexDelta === 0) return;

    let ns = dragStartRange.current.start - indexDelta;
    let ne = dragStartRange.current.end - indexDelta;

    if (ns < 0) { ns = 0; ne = count - 1; }
    if (ne > data.length - 1) { ne = data.length - 1; ns = Math.max(0, ne - count + 1); }

    setStartIndex(ns);
    setEndIndex(ne);
  }, [data.length]);

  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);

  // Touch
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchRef.current = { startX: e.touches[0].clientX, pinchDist: 0, zoomLevel: 1 };
      dragStartRange.current = { start: startIndex, end: endIndex };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const count = endIndex - startIndex + 1;
      touchRef.current = {
        startX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        pinchDist: Math.sqrt(dx * dx + dy * dy),
        zoomLevel: data.length / count,
      };
      dragStartRange.current = { start: startIndex, end: endIndex };
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
      let ns = dragStartRange.current.start - indexDelta;
      let ne = dragStartRange.current.end - indexDelta;
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
      const center = (dragStartRange.current.start + dragStartRange.current.end) / 2;
      let ns = Math.round(center - newCount / 2);
      let ne = ns + newCount - 1;
      if (ns < 0) { ns = 0; ne = newCount - 1; }
      if (ne > data.length - 1) { ne = data.length - 1; ns = Math.max(0, ne - newCount + 1); }
      setStartIndex(ns);
      setEndIndex(ne);
    }
  }, [data.length]);

  const handleTouchEnd = useCallback(() => { touchRef.current = null; }, []);

  // Global mouseup
  useEffect(() => {
    const h = () => { isDragging.current = false; };
    window.addEventListener('mouseup', h);
    return () => window.removeEventListener('mouseup', h);
  }, []);

  const pct = data.length > 0 ? Math.round((visibleCount / data.length) * 100) : 100;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
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
      {/* Zoom controls */}
      <div style={{
        position: 'absolute',
        top: 6,
        right: 6,
        display: 'flex',
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
        <ZoomBtn label="−" title="Zoom out (or scroll down)" onClick={(e) => { e.stopPropagation(); zoomOut(); }} />
        <ZoomBtn label="+" title="Zoom in (or scroll up)" onClick={(e) => { e.stopPropagation(); zoomIn(); }} />
        {isZoomed && (
          <ZoomBtn label="↺" title="Reset zoom" onClick={(e) => { e.stopPropagation(); resetZoom(); }} accent />
        )}
        <span style={{ fontFamily: 'monospace', fontSize: 7, color: '#333', marginLeft: 2, letterSpacing: 0.5 }}>
          SCROLL · DRAG
        </span>
      </div>

      {/* Minimap bar when zoomed */}
      {isZoomed && data.length > 0 && (
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
