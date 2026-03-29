/**
 * K-Line Logging Panel Component
 * 
 * Provides real-time logging of K-Line parameters from legacy vehicles.
 * Supports OBD-II Modes 01-09 and manufacturer-specific modes.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  KLINE_STANDARD_PIDS,
  KLineParameter,
  KLineParameterReading,
  KLineService,
} from '@/lib/klineProtocol';

export interface KLineLoggingPanelProps {
  isConnected: boolean;
  onParametersSelected?: (pids: number[]) => void;
  onDataReceived?: (readings: KLineParameterReading[]) => void;
}

interface PIDCategory {
  name: string;
  pids: KLineParameter[];
}

export function KLineLoggingPanel({
  isConnected,
  onParametersSelected,
  onDataReceived,
}: KLineLoggingPanelProps) {
  const [selectedPIDs, setSelectedPIDs] = useState<Set<number>>(
    new Set([0x0C, 0x0D, 0x10, 0x05, 0x0B]) // RPM, Speed, MAF, ECT, MAP by default
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>('engine');
  const [readings, setReadings] = useState<Map<string, KLineParameterReading>>(new Map());

  // Group PIDs by category
  const pidsByCategory: Record<string, KLineParameter[]> = {};
  KLINE_STANDARD_PIDS.forEach((pid) => {
    if (!pidsByCategory[pid.category]) {
      pidsByCategory[pid.category] = [];
    }
    pidsByCategory[pid.category].push(pid);
  });

  // Filter PIDs by search term
  const filteredCategories: PIDCategory[] = Object.entries(pidsByCategory)
    .map(([name, pids]) => ({
      name,
      pids: pids.filter((p) => {
        const searchLower = searchTerm.toLowerCase();
        return (
          p.name.toLowerCase().includes(searchLower) ||
          p.shortName.toLowerCase().includes(searchLower)
        );
      }),
    }))
    .filter((cat) => cat.pids.length > 0);

  // Handle PID selection
  const togglePID = useCallback(
    (pid: number) => {
      const newSelected = new Set(selectedPIDs);
      if (newSelected.has(pid)) {
        newSelected.delete(pid);
      } else {
        newSelected.add(pid);
      }
      setSelectedPIDs(newSelected);
      onParametersSelected?.(Array.from(newSelected).map((n) => n));
    },
    [selectedPIDs, onParametersSelected]
  );

  // Select all
  const selectAll = useCallback(() => {
    const allPIDs = KLINE_STANDARD_PIDS.map((p) => p.pid);
    setSelectedPIDs(new Set(allPIDs));
    onParametersSelected?.([...allPIDs]);
  }, [onParametersSelected]);

  // Clear all
  const clearAll = useCallback(() => {
    setSelectedPIDs(new Set());
    onParametersSelected?.([]);
  }, [onParametersSelected]);

  // Convert Set to array for iteration
  const selectedPIDsArray = Array.from(selectedPIDs);

  // Simulate receiving K-Line data
  useEffect(() => {
    if (!isConnected || selectedPIDs.size === 0) return;

    const interval = setInterval(() => {
      const newReadings = new Map(readings);

      for (const pidNum of selectedPIDsArray) {
        const pidDef = KLINE_STANDARD_PIDS.find((p) => p.pid === pidNum);
        if (!pidDef) continue;

        // Simulate data
        const simulatedBytes = new Array(pidDef.bytes).fill(0).map(() => Math.floor(Math.random() * 256));
        const value = pidDef.formula(simulatedBytes);

        const reading: KLineParameterReading = {
          pid: pidNum,
          name: pidDef.name,
          shortName: pidDef.shortName,
          value,
          unit: pidDef.unit,
          timestamp: Date.now(),
          service: pidDef.service,
        };

        const key = `${pidNum}-${pidDef.shortName}`;
        newReadings.set(key, reading);
      }

      setReadings(newReadings);
      onDataReceived?.(Array.from(newReadings.values()));
    }, 1000);

    return () => clearInterval(interval);
  }, [isConnected, selectedPIDsArray, readings, onDataReceived]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">K-Line Parameters (OBD-II)</h3>
        <div className="text-sm text-muted-foreground">
          {selectedPIDs.size} PID{selectedPIDs.size !== 1 ? 's' : ''} selected
        </div>
      </div>

      {/* Search */}
      <Input
        placeholder="Search parameters..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="h-9"
      />

      {/* Quick Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={selectAll}
          disabled={!isConnected}
        >
          Select All
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={clearAll}
          disabled={!isConnected}
        >
          Clear All
        </Button>
      </div>

      {/* PID Categories */}
      <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-3">
        {filteredCategories.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            No parameters found
          </div>
        ) : (
          filteredCategories.map((category) => (
            <div key={category.name} className="space-y-2">
              {/* Category Header */}
              <div
                className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer font-medium"
                onClick={() =>
                  setExpandedCategory(
                    expandedCategory === category.name ? null : category.name
                  )
                }
              >
                <div className="flex-1 capitalize">{category.name}</div>
                <div className="text-xs text-muted-foreground">
                  {category.pids.length} parameters
                </div>
              </div>

              {/* PIDs (expanded) */}
              {expandedCategory === category.name && (
                <div className="ml-4 space-y-1 border-l-2 border-muted pl-3">
                  {category.pids.map((pid) => {
                    const readingKey = `${pid.pid}-${pid.shortName}`;
                    const reading = readings.get(readingKey);
                    return (
                      <div
                        key={pid.pid}
                        className="flex items-center gap-2 p-2 rounded hover:bg-muted/30"
                      >
                        <Checkbox
                          checked={selectedPIDs.has(pid.pid)}
                          onCheckedChange={() => togglePID(pid.pid)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{pid.name}</div>
                          <div className="text-xs text-muted-foreground">
                            PID 0x{pid.pid.toString(16).toUpperCase().padStart(2, '0')} •{' '}
                            {pid.shortName}
                          </div>
                        </div>
                        {reading && (
                          <div className="text-right text-xs">
                            <div className="font-semibold">
                              {reading.value.toFixed(2)} {reading.unit}
                            </div>
                            <div className="text-muted-foreground">
                              {new Date(reading.timestamp).toLocaleTimeString()}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Connection Status */}
      <div className="text-xs text-muted-foreground">
        {isConnected ? (
          <span className="text-green-600">● Connected (K-Line 10.4kbaud)</span>
        ) : (
          <span className="text-red-600">● Not Connected</span>
        )}
      </div>

      {/* Info */}
      <Card className="p-3 bg-muted/30 border-0">
        <div className="text-xs text-muted-foreground space-y-1">
          <div>
            <strong>K-Line Protocol:</strong> ISO 9141-2 single-wire communication
          </div>
          <div>
            <strong>Supported Modes:</strong> 01 (Current Data), 02 (Freeze Frame), 03
            (Stored DTCs), 04 (Clear DTCs), 09 (Vehicle Info)
          </div>
          <div>
            <strong>Best For:</strong> Pre-2010 vehicles, European cars, legacy systems
          </div>
        </div>
      </Card>
    </div>
  );
}
