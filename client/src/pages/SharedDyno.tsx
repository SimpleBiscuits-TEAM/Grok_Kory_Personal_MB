/**
 * Public Shared Dyno Viewer — displays a shared virtual dyno PDF result.
 * Accessible without authentication at /shared/dyno/:token
 */
import { useRoute } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Loader2, Download, Eye, Gauge, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PPEI_LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663472908899/S5fEZ6uPndYXxpVXwwyEPy/PPEI Logo _b0d26c0f.png';

const TURBO_LABELS: Record<string, string> = {
  na: 'Naturally Aspirated',
  jr: 'Jackson Racing (JR)',
  kw: 'Kraftwerks (KW)',
  fp: 'Full Performance (FP)',
  generic_turbo: 'Turbo',
};

const FUEL_LABELS: Record<string, string> = {
  pump: '93 Octane',
  utv96: 'UTV96',
  e85: 'E85',
};

const INJECTOR_LABELS: Record<string, string> = {
  stock: 'Stock (~310cc)',
  jr_kit: 'JR Kit (~345cc)',
  kw800: 'FIC 800cc',
  id1050: 'ID1050X',
  id1300: 'ID1300X',
};

export default function SharedDyno() {
  const [, params] = useRoute('/shared/dyno/:token');
  const token = params?.token ?? '';

  const { data, isLoading, error } = trpc.dyno.getSharedDyno.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0d0f14] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          <p className="text-zinc-400 text-sm">Loading dyno result...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0d0f14] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center px-4">
          <img src={PPEI_LOGO_URL} alt="PPEI" className="h-12 opacity-60" />
          <h1 className="text-xl font-bold text-zinc-200">Dyno Result Not Found</h1>
          <p className="text-zinc-500 text-sm max-w-md">
            This shared dyno link may have expired or been removed.
          </p>
          <a href="/" className="text-orange-500 hover:text-orange-400 text-sm underline">
            Go to V-OP Home
          </a>
        </div>
      </div>
    );
  }

  const peakHp = data.peakHp ? parseFloat(data.peakHp) : null;
  const peakTorque = data.peakTorque ? parseFloat(data.peakTorque) : null;

  return (
    <div className="min-h-screen bg-[#0d0f14] text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-[#0d0f14]/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={PPEI_LOGO_URL} alt="PPEI" className="h-8" />
            <div>
              <h1 className="text-sm font-semibold text-orange-500">PPEI Virtual Dyno</h1>
              <p className="text-xs text-zinc-500">Shared Result</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Eye className="w-3.5 h-3.5" />
              <span>{data.views ?? 0} views</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(data.pdfUrl, '_blank')}
              className="text-zinc-300 border-zinc-600 hover:bg-zinc-800"
            >
              <Download className="w-4 h-4 mr-1" /> Download PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {peakHp != null && (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Zap className="w-4 h-4 text-orange-500" />
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Peak HP</span>
              </div>
              <div className="text-2xl font-bold text-orange-500">{peakHp.toFixed(1)}</div>
              {data.peakHpRpm && (
                <div className="text-xs text-zinc-500">@ {data.peakHpRpm.toLocaleString()} RPM</div>
              )}
            </div>
          )}
          {peakTorque != null && (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Gauge className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Peak Torque</span>
              </div>
              <div className="text-2xl font-bold text-cyan-400">{peakTorque.toFixed(1)}</div>
              {data.peakTorqueRpm && (
                <div className="text-xs text-zinc-500">@ {data.peakTorqueRpm.toLocaleString()} RPM</div>
              )}
            </div>
          )}
          {data.turboType && (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 text-center">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider block mb-1">Setup</span>
              <div className="text-sm font-semibold text-zinc-200">
                {TURBO_LABELS[data.turboType] || data.turboType}
              </div>
              {data.fuelType && (
                <div className="text-xs text-zinc-500">{FUEL_LABELS[data.fuelType] || data.fuelType}</div>
              )}
            </div>
          )}
          {data.injectorType && (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 text-center">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider block mb-1">Injectors</span>
              <div className="text-sm font-semibold text-zinc-200">
                {INJECTOR_LABELS[data.injectorType] || data.injectorType}
              </div>
              {data.has3BarMap && (
                <div className="text-xs text-emerald-500">3-Bar MAP Detected</div>
              )}
            </div>
          )}
        </div>

        {/* PDF Embed */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg overflow-hidden">
          <iframe
            src={data.pdfUrl}
            className="w-full"
            style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}
            title="Shared Virtual Dyno Result"
          />
        </div>

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-xs text-zinc-600">
            Virtual dyno estimates are dependent on tuning setup and conditions — results serve as reference only.
          </p>
          {data.fileName && (
            <p className="text-xs text-zinc-700 mt-1">Source: {data.fileName}</p>
          )}
          <p className="text-xs text-zinc-700 mt-1">
            Shared on {new Date(data.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>
    </div>
  );
}
