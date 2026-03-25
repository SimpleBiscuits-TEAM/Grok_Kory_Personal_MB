import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Upload, AlertCircle, CheckCircle, Loader2, FileDown, Cpu, Search } from 'lucide-react';
import { parseCSV, processData, downsampleData, createBinnedData, ProcessedMetrics } from '@/lib/dataProcessor';
import { StatsSummary } from '@/components/Charts';
import { DynoHPChart, RailPressureFaultChart, BoostFaultChart, EgtFaultChart, MafFaultChart } from '@/components/DynoCharts';
import { analyzeDiagnostics, DiagnosticReport } from '@/lib/diagnostics';
import { DiagnosticReportComponent } from '@/components/DiagnosticReport';
import { generateHealthReport, HealthReportData } from '@/lib/healthReport';
import HealthReport from '@/components/HealthReport';
import { getVehicleInfoFromFilename } from '@/lib/vinLookup';
import EcuReferencePanel from '@/components/EcuReferencePanel';
import DtcSearch from '@/components/DtcSearch';
import { usePdfExport } from '@/hooks/usePdfExport';

export default function Home() {
  const [data, setData] = useState<ProcessedMetrics | null>(null);
  const [binnedData, setBinnedData] = useState<any[] | undefined>(undefined);
  const [diagnostics, setDiagnostics] = useState<DiagnosticReport | null>(null);
  const [healthReport, setHealthReport] = useState<HealthReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refs for PDF export — dyno + fault charts
  const dynoRef = useRef<HTMLDivElement>(null);
  const railFaultRef = useRef<HTMLDivElement>(null);
  const boostFaultRef = useRef<HTMLDivElement>(null);
  const egtFaultRef = useRef<HTMLDivElement>(null);
  const mafFaultRef = useRef<HTMLDivElement>(null);
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

      const vehicleInfo = getVehicleInfoFromFilename(file.name) || undefined;
      const report = generateHealthReport(downsampled, vehicleInfo);
      setHealthReport(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file');
      setData(null);
      setBinnedData(undefined);
      setDiagnostics(null);
      setHealthReport(null);
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
      dynoRef,
      railFaultRef,
      boostFaultRef,
      egtFaultRef,
      mafFaultRef,
      statsRef,
      healthRef,
    };
    exportToPdf(data, fileName, diagnostics, healthReport, refs);
  };

  const hasFaults = diagnostics && diagnostics.issues.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center shadow">
              <span className="text-white font-bold text-lg" style={{ fontFamily: 'monospace' }}>D</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'monospace', letterSpacing: 1 }}>
              DURAMAX PERFORMANCE ANALYZER
            </h1>
          </div>
          <p className="text-gray-500 text-sm ml-13 pl-13" style={{ paddingLeft: '52px' }}>
            Upload HP Tuners · EFILIVE · Banks Power datalogs for instant performance analysis and fault diagnostics
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!data ? (
          /* ── Upload Section ── */
          <div className="max-w-2xl mx-auto">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer ${
                isDragOver
                  ? 'border-blue-500 bg-blue-50 scale-[1.01]'
                  : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/30'
              }`}
              onClick={() => !loading && fileInputRef.current?.click()}
            >
              <div className="p-14 flex flex-col items-center justify-center gap-5">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors ${isDragOver ? 'bg-blue-200' : 'bg-blue-100'}`}>
                  <Upload className={`w-10 h-10 transition-colors ${isDragOver ? 'text-blue-700' : 'text-blue-500'}`} />
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {isDragOver ? 'Drop to Analyze' : 'Upload Your Duramax Log'}
                  </h2>
                  <p className="text-gray-500 text-sm">
                    Drag &amp; drop your CSV file here, or click to browse
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    Supports HP Tuners · EFILIVE · Banks Power CSV formats
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
                <Button
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  disabled={loading}
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700 text-white mt-2"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-2" />Select CSV File</>
                  )}
                </Button>
              </div>
            </div>

            <div className="mt-8 grid md:grid-cols-2 gap-6">
              <Card className="p-6">
                <h3 className="font-semibold text-gray-900 mb-3">What's Analyzed</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>✓ Dynojet-style HP &amp; Torque graph</li>
                  <li>✓ Fault-specific charts (actual vs desired + delta)</li>
                  <li>✓ Automatic diagnostic checks (P0087, P0088, P0299, P0101, EGT)</li>
                  <li>✓ Vehicle health report with VIN decode</li>
                  <li>✓ Engine reference database with parameter definitions</li>
                  <li>✓ Diagnostic code (DTC) lookup with causes &amp; remedies</li>
                  <li>✓ Full PDF report export with all charts</li>
                </ul>
              </Card>
              <Card className="p-6">
                <h3 className="font-semibold text-gray-900 mb-3">File Requirements</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>• CSV format from OBD-II scanner</li>
                  <li>• Must include: RPM, MAF, Torque</li>
                  <li>• Optional: Boost, Rail Pressure, EGT, Speed</li>
                  <li>• No file size limit — processed in your browser</li>
                  <li>• VIN auto-detected from Banks Power filenames</li>
                </ul>
              </Card>
            </div>
          </div>
        ) : (
          /* ── Dashboard Section ── */
          <div className="space-y-6">
            {/* File info bar */}
            <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{fileName}</p>
                  <p className="text-xs text-gray-500">
                    {data.stats.duration.toFixed(1)}s · {data.rpm.length.toLocaleString()} samples
                    {hasFaults ? ` · ${diagnostics!.issues.length} fault(s) detected` : ' · No faults detected'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleExportPdf}
                  disabled={isExporting}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isExporting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating PDF...</>
                  ) : (
                    <><FileDown className="w-4 h-4 mr-2" />Export PDF Report</>
                  )}
                </Button>
                <Button
                  onClick={() => { setData(null); setBinnedData(undefined); setDiagnostics(null); setHealthReport(null); setFileName(null); }}
                  variant="outline"
                >
                  New File
                </Button>
              </div>
            </div>

            {/* Vehicle Health Report */}
            {healthReport && (
              <div ref={healthRef}>
                <h2 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'monospace', letterSpacing: 1 }}>VEHICLE HEALTH REPORT</h2>
                <HealthReport report={healthReport} />
              </div>
            )}

            {/* Diagnostic Analysis */}
            {diagnostics && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'monospace', letterSpacing: 1 }}>DIAGNOSTIC ANALYSIS</h2>
                <DiagnosticReportComponent report={diagnostics} />
              </div>
            )}

            {/* Stats Summary */}
            <div ref={statsRef}>
              <StatsSummary data={data} />
            </div>

            {/* Dynojet-Style HP/Torque Chart */}
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'monospace', letterSpacing: 1 }}>DYNO RESULTS</h2>
              <DynoHPChart ref={dynoRef} data={data} binnedData={binnedData} />
            </div>

            {/* Fault Zone Charts — only shown when faults detected */}
            {hasFaults && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 py-2 border-b border-red-200">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'monospace', letterSpacing: 1 }}>
                    FAULT ZONE ANALYSIS
                  </h2>
                  <span className="text-sm text-gray-500">— actual vs desired with shaded delta error</span>
                </div>
                <RailPressureFaultChart ref={railFaultRef} data={data} diagnostics={diagnostics!} binnedData={binnedData} />
                <BoostFaultChart ref={boostFaultRef} data={data} diagnostics={diagnostics!} binnedData={binnedData} />
                <EgtFaultChart ref={egtFaultRef} data={data} diagnostics={diagnostics!} />
                <MafFaultChart ref={mafFaultRef} data={data} diagnostics={diagnostics!} />
              </div>
            )}

            {/* Methodology */}
            <Card className="p-6 bg-slate-800 border-slate-700">
              <h3 className="font-semibold text-slate-200 mb-2" style={{ fontFamily: 'monospace' }}>METHODOLOGY</h3>
              <div className="text-sm text-slate-400 space-y-1" style={{ fontFamily: 'monospace' }}>
                <p>• <span className="text-orange-400">HP (Torque Method):</span> HP = Torque(lb·ft) × RPM / 5252 — uses SAE J1979 actual torque % × reference torque</p>
                <p>• <span className="text-cyan-400">Torque:</span> Derived from HP × 5252 / RPM for dyno graph display</p>
                <p>• <span className="text-green-400">Fault Delta:</span> Shaded area between Desired (green) and Actual (red) curves — larger delta = greater fault severity</p>
              </div>
            </Card>

            {/* DTC Code Search */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Search className="w-5 h-5 text-orange-500" />
                <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'monospace', letterSpacing: 1 }}>DIAGNOSTIC CODE LOOKUP</h2>
              </div>
              <DtcSearch />
            </div>

            {/* Engine Reference Panel */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Cpu className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'monospace', letterSpacing: 1 }}>ENGINE REFERENCE DATABASE</h2>
              </div>
              <EcuReferencePanel />
            </div>
          </div>
        )}

        {/* Error toast */}
        {(error || exportError) && (
          <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 max-w-md z-50 shadow-lg">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">{error ? 'Error Processing File' : 'PDF Export Failed'}</p>
              <p className="text-sm text-red-700">{error || exportError}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
