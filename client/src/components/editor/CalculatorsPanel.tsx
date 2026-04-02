/**
 * CalculatorsPanel — PPEI Tuning Calculators
 *
 * Interactive calculators ported from PPEI's Excel-based tools:
 *  - Tire / Gear / Speed Calculator
 *  - TOS & Vehicle Speed (48RE, 68RFE, 6R100, Aisin, Allison)
 *  - MAP Sensor Data (voltage ↔ pressure)
 *  - Injector Sizing
 *  - Engine Conversion Tool
 *  - Equivalence Ratio (AFR / Lambda)
 *  - 10R80 RPM & TCC Converter
 *  - Shift Point Calculator (Allison A6)
 *  - T56 Gear Calculator
 */
import { useState, useMemo, useCallback } from 'react';
import {
  Gauge, Calculator, Fuel, Cog, Thermometer, Zap, ArrowRightLeft,
  ChevronDown, ChevronRight, RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Shared Styles ──────────────────────────────────────────────────────────
const inputCls = 'w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-red-500 focus:outline-none transition-colors';
const labelCls = 'text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5 block';
const resultCls = 'bg-zinc-900/80 border border-zinc-700/50 rounded p-2 text-center';
const resultValCls = 'text-lg font-bold text-red-400 font-mono';
const resultLabelCls = 'text-[9px] text-zinc-500 uppercase tracking-wider';
const sectionCls = 'space-y-3';
const cardCls = 'bg-zinc-800/60 border border-zinc-700/40 rounded-lg p-3';

// ─── Transmission Gear Ratios ───────────────────────────────────────────────
const TRANSMISSIONS: Record<string, { name: string; gears: { name: string; ratio: number }[] }> = {
  'allison6': {
    name: 'Allison 1000 6-Speed',
    gears: [
      { name: '1st', ratio: 3.10 }, { name: '2nd', ratio: 1.81 }, { name: '3rd', ratio: 1.41 },
      { name: '4th', ratio: 1.00 }, { name: '5th', ratio: 0.71 }, { name: '6th', ratio: 0.61 },
    ],
  },
  '48re': {
    name: '48RE (Dodge 4-Speed)',
    gears: [
      { name: '1st', ratio: 2.45 }, { name: '2nd', ratio: 1.45 }, { name: '3rd', ratio: 1.00 },
      { name: '4th', ratio: 0.69 },
    ],
  },
  '68rfe': {
    name: '68RFE (Cummins 6-Speed)',
    gears: [
      { name: '1st', ratio: 3.24 }, { name: '2nd', ratio: 2.19 }, { name: '3rd', ratio: 1.41 },
      { name: '4th', ratio: 1.00 }, { name: '5th', ratio: 0.77 }, { name: '6th', ratio: 0.63 },
    ],
  },
  '6r100': {
    name: '6R100 (Ford 6-Speed)',
    gears: [
      { name: '1st', ratio: 3.97 }, { name: '2nd', ratio: 2.32 }, { name: '3rd', ratio: 1.52 },
      { name: '4th', ratio: 1.15 }, { name: '5th', ratio: 0.85 }, { name: '6th', ratio: 0.67 },
    ],
  },
  'aisin': {
    name: 'Aisin AS69RC 6-Speed',
    gears: [
      { name: '1st', ratio: 3.74 }, { name: '2nd', ratio: 2.00 }, { name: '3rd', ratio: 1.34 },
      { name: '4th', ratio: 1.00 }, { name: '5th', ratio: 0.77 }, { name: '6th', ratio: 0.63 },
    ],
  },
  '10l80': {
    name: 'GM 10L80/10L90 10-Speed',
    gears: [
      { name: '1st', ratio: 4.696 }, { name: '2nd', ratio: 2.985 }, { name: '3rd', ratio: 2.146 },
      { name: '4th', ratio: 1.769 }, { name: '5th', ratio: 1.520 }, { name: '6th', ratio: 1.275 },
      { name: '7th', ratio: 1.000 }, { name: '8th', ratio: 0.854 }, { name: '9th', ratio: 0.689 },
      { name: '10th', ratio: 0.636 },
    ],
  },
  '10r80': {
    name: 'Ford 10R80 10-Speed',
    gears: [
      { name: '1st', ratio: 4.696 }, { name: '2nd', ratio: 2.985 }, { name: '3rd', ratio: 2.179 },
      { name: '4th', ratio: 1.801 }, { name: '5th', ratio: 1.539 }, { name: '6th', ratio: 1.289 },
      { name: '7th', ratio: 1.000 }, { name: '8th', ratio: 0.852 }, { name: '9th', ratio: 0.689 },
      { name: '10th', ratio: 0.636 },
    ],
  },
  't56': {
    name: 'T56 6-Speed Manual',
    gears: [
      { name: '1st', ratio: 2.66 }, { name: '2nd', ratio: 1.78 }, { name: '3rd', ratio: 1.30 },
      { name: '4th', ratio: 1.00 }, { name: '5th', ratio: 0.74 }, { name: '6th', ratio: 0.50 },
    ],
  },
  '4l60e': {
    name: '4L60E 4-Speed',
    gears: [
      { name: '1st', ratio: 3.059 }, { name: '2nd', ratio: 1.625 }, { name: '3rd', ratio: 1.00 },
      { name: '4th', ratio: 0.696 },
    ],
  },
  '4l80e': {
    name: '4L80E 4-Speed',
    gears: [
      { name: '1st', ratio: 2.48 }, { name: '2nd', ratio: 1.48 }, { name: '3rd', ratio: 1.00 },
      { name: '4th', ratio: 0.75 },
    ],
  },
  '6l80': {
    name: '6L80/6L90 6-Speed',
    gears: [
      { name: '1st', ratio: 4.03 }, { name: '2nd', ratio: 2.36 }, { name: '3rd', ratio: 1.53 },
      { name: '4th', ratio: 1.15 }, { name: '5th', ratio: 0.85 }, { name: '6th', ratio: 0.67 },
    ],
  },
  'ab60f': {
    name: 'AB60F (Toyota 6-Speed)',
    gears: [
      { name: '1st', ratio: 3.333 }, { name: '2nd', ratio: 1.96 }, { name: '3rd', ratio: 1.353 },
      { name: '4th', ratio: 1.00 }, { name: '5th', ratio: 0.728 }, { name: '6th', ratio: 0.588 },
    ],
  },
};

// ─── MAP Sensor Presets ─────────────────────────────────────────────────────
const MAP_PRESETS: { name: string; minV: number; maxV: number; minkPa: number; maxkPa: number }[] = [
  { name: 'GM 1-Bar (Stock)', minV: 0.4, maxV: 4.65, minkPa: 20, maxkPa: 105 },
  { name: 'GM 2-Bar', minV: 0.4, maxV: 4.65, minkPa: 20, maxkPa: 200 },
  { name: 'GM 3-Bar', minV: 0.4, maxV: 4.65, minkPa: 20, maxkPa: 300 },
  { name: 'Bosch 0281002576', minV: 0.42, maxV: 4.72, minkPa: 45, maxkPa: 370 },
  { name: 'Bosch 10-Bar', minV: 0.25, maxV: 4.85, minkPa: 50, maxkPa: 1000 },
  { name: 'Can-Am X3 MAP', minV: 0.4, maxV: 4.65, minkPa: 20, maxkPa: 250 },
  { name: 'Can-Am X3 TIP', minV: 0.4, maxV: 4.65, minkPa: 20, maxkPa: 256 },
  { name: 'Polaris Pro XP', minV: 0.2, maxV: 4.883, minkPa: 5, maxkPa: 325 },
  { name: 'Honda Talon MAP', minV: 0.5, maxV: 4.746, minkPa: 17, maxkPa: 162 },
  { name: 'Honda Civic MAP', minV: 0.5, maxV: 4.5, minkPa: 13.3, maxkPa: 300 },
];

// ─── Calculator Components ──────────────────────────────────────────────────

/** 1. Tire / Gear / Speed Calculator */
function TireGearSpeedCalc() {
  const [trans, setTrans] = useState('allison6');
  const [axleRatio, setAxleRatio] = useState(3.73);
  const [tireHeight, setTireHeight] = useState(31.5);
  const [rpm, setRpm] = useState(3000);
  const [targetSpeed, setTargetSpeed] = useState(60);

  const tireCirc = Math.PI * tireHeight;
  const tireRevsPerMile = 63360 / tireCirc; // 63360 inches per mile
  const transmission = TRANSMISSIONS[trans];

  // Speed at given RPM for each gear
  const speedTable = useMemo(() => {
    return transmission.gears.map(g => {
      const speed = (rpm * tireCirc) / (g.ratio * axleRatio * 1056);
      return { gear: g.name, ratio: g.ratio, speed };
    });
  }, [rpm, tireCirc, axleRatio, transmission]);

  // RPM at target speed for each gear
  const rpmTable = useMemo(() => {
    return transmission.gears.map(g => {
      const rpmAtSpeed = (targetSpeed * g.ratio * axleRatio * 1056) / tireCirc;
      return { gear: g.name, ratio: g.ratio, rpm: rpmAtSpeed };
    });
  }, [targetSpeed, tireCirc, axleRatio, transmission]);

  return (
    <div className={sectionCls}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Transmission</label>
          <select value={trans} onChange={e => setTrans(e.target.value)} className={inputCls}>
            {Object.entries(TRANSMISSIONS).map(([k, v]) => (
              <option key={k} value={k}>{v.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Axle Ratio</label>
          <input type="number" step="0.01" value={axleRatio} onChange={e => setAxleRatio(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Tire Height (inches)</label>
          <input type="number" step="0.5" value={tireHeight} onChange={e => setTireHeight(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Engine RPM</label>
          <input type="number" step="100" value={rpm} onChange={e => setRpm(+e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className={resultCls}>
          <div className={resultValCls}>{tireCirc.toFixed(1)}"</div>
          <div className={resultLabelCls}>Tire Circumference</div>
        </div>
        <div className={resultCls}>
          <div className={resultValCls}>{tireRevsPerMile.toFixed(0)}</div>
          <div className={resultLabelCls}>Revs / Mile</div>
        </div>
        <div className={resultCls}>
          <div className="flex items-center gap-1">
            <label className={labelCls + ' mb-0'}>Target MPH</label>
            <input type="number" step="5" value={targetSpeed} onChange={e => setTargetSpeed(+e.target.value)}
              className="w-16 bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-xs text-zinc-200 text-center" />
          </div>
        </div>
      </div>

      {/* Speed at RPM table */}
      <div>
        <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">Speed at {rpm} RPM</div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(transmission.gears.length, 6)}, 1fr)` }}>
          {speedTable.map(r => (
            <div key={r.gear} className="bg-zinc-900/60 border border-zinc-700/30 rounded px-1.5 py-1 text-center">
              <div className="text-[9px] text-zinc-500">{r.gear} ({r.ratio})</div>
              <div className="text-sm font-bold text-emerald-400 font-mono">{r.speed.toFixed(1)}</div>
              <div className="text-[8px] text-zinc-600">MPH</div>
            </div>
          ))}
        </div>
      </div>

      {/* RPM at target speed table */}
      <div>
        <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">RPM at {targetSpeed} MPH</div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(transmission.gears.length, 6)}, 1fr)` }}>
          {rpmTable.map(r => (
            <div key={r.gear} className="bg-zinc-900/60 border border-zinc-700/30 rounded px-1.5 py-1 text-center">
              <div className="text-[9px] text-zinc-500">{r.gear} ({r.ratio})</div>
              <div className="text-sm font-bold text-cyan-400 font-mono">{r.rpm.toFixed(0)}</div>
              <div className="text-[8px] text-zinc-600">RPM</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 2. MAP Sensor Data Calculator */
function MapSensorCalc() {
  const [preset, setPreset] = useState(0);
  const [minV, setMinV] = useState(MAP_PRESETS[0].minV);
  const [maxV, setMaxV] = useState(MAP_PRESETS[0].maxV);
  const [minkPa, setMinkPa] = useState(MAP_PRESETS[0].minkPa);
  const [maxkPa, setMaxkPa] = useState(MAP_PRESETS[0].maxkPa);
  const [inputV, setInputV] = useState(2.5);
  const [inputkPa, setInputkPa] = useState(150);

  const applyPreset = useCallback((idx: number) => {
    setPreset(idx);
    const p = MAP_PRESETS[idx];
    setMinV(p.minV); setMaxV(p.maxV); setMinkPa(p.minkPa); setMaxkPa(p.maxkPa);
  }, []);

  const slope = (maxkPa - minkPa) / (maxV - minV);
  const offset = minkPa - slope * minV;
  const kpaFromV = slope * inputV + offset;
  const psiFromV = kpaFromV * 0.145038;
  const inhgFromV = kpaFromV / 3.386;
  const vFromkPa = (inputkPa - offset) / slope;

  return (
    <div className={sectionCls}>
      <div>
        <label className={labelCls}>Sensor Preset</label>
        <select value={preset} onChange={e => applyPreset(+e.target.value)} className={inputCls}>
          {MAP_PRESETS.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Min Voltage</label>
          <input type="number" step="0.01" value={minV} onChange={e => setMinV(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Max Voltage</label>
          <input type="number" step="0.01" value={maxV} onChange={e => setMaxV(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Min kPa</label>
          <input type="number" step="1" value={minkPa} onChange={e => setMinkPa(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Max kPa</label>
          <input type="number" step="1" value={maxkPa} onChange={e => setMaxkPa(+e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className={resultCls}>
          <div className="text-[9px] text-zinc-500 mb-0.5">Slope (kPa/V)</div>
          <div className="text-sm font-bold text-amber-400 font-mono">{slope.toFixed(4)}</div>
        </div>
        <div className={resultCls}>
          <div className="text-[9px] text-zinc-500 mb-0.5">Offset (kPa)</div>
          <div className="text-sm font-bold text-amber-400 font-mono">{offset.toFixed(4)}</div>
        </div>
      </div>

      <div className="text-[10px] text-zinc-500 text-center font-mono">y = {slope.toFixed(4)}x + {offset.toFixed(4)}</div>

      {/* Voltage → Pressure */}
      <div className={cardCls}>
        <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2">Voltage → Pressure</div>
        <div className="flex items-center gap-2 mb-2">
          <input type="number" step="0.1" value={inputV} onChange={e => setInputV(+e.target.value)} className={inputCls + ' w-24'} />
          <span className="text-[10px] text-zinc-500">V</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className={resultCls}>
            <div className={resultValCls}>{kpaFromV.toFixed(1)}</div>
            <div className={resultLabelCls}>kPa</div>
          </div>
          <div className={resultCls}>
            <div className={resultValCls}>{psiFromV.toFixed(2)}</div>
            <div className={resultLabelCls}>PSI</div>
          </div>
          <div className={resultCls}>
            <div className={resultValCls}>{inhgFromV.toFixed(2)}</div>
            <div className={resultLabelCls}>inHg</div>
          </div>
        </div>
      </div>

      {/* Pressure → Voltage */}
      <div className={cardCls}>
        <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2">Pressure → Voltage</div>
        <div className="flex items-center gap-2 mb-2">
          <input type="number" step="5" value={inputkPa} onChange={e => setInputkPa(+e.target.value)} className={inputCls + ' w-24'} />
          <span className="text-[10px] text-zinc-500">kPa</span>
        </div>
        <div className={resultCls}>
          <div className={resultValCls}>{vFromkPa.toFixed(3)} V</div>
          <div className={resultLabelCls}>Sensor Voltage</div>
        </div>
      </div>
    </div>
  );
}

/** 3. Injector Sizing Calculator */
function InjectorCalc() {
  const [hp, setHp] = useState(500);
  const [bsfc, setBsfc] = useState(0.5);
  const [cylinders, setCylinders] = useState(8);
  const [safety, setSafety] = useState(0.1);
  const [p1, setP1] = useState(39.15);
  const [q1, setQ1] = useState(34);
  const [p2, setP2] = useState(58);

  const requiredFlow = (hp * bsfc) / (cylinders * (1 - safety));
  const q2 = q1 * Math.sqrt(p2 / p1);
  const flowGs = requiredFlow / 7.936; // lb/hr to g/s

  return (
    <div className={sectionCls}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Target HP</label>
          <input type="number" step="10" value={hp} onChange={e => setHp(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>BSFC (lb/hp·hr)</label>
          <input type="number" step="0.01" value={bsfc} onChange={e => setBsfc(+e.target.value)} className={inputCls} />
          <div className="text-[8px] text-zinc-600 mt-0.5">NA: 0.50 | Turbo: 0.60 | SC: 0.70</div>
        </div>
        <div>
          <label className={labelCls}>Cylinders</label>
          <input type="number" step="1" value={cylinders} onChange={e => setCylinders(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Safety Margin</label>
          <input type="number" step="0.05" value={safety} onChange={e => setSafety(+e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={resultCls}>
          <div className={resultValCls}>{requiredFlow.toFixed(1)}</div>
          <div className={resultLabelCls}>lb/hr per injector</div>
        </div>
        <div className={resultCls}>
          <div className={resultValCls}>{flowGs.toFixed(2)}</div>
          <div className={resultLabelCls}>g/s per injector</div>
        </div>
      </div>

      {/* Flow rate conversion */}
      <div className={cardCls}>
        <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2">Flow Rate Conversion (Pressure Change)</div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>P1 (psi)</label>
            <input type="number" step="1" value={p1} onChange={e => setP1(+e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Q1 (lb/hr)</label>
            <input type="number" step="1" value={q1} onChange={e => setQ1(+e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>P2 (psi)</label>
            <input type="number" step="1" value={p2} onChange={e => setP2(+e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="mt-2 text-center">
          <div className="text-[9px] text-zinc-500 mb-0.5">Q2 = Q1 × √(P2/P1)</div>
          <div className={resultCls}>
            <div className={resultValCls}>{q2.toFixed(2)} lb/hr</div>
            <div className={resultLabelCls}>Flow at new pressure</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 4. Engine Conversion Tool */
function EngineConversionCalc() {
  const conversions: { label: string; from: string; to: string; factor: number; precision: number }[] = [
    { label: 'Horsepower ↔ Kilowatts', from: 'HP', to: 'kW', factor: 0.7457, precision: 2 },
    { label: 'Torque: lb·ft ↔ N·m', from: 'lb·ft', to: 'N·m', factor: 1.3558, precision: 2 },
    { label: 'Pressure: PSI ↔ bar', from: 'PSI', to: 'bar', factor: 0.06895, precision: 4 },
    { label: 'Pressure: PSI ↔ kPa', from: 'PSI', to: 'kPa', factor: 6.895, precision: 2 },
    { label: 'Pressure: bar ↔ kPa', from: 'bar', to: 'kPa', factor: 100, precision: 2 },
    { label: 'Temperature: °F ↔ °C', from: '°F', to: '°C', factor: 0, precision: 2 }, // special
    { label: 'Volume: L ↔ CI', from: 'L', to: 'CI', factor: 61.024, precision: 2 },
    { label: 'Mass: kg ↔ lb', from: 'kg', to: 'lb', factor: 2.2046, precision: 2 },
    { label: 'Speed: km/h ↔ mph', from: 'km/h', to: 'mph', factor: 0.6214, precision: 2 },
    { label: 'Flow: g/s ↔ lb/hr', from: 'g/s', to: 'lb/hr', factor: 7.9366, precision: 2 },
    { label: 'Flow: L/hr ↔ gal/hr', from: 'L/hr', to: 'gal/hr', factor: 0.2642, precision: 3 },
    { label: 'Fuel: mm³ ↔ mg (diesel)', from: 'mm³', to: 'mg', factor: 0.85, precision: 3 },
  ];

  const [values, setValues] = useState<number[]>(conversions.map(() => 0));

  const convert = (idx: number, val: number, direction: 'forward' | 'reverse') => {
    const c = conversions[idx];
    if (c.from === '°F') {
      return direction === 'forward' ? (val - 32) * 5 / 9 : val * 9 / 5 + 32;
    }
    return direction === 'forward' ? val * c.factor : val / c.factor;
  };

  return (
    <div className="space-y-2">
      {conversions.map((c, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto_1fr] gap-1 items-center">
          <div>
            <input type="number" step="any" value={values[i] || ''} placeholder={c.from}
              onChange={e => {
                const v = +e.target.value;
                const newVals = [...values];
                newVals[i] = v;
                setValues(newVals);
              }}
              className={inputCls + ' text-center'} />
            <div className="text-[8px] text-zinc-600 text-center">{c.from}</div>
          </div>
          <ArrowRightLeft className="w-3 h-3 text-zinc-600" />
          <div className="text-center">
            <div className="bg-zinc-900/60 border border-zinc-700/30 rounded px-2 py-1.5 text-xs text-emerald-400 font-mono">
              {values[i] ? convert(i, values[i], 'forward').toFixed(c.precision) : '—'}
            </div>
            <div className="text-[8px] text-zinc-600 text-center">{c.to}</div>
          </div>
        </div>
      ))}

      {/* Displacement calculator */}
      <div className={cardCls + ' mt-3'}>
        <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2">Displacement Calculator</div>
        <DisplacementCalc />
      </div>
    </div>
  );
}

function DisplacementCalc() {
  const [bore, setBore] = useState(4.055); // inches (L5P)
  const [stroke, setStroke] = useState(3.898);
  const [cyl, setCyl] = useState(8);

  const ci = bore * bore * stroke * 0.7854 * cyl;
  const liters = ci / 61.024;

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div>
          <label className={labelCls}>Bore (in)</label>
          <input type="number" step="0.001" value={bore} onChange={e => setBore(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Stroke (in)</label>
          <input type="number" step="0.001" value={stroke} onChange={e => setStroke(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Cylinders</label>
          <input type="number" step="1" value={cyl} onChange={e => setCyl(+e.target.value)} className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className={resultCls}>
          <div className={resultValCls}>{ci.toFixed(1)}</div>
          <div className={resultLabelCls}>Cubic Inches</div>
        </div>
        <div className={resultCls}>
          <div className={resultValCls}>{liters.toFixed(2)}</div>
          <div className={resultLabelCls}>Liters</div>
        </div>
      </div>
    </div>
  );
}

/** 5. Equivalence Ratio / AFR Calculator */
function EquivalenceRatioCalc() {
  const [fuelType, setFuelType] = useState<'diesel' | 'gasoline'>('diesel');
  const [iq, setIq] = useState(50); // mm³/stroke
  const [rpm, setRpm] = useState(2500);
  const [cyl, setCyl] = useState(8);
  const [maf, setMaf] = useState(60); // lb/min
  const [targetLambda, setTargetLambda] = useState(1.2);

  const stoichAFR = fuelType === 'diesel' ? 14.395 : 14.7;
  const fuelDensity = fuelType === 'diesel' ? 0.85 : 0.75; // mg/mm³

  // Fuel mass flow (g/s)
  const fuelMassFlow = (iq * fuelDensity * rpm * cyl) / (2 * 60 * 1000);
  // Air mass flow (g/s) from lb/min
  const airMassFlow = maf * 453.592 / 60;
  // Actual AFR
  const actualAFR = airMassFlow / fuelMassFlow;
  // Lambda
  const lambda = actualAFR / stoichAFR;
  // Equivalence ratio (phi)
  const phi = 1 / lambda;

  // Required air mass for target lambda
  const requiredAirFlow = targetLambda * stoichAFR * fuelMassFlow;
  const requiredMAF = requiredAirFlow * 60 / 453.592;

  return (
    <div className={sectionCls}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Fuel Type</label>
          <select value={fuelType} onChange={e => setFuelType(e.target.value as any)} className={inputCls}>
            <option value="diesel">Diesel (AFR 14.4)</option>
            <option value="gasoline">Gasoline (AFR 14.7)</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Injection Qty (mm³/stroke)</label>
          <input type="number" step="1" value={iq} onChange={e => setIq(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Engine RPM</label>
          <input type="number" step="100" value={rpm} onChange={e => setRpm(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Cylinders</label>
          <input type="number" step="1" value={cyl} onChange={e => setCyl(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>MAF (lb/min)</label>
          <input type="number" step="1" value={maf} onChange={e => setMaf(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Target Lambda</label>
          <input type="number" step="0.05" value={targetLambda} onChange={e => setTargetLambda(+e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={resultCls}>
          <div className={resultValCls}>{fuelMassFlow.toFixed(2)}</div>
          <div className={resultLabelCls}>Fuel Flow (g/s)</div>
        </div>
        <div className={resultCls}>
          <div className={resultValCls}>{airMassFlow.toFixed(1)}</div>
          <div className={resultLabelCls}>Air Flow (g/s)</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className={resultCls}>
          <div className={`text-lg font-bold font-mono ${lambda < 1.1 ? 'text-red-400' : lambda < 1.3 ? 'text-yellow-400' : 'text-emerald-400'}`}>
            {actualAFR.toFixed(1)}
          </div>
          <div className={resultLabelCls}>Actual AFR</div>
        </div>
        <div className={resultCls}>
          <div className={`text-lg font-bold font-mono ${lambda < 1.1 ? 'text-red-400' : lambda < 1.3 ? 'text-yellow-400' : 'text-emerald-400'}`}>
            {lambda.toFixed(3)}
          </div>
          <div className={resultLabelCls}>Lambda (λ)</div>
        </div>
        <div className={resultCls}>
          <div className={`text-lg font-bold font-mono ${phi > 0.9 ? 'text-red-400' : phi > 0.75 ? 'text-yellow-400' : 'text-emerald-400'}`}>
            {phi.toFixed(3)}
          </div>
          <div className={resultLabelCls}>Phi (φ)</div>
        </div>
      </div>

      <div className={cardCls}>
        <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">Required MAF for λ = {targetLambda}</div>
        <div className="grid grid-cols-2 gap-2">
          <div className={resultCls}>
            <div className={resultValCls}>{requiredMAF.toFixed(1)}</div>
            <div className={resultLabelCls}>lb/min</div>
          </div>
          <div className={resultCls}>
            <div className={resultValCls}>{(requiredAirFlow).toFixed(1)}</div>
            <div className={resultLabelCls}>g/s</div>
          </div>
        </div>
      </div>

      {/* Smoke zone indicator */}
      <div className="text-[9px] text-zinc-600 text-center">
        <span className="text-red-400">λ &lt; 1.1 SMOKE</span> · <span className="text-yellow-400">1.1-1.3 BORDERLINE</span> · <span className="text-emerald-400">λ &gt; 1.3 CLEAN</span>
      </div>
    </div>
  );
}

/** 6. BMEP / Engine Performance Calculator */
function BmepCalc() {
  const [torque, setTorque] = useState(900); // lb·ft
  const [displacement, setDisplacement] = useState(403); // CI (6.6L)
  const [hp, setHp] = useState(500);
  const [rpm, setRpm] = useState(3000);

  const bmep = (torque * 75.4) / displacement; // PSI
  const calcHP = (torque * rpm) / 5252;
  const calcTorque = (hp * 5252) / rpm;
  const mep_bar = bmep * 0.06895;

  return (
    <div className={sectionCls}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Torque (lb·ft)</label>
          <input type="number" step="10" value={torque} onChange={e => setTorque(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Displacement (CI)</label>
          <input type="number" step="1" value={displacement} onChange={e => setDisplacement(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Horsepower</label>
          <input type="number" step="10" value={hp} onChange={e => setHp(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>RPM</label>
          <input type="number" step="100" value={rpm} onChange={e => setRpm(+e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={resultCls}>
          <div className={resultValCls}>{bmep.toFixed(1)}</div>
          <div className={resultLabelCls}>BMEP (PSI)</div>
        </div>
        <div className={resultCls}>
          <div className={resultValCls}>{mep_bar.toFixed(2)}</div>
          <div className={resultLabelCls}>BMEP (bar)</div>
        </div>
      </div>

      <div className={cardCls}>
        <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2">HP ↔ Torque Converter</div>
        <div className="grid grid-cols-2 gap-2">
          <div className={resultCls}>
            <div className="text-[9px] text-zinc-500 mb-0.5">HP from Torque × RPM</div>
            <div className={resultValCls}>{calcHP.toFixed(1)}</div>
            <div className={resultLabelCls}>HP = (TQ × RPM) / 5252</div>
          </div>
          <div className={resultCls}>
            <div className="text-[9px] text-zinc-500 mb-0.5">Torque from HP × RPM</div>
            <div className={resultValCls}>{calcTorque.toFixed(1)}</div>
            <div className={resultLabelCls}>TQ = (HP × 5252) / RPM</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 7. Shift Point Calculator (Allison A6) */
function ShiftPointCalc() {
  const [axleRatio, setAxleRatio] = useState(3.73);
  const [tireHeight, setTireHeight] = useState(31.5);
  const [trans, setTrans] = useState('allison6');

  const tireCirc = Math.PI * tireHeight;
  const transmission = TRANSMISSIONS[trans];

  // Allison A6 stock shift schedule (TPS% → shift speed MPH)
  const shiftSchedule = [
    { tps: 6.3, shifts: [9.32, 16.78, 22.99, 30.45, 47.85] },
    { tps: 25.0, shifts: [10.25, 18.64, 24.85, 32.31, 47.85] },
    { tps: 37.5, shifts: [12.74, 22.37, 29.20, 37.90, 49.71] },
    { tps: 50.0, shifts: [15.53, 25.79, 34.18, 45.98, 57.79] },
    { tps: 62.5, shifts: [16.16, 28.89, 39.15, 55.30, 66.49] },
    { tps: 75.0, shifts: [16.16, 30.76, 43.50, 62.14, 75.19] },
    { tps: 87.5, shifts: [16.16, 31.69, 45.36, 65.87, 83.26] },
    { tps: 100.0, shifts: [16.16, 32.31, 45.36, 66.49, 86.37] },
  ];

  // Scale shift points based on tire/axle vs reference (3.73 axle, 31.5" tire)
  const refCirc = Math.PI * 31.5;
  const scaleFactor = (tireCirc / refCirc) * (3.73 / axleRatio);

  return (
    <div className={sectionCls}>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>Transmission</label>
          <select value={trans} onChange={e => setTrans(e.target.value)} className={inputCls}>
            <option value="allison6">Allison 6-Speed</option>
            <option value="68rfe">68RFE 6-Speed</option>
            <option value="6l80">6L80 6-Speed</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Axle Ratio</label>
          <input type="number" step="0.01" value={axleRatio} onChange={e => setAxleRatio(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Tire Height (in)</label>
          <input type="number" step="0.5" value={tireHeight} onChange={e => setTireHeight(+e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr className="border-b border-zinc-700">
              <th className="text-left text-zinc-500 py-1 px-1">TPS%</th>
              <th className="text-center text-zinc-500 py-1 px-1">1→2</th>
              <th className="text-center text-zinc-500 py-1 px-1">2→3</th>
              <th className="text-center text-zinc-500 py-1 px-1">3→4</th>
              <th className="text-center text-zinc-500 py-1 px-1">4→5</th>
              <th className="text-center text-zinc-500 py-1 px-1">5→6</th>
            </tr>
          </thead>
          <tbody>
            {shiftSchedule.map((row, i) => (
              <tr key={i} className="border-b border-zinc-800/50">
                <td className="text-zinc-400 py-0.5 px-1 font-mono">{row.tps}%</td>
                {row.shifts.map((s, j) => (
                  <td key={j} className="text-center text-emerald-400 py-0.5 px-1 font-mono">
                    {(s * scaleFactor).toFixed(1)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[8px] text-zinc-600 text-center">
        Shift speeds in MPH · Scaled for {tireHeight}" tires / {axleRatio} axle ratio
      </div>
    </div>
  );
}

/** 8. 68RFE Lockup Schedule Calculator */
function LockupScheduleCalc() {
  const [axleRatio, setAxleRatio] = useState(3.73);
  const [tireHeight, setTireHeight] = useState(31.5);

  // Stock 68RFE lockup schedule (gear → [lockup ON mph, lockup OFF mph])
  const lockupData = [
    { gear: '3rd', onSpeed: 28, offSpeed: 22 },
    { gear: '4th', onSpeed: 35, offSpeed: 28 },
    { gear: '5th', onSpeed: 42, offSpeed: 35 },
    { gear: '6th', onSpeed: 48, offSpeed: 42 },
  ];

  const refCirc = Math.PI * 31.5;
  const tireCirc = Math.PI * tireHeight;
  const scaleFactor = (tireCirc / refCirc) * (3.73 / axleRatio);

  return (
    <div className={sectionCls}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Axle Ratio</label>
          <input type="number" step="0.01" value={axleRatio} onChange={e => setAxleRatio(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Tire Height (in)</label>
          <input type="number" step="0.5" value={tireHeight} onChange={e => setTireHeight(+e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="space-y-1">
        {lockupData.map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-2 items-center">
            <div className="text-[10px] text-zinc-400 font-mono">{row.gear}</div>
            <div className={resultCls}>
              <div className="text-sm font-bold text-emerald-400 font-mono">{(row.onSpeed * scaleFactor).toFixed(1)}</div>
              <div className={resultLabelCls}>Lock ON (MPH)</div>
            </div>
            <div className={resultCls}>
              <div className="text-sm font-bold text-amber-400 font-mono">{(row.offSpeed * scaleFactor).toFixed(1)}</div>
              <div className={resultLabelCls}>Lock OFF (MPH)</div>
            </div>
          </div>
        ))}
      </div>
      <div className="text-[8px] text-zinc-600 text-center">
        68RFE TCC lockup schedule · Scaled for {tireHeight}" tires / {axleRatio} axle
      </div>
    </div>
  );
}

// ─── Calculator Registry ────────────────────────────────────────────────────

interface CalcEntry {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  component: React.FC;
}

const CALCULATORS: CalcEntry[] = [
  {
    id: 'tire-gear-speed',
    name: 'Tire / Gear / Speed',
    icon: <Gauge className="w-4 h-4" />,
    description: 'Calculate vehicle speed from RPM, gear ratio, axle ratio, and tire size. Supports 12+ transmissions.',
    component: TireGearSpeedCalc,
  },
  {
    id: 'map-sensor',
    name: 'MAP Sensor Data',
    icon: <Zap className="w-4 h-4" />,
    description: 'Convert MAP sensor voltage to pressure (kPa, PSI, inHg). Presets for GM, Bosch, Can-Am, Polaris, Honda.',
    component: MapSensorCalc,
  },
  {
    id: 'injector-sizing',
    name: 'Injector Sizing',
    icon: <Fuel className="w-4 h-4" />,
    description: 'Calculate required injector flow rate from target HP, BSFC, and cylinder count. Flow rate pressure conversion.',
    component: InjectorCalc,
  },
  {
    id: 'equivalence-ratio',
    name: 'Equivalence Ratio / AFR',
    icon: <Calculator className="w-4 h-4" />,
    description: 'Calculate air-fuel ratio, lambda, and equivalence ratio from injection quantity, RPM, and MAF.',
    component: EquivalenceRatioCalc,
  },
  {
    id: 'bmep-performance',
    name: 'BMEP / HP ↔ Torque',
    icon: <Cog className="w-4 h-4" />,
    description: 'Calculate BMEP from torque and displacement. Convert between HP and torque at any RPM.',
    component: BmepCalc,
  },
  {
    id: 'engine-conversion',
    name: 'Engine Conversion Tool',
    icon: <ArrowRightLeft className="w-4 h-4" />,
    description: 'Unit conversions: HP↔kW, lb·ft↔N·m, PSI↔bar↔kPa, °F↔°C, L↔CI, and displacement calculator.',
    component: EngineConversionCalc,
  },
  {
    id: 'shift-points',
    name: 'Shift Point Calculator',
    icon: <Cog className="w-4 h-4" />,
    description: 'Allison / 68RFE / 6L80 shift point schedule scaled for your tire size and axle ratio.',
    component: ShiftPointCalc,
  },
  {
    id: 'lockup-schedule',
    name: '68RFE Lockup Schedule',
    icon: <Cog className="w-4 h-4" />,
    description: '68RFE TCC lockup on/off speeds per gear, scaled for tire and axle ratio.',
    component: LockupScheduleCalc,
  },
];

// ─── Main Panel ─────────────────────────────────────────────────────────────

export default function CalculatorsPanel() {
  const [activeCalc, setActiveCalc] = useState<string | null>(null);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-red-500" />
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">PPEI Calculators</span>
          <span className="text-[9px] text-zinc-600 ml-auto">{CALCULATORS.length} tools</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {CALCULATORS.map(calc => {
          const isOpen = activeCalc === calc.id;
          const Comp = calc.component;
          return (
            <div key={calc.id} className="border border-zinc-800/60 rounded-lg overflow-hidden">
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                  isOpen ? 'bg-zinc-800/80 text-white' : 'bg-zinc-900/40 text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-300'
                }`}
                onClick={() => setActiveCalc(isOpen ? null : calc.id)}
              >
                <span className={isOpen ? 'text-red-400' : 'text-zinc-500'}>{calc.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold truncate">{calc.name}</div>
                  {!isOpen && <div className="text-[9px] text-zinc-600 truncate">{calc.description}</div>}
                </div>
                {isOpen ? <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" /> : <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />}
              </button>
              {isOpen && (
                <div className="px-3 pb-3 pt-1 bg-zinc-900/30">
                  <Comp />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
