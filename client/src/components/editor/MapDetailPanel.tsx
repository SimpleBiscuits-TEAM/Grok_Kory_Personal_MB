/**
 * MapDetailPanel — Displays selected map details with table editor and 3D view
 *
 * Shows map metadata, table/3D toggle, and the edit controls.
 */

import { useState, useCallback } from 'react';
import { CalibrationMap, CompuMethod, EcuDefinition } from '@/lib/editorEngine';
import MapTableEditor from './MapTableEditor';
import Surface3DView from './Surface3DView';
import { Table2, Box, Info, Undo2, Copy, ClipboardPaste } from 'lucide-react';

interface MapDetailPanelProps {
  map: CalibrationMap;
  ecuDef: EcuDefinition;
  onValuesChanged: (mapName: string, newPhysValues: number[]) => void;
  onResetMap: (mapName: string) => void;
  readOnly?: boolean;
}

export default function MapDetailPanel({ map, ecuDef, onValuesChanged, onResetMap, readOnly = false }: MapDetailPanelProps) {
  const [viewMode, setViewMode] = useState<'table' | '3d' | 'info'>('table');
  const cm = ecuDef.compuMethods.get(map.compuMethod);
  const unit = cm?.unit || '';
  const values = map.physValues || map.rawValues || [];

  // Stats
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  const isMap = map.type === 'MAP' && (map.rows || 1) >= 2 && (map.cols || 1) >= 2;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-mono font-bold text-white truncate" title={map.name}>
              {map.name}
            </h3>
            {map.description && (
              <p className="text-[11px] text-zinc-400 mt-0.5 truncate" title={map.description}>
                {map.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 ml-3 shrink-0">
            <button
              className={`p-1.5 rounded transition-colors ${viewMode === 'table' ? 'bg-ppei-red/20 text-ppei-red' : 'text-zinc-500 hover:text-zinc-300'}`}
              onClick={() => setViewMode('table')}
              title="Table view"
            >
              <Table2 className="w-4 h-4" />
            </button>
            {isMap && (
              <button
                className={`p-1.5 rounded transition-colors ${viewMode === '3d' ? 'bg-ppei-red/20 text-ppei-red' : 'text-zinc-500 hover:text-zinc-300'}`}
                onClick={() => setViewMode('3d')}
                title="3D surface view"
              >
                <Box className="w-4 h-4" />
              </button>
            )}
            <button
              className={`p-1.5 rounded transition-colors ${viewMode === 'info' ? 'bg-ppei-red/20 text-ppei-red' : 'text-zinc-500 hover:text-zinc-300'}`}
              onClick={() => setViewMode('info')}
              title="Map info"
            >
              <Info className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-zinc-700 mx-1" />
            {!readOnly && map.modified && (
              <button
                className="p-1.5 rounded text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                onClick={() => onResetMap(map.name)}
                title="Reset to original"
              >
                <Undo2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 mt-2 text-[10px] font-mono">
          <span className="text-zinc-500">
            Type: <span className="text-zinc-300">{map.type}</span>
          </span>
          {map.rows && map.cols && (
            <span className="text-zinc-500">
              Size: <span className="text-zinc-300">{map.cols}×{map.rows}</span>
            </span>
          )}
          <span className="text-zinc-500">
            Addr: <span className="text-zinc-300">0x{map.address.toString(16).toUpperCase()}</span>
          </span>
          {unit && (
            <span className="text-zinc-500">
              Unit: <span className="text-cyan-400">{unit}</span>
            </span>
          )}
          {map.modified && (
            <span className="text-yellow-400 font-semibold ml-auto">MODIFIED</span>
          )}
        </div>

        {/* Value summary */}
        <div className="flex items-center gap-4 mt-1 text-[10px] font-mono text-zinc-500">
          <span>Min: <span className="text-blue-400">{min.toFixed(2)}</span></span>
          <span>Max: <span className="text-red-400">{max.toFixed(2)}</span></span>
          <span>Avg: <span className="text-zinc-300">{avg.toFixed(2)}</span></span>
          <span>Limits: [{map.lowerLimit}, {map.upperLimit}]</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'table' && (
          <MapTableEditor
            map={map}
            compuMethod={cm}
            onValuesChanged={onValuesChanged}
            readOnly={readOnly}
          />
        )}
        {viewMode === '3d' && isMap && (
          <div className="p-2">
            <Surface3DView map={map} unit={unit} />
          </div>
        )}
        {viewMode === 'info' && (
          <div className="p-4 space-y-3 text-xs font-mono">
            <div>
              <span className="text-zinc-500">Name:</span>
              <span className="text-white ml-2">{map.name}</span>
            </div>
            <div>
              <span className="text-zinc-500">Description:</span>
              <span className="text-zinc-300 ml-2">{map.description || '(none)'}</span>
            </div>
            <div>
              <span className="text-zinc-500">Type:</span>
              <span className="text-zinc-300 ml-2">{map.type}</span>
            </div>
            <div>
              <span className="text-zinc-500">Address:</span>
              <span className="text-cyan-400 ml-2">0x{map.address.toString(16).toUpperCase().padStart(8, '0')}</span>
            </div>
            <div>
              <span className="text-zinc-500">Record Layout:</span>
              <span className="text-zinc-300 ml-2">{map.recordLayout}</span>
            </div>
            <div>
              <span className="text-zinc-500">Compu Method:</span>
              <span className="text-zinc-300 ml-2">{map.compuMethod}</span>
            </div>
            {cm && (
              <div>
                <span className="text-zinc-500">Conversion:</span>
                <span className="text-zinc-300 ml-2">
                  {cm.type}
                  {cm.coefficients && ` [${cm.coefficients.join(', ')}]`}
                </span>
              </div>
            )}
            <div>
              <span className="text-zinc-500">Limits:</span>
              <span className="text-zinc-300 ml-2">[{map.lowerLimit}, {map.upperLimit}]</span>
            </div>
            {map.axes.length > 0 && (
              <div className="mt-2">
                <span className="text-zinc-500 block mb-1">Axes:</span>
                {map.axes.map((axis, i) => (
                  <div key={i} className="pl-4 text-zinc-400">
                    Axis {i === 0 ? 'X' : 'Y'}: {axis.type} — {axis.inputQuantity} — {axis.maxAxisPoints} pts
                    [{axis.lowerLimit}, {axis.upperLimit}]
                    {axis.axisPtsRef && <span className="text-cyan-400/60 ml-1">→ {axis.axisPtsRef}</span>}
                  </div>
                ))}
              </div>
            )}
            {map.annotations.length > 0 && (
              <div className="mt-2">
                <span className="text-zinc-500 block mb-1">Annotations:</span>
                {map.annotations.map((a, i) => (
                  <div key={i} className="pl-4 text-zinc-400 text-[11px]">{a}</div>
                ))}
              </div>
            )}
            <div>
              <span className="text-zinc-500">Category:</span>
              <span className="text-zinc-300 ml-2">{map.category} / {map.subcategory}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
