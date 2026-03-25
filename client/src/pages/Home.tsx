import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Upload, AlertCircle, CheckCircle, Loader2, FileDown } from 'lucide-react';
import { parseCSV, processData, downsampleData, createBinnedData, ProcessedMetrics } from '@/lib/dataProcessor';
import { RPMvMAFChart, TimeSeriesChart, StatsSummary } from '@/components/Charts';
import { DynoHPChart, RailPressureFaultChart, BoostFaultChart, EgtFaultChart, MafFaultChart } from '@/components/DynoCharts';
import { usePdfExport } from '@/hooks/usePdfExport';
import { analyzeDiagnostics, DiagnosticReport } from '@/lib/diagnostics';
import { DiagnosticReportComponent } from '@/components/DiagnosticReport';
import { generateHealthReport, HealthReportData } from '@/lib/healthReport';
import HealthReport from '@/components/HealthReport';
import { getVehicleInfoFromFilename } from '@/lib/vinLookup';
import EcuReferencePanel from '@/components/EcuReferencePanel';
import DtcSearch from '@/components/DtcSearch';
import { Cpu, Search } from 'lucide-react';

export default function Home() {
  const [data, setData] = useState<ProcessedMetrics | null>(null);
  const [binnedData, setBinnedData] = useState<any[] | undefined>(undefined);
  const [diagnostics, setDiagnostics] = useState<DiagnosticReport | null>(null);
  const [healthReport, setHealthReport] = useState<HealthReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { exportToPdf, isExporting, exportError, rpmVsMafRef, hpVsRpmRef, timeSeriesRef } = usePdfExport();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const content = await file.text();
      const rawData = parseCSV(content);
      const processed = processData(rawData);
      const downsampled = downsampleData(processed, 2000);
      const binned = createBinnedData(processed, 35);

      setData(downsampled);
      setBinnedData(binned);
      setFileName(file.name);

      // Run diagnostics
      const diagnosticReport = analyzeDiagnostics(downsampled);
      setDiagnostics(diagnosticReport);

      // Extract vehicle info from filename
      const vehicleInfo = getVehicleInfoFromFilename(file.name) || undefined;

      // Generate health report
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
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">D</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Duramax Performance Analyzer</h1>
          </div>
          <p className="text-gray-600">Upload OBD-II logs to visualize engine performance metrics and diagnose issues</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {!data ? (
          // Upload Section
          <div className="max-w-2xl mx-auto">
            <Card className="border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors">
              <div className="p-12">
                <div className="flex flex-col items-center justify-center gap-4">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                    <Upload className="w-8 h-8 text-blue-600" />
                  </div>
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                      Upload Your Duramax Log
                    </h2>
              <p className="text-gray-600 mb-6">
                    Drag and drop your CSV datalog file or click to browse.<br/>
                    <span className="text-sm text-gray-500">Supports HP Tuners, EFILIVE, and Banks Power CSV formats.</span>
                  </p>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    disabled={loading}
                    className="hidden"
                  />

                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Select CSV File
                      </>
                    )}
                  </Button>

                  <p className="text-sm text-gray-500 text-center mt-4">
                    Supports OBD-II logs from Duramax diesel engines (L5P, LML, etc.)
                  </p>
                </div>
              </div>
            </Card>

            {/* Info Section */}
            <div className="mt-8 grid md:grid-cols-2 gap-6">
              <Card className="p-6">
                <h3 className="font-semibold text-gray-900 mb-3">What's Analyzed</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>✓ RPM vs Mass Airflow (MAF) correlation</li>
                  <li>✓ Estimated horsepower (dual methods)</li>
                  <li>✓ Boost pressure trends</li>
                  <li>✓ Time-series performance overview</li>
                  <li>✓ Automatic diagnostic checks (P0087, P0088, P0299, P0101)</li>
                  <li>✓ Peak performance statistics</li>
                  <li>✓ Vehicle health report with VIN lookup</li>
                  <li>✓ Engine reference database with parameter definitions</li>
                  <li>✓ Diagnostic code (DTC) lookup with causes &amp; remedies</li>
                </ul>
              </Card>

              <Card className="p-6">
                <h3 className="font-semibold text-gray-900 mb-3">File Requirements</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>• CSV format from OBD-II scanner</li>
                  <li>• Must include: RPM, MAF, Torque</li>
                  <li>• Optional: Boost, Speed, Fuel Rate</li>
                  <li>• No file size limit</li>
                  <li>• Data processed in your browser</li>
                  <li>• Diagnostic rules applied automatically</li>
                </ul>
              </Card>
            </div>
          </div>
        ) : (
          // Dashboard Section
          <div className="space-y-6">
            {/* Header with File Info */}
            <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-semibold text-gray-900">{fileName}</p>
                  <p className="text-sm text-gray-600">
                    {data.stats.duration.toFixed(1)}s of data • {data.rpm.length.toLocaleString()} samples
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => {
                    if (data && fileName) {
                      exportToPdf(data, fileName);
                    }
                  }}
                  disabled={isExporting}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating PDF...
                    </>
                  ) : (
                    <>
                      <FileDown className="w-4 h-4 mr-2" />
                      Export PDF Report
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => {
                    setData(null);
                    setBinnedData(undefined);
                    setDiagnostics(null);
                    setHealthReport(null);
                    setFileName(null);
                  }}
                  variant="outline"
                >
                  Upload New File
                </Button>
              </div>
            </div>

            {/* Health Report */}
            {healthReport && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Vehicle Health Report</h2>
                <HealthReport report={healthReport} />
              </div>
            )}

            {/* Diagnostic Report */}
            {diagnostics && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Diagnostic Analysis</h2>
                <DiagnosticReportComponent report={diagnostics} />
              </div>
            )}

            {/* Statistics Summary */}
            <StatsSummary data={data} />

            {/* Dynojet-Style HP Chart — always shown */}
            <div ref={hpVsRpmRef}>
              <DynoHPChart data={data} binnedData={binnedData} />
            </div>

            {/* Fault-Specific Charts — only shown when fault detected */}
            {diagnostics && diagnostics.issues.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <h2 className="text-xl font-bold text-gray-900">Fault Zone Charts</h2>
                  <span className="text-sm text-gray-500 ml-1">— annotated with fault location and delta analysis</span>
                </div>
                <RailPressureFaultChart data={data} diagnostics={diagnostics} binnedData={binnedData} />
                <BoostFaultChart data={data} diagnostics={diagnostics} binnedData={binnedData} />
                <EgtFaultChart data={data} diagnostics={diagnostics} />
                <MafFaultChart data={data} diagnostics={diagnostics} />
              </div>
            )}

            {/* Charts */}
            <div className="grid lg:grid-cols-2 gap-6">
              <div ref={rpmVsMafRef}>
                <RPMvMAFChart data={data} binnedData={binnedData} />
              </div>
              <div ref={timeSeriesRef}>
                <TimeSeriesChart data={data} />
              </div>
            </div>

            {/* Methodology Footer */}
            <Card className="p-6 bg-blue-50 border-blue-200">
              <h3 className="font-semibold text-gray-900 mb-2">Methodology</h3>
              <p className="text-sm text-gray-700 mb-3">
                <strong>Horsepower Calculations:</strong>
              </p>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>
                  • <strong>Torque Method:</strong> HP = Torque(lb·ft) × RPM / 5252 (uses SAE J1979 actual torque %)
                </li>
                <li>
                  • <strong>MAF Method:</strong> HP = MAF(lb/min) × 60 / (BSFC × AFR) (BSFC=0.35, AFR=19 for diesel)
                </li>
              </ul>
            </Card>

            {/* DTC Code Search */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Search className="w-5 h-5 text-orange-500" />
                <h2 className="text-2xl font-bold text-gray-900">Diagnostic Code Lookup</h2>
              </div>
              <DtcSearch />
            </div>

            {/* Engine Reference Panel */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Cpu className="w-5 h-5 text-blue-600" />
                <h2 className="text-2xl font-bold text-gray-900">Engine Reference Database</h2>
              </div>
              <EcuReferencePanel />
            </div>
          </div>
        )}

        {/* Error Messages */}
        {error && (
          <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 max-w-md z-50">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Error Processing File</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}
        {exportError && (
          <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 max-w-md z-50">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">PDF Export Failed</p>
              <p className="text-sm text-red-700">{exportError}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
