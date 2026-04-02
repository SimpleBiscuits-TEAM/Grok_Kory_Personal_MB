/**
 * Map Smoothing Panel
 * 
 * Provides UI for selecting ranges and applying smoothing algorithms
 * Features:
 * - Range selection (start/end index)
 * - Method selection with descriptions
 * - Strength slider (0-1)
 * - Live preview of smoothing effect
 * - Context menu integration
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Zap, RotateCcw, Check } from 'lucide-react';
import {
  applySmoothingMethod,
  smoothRange,
  getSmoothingMethods,
  SmoothingMethod,
  SmoothingOptions,
  SmoothingResult,
} from '@/lib/mapSmoothingAlgorithms';

interface MapSmoothingPanelProps {
  mapValues: number[];
  startIndex: number;
  endIndex: number;
  onApply: (smoothedValues: number[]) => void;
  onCancel: () => void;
  mapName?: string;
}

export default function MapSmoothingPanel({
  mapValues,
  startIndex,
  endIndex,
  onApply,
  onCancel,
  mapName = 'Map',
}: MapSmoothingPanelProps) {
  const [method, setMethod] = useState<SmoothingMethod>('spline');
  const [strength, setStrength] = useState(0.5);
  const [iterations, setIterations] = useState(1);
  const [preview, setPreview] = useState<SmoothingResult | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const smoothingMethods = getSmoothingMethods();

  // Update preview when parameters change
  const updatePreview = useCallback(() => {
    if (startIndex >= endIndex) return;

    const range = mapValues.slice(startIndex, endIndex + 1);
    const result = applySmoothingMethod(range, {
      method,
      strength,
      preserveEndpoints: true,
      iterations,
    });

    setPreview(result);
  }, [mapValues, startIndex, endIndex, method, strength, iterations]);

  // Auto-update preview
  useState(() => {
    updatePreview();
  });

  const handleApply = useCallback(() => {
    if (!preview) return;

    setIsApplying(true);
    setTimeout(() => {
      const smoothed = smoothRange(mapValues, startIndex, endIndex, {
        method,
        strength,
        preserveEndpoints: true,
        iterations,
      });

      onApply(smoothed);
      setIsApplying(false);
    }, 100);
  }, [preview, mapValues, startIndex, endIndex, method, strength, iterations, onApply]);

  const selectedMethod = smoothingMethods.find(m => m.id === method);

  return (
    <Card className="p-4 bg-zinc-900 border-zinc-700 space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">
          Smooth {mapName} (Range: {startIndex} → {endIndex})
        </h3>
        <p className="text-xs text-zinc-400">
          Endpoints will be preserved. Only intermediate values will be smoothed.
        </p>
      </div>

      {/* Method Selection */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-zinc-300">Algorithm</label>
        <Select value={method} onValueChange={(v) => setMethod(v as SmoothingMethod)}>
          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            {smoothingMethods.map(m => (
              <SelectItem key={m.id} value={m.id} className="text-white">
                <div className="flex items-center gap-2">
                  {m.recommended && <span className="text-ppei-red">★</span>}
                  {m.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedMethod && (
          <p className="text-xs text-zinc-400 italic">{selectedMethod.description}</p>
        )}
      </div>

      {/* Strength Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-zinc-300">Smoothing Strength</label>
          <span className="text-xs font-mono text-ppei-red">{(strength * 100).toFixed(0)}%</span>
        </div>
        <Slider
          value={[strength]}
          onValueChange={(v) => setStrength(v[0])}
          min={0}
          max={1}
          step={0.05}
          className="w-full"
        />
        <p className="text-xs text-zinc-400">
          {strength < 0.3 && 'Gentle smoothing - minimal changes'}
          {strength >= 0.3 && strength < 0.7 && 'Moderate smoothing - balanced effect'}
          {strength >= 0.7 && 'Aggressive smoothing - significant changes'}
        </p>
      </div>

      {/* Iterations */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-zinc-300">Iterations</label>
          <span className="text-xs font-mono text-ppei-red">{iterations}x</span>
        </div>
        <Slider
          value={[iterations]}
          onValueChange={(v) => setIterations(Math.round(v[0]))}
          min={1}
          max={5}
          step={1}
          className="w-full"
        />
        <p className="text-xs text-zinc-400">
          More iterations = smoother result (slower)
        </p>
      </div>

      {/* Preview Stats */}
      {preview && (
        <div className="bg-zinc-800 rounded p-3 space-y-1 border border-zinc-700">
          <div className="text-xs font-mono text-zinc-300">
            <div>Max Change: <span className="text-ppei-red">{preview.maxChange.toFixed(2)}</span></div>
            <div>Avg Change: <span className="text-ppei-red">{preview.avgChange.toFixed(2)}</span></div>
            <div>Points: {preview.smoothed.length}</div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <Button
          onClick={handleApply}
          disabled={!preview || isApplying}
          className="flex-1 bg-ppei-red hover:bg-ppei-red/90 text-white gap-2"
        >
          <Check className="w-4 h-4" />
          {isApplying ? 'Applying...' : 'Apply Smoothing'}
        </Button>
        <Button
          onClick={onCancel}
          variant="outline"
          className="flex-1 border-zinc-700 hover:bg-zinc-800"
        >
          <RotateCcw className="w-4 h-4" />
          Cancel
        </Button>
      </div>
    </Card>
  );
}
