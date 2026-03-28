/**
 * Map Math Operations Panel
 * 
 * Provides buttons to apply math operations to selected cells:
 * - Add/Subtract fixed value
 * - Multiply/Divide by factor
 * - Percentage increase/decrease
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Minus, X, Divide, Percent } from 'lucide-react';

interface MapMathOperationsProps {
  selectedCellCount: number;
  onAdd: (value: number) => void;
  onSubtract: (value: number) => void;
  onMultiply: (factor: number) => void;
  onDivide: (factor: number) => void;
  onPercentageChange: (percentage: number) => void;
  disabled?: boolean;
}

export default function MapMathOperations({
  selectedCellCount,
  onAdd,
  onSubtract,
  onMultiply,
  onDivide,
  onPercentageChange,
  disabled = false,
}: MapMathOperationsProps) {
  const [addValue, setAddValue] = useState('0');
  const [multiplyFactor, setMultiplyFactor] = useState('1.0');
  const [percentageValue, setPercentageValue] = useState('0');

  if (selectedCellCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 p-2 bg-zinc-800 rounded border border-zinc-700">
      <span className="text-xs text-zinc-400 font-mono">{selectedCellCount} selected</span>

      {/* Add/Subtract */}
      <Dialog>
        <DialogTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 border-zinc-700 hover:bg-zinc-700"
            disabled={disabled}
          >
            <Plus className="w-3 h-3" />
            Add
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-zinc-900 border-zinc-700">
          <DialogHeader>
            <DialogTitle>Add Value</DialogTitle>
            <DialogDescription>Add a fixed value to all selected cells</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="number"
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
              placeholder="Value to add"
              className="bg-zinc-800 border-zinc-700"
              step="0.1"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  onAdd(parseFloat(addValue) || 0);
                }}
                className="flex-1 bg-ppei-red hover:bg-ppei-red/90"
              >
                Add
              </Button>
              <Button
                onClick={() => {
                  onSubtract(parseFloat(addValue) || 0);
                }}
                variant="outline"
                className="flex-1 border-zinc-700"
              >
                Subtract
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Multiply/Divide */}
      <Dialog>
        <DialogTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 border-zinc-700 hover:bg-zinc-700"
            disabled={disabled}
          >
            <X className="w-3 h-3" />
            Multiply
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-zinc-900 border-zinc-700">
          <DialogHeader>
            <DialogTitle>Multiply/Divide</DialogTitle>
            <DialogDescription>Multiply or divide all selected cells by a factor</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="number"
              value={multiplyFactor}
              onChange={(e) => setMultiplyFactor(e.target.value)}
              placeholder="Factor"
              className="bg-zinc-800 border-zinc-700"
              step="0.01"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  onMultiply(parseFloat(multiplyFactor) || 1);
                }}
                className="flex-1 bg-ppei-red hover:bg-ppei-red/90"
              >
                <X className="w-3 h-3 mr-1" />
                Multiply
              </Button>
              <Button
                onClick={() => {
                  onDivide(parseFloat(multiplyFactor) || 1);
                }}
                variant="outline"
                className="flex-1 border-zinc-700"
              >
                <Divide className="w-3 h-3 mr-1" />
                Divide
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Percentage Change */}
      <Dialog>
        <DialogTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 border-zinc-700 hover:bg-zinc-700"
            disabled={disabled}
          >
            <Percent className="w-3 h-3" />
            %
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-zinc-900 border-zinc-700">
          <DialogHeader>
            <DialogTitle>Percentage Change</DialogTitle>
            <DialogDescription>Increase or decrease values by percentage</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="number"
              value={percentageValue}
              onChange={(e) => setPercentageValue(e.target.value)}
              placeholder="Percentage (-100 to 100)"
              className="bg-zinc-800 border-zinc-700"
              step="0.1"
            />
            <Button
              onClick={() => {
                onPercentageChange(parseFloat(percentageValue) || 0);
              }}
              className="w-full bg-ppei-red hover:bg-ppei-red/90"
            >
              Apply {percentageValue}%
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
