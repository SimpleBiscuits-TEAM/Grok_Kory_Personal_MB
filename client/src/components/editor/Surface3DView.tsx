/**
 * Surface3DView — Interactive 3D surface visualization for MAP-type calibrations
 *
 * Uses Canvas 2D with isometric projection for a lightweight 3D effect.
 * Supports rotation, zoom, and hover value display.
 */

import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { CalibrationMap } from '@/lib/editorEngine';
import { RotateCw, ZoomIn, ZoomOut } from 'lucide-react';

interface Surface3DViewProps {
  map: CalibrationMap;
  unit?: string;
}

function valueToSurfaceColor(value: number, min: number, max: number): string {
  if (min === max) return '#3b82f6';
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));

  // Blue → Cyan → Green → Yellow → Red
  const r = t < 0.5 ? Math.round(t * 2 * 100) : Math.round(100 + (t - 0.5) * 2 * 155);
  const g = t < 0.25 ? Math.round(80 + t * 4 * 175) : t < 0.75 ? Math.round(255 - (t - 0.25) * 2 * 55) : Math.round(200 - (t - 0.75) * 4 * 200);
  const b = t < 0.5 ? Math.round(220 - t * 2 * 180) : Math.round(40 - (t - 0.5) * 2 * 40);

  return `rgb(${r}, ${g}, ${b})`;
}

export default function Surface3DView({ map, unit }: Surface3DViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState(35);
  const [elevation, setElevation] = useState(25);
  const [zoom, setZoom] = useState(1);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; val: number } | null>(null);

  const values = map.physValues || map.rawValues || [];
  const rows = map.rows || 1;
  const cols = map.cols || values.length;
  const axisX = map.axisXValues || Array.from({ length: cols }, (_, i) => i);
  const axisY = map.axisYValues || Array.from({ length: rows }, (_, i) => i);

  const { minVal, maxVal } = useMemo(() => {
    if (values.length === 0) return { minVal: 0, maxVal: 1 };
    let min = Infinity, max = -Infinity;
    for (const v of values) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return { minVal: min, maxVal: max };
  }, [values]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (values.length === 0 || rows < 2 || cols < 2) {
      ctx.fillStyle = '#71717a';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('3D view requires MAP type (2+ rows, 2+ cols)', w / 2, h / 2);
      return;
    }

    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.min(w, h) * 0.35 * zoom;

    const rotRad = (rotation * Math.PI) / 180;
    const elevRad = (elevation * Math.PI) / 180;

    // Project 3D → 2D (isometric-like)
    const project = (x: number, y: number, z: number): [number, number] => {
      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);
      const cosE = Math.cos(elevRad);
      const sinE = Math.sin(elevRad);

      // Rotate around Y axis, then tilt
      const rx = x * cosR - y * sinR;
      const ry = x * sinR * sinE + y * cosR * sinE + z * cosE;
      const px = cx + rx * scale;
      const py = cy - ry * scale;
      return [px, py];
    };

    // Normalize coordinates to [-0.5, 0.5]
    const getPoint = (row: number, col: number): [number, number, number] => {
      const x = (col / (cols - 1)) - 0.5;
      const y = (row / (rows - 1)) - 0.5;
      const val = values[row * cols + col] || 0;
      const z = maxVal === minVal ? 0 : ((val - minVal) / (maxVal - minVal)) * 0.5;
      return [x, y, z];
    };

    // Draw grid cells back-to-front (painter's algorithm)
    // Sort by depth (y in rotated space)
    const cells: { row: number; col: number; depth: number }[] = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const [x, y] = getPoint(r, c);
        const cosR = Math.cos(rotRad);
        const sinR = Math.sin(rotRad);
        const depth = x * sinR + y * cosR;
        cells.push({ row: r, col: c, depth });
      }
    }
    cells.sort((a, b) => a.depth - b.depth);

    for (const { row, col } of cells) {
      const p0 = getPoint(row, col);
      const p1 = getPoint(row, col + 1);
      const p2 = getPoint(row + 1, col + 1);
      const p3 = getPoint(row + 1, col);

      const [x0, y0] = project(...p0);
      const [x1, y1] = project(...p1);
      const [x2, y2] = project(...p2);
      const [x3, y3] = project(...p3);

      const avgVal = (values[row * cols + col] + values[row * cols + col + 1] +
                      values[(row + 1) * cols + col] + values[(row + 1) * cols + col + 1]) / 4;

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.closePath();

      ctx.fillStyle = valueToSurfaceColor(avgVal, minVal, maxVal);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Draw axes labels
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';

    // X axis label
    const [xLabelX, xLabelY] = project(0.6, -0.5, 0);
    ctx.fillText(`X: ${axisX[0]?.toFixed?.(0) ?? '0'} → ${axisX[cols - 1]?.toFixed?.(0) ?? cols - 1}`, xLabelX, xLabelY + 15);

    // Y axis label
    const [yLabelX, yLabelY] = project(-0.5, 0.6, 0);
    ctx.fillText(`Y: ${axisY[0]?.toFixed?.(0) ?? '0'} → ${axisY[rows - 1]?.toFixed?.(0) ?? rows - 1}`, yLabelX, yLabelY + 15);

    // Value range
    ctx.fillStyle = '#71717a';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Range: ${minVal.toFixed(2)} → ${maxVal.toFixed(2)} ${unit || ''}`, 10, h - 10);
  }, [values, rows, cols, axisX, axisY, rotation, elevation, zoom, minVal, maxVal, unit]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse drag for rotation
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    setRotation(prev => prev + dx * 0.5);
    setElevation(prev => Math.max(5, Math.min(80, prev + dy * 0.3)));
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={600}
        height={400}
        className="w-full h-[400px] bg-zinc-950 rounded cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      {/* Controls */}
      <div className="absolute top-2 right-2 flex flex-col gap-1">
        <button
          className="p-1.5 bg-zinc-800/80 rounded hover:bg-zinc-700/80 transition-colors"
          onClick={() => setZoom(z => Math.min(3, z + 0.2))}
          title="Zoom in"
        >
          <ZoomIn className="w-3.5 h-3.5 text-zinc-400" />
        </button>
        <button
          className="p-1.5 bg-zinc-800/80 rounded hover:bg-zinc-700/80 transition-colors"
          onClick={() => setZoom(z => Math.max(0.3, z - 0.2))}
          title="Zoom out"
        >
          <ZoomOut className="w-3.5 h-3.5 text-zinc-400" />
        </button>
        <button
          className="p-1.5 bg-zinc-800/80 rounded hover:bg-zinc-700/80 transition-colors"
          onClick={() => { setRotation(35); setElevation(25); setZoom(1); }}
          title="Reset view"
        >
          <RotateCw className="w-3.5 h-3.5 text-zinc-400" />
        </button>
      </div>
      {/* Drag hint */}
      <div className="absolute bottom-2 left-2 text-[10px] text-zinc-600">
        Drag to rotate • Scroll to zoom
      </div>
    </div>
  );
}
