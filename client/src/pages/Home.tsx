/**
 * PPEI Custom Tuning — Duramax Performance Analyzer
 * Design: Industrial Performance / Motorsport Dark
 * Colors: Black (#0a0a0a bg) + PPEI Red (oklch 0.52 0.22 25) + White text
 * Typography: Bebas Neue (headings) + Rajdhani (body) + Share Tech Mono (data)
 * Layout: Full-width dark panels, red left-border accents, sharp corners
 */

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Upload, AlertCircle, CheckCircle, Loader2, FileDown, Cpu, Search, Activity, Gauge, Zap, BarChart3 } from 'lucide-react';
import { parseCSV, processData, downsampleData, createBinnedData, ProcessedMetrics } from '@/lib/dataProcessor';
import { StatsSummary } from '@/components/Charts';
import { DynoHPChart, DynoChartHandle, BoostEfficiencyChart, RailPressureFaultChart, BoostFaultChart, EgtFaultChart, MafFaultChart, TccFaultChart, VgtFaultChart, RegulatorFaultChart, CoolantFaultChart, IdleRpmFaultChart } from '@/components/DynoCharts';
import { analyzeDiagnostics, DiagnosticReport } from '@/lib/diagnostics';
import { DiagnosticReportComponent } from '@/components/DiagnosticReport';
import { generateHealthReport, HealthReportData } from '@/lib/healthReport';
import HealthReport from '@/components/HealthReport';
import { getVehicleInfoFromFilename, decodeVin } from '@/lib/vinLookup';
import EcuReferencePanel from '@/components/EcuReferencePanel';
import DtcSearch from '@/components/DtcSearch';
import { usePdfExport } from '@/hooks/usePdfExport';

const PPEI_LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663472908899/S5fEZ6uPndYXxpVXwwyEPy/PPEI Logo _b0d26c0f.png';

export default function Home() {
  const [data, setData] = useState<ProcessedMetrics | null>(null);
  const [binnedData, setBinnedData] = useState<any[] | undefined>(undefined);
  const [diagnostics, setDiagnostics] = useState<DiagnosticReport | null>(null);
  const [healthReport, setHealthReport] = useState<HealthReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [manualVin, setManualVin] = useState('');
  const [vinFromFile, setVinFromFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refs for PDF export
  const dynoRef = useRef<DynoChartHandle>(null);
  const dynoContainerRef = useRef<HTMLDivElement>(null);
  const boostEffRef = useRef<HTMLDivElement>(null);
  const railFaultRef = useRef<HTMLDivElement>(null);
  const boostFaultRef = useRef<HTMLDivElement>(null);
  const egtFaultRef = useRef<HTMLDivElement>(null);
  const mafFaultRef = useRef<HTMLDivElement>(null);
  const tccFaultRef = useRef<HTMLDivElement>(null);
  const vgtFaultRef = useRef<HTMLDivElement>(null);
  const regulatorFaultRef = useRef<HTMLDivElement>(null);
  const coolantFaultRef = useRef<HTMLDivElement>(null);
  const idleRpmFaultRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const healthRef = useRef<HTMLDivElement>(null);

  const { exportToPdf, isExporting, exportError } = usePdfExport();

  const processFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const content = await file.text();
      const rawData = parseCSV(content);
      const processed = processData(rawData);
      const downsampled = downsampleData(processed, 2000);
      const binned = createBinnedData(processed, 40);

      setData(downsampled);
      setBinnedData(binned);
      setFileName(file.name);

      const diagnosticReport = analyzeDiagnostics(downsampled);
      setDiagnostics(diagnosticReport);

      const detectedVin = getVehicleInfoFromFilename(file.name);
      setVinFromFile(detectedVin ? detectedVin.vin : null);
      const vehicleInfo = detectedVin || undefined;
      const report = generateHealthReport(downsampled, vehicleInfo);
      setHealthReport(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file');
      setData(null);
      setBinnedData(undefined);
      setDiagnostics(null);
      setHealthReport(null);
      setVinFromFile(null);
      setManualVin('');
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.csv')) {
      processFile(file);
    } else {
      setError('Please drop a CSV file.');
    }
  }, [processFile]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleExportPdf = () => {
    if (!data || !fileName) return;
    const refs = {
      dynoRef: dynoContainerRef,
      boostEffRef,
      railFaultRef,
      boostFaultRef,
      egtFaultRef,
      mafFaultRef,
      tccFaultRef,
      vgtFaultRef,
      regulatorFaultRef,
      coolantFaultRef,
      idleRpmFaultRef,
      statsRef,
      healthRef,
    };
    exportToPdf(data, fileName, diagnostics, healthReport, refs);
  };

  const hasFaults = diagnostics && diagnostics.issues.length > 0;

  const applyManualVin = useCallback(() => {
    if (!data || !manualVin.trim()) return;
    const vin = manualVin.trim().toUpperCase();
    if (vin.length !== 17) return;
    const vehicleInfo = decodeVin(vin);
    setVinFromFile(vin);
    const report = generateHealthReport(data, vehicleInfo);
    setHealthReport(report);
  }, [data, manualVin]);

  return (
    <div className="min-h-screen" style={{ background: 'oklch(0.10 0.005 260)', color: 'oklch(0.95 0.005 260)' }}>

      {/* ── PPEI Header ── */}
      <header style={{
        background: 'oklch(0.08 0.004 260)',
        borderBottom: '1px solid oklch(0.20 0.008 260)',
        boxShadow: '0 2px 20px oklch(0 0 0 / 0.5)'
      }}>
              {/* Top accent bar */}
        <div className="ppei-accent-animated" style={{ height: '3px' }} />
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* PPEI Logo */}
              <img
                src={PPEI_LOGO_URL}
                alt="PPEI Custom Tuning"
                className="ppei-logo"
                style={{ height: '64px', width: 'auto', objectFit: 'contain' }}
              />
              {/* Title block */}
              <div style={{ borderLeft: '3px solid oklch(0.52 0.22 25)', paddingLeft: '1rem' }}>
                <h1 style={{
                  fontFamily: '"Bebas Neue", "Impact", "Arial Black", sans-serif',
                  fontSize: '1.6rem',
                  letterSpacing: '0.08em',
                  color: 'white',
                  lineHeight: 1.1,
                  margin: 0
                }}>
                  DURAMAX PERFORMANCE ANALYZER
                </h1>
                <p style={{
                  fontFamily: '"Rajdhani", "Segoe UI", sans-serif',
                  fontSize: '0.8rem',
                  color: 'oklch(0.60 0.010 260)',
                  letterSpacing: '0.05em',
                  margin: 0,
                  marginTop: '2px'
                }}>
                  AI-POWERED DIAGNOSTICS · HP TUNERS · EFILIVE · BANKS POWER
                </p>
              </div>
            </div>
            {/* Right side — version badge */}
            <div style={{
              background: 'oklch(0.52 0.22 25)',
              color: 'white',
              padding: '4px 12px',
              borderRadius: '2px',
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: '0.85rem',
              letterSpacing: '0.1em'
            }}>
              L5P DURAMAX
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!data ? (
          /* ── Upload Section ── */
          <div className="max-w-3xl mx-auto">

            {/* Hero text */}
            <div className="text-center mb-8 ppei-anim-fade-up">
              <h2 className="ppei-gradient-text" style={{
                fontFamily: '"Bebas Neue", "Impact", sans-serif',
                fontSize: '3rem',
                letterSpacing: '0.1em',
                marginBottom: '0.5rem'
              }}>
                REDEFINING THE LIMITS
              </h2>
              <p style={{
                fontFamily: '"Rajdhani", sans-serif',
                fontSize: '1rem',
                color: 'oklch(0.60 0.010 260)',
                letterSpacing: '0.03em'
              }}>
                Upload your datalog to generate a full diagnostic analysis, dyno chart, and PDF report
              </p>
            </div>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`ppei-dropzone ppei-anim-scale-in ppei-delay-200${isDragOver ? ' active' : ''}${loading ? ' ppei-loading-scan' : ''}`}
              style={{
                border: isDragOver ? '2px dashed oklch(0.52 0.22 25)' : '2px dashed oklch(0.30 0.008 260)',
                background: isDragOver ? 'oklch(0.14 0.012 25)' : 'oklch(0.11 0.005 260)',
                borderRadius: '4px',
                transition: 'all 0.2s',
                boxShadow: isDragOver ? '0 0 30px oklch(0.52 0.22 25 / 0.2)' : 'none',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
              onClick={() => !loading && fileInputRef.current?.click()}
            >
              <div className="p-14 flex flex-col items-center justify-center gap-5">
                <div style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '4px',
                  background: isDragOver ? 'oklch(0.52 0.22 25 / 0.2)' : 'oklch(0.16 0.008 260)',
                  border: `2px solid ${isDragOver ? 'oklch(0.52 0.22 25)' : 'oklch(0.28 0.008 260)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}>
                  {loading ? (
                    <Loader2 style={{ width: '36px', height: '36px', color: 'oklch(0.52 0.22 25)', animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <Upload style={{ width: '36px', height: '36px', color: isDragOver ? 'oklch(0.52 0.22 25)' : 'oklch(0.55 0.010 260)' }} />
                  )}
                </div>
                <div className="text-center">
                  <h3 style={{
                    fontFamily: '"Bebas Neue", "Impact", sans-serif',
                    fontSize: '1.8rem',
                    letterSpacing: '0.06em',
                    color: 'white',
                    marginBottom: '0.4rem'
                  }}>
                    {loading ? 'PROCESSING LOG...' : isDragOver ? 'DROP TO ANALYZE' : 'UPLOAD YOUR DURAMAX LOG'}
                  </h3>
                  <p style={{ fontFamily: '"Rajdhani", sans-serif', color: 'oklch(0.55 0.010 260)', fontSize: '0.9rem' }}>
                    Drag &amp; drop your CSV file here, or click to browse
                  </p>
                  <p style={{ fontFamily: '"Share Tech Mono", monospace', color: 'oklch(0.40 0.008 260)', fontSize: '0.75rem', marginTop: '4px' }}>
                    HP TUNERS · EFILIVE · BANKS POWER CSV FORMATS
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  disabled={loading}
                  className="hidden"
                />
                <button
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  disabled={loading}
                  style={{
                    background: loading ? 'oklch(0.35 0.010 260)' : 'oklch(0.52 0.22 25)',
                    color: 'white',
                    fontFamily: '"Bebas Neue", "Impact", sans-serif',
                    fontSize: '1.1rem',
                    letterSpacing: '0.1em',
                    padding: '10px 32px',
                    borderRadius: '3px',
                    border: 'none',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  {loading ? (
                    <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />PROCESSING...</>
                  ) : (
                    <><Upload style={{ width: '16px', height: '16px' }} />SELECT CSV FILE</>
                  )}
                </button>
              </div>
            </div>

            {/* Feature cards */}
            <div className="mt-8 grid md:grid-cols-2 gap-4 ppei-anim-fade-up ppei-delay-400">
              <div className="ppei-card-hover" style={{
                background: 'oklch(0.13 0.006 260)',
                border: '1px solid oklch(0.22 0.008 260)',
                borderTop: '3px solid oklch(0.52 0.22 25)',
                borderRadius: '3px',
                padding: '1.25rem'
              }}>
                <h3 style={{
                  fontFamily: '"Bebas Neue", "Impact", sans-serif',
                  fontSize: '1.1rem',
                  letterSpacing: '0.08em',
                  color: 'white',
                  marginBottom: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <BarChart3 style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />
                  WHAT'S ANALYZED
                </h3>
                <ul style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.9rem', color: 'oklch(0.65 0.010 260)', lineHeight: 1.8 }}>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.52 0.22 25)', fontWeight: 'bold' }}>▸</span> Dynojet-style HP &amp; Torque graph
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.52 0.22 25)', fontWeight: 'bold' }}>▸</span> Fault-specific charts (actual vs desired)
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.52 0.22 25)', fontWeight: 'bold' }}>▸</span> 34 diagnostic checks (P0087, P0088, P0299, EGT...)
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.52 0.22 25)', fontWeight: 'bold' }}>▸</span> Vehicle health report with VIN decode
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.52 0.22 25)', fontWeight: 'bold' }}>▸</span> GM OBDG06C HD spec DTC lookup (293 codes)
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.52 0.22 25)', fontWeight: 'bold' }}>▸</span> Full PDF report export with all charts
                  </li>
                </ul>
              </div>
              <div className="ppei-card-hover" style={{
                background: 'oklch(0.13 0.006 260)',
                border: '1px solid oklch(0.22 0.008 260)',
                borderTop: '3px solid oklch(0.65 0.20 145)',
                borderRadius: '3px',
                padding: '1.25rem'
              }}>
                <h3 style={{
                  fontFamily: '"Bebas Neue", "Impact", sans-serif',
                  fontSize: '1.1rem',
                  letterSpacing: '0.08em',
                  color: 'white',
                  marginBottom: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <Gauge style={{ width: '18px', height: '18px', color: 'oklch(0.65 0.20 145)' }} />
                  FILE REQUIREMENTS
                </h3>
                <ul style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.9rem', color: 'oklch(0.65 0.010 260)', lineHeight: 1.8 }}>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.65 0.20 145)', fontWeight: 'bold' }}>▸</span> CSV format from OBD-II scanner
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.65 0.20 145)', fontWeight: 'bold' }}>▸</span> Must include: RPM, MAF, Torque
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.65 0.20 145)', fontWeight: 'bold' }}>▸</span> Optional: Boost, Rail Pressure, EGT, Speed
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.65 0.20 145)', fontWeight: 'bold' }}>▸</span> No file size limit — processed in your browser
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.65 0.20 145)', fontWeight: 'bold' }}>▸</span> VIN auto-detected from Banks Power filenames
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.65 0.20 145)', fontWeight: 'bold' }}>▸</span> Thresholds based on 2024 GM OBDG06C HD spec
                  </li>
                </ul>
              </div>
            </div>

            {/* Bottom brand tagline */}
            <div className="mt-8 text-center ppei-anim-fade-in ppei-delay-600">
              <p style={{
                fontFamily: '"Bebas Neue", "Impact", sans-serif',
                fontSize: '0.9rem',
                letterSpacing: '0.15em',
                color: 'oklch(0.35 0.008 260)'
              }}>
                POWERED BY PPEI · CUSTOM TUNING · REDEFINING THE LIMITS
              </p>
            </div>
          </div>
        ) : (
          /* ── Dashboard Section ── */
          <div className="space-y-6 ppei-anim-fade-in">

            {/* File info bar */}
            <div style={{
              background: 'oklch(0.13 0.006 260)',
              border: '1px solid oklch(0.22 0.008 260)',
              borderLeft: hasFaults ? '4px solid oklch(0.52 0.22 25)' : '4px solid oklch(0.65 0.20 145)',
              borderRadius: '3px',
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <CheckCircle style={{ width: '20px', height: '20px', color: 'oklch(0.65 0.20 145)', flexShrink: 0 }} />
                <div>
                  <p style={{
                    fontFamily: '"Share Tech Mono", monospace',
                    fontSize: '0.85rem',
                    color: 'white',
                    fontWeight: 600,
                    margin: 0
                  }}>{fileName}</p>
                  <p style={{
                    fontFamily: '"Rajdhani", sans-serif',
                    fontSize: '0.8rem',
                    color: 'oklch(0.55 0.010 260)',
                    margin: 0
                  }}>
                    {data.stats.duration.toFixed(1)}s · {data.rpm.length.toLocaleString()} samples
                    {hasFaults
                      ? <span style={{ color: 'oklch(0.65 0.18 25)' }}> · {diagnostics!.issues.length} potential fault area(s) detected</span>
                      : <span style={{ color: 'oklch(0.65 0.20 145)' }}> · No fault areas detected</span>
                    }
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={handleExportPdf}
                  disabled={isExporting}
                  style={{
                    background: isExporting ? 'oklch(0.35 0.010 260)' : 'oklch(0.52 0.22 25)',
                    color: 'white',
                    fontFamily: '"Bebas Neue", "Impact", sans-serif',
                    fontSize: '0.95rem',
                    letterSpacing: '0.08em',
                    padding: '8px 20px',
                    borderRadius: '3px',
                    border: 'none',
                    cursor: isExporting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'background 0.15s'
                  }}
                >
                  {isExporting ? (
                    <><Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} />GENERATING PDF...</>
                  ) : (
                    <><FileDown style={{ width: '14px', height: '14px' }} />EXPORT PDF REPORT</>
                  )}
                </button>
                <button
                  onClick={() => { setData(null); setBinnedData(undefined); setDiagnostics(null); setHealthReport(null); setFileName(null); }}
                  style={{
                    background: 'transparent',
                    color: 'oklch(0.65 0.010 260)',
                    fontFamily: '"Bebas Neue", "Impact", sans-serif',
                    fontSize: '0.95rem',
                    letterSpacing: '0.08em',
                    padding: '8px 16px',
                    borderRadius: '3px',
                    border: '1px solid oklch(0.28 0.008 260)',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'oklch(0.52 0.22 25)'; (e.target as HTMLElement).style.color = 'white'; }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'oklch(0.28 0.008 260)'; (e.target as HTMLElement).style.color = 'oklch(0.65 0.010 260)'; }}
                >
                  NEW FILE
                </button>
              </div>
            </div>

            {/* Manual VIN Entry */}
            {!vinFromFile && (
              <div style={{
                background: 'oklch(0.13 0.006 260)',
                border: '1px solid oklch(0.22 0.008 260)',
                borderLeft: '4px solid oklch(0.70 0.18 200)',
                borderRadius: '3px',
                padding: '1rem 1.25rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem' }}>
                  <div style={{
                    background: 'oklch(0.70 0.18 200 / 0.15)',
                    border: '1px solid oklch(0.70 0.18 200 / 0.4)',
                    borderRadius: '3px',
                    padding: '4px 8px',
                    fontFamily: '"Share Tech Mono", monospace',
                    fontSize: '0.75rem',
                    color: 'oklch(0.70 0.18 200)',
                    letterSpacing: '0.05em'
                  }}>VIN</div>
                  <div>
                    <p style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '1rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>
                      NO VIN DETECTED IN DATALOG
                    </p>
                    <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.8rem', color: 'oklch(0.55 0.010 260)', margin: 0 }}>
                      Optionally enter your VIN to unlock vehicle identification and factory spec lookup
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={manualVin}
                    onChange={(e) => setManualVin(e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17))}
                    placeholder="Enter 17-character VIN (e.g. 1GC4YPEY...)"
                    maxLength={17}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      fontFamily: '"Share Tech Mono", monospace',
                      fontSize: '0.85rem',
                      background: 'oklch(0.10 0.005 260)',
                      border: '1px solid oklch(0.28 0.008 260)',
                      borderRadius: '3px',
                      color: 'white',
                      outline: 'none',
                      letterSpacing: '0.05em'
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && applyManualVin()}
                  />
                  <button
                    onClick={applyManualVin}
                    disabled={manualVin.length !== 17}
                    style={{
                      background: manualVin.length === 17 ? 'oklch(0.70 0.18 200)' : 'oklch(0.25 0.008 260)',
                      color: 'white',
                      fontFamily: '"Bebas Neue", "Impact", sans-serif',
                      fontSize: '0.95rem',
                      letterSpacing: '0.08em',
                      padding: '8px 20px',
                      borderRadius: '3px',
                      border: 'none',
                      cursor: manualVin.length === 17 ? 'pointer' : 'not-allowed',
                      transition: 'background 0.15s'
                    }}
                  >
                    DECODE VIN
                  </button>
                </div>
                {manualVin.length > 0 && manualVin.length < 17 && (
                  <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.8rem', color: 'oklch(0.75 0.18 60)', marginTop: '6px' }}>
                    {17 - manualVin.length} more characters needed
                  </p>
                )}
              </div>
            )}

            {/* Vehicle Health Report */}
            {healthReport && (
              <div ref={healthRef} className="ppei-section-reveal">
                <SectionHeader icon={<Activity style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />} title="VEHICLE HEALTH REPORT" />
                <HealthReport report={healthReport} />
              </div>
            )}

            {/* Diagnostic Analysis */}
            {diagnostics && (
              <div className="ppei-section-reveal ppei-delay-100">
                <SectionHeader icon={<Zap style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />} title="DIAGNOSTIC ANALYSIS" />
                <DiagnosticReportComponent report={diagnostics} />
              </div>
            )}

            {/* Stats Summary */}
            <div ref={statsRef} className="ppei-section-reveal ppei-delay-200">
              <StatsSummary data={data} />
            </div>

            {/* Dyno Results */}
            <div className="ppei-section-reveal ppei-delay-300">
              <SectionHeader icon={<BarChart3 style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />} title="DYNO RESULTS" />
              <div ref={dynoContainerRef}>
                <DynoHPChart ref={dynoRef} data={data} binnedData={binnedData} />
              </div>
            </div>

            {/* Boost Efficiency */}
            <div className="ppei-section-reveal ppei-delay-400">
              <SectionHeader icon={<Gauge style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />} title="BOOST EFFICIENCY" />
              <BoostEfficiencyChart ref={boostEffRef} data={data} />
            </div>

            {/* Fault Zone Charts */}
            {hasFaults && (
              <div className="space-y-6">
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  paddingBottom: '0.75rem',
                  borderBottom: '1px solid oklch(0.52 0.22 25 / 0.3)'
                }}>
                  <AlertCircle style={{ width: '20px', height: '20px', color: 'oklch(0.52 0.22 25)' }} />
                  <h2 style={{
                    fontFamily: '"Bebas Neue", "Impact", sans-serif',
                    fontSize: '1.4rem',
                    letterSpacing: '0.08em',
                    color: 'white',
                    margin: 0
                  }}>
                    FAULT ZONE ANALYSIS
                  </h2>
                  <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.50 0.010 260)' }}>
                    — actual vs desired with shaded delta error
                  </span>
                </div>
                <RailPressureFaultChart ref={railFaultRef} data={data} diagnostics={diagnostics!} binnedData={binnedData} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
                <BoostFaultChart ref={boostFaultRef} data={data} diagnostics={diagnostics!} binnedData={binnedData} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
                <EgtFaultChart ref={egtFaultRef} data={data} diagnostics={diagnostics!} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
                <MafFaultChart ref={mafFaultRef} data={data} diagnostics={diagnostics!} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
                <TccFaultChart ref={tccFaultRef} data={data} diagnostics={diagnostics!} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
                <VgtFaultChart ref={vgtFaultRef} data={data} diagnostics={diagnostics!} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
                <RegulatorFaultChart ref={regulatorFaultRef} data={data} diagnostics={diagnostics!} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
                <CoolantFaultChart ref={coolantFaultRef} data={data} diagnostics={diagnostics!} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
                <IdleRpmFaultChart ref={idleRpmFaultRef} data={data} diagnostics={diagnostics!} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
              </div>
            )}

            {/* Methodology */}
            <div style={{
              background: 'oklch(0.13 0.006 260)',
              border: '1px solid oklch(0.22 0.008 260)',
              borderLeft: '4px solid oklch(0.55 0.010 260)',
              borderRadius: '3px',
              padding: '1.25rem'
            }}>
              <h3 style={{
                fontFamily: '"Bebas Neue", "Impact", sans-serif',
                fontSize: '1rem',
                letterSpacing: '0.08em',
                color: 'oklch(0.65 0.010 260)',
                marginBottom: '0.75rem'
              }}>METHODOLOGY</h3>
              <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.78rem', color: 'oklch(0.50 0.010 260)', lineHeight: 1.8 }}>
                <p>• <span style={{ color: 'oklch(0.75 0.18 40)' }}>HP (Torque Method):</span> HP = Torque(lb·ft) × RPM / 5252 — uses SAE J1979 actual torque % × reference torque</p>
                <p>• <span style={{ color: 'oklch(0.70 0.18 200)' }}>Torque:</span> Derived from HP × 5252 / RPM for dyno graph display</p>
                <p>• <span style={{ color: 'oklch(0.65 0.20 145)' }}>Fault Delta:</span> Shaded area between Desired and Actual curves — larger delta = greater fault severity</p>
                <p>• <span style={{ color: 'oklch(0.52 0.22 25)' }}>Thresholds:</span> Based on 2024 GM OBDG06C HD spec with 30% tolerance buffer to reduce false positives</p>
              </div>
            </div>

            {/* DTC Code Search */}
            <div>
              <SectionHeader icon={<Search style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />} title="DIAGNOSTIC CODE LOOKUP" />
              <DtcSearch />
            </div>

            {/* Engine Reference Panel */}
            <div>
              <SectionHeader icon={<Cpu style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />} title="ENGINE REFERENCE DATABASE" />
              <EcuReferencePanel />
            </div>
          </div>
        )}

        {/* Error toast */}
        {(error || exportError) && (
          <div style={{
            position: 'fixed',
            bottom: '1rem',
            right: '1rem',
            background: 'oklch(0.13 0.006 260)',
            border: '1px solid oklch(0.52 0.22 25)',
            borderLeft: '4px solid oklch(0.52 0.22 25)',
            borderRadius: '3px',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            maxWidth: '420px',
            zIndex: 50,
            boxShadow: '0 4px 20px oklch(0 0 0 / 0.5)'
          }}>
            <AlertCircle style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <p style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '1rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>
                {error ? 'ERROR PROCESSING FILE' : 'PDF EXPORT FAILED'}
              </p>
              <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.65 0.010 260)', margin: 0 }}>
                {error || exportError}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid oklch(0.18 0.006 260)',
        marginTop: '3rem',
        padding: '1.5rem 0'
      }}>
        {/* Bottom accent bar */}
        <div style={{
          height: '2px',
          background: 'linear-gradient(90deg, oklch(0.52 0.22 25) 0%, oklch(0.65 0.20 40) 40%, oklch(0.70 0.18 60) 60%, oklch(0.65 0.20 145) 80%, oklch(0.70 0.18 200) 100%)',
          marginBottom: '1rem'
        }} />
        <div className="container mx-auto px-4 text-center">
          <p style={{
            fontFamily: '"Bebas Neue", "Impact", sans-serif',
            fontSize: '0.85rem',
            letterSpacing: '0.12em',
            color: 'oklch(0.35 0.008 260)'
          }}>
            PPEI CUSTOM TUNING · REDEFINING THE LIMITS · PPEI.COM
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Reusable PPEI section header with red left border accent */
function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      paddingLeft: '1rem',
      borderLeft: '4px solid oklch(0.52 0.22 25)',
      marginBottom: '1rem'
    }}>
      {icon}
      <h2 style={{
        fontFamily: '"Bebas Neue", "Impact", sans-serif',
        fontSize: '1.4rem',
        letterSpacing: '0.08em',
        color: 'white',
        margin: 0
      }}>
        {title}
      </h2>
    </div>
  );
}
