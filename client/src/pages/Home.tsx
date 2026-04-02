/**
 * V-OP by PPEI — Vehicle Optimizer
 * Design: Industrial Performance / Motorsport Dark
 * Colors: Black (#0a0a0a bg) + PPEI Red (oklch 0.52 0.22 25) + White text
 * Typography: Bebas Neue (headings) + Rajdhani (body) + Share Tech Mono (data)
 * Layout: Full-width dark panels, red left-border accents, sharp corners
 */

import { useState, useRef, useCallback } from 'react';
import { SignInModal, SignInBanner } from '@/components/SignInPrompt';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Upload, AlertCircle, CheckCircle, Loader2, FileDown, Cpu, Search, Activity, Gauge, Zap, BarChart3, Brain, Flag } from 'lucide-react';
import { parseCSV, processData, downsampleData, createBinnedData, ProcessedMetrics } from '@/lib/dataProcessor';
import { trpc } from '@/lib/trpc';
import { StatsSummary } from '@/components/Charts';
import { DynoHPChart, DynoChartHandle, BoostEfficiencyChart, RailPressureFaultChart, BoostFaultChart, EgtFaultChart, MafFaultChart, TccFaultChart, VgtFaultChart, RegulatorFaultChart, CoolantFaultChart, IdleRpmFaultChart, ConverterStallChart } from '@/components/DynoCharts';
import { analyzeDiagnostics, DiagnosticReport } from '@/lib/diagnostics';
import { runReasoningEngine, ReasoningReport } from '@/lib/reasoningEngine';
import { DiagnosticReportComponent } from '@/components/DiagnosticReport';
import { generateHealthReport, HealthReportData } from '@/lib/healthReport';
import HealthReport from '@/components/HealthReport';
import { extractVinFromFilename, decodeVinNhtsa } from '@/lib/vinLookup';
import EcuReferencePanel from '@/components/EcuReferencePanel';
import DtcSearch from '@/components/DtcSearch';
import { usePdfExport } from '@/hooks/usePdfExport';
import { FeedbackPanel, FeedbackTrigger } from '@/components/FeedbackPanel';
import { ReasoningPanel } from '@/components/ReasoningPanel';
import PidAuditPanel from '@/components/PidAuditPanel';
import DragTimeslip from '@/components/DragTimeslip';
import { analyzeDragRuns, DragAnalysis } from '@/lib/dragAnalyzer';
import { generateHealthReportPdf } from '@/lib/healthReportPdf';
import CompareView from '@/components/CompareView';
import { APP_VERSION } from '@/lib/version';
import { ShareCard, buildDynoShareData, buildDiagnosticShareData, buildHealthShareData } from '@/components/ShareCard';
import { NotificationBell } from '@/components/AdminNotificationPanel';
import { WhatsNewPanel, useWhatsNew } from '@/components/WhatsNewPanel';
import { useAuth } from '@/_core/hooks/useAuth';
import PpeiHeader from '@/components/PpeiHeader';

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const { showPanel: showWhatsNew, setShowPanel: setShowWhatsNew } = useWhatsNew();
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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [reasoningReport, setReasoningReport] = useState<ReasoningReport | null>(null);
  const [dragAnalysis, setDragAnalysis] = useState<DragAnalysis | null>(null);
  const [mode, setMode] = useState<'analyze' | 'compare'>('analyze');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bugReportMutation = trpc.feedback.submit.useMutation();
  const cacheDatalogMutation = trpc.datalogCache.cacheDatalog.useMutation();

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
  const converterStallRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const healthRef = useRef<HTMLDivElement>(null);

  const { exportToPdf, isExporting, exportError } = usePdfExport();

  const [, setLocation] = useLocation();

  const processFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      // Detect .wp8 files (Dynojet Power Vision datalogs)
      // On the Home page, always generate a general health report (no redirect to Honda Talon Tuner)
      if (file.name.toLowerCase().endsWith('.wp8')) {
        const { parseWP8, wp8ToDuramaxData } = await import('@/lib/wp8Parser');
        const buffer = await file.arrayBuffer();
        const wp8Result = parseWP8(buffer);
        // Convert WP8 data directly to DuramaxData (avoids CSV format detection issues)
        const rawData = wp8ToDuramaxData(wp8Result);
        const processed = processData(rawData);
        const downsampled = downsampleData(processed, 2000);
        const binned = createBinnedData(processed, 40);

        setData(downsampled);
        setBinnedData(binned);
        setFileName(file.name);

        const diagnosticReport = analyzeDiagnostics(downsampled);
        setDiagnostics(diagnosticReport);

        const reasoning = runReasoningEngine(downsampled, diagnosticReport);
        setReasoningReport(reasoning);

        const drag = analyzeDragRuns(processed);
        setDragAnalysis(drag);

        // Generate health report (general, no Honda Talon redirect)
        const report = generateHealthReport(downsampled, undefined);
        setHealthReport(report);

        // Try VIN from filename
        const detectedVin = extractVinFromFilename(file.name);
        setVinFromFile(detectedVin);
        if (detectedVin) {
          decodeVinNhtsa(detectedVin).then(vehicleInfo => {
            const reportWithVin = generateHealthReport(downsampled, vehicleInfo);
            setHealthReport(reportWithVin);
          });
        }

        // Cache datalog (fire-and-forget)
        try {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const base64 = dataUrl.split(',')[1] || '';
            if (base64) {
              cacheDatalogMutation.mutate({ fileName: file.name, fileBase64: base64, sourcePage: 'analyzer' });
            }
          };
          reader.readAsDataURL(file);
        } catch { /* silent */ }

        setLoading(false);
        return;
      }

      // Use TextDecoder to handle both UTF-8 and Latin-1 encoded files
      // Banks iDash logs use Latin-1 degree symbols (°F) that fail with UTF-8
      const buf = await file.arrayBuffer();
      let content: string;
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      } catch {
        content = new TextDecoder('latin1').decode(buf);
      }
      const rawData = parseCSV(content);
      const processed = processData(rawData);
      const downsampled = downsampleData(processed, 2000);
      const binned = createBinnedData(processed, 40);

      setData(downsampled);
      setBinnedData(binned);
      setFileName(file.name);

      const diagnosticReport = analyzeDiagnostics(downsampled);
      setDiagnostics(diagnosticReport);

      // Run the AI reasoning engine for context-aware analysis
      const reasoning = runReasoningEngine(downsampled, diagnosticReport);
      setReasoningReport(reasoning);

      // Run drag racing analyzer
      const drag = analyzeDragRuns(processed);
      setDragAnalysis(drag);

      // Generate health report without vehicle info first (data is ready)
      const reportNoVin = generateHealthReport(downsampled, undefined);
      setHealthReport(reportNoVin);

      // Async VIN decode via NHTSA (don't block the main analysis)
      const detectedVin = extractVinFromFilename(file.name);
      setVinFromFile(detectedVin);
      if (detectedVin) {
        decodeVinNhtsa(detectedVin).then(vehicleInfo => {
          const reportWithVin = generateHealthReport(downsampled, vehicleInfo);
          setHealthReport(reportWithVin);
        });
      }
      // Cache datalog to S3 for dev/debug (fire-and-forget, non-blocking)
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(',')[1] || '';
          if (base64) {
            cacheDatalogMutation.mutate({ fileName: file.name, fileBase64: base64, sourcePage: 'analyzer' });
          }
        };
        reader.readAsDataURL(file);
      } catch { /* silent — caching is best-effort */ }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError('File load error \u2014 This file format has been reported to the PPEI team for review. We\'ll update the tool to support it.');
      setData(null);
      setBinnedData(undefined);
      setDiagnostics(null);
      setHealthReport(null);
      setVinFromFile(null);
      setManualVin('');
      setReasoningReport(null);
      setDragAnalysis(null);
      // Auto-report unsupported file to owner
      try {
        bugReportMutation.mutate({
          type: 'error',
          message: `Auto-report: File parse failure\nFilename: ${file.name}\nSize: ${(file.size / 1024).toFixed(1)} KB\nError: ${errorMsg}`,
          errorType: 'File Upload / Parse Error',
          context: `Auto-reported parse failure for: ${file.name}`,
        });
      } catch { /* silent */ }
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
    if (file) {
      processFile(file);
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
      converterStallRef,
      statsRef,
      healthRef,
    };
    exportToPdf(data, fileName, diagnostics, healthReport, refs);
  };

  const hasReasoningFaults = reasoningReport?.findings?.some(
    f => (f.id === 'converter-stall-turbo-mismatch' || f.id === 'boost-leak-suspicion') && (f.type === 'warning' || f.type === 'fault')
  ) ?? false;
  const hasFaults = (diagnostics && diagnostics.issues.length > 0) || hasReasoningFaults;

  const applyManualVin = useCallback(async () => {
    if (!data || !manualVin.trim()) return;
    const vin = manualVin.trim().toUpperCase();
    if (vin.length !== 17) return;
    setVinFromFile(vin);
    // Show loading state while NHTSA verifies
    const vehicleInfo = await decodeVinNhtsa(vin);
    const report = generateHealthReport(data, vehicleInfo);
    setHealthReport(report);
  }, [data, manualVin]);

  return (
    <div className="min-h-screen" style={{ background: 'oklch(0.10 0.005 260)', color: 'oklch(0.95 0.005 260)' }}>
      <SignInModal />
      <SignInBanner />

      {/* ── PPEI Header (shared across all pages) ── */}
      <PpeiHeader />

      <main className="container mx-auto px-4 py-8">
        {/* What's New Panel */}
        {isAuthenticated && showWhatsNew && (
          <WhatsNewPanel onClose={() => setShowWhatsNew(false)} autoHide={false} />
        )}

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
                fontSize: '1.05rem',
                color: 'oklch(0.82 0.008 260)',
                letterSpacing: '0.03em'
              }}>
                Upload your datalog to generate a full diagnostic analysis, dyno chart, and PDF report
              </p>
            </div>

            {/* Mode Toggle: Analyze vs Compare */}
            <div className="ppei-anim-fade-up" style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '0',
              marginBottom: '1.5rem',
            }}>
              <button
                onClick={() => setMode('analyze')}
                style={{
                  background: mode === 'analyze' ? 'oklch(0.52 0.22 25)' : 'oklch(0.14 0.006 260)',
                  color: mode === 'analyze' ? 'white' : 'oklch(0.68 0.010 260)',
                  fontFamily: '"Bebas Neue", sans-serif',
                  fontSize: '1rem',
                  letterSpacing: '0.08em',
                  padding: '10px 28px',
                  border: mode === 'analyze' ? '1px solid oklch(0.52 0.22 25)' : '1px solid oklch(0.48 0.008 260)',
                  borderRadius: '3px 0 0 3px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <BarChart3 style={{ width: '16px', height: '16px' }} />
                ANALYZE
              </button>
              <button
                onClick={() => setMode('compare')}
                style={{
                  background: mode === 'compare' ? 'oklch(0.52 0.22 25)' : 'oklch(0.14 0.006 260)',
                  color: mode === 'compare' ? 'white' : 'oklch(0.68 0.010 260)',
                  fontFamily: '"Bebas Neue", sans-serif',
                  fontSize: '1rem',
                  letterSpacing: '0.08em',
                  padding: '10px 28px',
                  border: mode === 'compare' ? '1px solid oklch(0.52 0.22 25)' : '1px solid oklch(0.48 0.008 260)',
                  borderRadius: '0 3px 3px 0',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderLeft: 'none',
                }}
              >
                <Gauge style={{ width: '16px', height: '16px' }} />
                COMPARE
              </button>
            </div>

            {mode === 'compare' ? (
              <CompareView onBack={() => setMode('analyze')} />
            ) : (
            <>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`ppei-dropzone ppei-anim-scale-in ppei-delay-200${isDragOver ? ' active' : ''}${loading ? ' ppei-loading-scan' : ''}`}
              style={{
                border: isDragOver ? '2px dashed oklch(0.52 0.22 25)' : '2px dashed oklch(0.50 0.008 260)',
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
                    <Upload style={{ width: '36px', height: '36px', color: isDragOver ? 'oklch(0.52 0.22 25)' : 'oklch(0.68 0.010 260)' }} />
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
                    {loading ? 'PROCESSING LOG...' : isDragOver ? 'DROP TO ANALYZE' : 'UPLOAD YOUR DATALOG'}
                  </h3>
                  <p style={{ fontFamily: '"Rajdhani", sans-serif', color: 'oklch(0.75 0.010 260)', fontSize: '0.9rem' }}>
                    Drag &amp; drop your datalog file here, or click to browse
                  </p>
                  <p style={{ fontFamily: '"Share Tech Mono", monospace', color: 'oklch(0.62 0.010 260)', fontSize: '0.75rem', marginTop: '0.5rem', letterSpacing: '0.05em' }}>
                    CSV &amp; WP8 (DYNOJET) SUPPORTED
                  </p>

                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.bin,.wp8,*"
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
                    <><Upload style={{ width: '16px', height: '16px' }} />SELECT FILE</>
                  )}
                </button>
              </div>
            </div>

            {/* Feature cards */}
            <div className="mt-6 grid md:grid-cols-2 gap-4 ppei-anim-fade-up ppei-delay-400">
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
                    <span style={{ color: 'oklch(0.52 0.22 25)', fontWeight: 'bold' }}>▸</span> VIN Decoder
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.52 0.22 25)', fontWeight: 'bold' }}>▸</span>
                    <span>AI Diagnostics <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.72rem', color: 'oklch(0.75 0.18 40)', background: 'oklch(0.75 0.18 40 / 0.12)', border: '1px solid oklch(0.75 0.18 40 / 0.3)', borderRadius: '2px', padding: '1px 5px', marginLeft: '4px' }}>BETA</span></span>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.52 0.22 25)', fontWeight: 'bold' }}>▸</span> DTC Lookup
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.52 0.22 25)', fontWeight: 'bold' }}>▸</span> Full PDF Report Export
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
                  <Cpu style={{ width: '18px', height: '18px', color: 'oklch(0.65 0.20 145)' }} />
                  ADVANCED MODE
                </h3>
                <ul style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.9rem', color: 'oklch(0.65 0.010 260)', lineHeight: 1.8 }}>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.65 0.20 145)', fontWeight: 'bold' }}>▸</span> Calibration Editor
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.65 0.20 145)', fontWeight: 'bold' }}>▸</span> Live Gauge Dashboard
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.65 0.20 145)', fontWeight: 'bold' }}>▸</span> Voice Commands
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'oklch(0.65 0.20 145)', fontWeight: 'bold' }}>▸</span> Tune Compare & Patch
                  </li>
                </ul>
              </div>
            </div>

            {/* Quick Actions for signed-in users */}
            {isAuthenticated && (
              <div className="mt-6 ppei-anim-fade-up ppei-delay-600">
                <div style={{
                  background: 'oklch(0.12 0.006 260)',
                  border: '1px solid oklch(0.22 0.008 260)',
                  borderLeft: '4px solid oklch(0.52 0.22 25)',
                  borderRadius: '3px',
                  padding: '1rem 1.25rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <p style={{
                        fontFamily: '"Bebas Neue", sans-serif',
                        fontSize: '1rem',
                        letterSpacing: '0.06em',
                        color: 'white',
                        margin: 0
                      }}>
                        WELCOME BACK{user?.name ? `, ${user.name.toUpperCase()}` : ''}
                      </p>
                      <p style={{
                        fontFamily: '"Rajdhani", sans-serif',
                        fontSize: '0.85rem',
                        color: 'oklch(0.68 0.010 260)',
                        margin: 0
                      }}>
                        Upload a datalog above or jump to Advanced Mode for calibration tools
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Link href="/advanced">
                        <button className="ppei-btn-hover" style={{
                          background: 'oklch(0.16 0.008 260)',
                          color: 'oklch(0.80 0.010 260)',
                          fontFamily: '"Bebas Neue", sans-serif',
                          fontSize: '0.85rem',
                          letterSpacing: '0.08em',
                          padding: '6px 16px',
                          borderRadius: '3px',
                          border: '1px solid oklch(0.28 0.008 260)',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <Cpu style={{ width: '14px', height: '14px' }} />
                          ADVANCED MODE
                        </button>
                      </Link>
                      <Link href="/advanced">
                        <button className="ppei-btn-hover" style={{
                          background: 'oklch(0.16 0.008 260)',
                          color: 'oklch(0.80 0.010 260)',
                          fontFamily: '"Bebas Neue", sans-serif',
                          fontSize: '0.85rem',
                          letterSpacing: '0.08em',
                          padding: '6px 16px',
                          borderRadius: '3px',
                          border: '1px solid oklch(0.28 0.008 260)',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <Search style={{ width: '14px', height: '14px' }} />
                          DTC LOOKUP
                        </button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom brand tagline */}
            <div className="mt-6 text-center ppei-anim-fade-in ppei-delay-600">
              <p style={{
                fontFamily: '"Bebas Neue", "Impact", sans-serif',
                fontSize: '0.9rem',
                letterSpacing: '0.15em',
                color: 'oklch(0.55 0.008 260)'
              }}>
                POWERED BY PPEI · CUSTOM TUNING · REDEFINING THE LIMITS
              </p>
            </div>
            </>)}
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
                    color: 'oklch(0.68 0.010 260)',
                    margin: 0
                  }}>
                    {data.stats.duration.toFixed(1)}s · {data.rpm.length.toLocaleString()} samples
                    {hasFaults
                      ? <span style={{ color: 'oklch(0.65 0.18 25)' }}> · {(diagnostics?.issues.length ?? 0) + (hasReasoningFaults ? 1 : 0)} potential fault area(s) detected</span>
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
                {/* Share to Facebook */}
                {data && (
                  <ShareCard
                    data={
                      healthReport
                        ? buildHealthShareData(
                            healthReport.overallScore,
                            healthReport.overallStatus,
                            healthReport.vehicleInfo ? `${healthReport.vehicleInfo.year} ${healthReport.vehicleInfo.make} ${healthReport.vehicleInfo.model}` : undefined,
                            user?.name || undefined
                          )
                        : buildDynoShareData(
                            Math.round(data.stats.hpTorqueMax),
                            Math.round(data.stats.hpTorqueMax * 0.85),
                            fileName || undefined,
                            user?.name || undefined
                          )
                    }
                  />
                )}
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
                    <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.8rem', color: 'oklch(0.68 0.010 260)', margin: 0 }}>
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
                      background: manualVin.length === 17 ? 'oklch(0.70 0.18 200)' : 'oklch(0.45 0.008 260)',
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <SectionHeader icon={<Activity style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />} title="VEHICLE HEALTH REPORT" />
                  <button
                    onClick={() => {
                      if (data && healthReport && fileName) {
                        generateHealthReportPdf(healthReport, data, fileName, data.stats.hpTorqueMax > 0, dragAnalysis);
                      }
                    }}
                    style={{
                      background: 'oklch(0.70 0.18 200)',
                      color: 'white',
                      fontFamily: '"Bebas Neue", "Impact", sans-serif',
                      fontSize: '0.85rem',
                      letterSpacing: '0.08em',
                      padding: '6px 14px',
                      borderRadius: '3px',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'background 0.2s',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'oklch(0.60 0.18 200)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'oklch(0.70 0.18 200)')}
                  >
                    <FileDown style={{ width: '14px', height: '14px' }} />
                    DOWNLOAD HEALTH REPORT PDF
                  </button>
                </div>
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

            {/* AI Reasoning Engine */}
            {reasoningReport && (
              <div className="ppei-section-reveal ppei-delay-150">
                <SectionHeader icon={<Brain style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />} title="AI REASONING ENGINE" />
                <div style={{
                  background: 'oklch(0.13 0.006 260)',
                  border: '1px solid oklch(0.22 0.008 260)',
                  borderLeft: '4px solid oklch(0.52 0.22 25)',
                  borderRadius: '3px',
                  padding: '1.25rem'
                }}>
                  <ReasoningPanel report={reasoningReport} />
                </div>
              </div>
            )}

            {/* PID Audit Trail */}
            {(data.pidSubstitutions?.length > 0 || data.pidsMissing?.length > 0) && (
              <div className="ppei-section-reveal ppei-delay-175" style={{
                background: 'oklch(0.13 0.006 260)',
                border: '1px solid oklch(0.22 0.008 260)',
                borderLeft: '4px solid oklch(0.70 0.18 200)',
                borderRadius: '3px',
                padding: '0'
              }}>
                <PidAuditPanel
                  substitutions={data.pidSubstitutions ?? []}
                  missing={data.pidsMissing ?? []}
                  fileFormat={data.fileFormat}
                  boostCalibration={data.boostCalibration}
                />
              </div>
            )}

            {/* Stats Summary */}
            <div ref={statsRef} className="ppei-section-reveal ppei-delay-200">
              <StatsSummary data={data} />
            </div>

            {/* Drag Racing Analyzer */}
            {dragAnalysis && (
              <div className="ppei-section-reveal ppei-delay-250">
                <SectionHeader icon={<Flag style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />} title="DRAG RACING ANALYZER" />
                <div style={{
                  background: 'oklch(0.13 0.006 260)',
                  border: '1px solid oklch(0.22 0.008 260)',
                  borderLeft: '4px solid oklch(0.52 0.22 25)',
                  borderRadius: '3px',
                  padding: '1.25rem'
                }}>
                  <DragTimeslip analysis={dragAnalysis} />
                </div>
              </div>
            )}

            {/* Log Details */}
            <div className="ppei-section-reveal ppei-delay-300">
              <SectionHeader icon={<BarChart3 style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />} title="LOG DETAILS" />
              <div ref={dynoContainerRef}>
                <DynoHPChart ref={dynoRef} data={data} binnedData={binnedData} />
              </div>
            </div>

            {/* Airflow Outlook */}
            <div className="ppei-section-reveal ppei-delay-400">
              <SectionHeader icon={<Gauge style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />} title="AIRFLOW OUTLOOK" />
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
                  <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.63 0.010 260)' }}>
                    — actual vs desired with shaded delta error
                  </span>
                </div>
                <RailPressureFaultChart ref={railFaultRef} data={data} diagnostics={diagnostics ?? { issues: [], summary: '', timestamp: new Date() }} binnedData={binnedData} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} reasoningReport={reasoningReport} />
                <BoostFaultChart ref={boostFaultRef} data={data} diagnostics={diagnostics ?? { issues: [], summary: '', timestamp: new Date() }} binnedData={binnedData} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} reasoningReport={reasoningReport} />
                <ConverterStallChart ref={converterStallRef} data={data} diagnostics={diagnostics ?? { issues: [], summary: '', timestamp: new Date() }} binnedData={binnedData} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} reasoningReport={reasoningReport} />
                <EgtFaultChart ref={egtFaultRef} data={data} diagnostics={diagnostics ?? { issues: [], summary: '', timestamp: new Date() }} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
                <MafFaultChart ref={mafFaultRef} data={data} diagnostics={diagnostics ?? { issues: [], summary: '', timestamp: new Date() }} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
                <TccFaultChart ref={tccFaultRef} data={data} diagnostics={diagnostics ?? { issues: [], summary: '', timestamp: new Date() }} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
                <VgtFaultChart ref={vgtFaultRef} data={data} diagnostics={diagnostics ?? { issues: [], summary: '', timestamp: new Date() }} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
                <RegulatorFaultChart ref={regulatorFaultRef} data={data} diagnostics={diagnostics ?? { issues: [], summary: '', timestamp: new Date() }} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
                <CoolantFaultChart ref={coolantFaultRef} data={data} diagnostics={diagnostics ?? { issues: [], summary: '', timestamp: new Date() }} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
                <IdleRpmFaultChart ref={idleRpmFaultRef} data={data} diagnostics={diagnostics ?? { issues: [], summary: '', timestamp: new Date() }} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
              </div>
            )}

            {/* DTC Code Search */}
            <div>
              <SectionHeader icon={<Search style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />} title="DIAGNOSTIC CODE LOOKUP" />
              <DtcSearch />
            </div>

            {/* Subsystem Reference */}
            <div>
              <SectionHeader icon={<Cpu style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />} title="SUBSYSTEM REFERENCE" />
              <EcuReferencePanel />
            </div>
          </div>
        )}

        {/* Error toast — positioned above the feedback button */}
        {(error || exportError) && (
          <div style={{
            position: 'fixed',
            bottom: '5rem',
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
            zIndex: 1000,
            boxShadow: '0 4px 20px oklch(0 0 0 / 0.5)'
          }}>
            <AlertCircle style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <p style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '1rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>
                {error ? 'FILE LOAD ERROR' : 'PDF EXPORT FAILED'}
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
            color: 'oklch(0.55 0.008 260)'
          }}>
            PPEI CUSTOM TUNING · REDEFINING THE LIMITS · PPEI.COM
          </p>
        </div>
      </footer>

      {/* Feedback / Error Report floating button and panel */}
      <FeedbackTrigger onClick={() => setFeedbackOpen(true)} />
      <FeedbackPanel
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        context={fileName ?? undefined}
      />
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
