/**
 * J1939 Logging Panel Component
 * 
 * Provides real-time logging of J1939 parameters from heavy-duty vehicles.
 * Displays engine, transmission, temperature, and fuel parameters.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  J1939PGN,
  J1939Parameter,
  J1939ParameterReading,
  J1939_PGNS,
  parseJ1939Parameter,
} from '@/lib/j1939Protocol';

export interface J1939LoggingPanelProps {
  isConnected: boolean;
  onParametersSelected?: (pgns: number[]) => void;
  onDataReceived?: (readings: J1939ParameterReading[]) => void;
}

export function J1939LoggingPanel({
  isConnected,
  onParametersSelected,
  onDataReceived,
}: J1939LoggingPanelProps) {
  const [selectedPGNs, setSelectedPGNs] = useState<Set<number>>(
    new Set([61444, 61443, 110592]) // EEC1, ETC1, ET1 by default
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedPGN, setExpandedPGN] = useState<number | null>(null);
  const [readings, setReadings] = useState<Map<string, J1939ParameterReading>>(new Map());

  // Get all PGNs
  const allPGNs = Object.values(J1939_PGNS) as J1939PGN[];

  // Filter PGNs by search term
  const filteredPGNs = allPGNs.filter((pgn) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      pgn.name.toLowerCase().includes(searchLower) ||
      pgn.description.toLowerCase().includes(searchLower) ||
      pgn.parameters.some(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.shortName.toLowerCase().includes(searchLower)
      )
    );
  });

  // Handle PGN selection
  const togglePGN = useCallback(
    (pgn: number) => {
      const newSelected = new Set(selectedPGNs);
      if (newSelected.has(pgn)) {
        newSelected.delete(pgn);
      } else {
        newSelected.add(pgn);
      }
      setSelectedPGNs(newSelected);
      onParametersSelected?.(Array.from(newSelected).map((n) => n));
    },
    [selectedPGNs, onParametersSelected]
  );

  // Select all
  const selectAll = useCallback(() => {
    const allPGNNumbers = filteredPGNs.map((p) => p.pgn);
    setSelectedPGNs(new Set(allPGNNumbers));
    onParametersSelected?.([...allPGNNumbers]);
  }, [filteredPGNs, onParametersSelected]);

  // Clear all
  const clearAll = useCallback(() => {
    setSelectedPGNs(new Set());
    onParametersSelected?.([]);
  }, [onParametersSelected]);

  // Convert Set to array for iteration
  const selectedPGNsArray = Array.from(selectedPGNs);

  // Simulate receiving J1939 data (in real implementation, this would come from CAN adapter)
  useEffect(() => {
    if (!isConnected || selectedPGNs.size === 0) return;

    const interval = setInterval(() => {
      const newReadings = new Map(readings);

      for (const pgnNum of selectedPGNsArray) {
        const pgnDef = J1939_PGNS[pgnNum];
        if (!pgnDef) continue;

        // Simulate data
        for (const param of pgnDef.parameters) {
          const simulatedData = new Array(8).fill(0).map(() => Math.floor(Math.random() * 256));
          const value = parseJ1939Parameter(simulatedData, param);

          const reading: J1939ParameterReading = {
            pgn: pgnNum,
            pgnName: pgnDef.name,
            parameter: param.name,
            shortName: param.shortName,
            value,
            unit: param.unit,
            timestamp: Date.now(),
            sourceAddress: 0x00, // Simulated
          };

          const readingKey = `${pgnNum}-${param.shortName}`;
          newReadings.set(readingKey, reading);
        }
      }

      setReadings(newReadings);
      onDataReceived?.(Array.from(newReadings.values()));
    }, 1000);

    return () => clearInterval(interval);
  }, [isConnected, selectedPGNsArray, readings, onDataReceived]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">J1939 Parameters</h3>
        <div className="text-sm text-muted-foreground">
          {selectedPGNs.size} PGN{selectedPGNs.size !== 1 ? 's' : ''} selected
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

      {/* PGN List */}
      <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-3">
        {filteredPGNs.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            No parameters found
          </div>
        ) : (
          filteredPGNs.map((pgn) => (
            <div key={pgn.pgn} className="space-y-2">
              {/* PGN Header */}
              <div
                className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer"
                onClick={() =>
                  setExpandedPGN(expandedPGN === pgn.pgn ? null : pgn.pgn)
                }
              >
                <Checkbox
                  checked={selectedPGNs.has(pgn.pgn)}
                  onCheckedChange={() => togglePGN(pgn.pgn)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{pgn.name}</div>
                  <div className="text-xs text-muted-foreground">
                    PGN {pgn.pgn} • {pgn.parameters.length} parameters
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {pgn.transmissionRate || 'on change'}
                </div>
              </div>

              {/* Parameters (expanded) */}
              {expandedPGN === pgn.pgn && (
                <div className="ml-6 space-y-1 border-l-2 border-muted pl-3">
                  {pgn.parameters.map((param) => {
                    const readingKey = `${pgn.pgn}-${param.shortName}`;
                    const reading = readings.get(readingKey);
                    return (
                      <div
                        key={param.shortName}
                        className="text-xs p-2 rounded bg-muted/30"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium">{param.name}</div>
                            <div className="text-muted-foreground">
                              {param.shortName}
                            </div>
                          </div>
                          {reading && (
                            <div className="text-right">
                              <div className="font-semibold">
                                {reading.value.toFixed(2)} {reading.unit}
                              </div>
                              <div className="text-muted-foreground text-xs">
                                {new Date(reading.timestamp).toLocaleTimeString()}
                              </div>
                            </div>
                          )}
                        </div>
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
          <span className="text-green-600">● Connected (J1939 250kbps)</span>
        ) : (
          <span className="text-red-600">● Not Connected</span>
        )}
      </div>
    </div>
  );
}
