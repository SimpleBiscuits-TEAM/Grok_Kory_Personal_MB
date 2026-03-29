/**
 * Map3DSurface — WebGL 3D Surface Visualization for Calibration Maps
 * 
 * Uses React Three Fiber + Three.js to render map data as an interactive
 * 3D surface with heatmap coloring matching the table editor gradient.
 */

import { useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { CalibrationMap, CompuMethod, rawToPhysical } from '@/lib/editorEngine';

interface Map3DSurfaceProps {
  map: CalibrationMap;
  compuMethod?: CompuMethod;
  showModified?: boolean;
}

/* ── Color science (matches table editor gradient) ── */
function valueToColor3(value: number, min: number, max: number): THREE.Color {
  if (min === max) return new THREE.Color(0.06, 0.13, 0.28);
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const stops = [
    { t: 0.00, r: 0.063, g: 0.125, b: 0.306 },
    { t: 0.25, r: 0.047, g: 0.361, b: 0.424 },
    { t: 0.50, r: 0.086, g: 0.541, b: 0.322 },
    { t: 0.75, r: 0.800, g: 0.612, b: 0.110 },
    { t: 1.00, r: 0.706, g: 0.141, b: 0.141 },
  ];
  let i = 0;
  for (let s = 1; s < stops.length; s++) { if (t <= stops[s].t) { i = s - 1; break; } }
  if (t >= 1) i = stops.length - 2;
  const s0 = stops[i], s1 = stops[i + 1];
  const lt = (t - s0.t) / (s1.t - s0.t);
  const st = lt * lt * (3 - 2 * lt);
  return new THREE.Color(
    s0.r + (s1.r - s0.r) * st,
    s0.g + (s1.g - s0.g) * st,
    s0.b + (s1.b - s0.b) * st
  );
}

function formatVal(v: number): string {
  if (Number.isInteger(v) && Math.abs(v) < 100000) return v.toString();
  return v.toFixed(2);
}

/* ── Surface Mesh ── */
function SurfaceMesh({ values, rows, cols, minVal, maxVal }: {
  values: number[]; rows: number; cols: number; minVal: number; maxVal: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const { geometry, colors } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(cols - 1, rows - 1, cols - 1, rows - 1);
    const positions = geo.attributes.position;
    const colorArr = new Float32Array(positions.count * 3);
    const range = maxVal - minVal || 1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const vi = r * cols + c;
        const pi = (rows - 1 - r) * cols + c;
        const val = values[vi] ?? 0;
        const height = ((val - minVal) / range) * 4;
        positions.setY(pi, height);
        const color = valueToColor3(val, minVal, maxVal);
        colorArr[pi * 3] = color.r;
        colorArr[pi * 3 + 1] = color.g;
        colorArr[pi * 3 + 2] = color.b;
      }
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
    geo.computeVertexNormals();
    return { geometry: geo, colors: colorArr };
  }, [values, rows, cols, minVal, maxVal]);

  return (
    <mesh ref={meshRef} geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
      <meshPhongMaterial
        vertexColors
        side={THREE.DoubleSide}
        shininess={30}
        specular={new THREE.Color(0.15, 0.15, 0.15)}
      />
    </mesh>
  );
}

/* ── Wireframe overlay ── */
function WireframeOverlay({ values, rows, cols, minVal, maxVal }: {
  values: number[]; rows: number; cols: number; minVal: number; maxVal: number;
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(cols - 1, rows - 1, cols - 1, rows - 1);
    const positions = geo.attributes.position;
    const range = maxVal - minVal || 1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const vi = r * cols + c;
        const pi = (rows - 1 - r) * cols + c;
        const val = values[vi] ?? 0;
        const height = ((val - minVal) / range) * 4;
        positions.setY(pi, height + 0.01);
      }
    }
    geo.computeVertexNormals();
    return geo;
  }, [values, rows, cols, minVal, maxVal]);

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
      <meshBasicMaterial wireframe color="#ffffff" opacity={0.08} transparent />
    </mesh>
  );
}

/* ── Axis Labels ── */
function AxisLabels({ map, rows, cols }: { map: CalibrationMap; rows: number; cols: number }) {
  const axisX = map.axisXValues || [];
  const axisY = map.axisYValues || [];

  const xLabels = useMemo(() => {
    if (axisX.length === 0) return null;
    const step = Math.max(1, Math.floor(axisX.length / 8));
    return axisX.filter((_, i) => i % step === 0 || i === axisX.length - 1).map((v, idx) => {
      const origIdx = axisX.indexOf(v);
      const x = origIdx - (cols - 1) / 2;
      return (
        <Text key={`x-${idx}`} position={[x, -0.5, (rows - 1) / 2 + 0.8]} rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.3} color="#22d3ee" anchorX="center" anchorY="middle">
          {formatVal(v)}
        </Text>
      );
    });
  }, [axisX, cols, rows]);

  const yLabels = useMemo(() => {
    if (axisY.length === 0) return null;
    const step = Math.max(1, Math.floor(axisY.length / 8));
    return axisY.filter((_, i) => i % step === 0 || i === axisY.length - 1).map((v, idx) => {
      const origIdx = axisY.indexOf(v);
      const z = (rows - 1) / 2 - origIdx;
      return (
        <Text key={`y-${idx}`} position={[-(cols - 1) / 2 - 0.8, -0.5, z]} rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.3} color="#22d3ee" anchorX="center" anchorY="middle">
          {formatVal(v)}
        </Text>
      );
    });
  }, [axisY, cols, rows]);

  return <>{xLabels}{yLabels}</>;
}

/* ── Auto-rotate ── */
function AutoRotate({ enabled }: { enabled: boolean }) {
  const controlsRef = useRef<any>(null);
  useFrame(() => {
    if (enabled && controlsRef.current) {
      controlsRef.current.autoRotate = true;
      controlsRef.current.autoRotateSpeed = 0.5;
    }
  });
  return <OrbitControls ref={controlsRef} autoRotate={enabled} autoRotateSpeed={0.5}
    enableDamping dampingFactor={0.1} minDistance={2} maxDistance={30} />;
}

/* ── Main Component ── */
export default function Map3DSurface({ map, compuMethod, showModified = false }: Map3DSurfaceProps) {
  const values = map.physValues || map.rawValues || [];
  const rows = map.rows || 1;
  const cols = map.cols || values.length;

  const { minVal, maxVal } = useMemo(() => {
    if (values.length === 0) return { minVal: 0, maxVal: 1 };
    let mn = Infinity, mx = -Infinity;
    for (const v of values) { if (v < mn) mn = v; if (v > mx) mx = v; }
    return { minVal: mn, maxVal: mx };
  }, [values]);

  if (rows < 2 || cols < 2) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500 text-sm font-mono">
        3D surface requires a 2D map (minimum 2x2). This map is {rows}x{cols}.
      </div>
    );
  }

  const camDist = Math.max(cols, rows) * 0.8;

  return (
    <div className="w-full h-[400px] bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden relative">
      <Canvas camera={{ position: [camDist * 0.6, camDist * 0.5, camDist * 0.6], fov: 50, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: false }} style={{ background: '#09090b' }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 10, 5]} intensity={0.8} />
        <directionalLight position={[-5, 5, -5]} intensity={0.3} />
        <pointLight position={[0, 8, 0]} intensity={0.4} />

        <SurfaceMesh values={values} rows={rows} cols={cols} minVal={minVal} maxVal={maxVal} />
        <WireframeOverlay values={values} rows={rows} cols={cols} minVal={minVal} maxVal={maxVal} />
        <AxisLabels map={map} rows={rows} cols={cols} />

        <AutoRotate enabled={false} />
      </Canvas>

      {/* Legend overlay */}
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-zinc-900/90 px-2.5 py-1.5 rounded border border-zinc-700/50">
        <span className="text-[10px] font-mono text-zinc-500">{formatVal(minVal)}</span>
        <div className="flex h-2 w-24 rounded-sm overflow-hidden">
          {Array.from({ length: 15 }).map((_, i) => {
            const t = i / 14;
            const v = minVal + (maxVal - minVal) * t;
            const c = valueToColor3(v, minVal, maxVal);
            return <div key={i} className="flex-1" style={{ backgroundColor: `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})` }} />;
          })}
        </div>
        <span className="text-[10px] font-mono text-zinc-500">{formatVal(maxVal)}</span>
        {compuMethod?.unit && <span className="text-[10px] font-mono text-zinc-600 ml-1">{compuMethod.unit}</span>}
      </div>

      {/* Controls hint */}
      <div className="absolute top-3 right-3 text-[10px] font-mono text-zinc-600 bg-zinc-900/80 px-2 py-1 rounded">
        Drag: rotate · Scroll: zoom · Shift+drag: pan
      </div>

      {/* Map info */}
      <div className="absolute top-3 left-3 text-[10px] font-mono text-zinc-500 bg-zinc-900/80 px-2 py-1 rounded">
        {map.name} · {rows}x{cols}
      </div>
    </div>
  );
}
