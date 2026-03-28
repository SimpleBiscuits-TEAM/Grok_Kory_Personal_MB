import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eye, EyeOff, Copy, Download } from 'lucide-react';
import { useState, useMemo } from 'react';

interface MapDiff {
  name: string;
  address: number;
  type: 'VALUE' | 'CURVE' | 'MAP';
  rows: number;
  cols: number;
  originalValues: number[];
  comparisonValues: number[];
  minOriginal: number;
  maxOriginal: number;
  minComparison: number;
  maxComparison: number;
  changedCells: number;
}

interface TuneCompareEnhancedProps {
  mapDiffs: MapDiff[];
  selectedMap: MapDiff | null;
  onSelectMap?: (map: MapDiff) => void;
  onCopyMap?: (map: MapDiff) => void;
  onDownload?: () => void;
}

export const TuneCompareEnhanced: React.FC<TuneCompareEnhancedProps> = ({
  mapDiffs,
  selectedMap,
  onSelectMap,
  onCopyMap,
  onDownload,
}) => {
  const [showOriginal, setShowOriginal] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'changes'>('changes');

  const sortedDiffs = useMemo(() => {
    return [...mapDiffs].sort((a, b) => {
      if (sortBy === 'changes') {
        return b.changedCells - a.changedCells;
      }
      return a.name.localeCompare(b.name);
    });
  }, [mapDiffs, sortBy]);

  const displayValues = selectedMap
    ? showOriginal
      ? selectedMap.originalValues
      : selectedMap.comparisonValues
    : [];

  const displayStats = selectedMap
    ? showOriginal
      ? {
          min: selectedMap.minOriginal,
          max: selectedMap.maxOriginal,
          label: 'Original',
        }
      : {
          min: selectedMap.minComparison,
          max: selectedMap.maxComparison,
          label: 'Comparison',
        }
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
      {/* Left: Map List */}
      <div className="lg:col-span-1 border-r border-gray-200 overflow-y-auto">
        <div className="p-4 space-y-3 sticky top-0 bg-white z-10 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Changed Maps</h3>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={sortBy === 'changes' ? 'default' : 'outline'}
              onClick={() => setSortBy('changes')}
              className="flex-1"
            >
              By Changes
            </Button>
            <Button
              size="sm"
              variant={sortBy === 'name' ? 'default' : 'outline'}
              onClick={() => setSortBy('name')}
              className="flex-1"
            >
              By Name
            </Button>
          </div>
        </div>

        <div className="p-2 space-y-2">
          {sortedDiffs.map((diff) => (
            <div
              key={diff.address}
              onClick={() => onSelectMap?.(diff)}
              className={`p-3 rounded-lg cursor-pointer transition-all ${
                selectedMap?.address === diff.address
                  ? 'bg-blue-100 border-2 border-blue-500'
                  : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">
                    {diff.name}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {diff.type} • {diff.rows}×{diff.cols}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    0x{diff.address.toString(16).toUpperCase()}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-orange-600">
                    {diff.changedCells}
                  </p>
                  <p className="text-xs text-gray-600">changed</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Map Details */}
      <div className="lg:col-span-2 overflow-y-auto">
        {selectedMap ? (
          <div className="p-4 space-y-4">
            {/* Header with Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedMap.name}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedMap.type} • {selectedMap.rows}×{selectedMap.cols} •{' '}
                  {selectedMap.changedCells} cells changed
                </p>
              </div>
              {selectedMap.type !== 'VALUE' && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={showOriginal ? 'default' : 'outline'}
                    onClick={() => setShowOriginal(true)}
                    className="gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    Original
                  </Button>
                  <Button
                    size="sm"
                    variant={!showOriginal ? 'default' : 'outline'}
                    onClick={() => setShowOriginal(false)}
                    className="gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    Comparison
                  </Button>
                </div>
              )}
            </div>

            {/* Stats Card */}
            {displayStats && (
              <Card className="p-3 bg-blue-50 border-blue-200">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-600">View</p>
                    <p className="font-semibold text-gray-900">
                      {displayStats.label}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Min</p>
                    <p className="font-semibold text-gray-900">
                      {displayStats.min.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Max</p>
                    <p className="font-semibold text-gray-900">
                      {displayStats.max.toFixed(2)}
                    </p>
                  </div>
                </div>
                {/* Single VALUE: Show Original, Comparison, Difference */}
                {selectedMap.type === 'VALUE' && (
                  <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-blue-300">
                    <div>
                      <p className="text-xs text-gray-600">Original</p>
                      <p className="font-semibold text-gray-900">
                        {selectedMap.originalValues[0]?.toFixed(4)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Comparison</p>
                      <p className="font-semibold text-gray-900">
                        {selectedMap.comparisonValues[0]?.toFixed(4)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Difference</p>
                      <p
                        className={`font-semibold ${
                          (selectedMap.comparisonValues[0] - selectedMap.originalValues[0]) > 0
                            ? 'text-green-600'
                            : (selectedMap.comparisonValues[0] - selectedMap.originalValues[0]) < 0
                            ? 'text-red-600'
                            : 'text-gray-900'
                        }`}
                      >
                        {(selectedMap.comparisonValues[0] - selectedMap.originalValues[0])?.toFixed(4)}
                      </p>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Map Table */}
            {selectedMap.type === 'VALUE' ? (
              <Card className="p-4 bg-gray-50">
                <p className="text-sm font-mono text-gray-900">
                  {displayValues[0]?.toFixed(4)}
                </p>
              </Card>
            ) : selectedMap.rows === 1 && selectedMap.cols > 1 ? (
              /* Single Row: Display top-to-bottom */
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Original</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <tbody>
                          <tr>
                            {Array.from({ length: selectedMap.cols }).map((_, col) => {
                              const idx = col;
                              const value = selectedMap.originalValues[idx];
                              return (
                                <td
                                  key={`orig-${col}`}
                                  className="p-2 border border-gray-300 text-center font-mono bg-white text-gray-900"
                                >
                                  {value?.toFixed(2)}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Comparison</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <tbody>
                          <tr>
                            {Array.from({ length: selectedMap.cols }).map((_, col) => {
                              const idx = col;
                              const value = selectedMap.comparisonValues[idx];
                              const isChanged = selectedMap.originalValues[idx] !== value;
                              return (
                                <td
                                  key={`comp-${col}`}
                                  className={`p-2 border border-gray-300 text-center font-mono ${
                                    isChanged ? 'bg-green-100 text-green-900' : 'bg-white text-gray-900'
                                  }`}
                                >
                                  {value?.toFixed(2)}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            ) : selectedMap.cols === 1 && selectedMap.rows > 1 ? (
              /* Single Column: Display side-by-side */
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Original</h4>
                  <div className="overflow-y-auto max-h-96">
                    <table className="w-full text-xs border-collapse">
                      <tbody>
                        {Array.from({ length: selectedMap.rows }).map((_, row) => {
                          const idx = row;
                          const value = selectedMap.originalValues[idx];
                          return (
                            <tr key={`orig-${row}`}>
                              <td className="p-2 border border-gray-300 text-center font-mono bg-white text-gray-900">
                                {value?.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Comparison</h4>
                  <div className="overflow-y-auto max-h-96">
                    <table className="w-full text-xs border-collapse">
                      <tbody>
                        {Array.from({ length: selectedMap.rows }).map((_, row) => {
                          const idx = row;
                          const value = selectedMap.comparisonValues[idx];
                          const isChanged = selectedMap.originalValues[idx] !== value;
                          return (
                            <tr key={`comp-${row}`}>
                              <td
                                className={`p-2 border border-gray-300 text-center font-mono ${
                                  isChanged ? 'bg-green-100 text-green-900' : 'bg-white text-gray-900'
                                }`}
                              >
                                {value?.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              /* 2D Map: Standard table with toggle */
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <tbody>
                    {Array.from({ length: selectedMap.rows }).map((_, row) => (
                      <tr key={row}>
                        {Array.from({ length: selectedMap.cols }).map((_, col) => {
                          const idx = row * selectedMap.cols + col;
                          const value = displayValues[idx];
                          const originalValue = selectedMap.originalValues[idx];
                          const comparisonValue = selectedMap.comparisonValues[idx];
                          const isChanged = originalValue !== comparisonValue;

                          return (
                            <td
                              key={`${row}-${col}`}
                              className={`p-2 border border-gray-300 text-center font-mono ${
                                isChanged
                                  ? showOriginal
                                    ? 'bg-red-100 text-red-900'
                                    : 'bg-green-100 text-green-900'
                                  : 'bg-white text-gray-900'
                              }`}
                            >
                              {value?.toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => onCopyMap?.(selectedMap)}
                className="flex-1 gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy to Primary
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onDownload}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Export
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>Select a map to view comparison details</p>
          </div>
        )}
      </div>
    </div>
  );
};
