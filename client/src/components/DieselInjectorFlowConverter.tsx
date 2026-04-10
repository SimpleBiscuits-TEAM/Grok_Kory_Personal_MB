/**
 * DieselInjectorFlowConverter — Converts stock OEM injector duration tables
 * to work with aftermarket injectors based on flow sheet data.
 *
 * Currently supports: Duramax > LB7 > S&S SAC00™
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  LB7_PRESSURE_AXIS_MPA,
  LB7_QUANTITY_AXIS_MM3,
  LB7_STOCK_DURATION_TABLE,
  SS_SAC00_FLOW_DATA,
} from '@/lib/lb7InjectorData';
import {
  generateCorrectedTable,
  formatTableForExport,
  formatTableAsCSV,
  type CorrectionPoint,
} from '@/lib/injectorFlowConverter';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Check,
  Info,
  Fuel,
  Gauge,
  ArrowRight,
  Table2,
  BarChart3,
} from 'lucide-react';

// ── Shared style tokens (match Advanced.tsx) ────────────────────────────────
const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};
const sColor = {
  bg: 'oklch(0.10 0.005 260)',
  bgDark: 'oklch(0.08 0.004 260)',
  bgCard: 'oklch(0.33 0.006 260)',
  bgInput: 'oklch(0.30 0.005 260)',
  border: 'oklch(0.22 0.008 260)',
  borderLight: 'oklch(0.18 0.006 260)',
  red: 'oklch(0.52 0.22 25)',
  green: 'oklch(0.65 0.20 145)',
  blue: 'oklch(0.70 0.18 200)',
  yellow: 'oklch(0.75 0.18 60)',
  purple: 'oklch(0.65 0.20 300)',
  text: 'oklch(0.95 0.005 260)',
  textDim: 'oklch(0.68 0.010 260)',
  textMuted: 'oklch(0.58 0.008 260)',
};

// ── Cell color helper ───────────────────────────────────────────────────────
function getDeltaColor(stockVal: number, correctedVal: number): string {
  if (stockVal <= 0) return 'transparent';
  const pctChange = ((correctedVal - stockVal) / stockVal) * 100;
  if (pctChange > 15) return 'oklch(0.35 0.15 25 / 0.5)';    // strong red (much longer)
  if (pctChange > 5) return 'oklch(0.35 0.12 25 / 0.35)';     // light red
  if (pctChange > 1) return 'oklch(0.35 0.08 60 / 0.25)';     // slight warm
  if (pctChange < -15) return 'oklch(0.35 0.15 145 / 0.5)';   // strong green (much shorter)
  if (pctChange < -5) return 'oklch(0.35 0.12 145 / 0.35)';   // light green
  if (pctChange < -1) return 'oklch(0.35 0.08 200 / 0.25)';   // slight cool
  return 'transparent';
}

function formatDelta(stockVal: number, correctedVal: number): string {
  if (stockVal <= 0) return '';
  const delta = correctedVal - stockVal;
  const pct = ((delta) / stockVal) * 100;
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)} (${sign}${pct.toFixed(1)}%)`;
}

// ── Collapsible Section ─────────────────────────────────────────────────────
function Section({
  title,
  icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: '1rem' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
          padding: '10px 14px', background: sColor.bgCard, border: `1px solid ${sColor.border}`,
          borderRadius: '4px', cursor: 'pointer', color: sColor.text,
          fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.08em',
        }}
      >
        {icon}
        {title}
        <span style={{ marginLeft: 'auto' }}>
          {open ? <ChevronDown style={{ width: 16, height: 16 }} /> : <ChevronRight style={{ width: 16, height: 16 }} />}
        </span>
      </button>
      {open && (
        <div style={{ padding: '12px 0 0 0' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Duration Table Component ────────────────────────────────────────────────
function DurationTable({
  table,
  stockTable,
  label,
  showDelta = false,
}: {
  table: number[][];
  stockTable?: number[][];
  label: string;
  showDelta?: boolean;
}) {
  const cellStyle: React.CSSProperties = {
    padding: '3px 5px',
    fontFamily: sFont.mono,
    fontSize: '0.65rem',
    textAlign: 'right',
    borderRight: `1px solid ${sColor.borderLight}`,
    borderBottom: `1px solid ${sColor.borderLight}`,
    whiteSpace: 'nowrap',
    minWidth: '48px',
  };

  const headerStyle: React.CSSProperties = {
    ...cellStyle,
    fontFamily: sFont.body,
    fontWeight: 700,
    fontSize: '0.7rem',
    textAlign: 'center',
    background: sColor.bgCard,
    color: sColor.yellow,
    position: 'sticky' as const,
    top: 0,
    zIndex: 2,
  };

  const rowHeaderStyle: React.CSSProperties = {
    ...cellStyle,
    fontFamily: sFont.body,
    fontWeight: 700,
    fontSize: '0.7rem',
    textAlign: 'center',
    background: sColor.bgCard,
    color: sColor.green,
    position: 'sticky' as const,
    left: 0,
    zIndex: 1,
    minWidth: '40px',
  };

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '500px', border: `1px solid ${sColor.border}`, borderRadius: '4px' }}>
      <table style={{ borderCollapse: 'collapse', width: 'max-content' }}>
        <thead>
          <tr>
            <th style={{ ...headerStyle, position: 'sticky', left: 0, zIndex: 3, background: sColor.bgDark }}>
              <span style={{ fontSize: '0.6rem', color: sColor.textMuted }}>{label}</span>
            </th>
            {LB7_PRESSURE_AXIS_MPA.map((mpa) => (
              <th key={mpa} style={headerStyle}>{mpa}</th>
            ))}
          </tr>
          <tr>
            <th style={{ ...headerStyle, position: 'sticky', left: 0, zIndex: 3, background: sColor.bgDark, fontSize: '0.55rem', color: sColor.textMuted }}>
              mm³\MPa
            </th>
            {LB7_PRESSURE_AXIS_MPA.map((mpa) => (
              <th key={`u-${mpa}`} style={{ ...headerStyle, fontSize: '0.55rem', color: sColor.textMuted }}>MPa</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.map((row, r) => (
            <tr key={r}>
              <td style={rowHeaderStyle}>{LB7_QUANTITY_AXIS_MM3[r]}</td>
              {row.map((val, c) => {
                const bg = showDelta && stockTable
                  ? getDeltaColor(stockTable[r][c], val)
                  : 'transparent';
                return (
                  <td
                    key={c}
                    style={{
                      ...cellStyle,
                      background: bg,
                      color: val <= 0 ? sColor.textMuted : sColor.text,
                    }}
                    title={showDelta && stockTable && stockTable[r][c] > 0
                      ? `Stock: ${stockTable[r][c].toFixed(1)} → Corrected: ${val.toFixed(1)}\n${formatDelta(stockTable[r][c], val)}`
                      : `${val.toFixed(1)} µs`
                    }
                  >
                    {val.toFixed(1)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function DieselInjectorFlowConverter() {
  const [engine] = useState('Duramax');
  const [variant] = useState('LB7');
  const [injector] = useState('S&S SAC00™');
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState<'corrected' | 'stock' | 'delta'>('corrected');

  const result = useMemo(() => generateCorrectedTable(), []);

  const handleCopyTSV = useCallback(() => {
    const tsv = formatTableForExport(result.table);
    navigator.clipboard.writeText(tsv).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [result]);

  const handleDownloadCSV = useCallback(() => {
    const csv = formatTableAsCSV(result.table);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LB7_SS_SAC00_corrected_duration_table.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  return (
    <div style={{ padding: '1rem', maxWidth: '100%', color: sColor.text }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Fuel style={{ width: 28, height: 28, color: sColor.red }} />
        <div>
          <h1 style={{ fontFamily: sFont.heading, fontSize: '1.6rem', letterSpacing: '0.1em', color: 'white', margin: 0, lineHeight: 1 }}>
            DIESEL INJECTOR FLOW CONVERTER
          </h1>
          <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, margin: '2px 0 0 0' }}>
            Convert stock OEM duration tables for aftermarket injectors
          </p>
        </div>
      </div>

      {/* ── Selector Bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
        background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderRadius: '4px',
        marginBottom: '1rem', flexWrap: 'wrap',
      }}>
        <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 700, color: sColor.yellow }}>
          {engine}
        </span>
        <ArrowRight style={{ width: 14, height: 14, color: sColor.textMuted }} />
        <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 700, color: sColor.green }}>
          {variant}
        </span>
        <ArrowRight style={{ width: 14, height: 14, color: sColor.textMuted }} />
        <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 700, color: sColor.blue }}>
          {injector}
        </span>
        <span style={{
          marginLeft: 'auto', fontFamily: sFont.mono, fontSize: '0.7rem',
          padding: '2px 8px', borderRadius: '2px',
          background: 'oklch(0.52 0.22 25 / 0.15)', border: '1px solid oklch(0.52 0.22 25 / 0.3)',
          color: sColor.red,
        }}>
          {'{'} B0720 {'}'} MAIN INJECTION PULSE
        </span>
      </div>

      {/* ── S&S Flow Sheet Summary ── */}
      <Section
        title="S&S SAC00™ FLOW SHEET DATA"
        icon={<BarChart3 style={{ width: 16, height: 16, color: sColor.blue }} />}
        defaultOpen={false}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '900px' }}>
            <thead>
              <tr>
                {['Test Pt', 'MPa', 'µSec', 'Avg Flow (mm³)', 'Stock Flow (mm³)', 'Correction', 'Variance'].map((h) => (
                  <th key={h} style={{
                    padding: '6px 10px', fontFamily: sFont.body, fontSize: '0.75rem', fontWeight: 700,
                    textAlign: 'center', color: sColor.yellow, background: sColor.bgCard,
                    borderBottom: `1px solid ${sColor.border}`,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.correctionPoints.map((cp, i) => {
                const tp = SS_SAC00_FLOW_DATA[i];
                const factorPct = ((1 / cp.correctionFactor - 1) * 100);
                const factorColor = factorPct > 0 ? sColor.green : sColor.red;
                return (
                  <tr key={i}>
                    <td style={{ padding: '5px 10px', fontFamily: sFont.mono, fontSize: '0.75rem', textAlign: 'center', color: sColor.text, borderBottom: `1px solid ${sColor.borderLight}` }}>
                      {cp.pressureMPa === 160 && cp.durationUs === 1700 ? '1' : cp.pressureMPa === 160 && cp.durationUs === 1350 ? '2' : cp.pressureMPa === 60 ? '3' : '4'}
                    </td>
                    <td style={{ padding: '5px 10px', fontFamily: sFont.mono, fontSize: '0.75rem', textAlign: 'center', color: sColor.text, borderBottom: `1px solid ${sColor.borderLight}` }}>
                      {cp.pressureMPa}
                    </td>
                    <td style={{ padding: '5px 10px', fontFamily: sFont.mono, fontSize: '0.75rem', textAlign: 'center', color: sColor.text, borderBottom: `1px solid ${sColor.borderLight}` }}>
                      {cp.durationUs}
                    </td>
                    <td style={{ padding: '5px 10px', fontFamily: sFont.mono, fontSize: '0.75rem', textAlign: 'center', color: sColor.blue, fontWeight: 700, borderBottom: `1px solid ${sColor.borderLight}` }}>
                      {cp.ssMm3}
                    </td>
                    <td style={{ padding: '5px 10px', fontFamily: sFont.mono, fontSize: '0.75rem', textAlign: 'center', color: sColor.textDim, borderBottom: `1px solid ${sColor.borderLight}` }}>
                      {cp.stockMm3}
                    </td>
                    <td style={{ padding: '5px 10px', fontFamily: sFont.mono, fontSize: '0.75rem', textAlign: 'center', color: factorColor, fontWeight: 700, borderBottom: `1px solid ${sColor.borderLight}` }}>
                      {cp.correctionFactor.toFixed(3)}x ({factorPct > 0 ? '+' : ''}{factorPct.toFixed(1)}%)
                    </td>
                    <td style={{ padding: '5px 10px', fontFamily: sFont.mono, fontSize: '0.75rem', textAlign: 'center', color: sColor.textMuted, borderBottom: `1px solid ${sColor.borderLight}` }}>
                      {tp.variance}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: '8px', padding: '8px 12px', background: 'oklch(0.15 0.008 260)', borderRadius: '4px', border: `1px solid ${sColor.borderLight}` }}>
          <p style={{ fontFamily: sFont.body, fontSize: '0.78rem', color: sColor.textDim, margin: 0, lineHeight: 1.6 }}>
            <Info style={{ width: 12, height: 12, display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
            <strong style={{ color: sColor.text }}>How it works:</strong> The S&S SAC00 flows <strong style={{ color: sColor.red }}>less</strong> at low pressures and <strong style={{ color: sColor.green }}>more</strong> at high pressures vs stock.
            The correction factor adjusts the pulse width so the ECM delivers the same fuel quantity as the stock calibration expects.
            Factor {'>'} 1.0 = longer pulse (S&S flows less). Factor {'<'} 1.0 = shorter pulse (S&S flows more).
          </p>
        </div>
      </Section>

      {/* ── Correction Curve ── */}
      <Section
        title="PRESSURE-BASED CORRECTION CURVE"
        icon={<Gauge style={{ width: 16, height: 16, color: sColor.purple }} />}
        defaultOpen={false}
      >
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '120px', padding: '0 4px' }}>
            {result.correctionCurve.map((pt) => {
              if (pt.pressureMPa === 0) return null;
              const maxFactor = Math.max(...result.correctionCurve.filter(p => p.pressureMPa > 0).map(p => p.factor));
              const minFactor = Math.min(...result.correctionCurve.filter(p => p.pressureMPa > 0).map(p => p.factor));
              const range = maxFactor - minFactor || 1;
              const height = ((pt.factor - minFactor) / range) * 90 + 10;
              const barColor = pt.factor > 1.0
                ? `oklch(0.52 0.22 25 / ${0.3 + (pt.factor - 1) * 2})`
                : `oklch(0.65 0.20 145 / ${0.3 + (1 - pt.factor) * 3})`;
              return (
                <div
                  key={pt.pressureMPa}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: '30px' }}
                  title={`${pt.pressureMPa} MPa → ${pt.factor.toFixed(3)}x`}
                >
                  <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textDim, marginBottom: '2px' }}>
                    {pt.factor.toFixed(2)}
                  </span>
                  <div style={{
                    width: '100%', maxWidth: '28px', height: `${height}%`,
                    background: barColor, borderRadius: '2px 2px 0 0',
                    border: `1px solid ${pt.factor > 1 ? 'oklch(0.52 0.22 25 / 0.4)' : 'oklch(0.65 0.20 145 / 0.4)'}`,
                  }} />
                  <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted, marginTop: '2px' }}>
                    {pt.pressureMPa}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: 'center', fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textMuted, marginTop: '4px' }}>
            Fuel Rail Pressure (MPa) → Correction Factor
          </div>
        </div>
        <div style={{ marginTop: '8px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.red }}>
            ■ Red = Longer pulse (S&S flows less than stock)
          </span>
          <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.green }}>
            ■ Green = Shorter pulse (S&S flows more than stock)
          </span>
        </div>
      </Section>

      {/* ── Table View Switcher ── */}
      <Section
        title="DURATION TABLE"
        icon={<Table2 style={{ width: 16, height: 16, color: sColor.green }} />}
        defaultOpen={true}
      >
        {/* View tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
          {([
            { id: 'corrected' as const, label: 'CORRECTED (S&S SAC00)', color: sColor.green },
            { id: 'stock' as const, label: 'STOCK OEM', color: sColor.textMuted },
            { id: 'delta' as const, label: 'DELTA VIEW', color: sColor.yellow },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              style={{
                padding: '6px 14px', fontFamily: sFont.body, fontSize: '0.75rem', fontWeight: 700,
                letterSpacing: '0.05em', border: `1px solid ${activeView === tab.id ? tab.color : sColor.border}`,
                borderRadius: '3px', cursor: 'pointer',
                background: activeView === tab.id ? `${tab.color}22` : 'transparent',
                color: activeView === tab.id ? tab.color : sColor.textDim,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        {activeView === 'corrected' && (
          <DurationTable table={result.table} stockTable={LB7_STOCK_DURATION_TABLE} label="S&S SAC00 Corrected (µs)" showDelta />
        )}
        {activeView === 'stock' && (
          <DurationTable table={LB7_STOCK_DURATION_TABLE} label="Stock OEM LB7 (µs)" />
        )}
        {activeView === 'delta' && (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '500px', border: `1px solid ${sColor.border}`, borderRadius: '4px' }}>
            <table style={{ borderCollapse: 'collapse', width: 'max-content' }}>
              <thead>
                <tr>
                  <th style={{
                    padding: '3px 5px', fontFamily: sFont.body, fontSize: '0.7rem', fontWeight: 700,
                    textAlign: 'center', background: sColor.bgDark, color: sColor.yellow,
                    borderRight: `1px solid ${sColor.borderLight}`, borderBottom: `1px solid ${sColor.borderLight}`,
                    position: 'sticky', left: 0, top: 0, zIndex: 3,
                  }}>
                    Δ µs
                  </th>
                  {LB7_PRESSURE_AXIS_MPA.map((mpa) => (
                    <th key={mpa} style={{
                      padding: '3px 5px', fontFamily: sFont.body, fontSize: '0.7rem', fontWeight: 700,
                      textAlign: 'center', background: sColor.bgCard, color: sColor.yellow,
                      borderRight: `1px solid ${sColor.borderLight}`, borderBottom: `1px solid ${sColor.borderLight}`,
                      position: 'sticky', top: 0, zIndex: 2,
                    }}>
                      {mpa}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.table.map((row, r) => (
                  <tr key={r}>
                    <td style={{
                      padding: '3px 5px', fontFamily: sFont.body, fontSize: '0.7rem', fontWeight: 700,
                      textAlign: 'center', background: sColor.bgCard, color: sColor.green,
                      borderRight: `1px solid ${sColor.borderLight}`, borderBottom: `1px solid ${sColor.borderLight}`,
                      position: 'sticky', left: 0, zIndex: 1,
                    }}>
                      {LB7_QUANTITY_AXIS_MM3[r]}
                    </td>
                    {row.map((val, c) => {
                      const stock = LB7_STOCK_DURATION_TABLE[r][c];
                      const delta = val - stock;
                      const bg = getDeltaColor(stock, val);
                      return (
                        <td key={c} style={{
                          padding: '3px 5px', fontFamily: sFont.mono, fontSize: '0.65rem',
                          textAlign: 'right', background: bg,
                          color: stock <= 0 ? sColor.textMuted : delta > 0 ? sColor.red : delta < 0 ? sColor.green : sColor.textDim,
                          borderRight: `1px solid ${sColor.borderLight}`, borderBottom: `1px solid ${sColor.borderLight}`,
                          minWidth: '48px',
                        }}>
                          {stock <= 0 ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Color legend */}
        <div style={{ marginTop: '8px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.red }}>
            ■ Red cells = Duration increased (S&S needs longer pulse)
          </span>
          <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.green }}>
            ■ Green cells = Duration decreased (S&S needs shorter pulse)
          </span>
        </div>
      </Section>

      {/* ── Export Section ── */}
      <Section
        title="EXPORT CORRECTED TABLE"
        icon={<Download style={{ width: 16, height: 16, color: sColor.yellow }} />}
        defaultOpen={true}
      >
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleCopyTSV}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 20px', fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 700,
              letterSpacing: '0.05em', border: `1px solid ${copied ? sColor.green : sColor.red}`,
              borderRadius: '4px', cursor: 'pointer',
              background: copied ? 'oklch(0.65 0.20 145 / 0.15)' : 'oklch(0.52 0.22 25 / 0.15)',
              color: copied ? sColor.green : sColor.red,
              transition: 'all 0.2s',
            }}
          >
            {copied ? <Check style={{ width: 16, height: 16 }} /> : <Copy style={{ width: 16, height: 16 }} />}
            {copied ? 'COPIED TO CLIPBOARD' : 'COPY TABLE (TAB-SEPARATED)'}
          </button>

          <button
            onClick={handleDownloadCSV}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 20px', fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 700,
              letterSpacing: '0.05em', border: `1px solid ${sColor.border}`,
              borderRadius: '4px', cursor: 'pointer',
              background: 'transparent', color: sColor.textDim,
            }}
          >
            <Download style={{ width: 16, height: 16 }} />
            DOWNLOAD CSV
          </button>
        </div>

        <div style={{ marginTop: '10px', padding: '8px 12px', background: 'oklch(0.15 0.008 260)', borderRadius: '4px', border: `1px solid ${sColor.borderLight}` }}>
          <p style={{ fontFamily: sFont.body, fontSize: '0.78rem', color: sColor.textDim, margin: 0, lineHeight: 1.6 }}>
            <Info style={{ width: 12, height: 12, display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
            <strong style={{ color: sColor.text }}>Paste into calibration:</strong> Use "Copy Table" for tab-separated format compatible with HP Tuners and EFILive paste operations.
            Select the entire {'{'}B0720{'}'} Main Injection Pulse table in your calibration software, then paste the copied data to replace all values.
          </p>
        </div>
      </Section>
    </div>
  );
}
