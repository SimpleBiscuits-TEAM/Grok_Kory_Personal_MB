/**
 * Map Diff Modal
 * 
 * Scrollable modal showing all map differences between two binary files
 */

import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { CalibrationMap } from '@/lib/editorEngine';

interface MapDiff {
  mapIndex: number;
  map: CalibrationMap;
  changedCells: number;
  totalCells: number;
  valuesA: number[];
  valuesB: number[];
  maxIncrease: number;
  maxDecrease: number;
  minValueA: number;
  maxValueA: number;
  avgValueA: number;
  minValueB: number;
  maxValueB: number;
  avgValueB: number;
}

interface MapDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  diffs: MapDiff[];
  title?: string;
}

export default function MapDiffModal({ isOpen, onClose, diffs, title = 'Map Differences' }: MapDiffModalProps) {
  const [expandedMaps, setExpandedMaps] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const toggleExpanded = (mapIndex: number) => {
    const newExpanded = new Set(expandedMaps);
    if (newExpanded.has(mapIndex)) {
      newExpanded.delete(mapIndex);
    } else {
      newExpanded.add(mapIndex);
    }
    setExpandedMaps(newExpanded);
  };

  const filteredDiffs = diffs.filter(diff =>
    diff.map.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (diff.map.description && diff.map.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const totalChangedMaps = diffs.filter(d => d.changedCells > 0).length;
  const totalChangedCells = diffs.reduce((sum, d) => sum + d.changedCells, 0);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-[90vw] h-[90vh] max-w-4xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
          <div>
            <h2 className="text-lg font-bold text-white">{title}</h2>
            <p className="text-xs text-zinc-400 mt-1">
              {totalChangedMaps} maps changed • {totalChangedCells} total cells modified
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-zinc-700">
          <input
            type="text"
            placeholder="Search maps by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {filteredDiffs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-500">
              {diffs.length === 0 ? 'No map differences found' : 'No matches for search'}
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {filteredDiffs.map((diff) => {
                const isExpanded = expandedMaps.has(diff.mapIndex);
                const pctChanged = ((diff.changedCells / diff.totalCells) * 100).toFixed(1);

                return (
                  <div key={diff.mapIndex} className="hover:bg-zinc-800/30 transition-colors">
                    {/* Summary row */}
                    <button
                      onClick={() => toggleExpanded(diff.mapIndex)}
                      className="w-full px-6 py-3 flex items-center gap-3 text-left hover:bg-zinc-800/50 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-mono text-white truncate">{diff.map.name}</div>
                        {diff.map.description && (
                          <div className="text-xs text-zinc-400 truncate mt-0.5">{diff.map.description}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-4 flex-shrink-0 text-xs">
                        <div className="text-amber-400 font-mono">
                          {diff.changedCells}/{diff.totalCells} ({pctChanged}%)
                        </div>
                        {diff.maxIncrease > 0 && (
                          <div className="text-emerald-500">+{diff.maxIncrease.toFixed(1)}</div>
                        )}
                        {diff.maxDecrease < 0 && (
                          <div className="text-red-500">{diff.maxDecrease.toFixed(1)}</div>
                        )}
                      </div>
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-6 py-4 bg-zinc-800/20 border-t border-zinc-800">
                        <div className="grid grid-cols-2 gap-4 text-xs mb-4">
                          <div>
                            <div className="text-zinc-400 mb-1">Original (A)</div>
                            <div className="space-y-0.5 font-mono text-zinc-300">
                              <div>Min: {diff.minValueA.toFixed(2)}</div>
                              <div>Max: {diff.maxValueA.toFixed(2)}</div>
                              <div>Avg: {diff.avgValueA.toFixed(2)}</div>
                            </div>
                          </div>
                          <div>
                            <div className="text-zinc-400 mb-1">Compare (B)</div>
                            <div className="space-y-0.5 font-mono text-zinc-300">
                              <div>Min: {diff.minValueB.toFixed(2)}</div>
                              <div>Max: {diff.maxValueB.toFixed(2)}</div>
                              <div>Avg: {diff.avgValueB.toFixed(2)}</div>
                            </div>
                          </div>
                        </div>

                        {/* Changed cells preview */}
                        <div className="text-zinc-400 text-xs mb-2">Changed cells:</div>
                        <div className="bg-zinc-900 rounded p-3 max-h-40 overflow-auto">
                          <div className="space-y-1 font-mono text-[11px]">
                            {diff.valuesA.map((vA, i) => {
                              const vB = diff.valuesB[i];
                              if (vA === vB) return null;
                              const delta = vB - vA;
                              return (
                                <div key={i} className="text-zinc-300">
                                  <span className="text-zinc-600">[{i}]</span>
                                  {' '}
                                  <span className="text-zinc-400">{vA.toFixed(2)}</span>
                                  {' '}
                                  <span className="text-zinc-600">→</span>
                                  {' '}
                                  <span className={delta > 0 ? 'text-emerald-400' : 'text-red-400'}>
                                    {vB.toFixed(2)}
                                  </span>
                                  {' '}
                                  <span className={delta > 0 ? 'text-emerald-600' : 'text-red-600'}>
                                    ({delta > 0 ? '+' : ''}{delta.toFixed(2)})
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
