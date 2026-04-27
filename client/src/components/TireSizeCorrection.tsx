/**
 * Tire Size / Speedometer Correction Tool
 * =========================================
 * Two modes:
 *  - MANUAL: User enters old/new axle ratio + tire circumference
 *  - AUTO-CORRECT: User enters ECM speed vs GPS speed while driving
 *
 * Binary address fields are placeholders — GM = ECM flash, wired later.
 */

import { useState, useMemo, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CircleDot, Gauge, Calculator, Crosshair, Save, Trash2,
  AlertTriangle, CheckCircle, Info, ChevronDown, ChevronUp, ArrowRight,
  Wifi, Loader2, Download
} from 'lucide-react';
import {
  calculateManualCorrection,
  calculateAutoCorrect,
  saveAutoCorrectData,
  getAutoCorrectHistory,
  clearAutoCorrectHistory,
  COMMON_TIRE_CIRCUMFERENCES,
  circumferenceFromDiameter,
  revsPerMile,
  GM_BINARY_ADDRESSES,
  GM_TIRE_AXLE_DIDS,
  type ManualInputs,
  type CorrectionResult,
  type AutoCorrectResult,
  type SavedAutoCorrectData,
  type VehicleScanResult,
} from '@/lib/tireSizeCorrection';

// ─── Styles ─────────────────────────────────────────────────────────────────

const sColor = {
  bg: 'bg-zinc-950',
  card: 'bg-zinc-900/60 border-zinc-800/50',
  input: 'bg-zinc-950 border-zinc-700 text-white font-[\'Share_Tech_Mono\',monospace] text-sm h-9',
  label: 'text-[10px] font-[\'Share_Tech_Mono\',monospace] text-zinc-500 uppercase tracking-wider mb-1 block',
  heading: 'font-[\'Bebas_Neue\',sans-serif] tracking-wider',
  mono: 'font-[\'Share_Tech_Mono\',monospace]',
  value: 'text-2xl font-[\'Bebas_Neue\',sans-serif] text-white',
  accent: 'text-red-500',
  muted: 'text-zinc-500',
  success: 'text-emerald-400',
  warn: 'text-amber-400',
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function TireSizeCorrection() {
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [scanResult, setScanResult] = useState<VehicleScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  /**
   * Scan vehicle via PCAN bridge for current tire/axle calibration values.
   * Pre-populates the Manual mode fields with scanned data.
   */
  const handleScanVehicle = async () => {
    setIsScanning(true);
    try {
      // Attempt to connect to PCAN bridge and read DIDs
      // This is a placeholder — actual PCAN bridge connection will be wired
      // when the bridge infrastructure is fully integrated
      const mockScan: VehicleScanResult = {
        success: false,
        axleRatio: null,
        tireCircumference: null,
        tireRevsPerMile: null,
        ipcSpeedoFactor: null,
        errors: ['PCAN bridge not connected. Connect V-OP or PCAN-USB adapter to scan vehicle.'],
        scannedAt: Date.now(),
      };
      setScanResult(mockScan);
      if (!mockScan.success) {
        // Toast handled in UI below
      }
    } catch {
      setScanResult({
        success: false,
        axleRatio: null,
        tireCircumference: null,
        tireRevsPerMile: null,
        ipcSpeedoFactor: null,
        errors: ['Failed to communicate with PCAN bridge'],
        scannedAt: Date.now(),
      });
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CircleDot className="w-5 h-5 text-red-500" />
          <div>
            <h2 className={`${sColor.heading} text-lg text-white`}>
              TIRE SIZE / SPEEDO CORRECTION
            </h2>
            <p className="text-[10px] text-zinc-600">
              Calculate corrected ECM values for axle ratio and tire circumference
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleScanVehicle}
            disabled={isScanning}
            className="border-zinc-700 text-zinc-400 hover:text-white hover:border-red-700 text-[10px] h-7 gap-1.5"
          >
            {isScanning ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Download className="w-3 h-3" />
            )}
            {isScanning ? 'SCANNING...' : 'SCAN VEHICLE'}
          </Button>
          <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[9px]">
            BINARY ADDRESS: TBD
          </Badge>
        </div>
      </div>

      {/* Scan Result Banner */}
      {scanResult && (
        <Card className={`p-3 ${scanResult.success ? 'bg-emerald-950/30 border-emerald-800/40' : 'bg-amber-950/20 border-amber-800/30'}`}>
          <div className="flex items-start gap-2">
            {scanResult.success ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <Wifi className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className={`text-[10px] ${sColor.mono} ${scanResult.success ? 'text-emerald-300' : 'text-amber-300'}`}>
                {scanResult.success ? 'VEHICLE SCAN COMPLETE' : 'VEHICLE SCAN — BRIDGE NOT CONNECTED'}
              </p>
              {scanResult.success && (
                <div className="grid grid-cols-4 gap-3 mt-2">
                  {scanResult.axleRatio !== null && (
                    <div>
                      <span className={`text-[9px] ${sColor.mono} text-zinc-500 block`}>AXLE RATIO</span>
                      <span className={`text-sm ${sColor.mono} text-white`}>{scanResult.axleRatio}</span>
                    </div>
                  )}
                  {scanResult.tireCircumference !== null && (
                    <div>
                      <span className={`text-[9px] ${sColor.mono} text-zinc-500 block`}>TIRE CIRC</span>
                      <span className={`text-sm ${sColor.mono} text-white`}>{scanResult.tireCircumference}"</span>
                    </div>
                  )}
                  {scanResult.tireRevsPerMile !== null && (
                    <div>
                      <span className={`text-[9px] ${sColor.mono} text-zinc-500 block`}>REVS/MILE</span>
                      <span className={`text-sm ${sColor.mono} text-white`}>{scanResult.tireRevsPerMile}</span>
                    </div>
                  )}
                  {scanResult.ipcSpeedoFactor !== null && (
                    <div>
                      <span className={`text-[9px] ${sColor.mono} text-zinc-500 block`}>IPC FACTOR</span>
                      <span className={`text-sm ${sColor.mono} text-white`}>{scanResult.ipcSpeedoFactor.toFixed(3)}</span>
                    </div>
                  )}
                </div>
              )}
              {scanResult.errors.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {scanResult.errors.map((err, i) => (
                    <p key={i} className={`text-[9px] ${sColor.mono} text-zinc-500`}>{err}</p>
                  ))}
                </div>
              )}
              <p className={`text-[8px] ${sColor.mono} text-zinc-600 mt-1`}>
                DIDs: {Object.values(GM_TIRE_AXLE_DIDS).map(d => `0x${d.did.toString(16).toUpperCase()}`).join(', ')}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Mode Tabs */}
      <div className="flex gap-1 p-0.5 bg-zinc-900/80 rounded-lg border border-zinc-800/50 w-fit">
        <button
          onClick={() => setMode('manual')}
          className={`px-4 py-1.5 rounded-md text-xs ${sColor.mono} tracking-wider transition-all ${
            mode === 'manual'
              ? 'bg-red-700 text-white'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Calculator className="w-3 h-3 inline mr-1.5" />
          MANUAL
        </button>
        <button
          onClick={() => setMode('auto')}
          className={`px-4 py-1.5 rounded-md text-xs ${sColor.mono} tracking-wider transition-all ${
            mode === 'auto'
              ? 'bg-red-700 text-white'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Crosshair className="w-3 h-3 inline mr-1.5" />
          AUTO-CORRECT
        </button>
      </div>

      {mode === 'manual' ? <ManualMode /> : <AutoCorrectMode />}

      {/* Binary Address Info (placeholder) */}
      <BinaryAddressInfo />
    </div>
  );
}

// ─── Manual Mode ────────────────────────────────────────────────────────────

function ManualMode() {
  const [oldAxle, setOldAxle] = useState(3.73);
  const [oldCirc, setOldCirc] = useState(108);
  const [newAxle, setNewAxle] = useState(3.73);
  const [newCirc, setNewCirc] = useState(108);
  const [keepAxle, setKeepAxle] = useState(false);
  const [keepTire, setKeepTire] = useState(false);
  const [results, setResults] = useState<CorrectionResult[] | null>(null);

  const handleCalculate = useCallback(() => {
    const inputs: ManualInputs = {
      oldAxleRatio: oldAxle,
      oldTireCircumference: oldCirc,
      newAxleRatio: keepAxle ? oldAxle : newAxle,
      newTireCircumference: keepTire ? oldCirc : newCirc,
    };
    setResults(calculateManualCorrection(inputs));
  }, [oldAxle, oldCirc, newAxle, newCirc, keepAxle, keepTire]);

  // Speedo error preview
  const speedoPreview = useMemo(() => {
    const effectiveNewAxle = keepAxle ? oldAxle : newAxle;
    const effectiveNewCirc = keepTire ? oldCirc : newCirc;
    // Speed ratio = (newCirc / oldCirc) * (oldAxle / newAxle)
    const ratio = (effectiveNewCirc / oldCirc) * (oldAxle / effectiveNewAxle);
    const errorPct = (ratio - 1) * 100;
    return { ratio, errorPct };
  }, [oldAxle, oldCirc, newAxle, newCirc, keepAxle, keepTire]);

  return (
    <div className="space-y-4">
      {/* Current ECM Values */}
      <Card className={`${sColor.card} p-4`}>
        <h3 className={`${sColor.heading} text-sm text-zinc-400 mb-3`}>
          CURRENT ECM VALUES
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={sColor.label}>Current Axle Ratio</label>
            <Input
              type="number"
              step="0.01"
              value={oldAxle}
              onChange={e => setOldAxle(+e.target.value)}
              className={sColor.input}
            />
            <span className="text-[9px] text-zinc-600">Value stored in ECM now</span>
          </div>
          <div>
            <label className={sColor.label}>Current Tire Circumference (in)</label>
            <Input
              type="number"
              step="0.1"
              value={oldCirc}
              onChange={e => setOldCirc(+e.target.value)}
              className={sColor.input}
            />
            <span className="text-[9px] text-zinc-600">
              {revsPerMile(oldCirc).toFixed(0)} rev/mile
            </span>
          </div>
        </div>
      </Card>

      {/* New Actual Values */}
      <Card className={`${sColor.card} p-4`}>
        <h3 className={`${sColor.heading} text-sm text-zinc-400 mb-3`}>
          NEW ACTUAL VALUES
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {/* Axle Ratio */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className={`${sColor.label} mb-0`}>New Axle Ratio</label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keepAxle}
                  onChange={e => setKeepAxle(e.target.checked)}
                  className="w-3 h-3 accent-red-600"
                />
                <span className="text-[9px] text-zinc-600">Keep same</span>
              </label>
            </div>
            <Input
              type="number"
              step="0.01"
              value={keepAxle ? oldAxle : newAxle}
              onChange={e => setNewAxle(+e.target.value)}
              disabled={keepAxle}
              className={`${sColor.input} ${keepAxle ? 'opacity-40' : ''}`}
            />
            <div className="flex gap-1 mt-1 flex-wrap">
              {[3.08, 3.42, 3.55, 3.73, 4.10, 4.30, 4.56, 4.88, 5.13, 5.38].map(r => (
                <button
                  key={r}
                  onClick={() => { setNewAxle(r); setKeepAxle(false); }}
                  className={`text-[9px] px-1.5 py-0.5 rounded border ${
                    !keepAxle && newAxle === r
                      ? 'border-red-600 text-red-400 bg-red-950/30'
                      : 'border-zinc-800 text-zinc-600 hover:text-zinc-400'
                  }`}
                >
                  {r.toFixed(2)}
                </button>
              ))}
            </div>
          </div>

          {/* Tire Circumference */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className={`${sColor.label} mb-0`}>New Tire Circumference (in)</label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keepTire}
                  onChange={e => setKeepTire(e.target.checked)}
                  className="w-3 h-3 accent-red-600"
                />
                <span className="text-[9px] text-zinc-600">Keep same</span>
              </label>
            </div>
            <Input
              type="number"
              step="0.1"
              value={keepTire ? oldCirc : newCirc}
              onChange={e => setNewCirc(+e.target.value)}
              disabled={keepTire}
              className={`${sColor.input} ${keepTire ? 'opacity-40' : ''}`}
            />
            {/* Quick-select from common sizes */}
            <Select
              value=""
              onValueChange={v => {
                const tire = COMMON_TIRE_CIRCUMFERENCES.find(t => t.label === v);
                if (tire) {
                  setNewCirc(tire.circumference);
                  setKeepTire(false);
                }
              }}
            >
              <SelectTrigger className="mt-1 h-7 bg-zinc-950 border-zinc-800 text-[10px] text-zinc-500">
                <SelectValue placeholder="Quick select tire size..." />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700 max-h-48">
                {COMMON_TIRE_CIRCUMFERENCES.map(t => (
                  <SelectItem key={t.label} value={t.label} className="text-white text-xs">
                    {t.label} — {t.circumference.toFixed(1)}" circ
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!keepTire && (
              <span className="text-[9px] text-zinc-600">
                {revsPerMile(newCirc).toFixed(0)} rev/mile · {(newCirc / Math.PI).toFixed(1)}" diameter
              </span>
            )}
          </div>
        </div>

        {/* Speedo Error Preview */}
        <div className="mt-3 p-2 rounded bg-zinc-950/50 border border-zinc-800/30">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500">Uncorrected speedo error:</span>
            <span className={`text-sm ${sColor.mono} ${
              Math.abs(speedoPreview.errorPct) < 1 ? sColor.success :
              Math.abs(speedoPreview.errorPct) < 5 ? sColor.warn : 'text-red-400'
            }`}>
              {speedoPreview.errorPct > 0 ? '+' : ''}{speedoPreview.errorPct.toFixed(1)}%
              {speedoPreview.errorPct > 0 ? ' (reads fast)' : speedoPreview.errorPct < 0 ? ' (reads slow)' : ''}
            </span>
          </div>
          <div className="text-[9px] text-zinc-600 mt-0.5">
            At 60 mph GPS, dash would show {(60 * speedoPreview.ratio).toFixed(1)} mph without correction
          </div>
        </div>
      </Card>

      {/* Calculate Button */}
      <Button
        onClick={handleCalculate}
        className="w-full bg-red-700 hover:bg-red-600 text-white font-['Bebas_Neue',sans-serif] tracking-wider text-base h-11"
      >
        <Calculator className="w-4 h-4 mr-2" />
        CALCULATE CORRECTION VALUES
      </Button>

      {/* Results */}
      {results && <ManualResults results={results} />}

      {/* Measurement Tip */}
      <MeasurementTip />
    </div>
  );
}

// ─── Manual Results ─────────────────────────────────────────────────────────

function ManualResults({ results }: { results: CorrectionResult[] }) {
  return (
    <div className="space-y-3">
      <h3 className={`${sColor.heading} text-sm text-white`}>
        RECOMMENDED VALUES TO WRITE
      </h3>
      {results.map((r, i) => (
        <Card
          key={r.method}
          className={`p-3 border ${
            i === 0
              ? 'bg-red-950/20 border-red-800/50'
              : 'bg-zinc-900/40 border-zinc-800/30'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            {i === 0 ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <ArrowRight className="w-3 h-3 text-zinc-600" />
            )}
            <span className={`text-xs ${sColor.mono} ${i === 0 ? 'text-white' : 'text-zinc-400'}`}>
              {r.label}
            </span>
            {i === 0 && (
              <Badge className="bg-emerald-900/50 text-emerald-300 text-[8px] border-0">
                RECOMMENDED
              </Badge>
            )}
          </div>
          <p className="text-[10px] text-zinc-500 mb-2">{r.description}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-950/50 rounded p-2 border border-zinc-800/30">
              <div className="text-[9px] text-zinc-600 mb-0.5">Axle Ratio to Write</div>
              <div className={`text-lg ${sColor.heading} text-white`}>
                {r.axleRatioToWrite.toFixed(3)}
              </div>
            </div>
            <div className="bg-zinc-950/50 rounded p-2 border border-zinc-800/30">
              <div className="text-[9px] text-zinc-600 mb-0.5">Tire Circumference to Write</div>
              <div className={`text-lg ${sColor.heading} text-white`}>
                {r.tireCircumferenceToWrite.toFixed(1)}"
              </div>
              <div className="text-[8px] text-zinc-600">
                {revsPerMile(r.tireCircumferenceToWrite).toFixed(0)} rev/mile
              </div>
            </div>
          </div>
        </Card>
      ))}

      {/* Post-write warning */}
      <div className="flex items-start gap-2 p-2 rounded bg-amber-950/20 border border-amber-800/30">
        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
        <div className="text-[10px] text-amber-300/80">
          <strong>After writing:</strong> Re-test at steady highway speed (60-70 mph, flat road).
          Compare dash to GPS. If still off by more than 1-2%, use Auto-Correct mode to fine-tune.
          Small steps — adjust one value at a time.
        </div>
      </div>
    </div>
  );
}

// ─── Auto-Correct Mode ──────────────────────────────────────────────────────

function AutoCorrectMode() {
  const [ecmSpeed, setEcmSpeed] = useState(65);
  const [gpsSpeed, setGpsSpeed] = useState(60);
  const [oldAxle, setOldAxle] = useState(3.73);
  const [oldCirc, setOldCirc] = useState(108);
  const [result, setResult] = useState<AutoCorrectResult | null>(null);
  const [history, setHistory] = useState<SavedAutoCorrectData[]>(() => getAutoCorrectHistory());
  const [showHistory, setShowHistory] = useState(false);

  const handleCalculate = useCallback(() => {
    const res = calculateAutoCorrect({ ecmSpeed, gpsSpeed, oldAxleRatio: oldAxle, oldTireCircumference: oldCirc });
    setResult(res);
  }, [ecmSpeed, gpsSpeed, oldAxle, oldCirc]);

  const handleSave = useCallback(() => {
    if (!result) return;
    const data: SavedAutoCorrectData = {
      timestamp: Date.now(),
      ecmSpeed,
      gpsSpeed,
      correctionFactor: result.correctionFactor,
      speedoErrorPercent: result.speedoErrorPercent,
      oldAxleRatio: oldAxle,
      oldTireCircumference: oldCirc,
      recommendedAxleRatio: result.corrections[1]?.axleRatioToWrite ?? oldAxle,
      recommendedTireCircumference: result.corrections[0]?.tireCircumferenceToWrite ?? oldCirc,
    };
    saveAutoCorrectData(data);
    setHistory(getAutoCorrectHistory());
  }, [result, ecmSpeed, gpsSpeed, oldAxle, oldCirc]);

  const handleClearHistory = useCallback(() => {
    clearAutoCorrectHistory();
    setHistory([]);
  }, []);

  return (
    <div className="space-y-4">
      {/* Instructions */}
      <Card className="bg-blue-950/20 border-blue-800/30 p-3">
        <div className="flex items-start gap-2">
          <Gauge className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
          <div className="text-[10px] text-blue-300/80 space-y-1">
            <p><strong>How to use Auto-Correct:</strong></p>
            <p>1. Drive at a steady speed on a flat road (60-70 mph recommended, no wind)</p>
            <p>2. Note what your dash/ECM shows and what your GPS app reads</p>
            <p>3. Enter both values below and hit Calculate</p>
            <p>4. Save the result — values will be used when binary flashing is wired</p>
          </div>
        </div>
      </Card>

      {/* Current ECM Values */}
      <Card className={`${sColor.card} p-4`}>
        <h3 className={`${sColor.heading} text-sm text-zinc-400 mb-3`}>
          CURRENT ECM CALIBRATION
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={sColor.label}>ECM Axle Ratio</label>
            <Input
              type="number"
              step="0.01"
              value={oldAxle}
              onChange={e => setOldAxle(+e.target.value)}
              className={sColor.input}
            />
          </div>
          <div>
            <label className={sColor.label}>ECM Tire Circumference (in)</label>
            <Input
              type="number"
              step="0.1"
              value={oldCirc}
              onChange={e => setOldCirc(+e.target.value)}
              className={sColor.input}
            />
          </div>
        </div>
      </Card>

      {/* Speed Comparison */}
      <Card className={`${sColor.card} p-4`}>
        <h3 className={`${sColor.heading} text-sm text-zinc-400 mb-3`}>
          SPEED COMPARISON
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={sColor.label}>ECM / Dash Speed (mph)</label>
            <Input
              type="number"
              step="0.5"
              value={ecmSpeed}
              onChange={e => setEcmSpeed(+e.target.value)}
              className={sColor.input}
              placeholder="What dash shows..."
            />
            <span className="text-[9px] text-zinc-600">What your speedometer reads</span>
          </div>
          <div>
            <label className={sColor.label}>GPS Speed (mph)</label>
            <Input
              type="number"
              step="0.5"
              value={gpsSpeed}
              onChange={e => setGpsSpeed(+e.target.value)}
              className={sColor.input}
              placeholder="True GPS speed..."
            />
            <span className="text-[9px] text-zinc-600">Actual speed from GPS app</span>
          </div>
        </div>

        {/* Live preview */}
        {ecmSpeed > 0 && gpsSpeed > 0 && (
          <div className="mt-3 p-2 rounded bg-zinc-950/50 border border-zinc-800/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500">Quick preview:</span>
              <span className={`text-sm ${sColor.mono} ${
                Math.abs(((ecmSpeed - gpsSpeed) / gpsSpeed) * 100) < 1 ? sColor.success :
                Math.abs(((ecmSpeed - gpsSpeed) / gpsSpeed) * 100) < 5 ? sColor.warn : 'text-red-400'
              }`}>
                {ecmSpeed > gpsSpeed ? 'Reading ' : ecmSpeed < gpsSpeed ? 'Reading ' : ''}
                {Math.abs(((ecmSpeed - gpsSpeed) / gpsSpeed) * 100).toFixed(1)}%
                {ecmSpeed > gpsSpeed ? ' HIGH' : ecmSpeed < gpsSpeed ? ' LOW' : ' ACCURATE'}
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* Calculate Button */}
      <Button
        onClick={handleCalculate}
        disabled={ecmSpeed <= 0 || gpsSpeed <= 0}
        className="w-full bg-red-700 hover:bg-red-600 text-white font-['Bebas_Neue',sans-serif] tracking-wider text-base h-11"
      >
        <Crosshair className="w-4 h-4 mr-2" />
        CALCULATE AUTO-CORRECTION
      </Button>

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {/* Correction Factor Banner */}
          <Card className={`p-4 border ${
            result.errorDirection === 'accurate'
              ? 'bg-emerald-950/20 border-emerald-800/50'
              : result.errorDirection === 'high'
              ? 'bg-amber-950/20 border-amber-800/50'
              : 'bg-red-950/20 border-red-800/50'
          }`}>
            <div className="text-center">
              <div className="text-[10px] text-zinc-500 mb-1">CORRECTION FACTOR</div>
              <div className={`text-4xl ${sColor.heading} ${
                result.errorDirection === 'accurate' ? sColor.success :
                result.errorDirection === 'high' ? sColor.warn : 'text-red-400'
              }`}>
                {result.correctionFactor.toFixed(4)}
              </div>
              <div className={`text-sm ${sColor.mono} mt-1 ${
                result.errorDirection === 'accurate' ? 'text-emerald-300/80' :
                result.errorDirection === 'high' ? 'text-amber-300/80' : 'text-red-300/80'
              }`}>
                {result.description}
              </div>
            </div>
          </Card>

          {/* Correction Options */}
          {result.errorDirection !== 'accurate' && (
            <>
              <h3 className={`${sColor.heading} text-sm text-white`}>
                AUTO-CORRECT SUGGESTIONS
              </h3>
              {result.corrections.map((c, i) => (
                <Card key={c.method} className={`p-3 ${sColor.card}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowRight className="w-3 h-3 text-zinc-600" />
                    <span className={`text-xs ${sColor.mono} text-zinc-300`}>{c.label}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mb-2">{c.description}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-zinc-950/50 rounded p-2 border border-zinc-800/30">
                      <div className="text-[9px] text-zinc-600 mb-0.5">Axle Ratio</div>
                      <div className={`text-lg ${sColor.heading} ${
                        c.axleRatioToWrite !== oldAxle ? 'text-amber-300' : 'text-zinc-400'
                      }`}>
                        {c.axleRatioToWrite.toFixed(3)}
                        {c.axleRatioToWrite !== oldAxle && (
                          <span className="text-[9px] text-zinc-600 ml-1">
                            (was {oldAxle.toFixed(3)})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="bg-zinc-950/50 rounded p-2 border border-zinc-800/30">
                      <div className="text-[9px] text-zinc-600 mb-0.5">Tire Circumference</div>
                      <div className={`text-lg ${sColor.heading} ${
                        c.tireCircumferenceToWrite !== oldCirc ? 'text-amber-300' : 'text-zinc-400'
                      }`}>
                        {c.tireCircumferenceToWrite.toFixed(1)}"
                        {c.tireCircumferenceToWrite !== oldCirc && (
                          <span className="text-[9px] text-zinc-600 ml-1">
                            (was {oldCirc.toFixed(1)}")
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}

              {/* Save Button */}
              <Button
                onClick={handleSave}
                variant="outline"
                className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <Save className="w-4 h-4 mr-2" />
                SAVE CORRECTION DATA
              </Button>
            </>
          )}

          {/* Post-correction warning */}
          <div className="flex items-start gap-2 p-2 rounded bg-amber-950/20 border border-amber-800/30">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-[10px] text-amber-300/80">
              <strong>After writing:</strong> Re-test at the same speed and repeat auto-correct if still off.
              ±1-2% is normal. Best done at steady highway speed, flat road, no wind.
              Fine-tune in small steps if needed.
            </div>
          </div>
        </div>
      )}

      {/* Saved History */}
      {history.length > 0 && (
        <Card className={`${sColor.card} p-3`}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full"
          >
            <span className={`text-xs ${sColor.heading} text-zinc-400`}>
              SAVED CORRECTIONS ({history.length})
            </span>
            {showHistory ? (
              <ChevronUp className="w-4 h-4 text-zinc-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-500" />
            )}
          </button>
          {showHistory && (
            <div className="mt-2 space-y-2">
              {history.slice().reverse().map((h, i) => (
                <div key={i} className="p-2 rounded bg-zinc-950/50 border border-zinc-800/30 text-[10px]">
                  <div className="flex justify-between text-zinc-500">
                    <span>{new Date(h.timestamp).toLocaleString()}</span>
                    <span className={sColor.mono}>
                      Factor: {h.correctionFactor.toFixed(4)} ({h.speedoErrorPercent > 0 ? '+' : ''}{h.speedoErrorPercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex gap-4 mt-1 text-zinc-400">
                    <span>ECM: {h.ecmSpeed} mph</span>
                    <span>GPS: {h.gpsSpeed} mph</span>
                    <span>→ Circ: {h.recommendedTireCircumference.toFixed(1)}"</span>
                    <span>→ Axle: {h.recommendedAxleRatio.toFixed(3)}</span>
                  </div>
                </div>
              ))}
              <Button
                onClick={handleClearHistory}
                variant="ghost"
                size="sm"
                className="text-zinc-600 hover:text-red-400 text-[10px]"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear History
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ─── Measurement Tip ────────────────────────────────────────────────────────

function MeasurementTip() {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="bg-zinc-900/30 border-zinc-800/30 p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        <Info className="w-4 h-4 text-blue-400 shrink-0" />
        <span className={`text-[10px] ${sColor.mono} text-zinc-400`}>
          HOW TO MEASURE LOADED TIRE CIRCUMFERENCE
        </span>
        {expanded ? (
          <ChevronUp className="w-3 h-3 text-zinc-600 ml-auto" />
        ) : (
          <ChevronDown className="w-3 h-3 text-zinc-600 ml-auto" />
        )}
      </button>
      {expanded && (
        <div className="mt-2 text-[10px] text-zinc-500 space-y-1 pl-6">
          <p>1. Park on flat, level ground with normal tire pressure and load</p>
          <p>2. Mark the tire at the ground contact point (chalk line on sidewall + ground)</p>
          <p>3. Roll the vehicle forward exactly one full tire revolution</p>
          <p>4. Measure the distance from the old mark to the new ground contact point</p>
          <p>5. That distance in inches is your loaded tire circumference</p>
          <p className="text-zinc-600 italic mt-2">
            Loaded circumference is smaller than calculated (π × diameter) because the tire
            deforms under weight. This measurement gives the most accurate speedometer correction.
          </p>
        </div>
      )}
    </Card>
  );
}

// ─── Binary Address Info ────────────────────────────────────────────────────

function BinaryAddressInfo() {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="bg-zinc-900/30 border-zinc-800/30 p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        <AlertTriangle className="w-4 h-4 text-zinc-600 shrink-0" />
        <span className={`text-[10px] ${sColor.mono} text-zinc-500`}>
          BINARY ADDRESS MAPPING (PLACEHOLDER — WIRED LATER)
        </span>
        {expanded ? (
          <ChevronUp className="w-3 h-3 text-zinc-600 ml-auto" />
        ) : (
          <ChevronDown className="w-3 h-3 text-zinc-600 ml-auto" />
        )}
      </button>
      {expanded && (
        <div className="mt-2 space-y-1 pl-6">
          {Object.entries(GM_BINARY_ADDRESSES).map(([key, addr]) => (
            <div key={key} className="flex items-center gap-3 text-[10px]">
              <span className={`${sColor.mono} text-zinc-600 w-28`}>{addr.name}</span>
              <Badge variant="outline" className="border-zinc-800 text-zinc-600 text-[8px]">
                {addr.offset}
              </Badge>
              <span className="text-zinc-700">{addr.encoding} · {addr.length}B</span>
              <span className="text-zinc-700 ml-auto">{addr.description}</span>
            </div>
          ))}
          <p className="text-[9px] text-zinc-700 mt-2 italic">
            GM vehicles use ECM flash for these values. Ford/RAM may use UDS or binary depending on platform.
            Binary addresses will be provided per ECM type (E38, E67, E41, E42, etc.)
          </p>
        </div>
      )}
    </Card>
  );
}
