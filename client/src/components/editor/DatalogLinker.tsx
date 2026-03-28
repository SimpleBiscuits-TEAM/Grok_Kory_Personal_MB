/**
 * DatalogLinker — Link/Unlink datalogs to tune files in the editor
 * 
 * Allows tuners to associate a datalog CSV with the current tune binary
 * so Erika can reference real-world data when suggesting calibration changes.
 * 
 * Features:
 * - Upload datalog CSV to link to current tune
 * - Display linked datalog summary (PIDs, duration, vehicle info)
 * - Quick-view key metrics from linked datalog
 * - Unlink to remove association
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  FileText, Link2, Unlink, Upload, Activity,
  Gauge, Thermometer, Clock, Car, X, ChevronDown, ChevronUp
} from 'lucide-react';
import { toast } from 'sonner';

// Parsed datalog summary
export interface DatalogSummary {
  fileName: string;
  rawCsv: string;
  totalRows: number;
  totalColumns: number;
  durationSeconds: number;
  sampleRateHz: number;
  pidNames: string[];
  vehicleMeta?: {
    vin?: string;
    make?: string;
    model?: string;
    year?: string;
    engine?: string;
  };
  keyMetrics: {
    maxRpm?: number;
    maxBoost?: number;
    maxEgt?: number;
    maxCoolantTemp?: number;
    maxRailPressure?: number;
    maxSpeed?: number;
    avgFuelRate?: number;
  };
}

interface DatalogLinkerProps {
  linkedDatalog: DatalogSummary | null;
  onLink: (datalog: DatalogSummary) => void;
  onUnlink: () => void;
  compact?: boolean;
}

// Parse CSV to extract summary info
function parseDatalogSummary(csv: string, fileName: string): DatalogSummary {
  const lines = csv.split('\n').filter(l => l.trim());

  // Extract vehicle meta from comment headers
  let vehicleMeta: DatalogSummary['vehicleMeta'] = undefined;
  const metaLines = lines.filter(l => l.startsWith('#'));
  for (const line of metaLines) {
    const match = line.match(/^#\s*(\w+):\s*(.+)/);
    if (match) {
      if (!vehicleMeta) vehicleMeta = {};
      const key = match[1].toLowerCase();
      const val = match[2].trim();
      if (key === 'vin') vehicleMeta.vin = val;
      if (key === 'make') vehicleMeta.make = val;
      if (key === 'model') vehicleMeta.model = val;
      if (key === 'year') vehicleMeta.year = val;
      if (key === 'engine') vehicleMeta.engine = val;
    }
  }

  // Find header row (first non-comment, non-empty line)
  const dataLines = lines.filter(l => !l.startsWith('#'));
  if (dataLines.length < 2) {
    return {
      fileName, rawCsv: csv, totalRows: 0, totalColumns: 0,
      durationSeconds: 0, sampleRateHz: 0, pidNames: [],
      vehicleMeta, keyMetrics: {}
    };
  }

  // Check for HP Tuners format (has units row)
  const headerLine = dataLines[0];
  const headers = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  // Detect if second line is units row
  let dataStartIdx = 1;
  const secondLine = dataLines[1];
  const secondCols = secondLine.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
  const looksLikeUnits = secondCols.every(c =>
    /^[°℃℉]?[a-zA-Z/%°·\s]*$/.test(c) || c === '' || c === '-'
  );
  if (looksLikeUnits && dataLines.length > 2) {
    dataStartIdx = 2;
  }

  const dataRows = dataLines.slice(dataStartIdx);
  const totalRows = dataRows.length;
  const totalColumns = headers.length;

  // Find time column
  const timeIdx = headers.findIndex(h =>
    /^(time|timestamp|elapsed|seconds|time\s*\(s\))/i.test(h)
  );

  let durationSeconds = 0;
  let sampleRateHz = 0;
  if (timeIdx >= 0 && totalRows > 1) {
    const firstRow = dataRows[0].split(',');
    const lastRow = dataRows[totalRows - 1].split(',');
    const t0 = parseFloat(firstRow[timeIdx]) || 0;
    const tN = parseFloat(lastRow[timeIdx]) || 0;
    durationSeconds = Math.abs(tN - t0);
    if (durationSeconds > 0) {
      sampleRateHz = Math.round(totalRows / durationSeconds);
    }
  }

  // Extract key metrics
  const keyMetrics: DatalogSummary['keyMetrics'] = {};
  const findMax = (patterns: RegExp[]): number | undefined => {
    for (const pattern of patterns) {
      const idx = headers.findIndex(h => pattern.test(h));
      if (idx >= 0) {
        let max = -Infinity;
        for (const row of dataRows) {
          const val = parseFloat(row.split(',')[idx]);
          if (!isNaN(val) && val > max) max = val;
        }
        return max === -Infinity ? undefined : Math.round(max * 10) / 10;
      }
    }
    return undefined;
  };

  keyMetrics.maxRpm = findMax([/rpm/i, /engine\s*speed/i, /engine_rpm/i]);
  keyMetrics.maxBoost = findMax([/boost/i, /map\s*hi/i, /manifold.*press/i]);
  keyMetrics.maxEgt = findMax([/egt/i, /exhaust.*gas.*temp/i]);
  keyMetrics.maxCoolantTemp = findMax([/coolant/i, /ect/i, /engine.*temp/i]);
  keyMetrics.maxRailPressure = findMax([/rail.*press/i, /fuel.*press/i, /frp/i]);
  keyMetrics.maxSpeed = findMax([/vehicle.*speed/i, /vss/i, /speed.*mph/i]);

  return {
    fileName,
    rawCsv: csv,
    totalRows,
    totalColumns,
    durationSeconds,
    sampleRateHz,
    pidNames: headers.filter(h => h && !/^(time|timestamp|elapsed|seconds)/i.test(h)),
    vehicleMeta,
    keyMetrics,
  };
}

export { parseDatalogSummary };

export default function DatalogLinker({ linkedDatalog, onLink, onUnlink, compact = false }: DatalogLinkerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const csv = await file.text();
      const summary = parseDatalogSummary(csv, file.name);

      if (summary.totalRows === 0) {
        toast.error('Invalid Datalog', { description: 'No data rows found in CSV file' });
        return;
      }

      onLink(summary);
      toast.success('Datalog Linked', {
        description: `${file.name}: ${summary.totalRows} rows, ${summary.pidNames.length} PIDs, ${formatDuration(summary.durationSeconds)}`
      });
    } catch (err: any) {
      toast.error('Failed to parse datalog', { description: err.message });
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [onLink]);

  const handleUnlink = useCallback(() => {
    onUnlink();
    toast.info('Datalog Unlinked', { description: 'Datalog reference removed from tune' });
  }, [onUnlink]);

  // Compact mode — just a small indicator + button
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {linkedDatalog ? (
          <>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-500/10 border border-green-500/30">
              <Link2 className="w-3 h-3 text-green-400" />
              <span className="text-[10px] font-mono text-green-400 truncate max-w-[120px]">
                {linkedDatalog.fileName}
              </span>
            </div>
            <button
              onClick={handleUnlink}
              className="p-1 rounded hover:bg-zinc-700/50 text-zinc-500 hover:text-red-400 transition-colors"
              title="Unlink datalog"
            >
              <Unlink className="w-3 h-3" />
            </button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-6 px-2 text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            <Link2 className="w-3 h-3 mr-1" />
            Link Datalog
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.CSV"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
    );
  }

  // Full mode — card with details
  return (
    <Card className="bg-zinc-900/80 border-zinc-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-red-500" />
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            Linked Datalog
          </span>
        </div>
        {linkedDatalog ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-6 px-1.5 text-zinc-500 hover:text-zinc-300"
            >
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUnlink}
              className="h-6 px-1.5 text-zinc-500 hover:text-red-400"
              title="Unlink datalog"
            >
              <Unlink className="w-3 h-3" />
            </Button>
          </div>
        ) : null}
      </div>

      {linkedDatalog ? (
        <>
          {/* Summary bar */}
          <div className="flex items-center gap-2 p-2 rounded bg-green-500/5 border border-green-500/20 mb-2">
            <Link2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-mono text-green-400 truncate">{linkedDatalog.fileName}</p>
              <p className="text-[10px] text-zinc-500">
                {linkedDatalog.totalRows} rows &bull; {linkedDatalog.pidNames.length} PIDs &bull; {formatDuration(linkedDatalog.durationSeconds)} &bull; {linkedDatalog.sampleRateHz}Hz
              </p>
            </div>
          </div>

          {/* Vehicle info */}
          {linkedDatalog.vehicleMeta && (
            <div className="flex items-center gap-1.5 mb-2 px-2">
              <Car className="w-3 h-3 text-zinc-500" />
              <span className="text-[10px] text-zinc-400">
                {[linkedDatalog.vehicleMeta.year, linkedDatalog.vehicleMeta.make, linkedDatalog.vehicleMeta.model, linkedDatalog.vehicleMeta.engine].filter(Boolean).join(' ')}
                {linkedDatalog.vehicleMeta.vin && ` (${linkedDatalog.vehicleMeta.vin})`}
              </span>
            </div>
          )}

          {/* Key metrics */}
          <div className="grid grid-cols-3 gap-1.5">
            {linkedDatalog.keyMetrics.maxRpm !== undefined && (
              <MetricBadge icon={<Gauge className="w-3 h-3" />} label="Max RPM" value={`${linkedDatalog.keyMetrics.maxRpm}`} />
            )}
            {linkedDatalog.keyMetrics.maxBoost !== undefined && (
              <MetricBadge icon={<Activity className="w-3 h-3" />} label="Max Boost" value={`${linkedDatalog.keyMetrics.maxBoost} psi`} />
            )}
            {linkedDatalog.keyMetrics.maxEgt !== undefined && (
              <MetricBadge icon={<Thermometer className="w-3 h-3" />} label="Max EGT" value={`${linkedDatalog.keyMetrics.maxEgt}°`} />
            )}
            {linkedDatalog.keyMetrics.maxCoolantTemp !== undefined && (
              <MetricBadge icon={<Thermometer className="w-3 h-3" />} label="Max Coolant" value={`${linkedDatalog.keyMetrics.maxCoolantTemp}°`} />
            )}
            {linkedDatalog.keyMetrics.maxRailPressure !== undefined && (
              <MetricBadge icon={<Gauge className="w-3 h-3" />} label="Max Rail" value={`${linkedDatalog.keyMetrics.maxRailPressure} psi`} />
            )}
            {linkedDatalog.keyMetrics.maxSpeed !== undefined && (
              <MetricBadge icon={<Car className="w-3 h-3" />} label="Max Speed" value={`${linkedDatalog.keyMetrics.maxSpeed} mph`} />
            )}
          </div>

          {/* Expanded PID list */}
          {isExpanded && (
            <div className="mt-2 p-2 rounded bg-zinc-800/50 border border-zinc-700/50">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Available PIDs ({linkedDatalog.pidNames.length})</p>
              <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto">
                {linkedDatalog.pidNames.map((pid, i) => (
                  <span key={i} className="px-1.5 py-0.5 text-[9px] font-mono bg-zinc-700/50 text-zinc-400 rounded">
                    {pid}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Upload prompt */
        <div
          className="flex flex-col items-center gap-2 p-4 rounded border border-dashed border-zinc-700 hover:border-zinc-500 cursor-pointer transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-5 h-5 text-zinc-600" />
          <p className="text-[11px] text-zinc-500 text-center">
            Link a datalog CSV to this tune for reference
          </p>
          <p className="text-[9px] text-zinc-600 text-center">
            Erika can use linked datalog data to suggest calibration changes
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.CSV"
        className="hidden"
        onChange={handleFileSelect}
      />
    </Card>
  );
}

function MetricBadge({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 px-1.5 py-1 rounded bg-zinc-800/50 border border-zinc-700/30">
      <span className="text-zinc-500">{icon}</span>
      <div className="min-w-0">
        <p className="text-[8px] text-zinc-600 uppercase">{label}</p>
        <p className="text-[10px] font-mono text-zinc-300 truncate">{value}</p>
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}
