/**
 * V-OP Weather — Vehicle-Reported Atmospheric Data Network
 * 
 * Vehicles with VOP plugged in report real atmospheric conditions from onboard sensors.
 * This creates a distributed weather network that provides ACTUAL conditions
 * for SAE J1349 dyno corrections — no more guessing.
 */
import { useState, useMemo } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import PpeiHeader from '@/components/PpeiHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Loader2, CloudSun, Thermometer, Wind, Droplets, Mountain,
  Gauge, Activity, MapPin, Truck, BarChart3, Clock, Radio,
  Calculator, ChevronDown, ChevronUp, Signal, Database,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

const sColor = {
  red: 'oklch(0.52 0.22 25)',
  bg: 'oklch(0.10 0.005 260)',
  cardBg: 'oklch(0.13 0.006 260)',
  border: 'oklch(0.25 0.008 260)',
  textDim: 'oklch(0.60 0.010 260)',
  green: 'oklch(0.65 0.20 145)',
  amber: 'oklch(0.75 0.18 60)',
  blue: 'oklch(0.70 0.18 200)',
  cyan: 'oklch(0.72 0.16 210)',
  purple: 'oklch(0.65 0.18 300)',
};

type WeatherTab = 'live' | 'reports' | 'calculator' | 'network';

// ── SAE Calculator Component ──
function SaeCalculator() {
  const [tempF, setTempF] = useState('77');
  const [baroInHg, setBaroInHg] = useState('29.235');
  const [humidity, setHumidity] = useState('0');

  const calcQuery = trpc.weather.calculateSaeCorrection.useQuery(
    {
      temperatureF: parseFloat(tempF) || 77,
      baroPressureInHg: parseFloat(baroInHg) || 29.235,
      humidityPct: parseFloat(humidity) || 0,
    },
    { enabled: !isNaN(parseFloat(tempF)) && !isNaN(parseFloat(baroInHg)) }
  );

  const result = calcQuery.data;
  const cf = result?.saeCorrectionFactor ?? 1.0;
  const cfColor = cf > 1.02 ? sColor.green : cf < 0.98 ? sColor.red : sColor.amber;

  return (
    <div>
      <div style={{
        background: sColor.cardBg,
        border: `1px solid ${sColor.border}`,
        borderLeft: `4px solid ${sColor.cyan}`,
        borderRadius: '3px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
      }}>
        <h3 style={{ fontFamily: sFont.heading, fontSize: '1.2rem', letterSpacing: '0.06em', color: 'white', margin: '0 0 12px 0' }}>
          SAE J1349 CORRECTION FACTOR CALCULATOR
        </h3>
        <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, marginBottom: '1.25rem' }}>
          Enter atmospheric conditions to calculate the SAE correction factor. Standard conditions: 77°F, 29.235 inHg, 0% humidity = CF 1.0000
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim, letterSpacing: '0.08em', display: 'block', marginBottom: '4px' }}>
              TEMPERATURE (°F)
            </label>
            <Input
              type="number"
              value={tempF}
              onChange={e => setTempF(e.target.value)}
              style={{ background: 'oklch(0.08 0.004 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.mono }}
            />
          </div>
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim, letterSpacing: '0.08em', display: 'block', marginBottom: '4px' }}>
              BAROMETRIC PRESSURE (inHg)
            </label>
            <Input
              type="number"
              step="0.001"
              value={baroInHg}
              onChange={e => setBaroInHg(e.target.value)}
              style={{ background: 'oklch(0.08 0.004 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.mono }}
            />
          </div>
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim, letterSpacing: '0.08em', display: 'block', marginBottom: '4px' }}>
              HUMIDITY (%)
            </label>
            <Input
              type="number"
              value={humidity}
              onChange={e => setHumidity(e.target.value)}
              style={{ background: 'oklch(0.08 0.004 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.mono }}
            />
          </div>
        </div>

        {result && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={<Calculator style={{ width: 18, height: 18 }} />}
              label="SAE CORRECTION"
              value={cf.toFixed(4)}
              color={cfColor}
              large
            />
            <StatCard
              icon={<Mountain style={{ width: 18, height: 18 }} />}
              label="DENSITY ALT"
              value={`${result.densityAltitudeFt.toLocaleString()} ft`}
              color={sColor.blue}
            />
            <StatCard
              icon={<Wind style={{ width: 18, height: 18 }} />}
              label="AIR DENSITY"
              value={`${result.airDensityLbFt3.toFixed(4)} lb/ft³`}
              color={sColor.purple}
            />
            <StatCard
              icon={<Droplets style={{ width: 18, height: 18 }} />}
              label="DEW POINT"
              value={result.dewPointF != null ? `${result.dewPointF.toFixed(1)}°F` : 'N/A'}
              color={sColor.cyan}
            />
          </div>
        )}
      </div>

      {/* HP Correction Example */}
      {result && cf !== 1.0 && (
        <div style={{
          background: 'oklch(0.12 0.008 260)',
          border: `1px solid ${sColor.border}`,
          borderRadius: '3px',
          padding: '1.25rem',
        }}>
          <h4 style={{ fontFamily: sFont.heading, fontSize: '1rem', color: 'white', margin: '0 0 8px 0' }}>
            CORRECTION EXAMPLE
          </h4>
          <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim }}>
            A dyno pull showing <span style={{ color: 'white', fontWeight: 600 }}>500 HP observed</span> under these conditions would correct to{' '}
            <span style={{ color: cfColor, fontWeight: 700, fontSize: '1rem' }}>{(500 * cf).toFixed(1)} HP</span>{' '}
            (SAE corrected). That's a {cf > 1 ? '+' : ''}{((cf - 1) * 100).toFixed(2)}% adjustment.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Stat Card Component ──
function StatCard({ icon, label, value, color, large }: {
  icon: React.ReactNode; label: string; value: string; color: string; large?: boolean;
}) {
  return (
    <div style={{
      background: 'oklch(0.08 0.004 260)',
      border: `1px solid ${sColor.border}`,
      borderRadius: '3px',
      padding: '1rem',
      textAlign: 'center',
    }}>
      <div style={{ color, marginBottom: '6px', display: 'flex', justifyContent: 'center' }}>{icon}</div>
      <div style={{
        fontFamily: sFont.mono,
        fontSize: large ? '1.4rem' : '1rem',
        color,
        fontWeight: 700,
        letterSpacing: '0.02em',
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: sFont.mono,
        fontSize: '0.6rem',
        color: sColor.textDim,
        letterSpacing: '0.1em',
        marginTop: '4px',
      }}>
        {label}
      </div>
    </div>
  );
}

// ── Manual Report Form ──
function ManualReportForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({
    temperatureF: '',
    baroPressureInHg: '',
    humidityPct: '',
    altitudeFt: '',
    latitude: '',
    longitude: '',
    city: '',
    state: '',
    vehicleName: '',
  });

  const submitMut = trpc.weather.submitReport.useMutation({
    onSuccess: (data) => {
      toast.success(`Weather report submitted! SAE CF: ${data.derived.saeCorrectionFactor}`);
      onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    const tempF = parseFloat(form.temperatureF);
    const baro = parseFloat(form.baroPressureInHg);
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);

    if (isNaN(tempF) || isNaN(baro) || isNaN(lat) || isNaN(lng)) {
      toast.error('Temperature, barometric pressure, latitude, and longitude are required.');
      return;
    }

    submitMut.mutate({
      temperatureF: tempF,
      baroPressureInHg: baro,
      humidityPct: form.humidityPct ? parseFloat(form.humidityPct) : undefined,
      altitudeFt: form.altitudeFt ? parseFloat(form.altitudeFt) : undefined,
      latitude: lat,
      longitude: lng,
      city: form.city || undefined,
      state: form.state || undefined,
      vehicleName: form.vehicleName || undefined,
      sensorSource: 'manual',
    });
  };

  return (
    <div style={{
      background: sColor.cardBg,
      border: `1px solid ${sColor.border}`,
      borderLeft: `4px solid ${sColor.green}`,
      borderRadius: '3px',
      padding: '1.5rem',
    }}>
      <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: 'white', margin: '0 0 12px 0' }}>
        SUBMIT MANUAL WEATHER REPORT
      </h3>
      <p style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: sColor.textDim, marginBottom: '1rem' }}>
        Enter current atmospheric conditions from your vehicle's sensors or a weather station. VOP devices report automatically — this form is for manual entry.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { key: 'temperatureF', label: 'TEMP (°F)', placeholder: '85', required: true },
          { key: 'baroPressureInHg', label: 'BARO (inHg)', placeholder: '29.92', required: true },
          { key: 'humidityPct', label: 'HUMIDITY (%)', placeholder: '45' },
          { key: 'altitudeFt', label: 'ALTITUDE (ft)', placeholder: '150' },
          { key: 'latitude', label: 'LATITUDE', placeholder: '30.2241', required: true },
          { key: 'longitude', label: 'LONGITUDE', placeholder: '-92.0198', required: true },
          { key: 'city', label: 'CITY', placeholder: 'Lafayette' },
          { key: 'state', label: 'STATE', placeholder: 'LA' },
        ].map(field => (
          <div key={field.key}>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim, letterSpacing: '0.08em', display: 'block', marginBottom: '3px' }}>
              {field.label}{field.required ? ' *' : ''}
            </label>
            <Input
              type={['city', 'state'].includes(field.key) ? 'text' : 'number'}
              step="any"
              placeholder={field.placeholder}
              value={(form as any)[field.key]}
              onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
              style={{ background: 'oklch(0.08 0.004 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.mono, fontSize: '0.8rem', padding: '6px 10px' }}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div style={{ flex: 1 }}>
          <label style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim, letterSpacing: '0.08em', display: 'block', marginBottom: '3px' }}>
            VEHICLE NAME (optional)
          </label>
          <Input
            placeholder="My L5P"
            value={form.vehicleName}
            onChange={e => setForm(prev => ({ ...prev, vehicleName: e.target.value }))}
            style={{ background: 'oklch(0.08 0.004 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.mono, fontSize: '0.8rem' }}
          />
        </div>
        <Button
          onClick={handleSubmit}
          disabled={submitMut.isPending}
          className="ppei-btn-red mt-4"
          style={{ fontFamily: sFont.heading, letterSpacing: '0.08em' }}
        >
          {submitMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Radio className="h-4 w-4 mr-2" />}
          SUBMIT REPORT
        </Button>
      </div>
    </div>
  );
}

// ── Report Row ──
function ReportRow({ report }: { report: any }) {
  const timeAgo = getTimeAgo(new Date(report.measuredAt));
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr',
      gap: '8px',
      padding: '10px 14px',
      borderBottom: `1px solid oklch(0.18 0.005 260)`,
      alignItems: 'center',
      fontSize: '0.78rem',
    }}>
      <div>
        <div style={{ fontFamily: sFont.body, color: 'white', fontWeight: 600 }}>
          {report.city || 'Unknown'}{report.state ? `, ${report.state}` : ''}
        </div>
        <div style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim }}>{timeAgo}</div>
      </div>
      <div style={{ fontFamily: sFont.mono, color: sColor.amber, textAlign: 'center' }}>
        {parseFloat(report.temperatureF).toFixed(1)}°F
      </div>
      <div style={{ fontFamily: sFont.mono, color: sColor.blue, textAlign: 'center' }}>
        {parseFloat(report.baroPressureInHg).toFixed(3)}"
      </div>
      <div style={{ fontFamily: sFont.mono, color: sColor.cyan, textAlign: 'center' }}>
        {report.humidityPct ? `${parseFloat(report.humidityPct).toFixed(0)}%` : '—'}
      </div>
      <div style={{ fontFamily: sFont.mono, color: sColor.purple, textAlign: 'center' }}>
        {report.densityAltitudeFt ? `${parseFloat(report.densityAltitudeFt).toLocaleString()} ft` : '—'}
      </div>
      <div style={{ fontFamily: sFont.mono, color: sColor.green, textAlign: 'center', fontWeight: 700 }}>
        {report.saeCorrectionFactor ? parseFloat(report.saeCorrectionFactor).toFixed(4) : '—'}
      </div>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Main Weather Component ──
export function WeatherContent() {
  return <WeatherPage embedded />;
}

export default function WeatherPage({ embedded = false }: { embedded?: boolean }) {
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<WeatherTab>('live');
  const [showManualForm, setShowManualForm] = useState(false);

  const reportsQuery = trpc.weather.getReports.useQuery(
    { limit: 100, hoursBack: 24 },
    { enabled: activeTab === 'live' || activeTab === 'reports' }
  );

  const networkStatsQuery = trpc.weather.getNetworkStats.useQuery(
    undefined,
    { enabled: activeTab === 'network' || activeTab === 'live' }
  );

  const tabs: { id: WeatherTab; label: string; icon: any }[] = [
    { id: 'live', label: 'LIVE CONDITIONS', icon: CloudSun },
    { id: 'reports', label: 'REPORT FEED', icon: Activity },
    { id: 'calculator', label: 'SAE CALCULATOR', icon: Calculator },
    { id: 'network', label: 'NETWORK', icon: Signal },
  ];

  const reports = reportsQuery.data ?? [];
  const stats = networkStatsQuery.data;

  // Compute live averages from recent reports
  const liveAvg = useMemo(() => {
    if (reports.length === 0) return null;
    const temps = reports.map(r => parseFloat(r.temperatureF as string));
    const baros = reports.map(r => parseFloat(r.baroPressureInHg as string));
    const humids = reports.filter(r => r.humidityPct).map(r => parseFloat(r.humidityPct as string));
    const densAlts = reports.filter(r => r.densityAltitudeFt).map(r => parseFloat(r.densityAltitudeFt as string));
    const saeCFs = reports.filter(r => r.saeCorrectionFactor).map(r => parseFloat(r.saeCorrectionFactor as string));
    const airDens = reports.filter(r => r.airDensityLbFt3).map(r => parseFloat(r.airDensityLbFt3 as string));

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    return {
      avgTempF: avg(temps),
      avgBaroInHg: avg(baros),
      avgHumidity: avg(humids),
      avgDensityAlt: avg(densAlts),
      avgSaeCF: avg(saeCFs),
      avgAirDensity: avg(airDens),
      reportCount: reports.length,
      uniqueLocations: new Set(reports.map(r => `${r.state}`)).size,
    };
  }, [reports]);

  return (
    <div className={embedded ? '' : 'min-h-screen'} style={{ background: sColor.bg }}>
      {!embedded && <PpeiHeader />}

      {/* Hero Banner */}
      <div style={{
        background: 'linear-gradient(135deg, oklch(0.12 0.015 210) 0%, oklch(0.08 0.004 260) 100%)',
        borderBottom: `1px solid ${sColor.border}`,
        padding: '2rem 0',
      }}>
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <CloudSun className="h-8 w-8" style={{ color: sColor.cyan }} />
                <h1 style={{ fontFamily: sFont.heading, fontSize: '2.2rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>
                  V-OP WEATHER NETWORK
                </h1>
              </div>
              <p style={{ fontFamily: sFont.body, color: sColor.textDim, maxWidth: '600px' }}>
                Real atmospheric conditions reported by vehicles with VOP plugged in. No guessing — actual sensor data from the field.
                This data powers SAE J1349 dyno corrections for fair competition.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isAuthenticated && (
                <Button
                  onClick={() => { setActiveTab('reports'); setShowManualForm(true); }}
                  className="ppei-btn-red"
                  style={{ fontFamily: sFont.heading, letterSpacing: '0.08em' }}
                >
                  <Radio className="h-4 w-4 mr-2" /> SUBMIT REPORT
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-nav */}
      <div style={{ background: 'oklch(0.08 0.004 260)', borderBottom: `1px solid ${sColor.border}` }}>
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-1 overflow-x-auto py-2">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="ppei-btn-hover"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: isActive ? 'oklch(0.18 0.015 210)' : 'transparent',
                    border: isActive ? `1px solid ${sColor.cyan}` : '1px solid transparent',
                    color: isActive ? sColor.cyan : sColor.textDim,
                    padding: '6px 14px', borderRadius: '2px',
                    fontFamily: sFont.heading, fontSize: '0.72rem', letterSpacing: '0.08em',
                    whiteSpace: 'nowrap', transition: 'all 0.15s',
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-6">
        {/* Module Summary */}
        <div style={{
          background: 'oklch(0.12 0.008 260)',
          border: `1px solid ${sColor.border}`,
          borderLeft: `4px solid ${sColor.cyan}`,
          borderRadius: '3px',
          padding: '20px 24px',
          marginBottom: '24px',
        }}>
          <h3 style={{ fontFamily: sFont.heading, fontSize: '1.2rem', letterSpacing: '0.06em', color: 'white', margin: '0 0 8px 0' }}>
            ABOUT V-OP WEATHER
          </h3>
          <p style={{ fontFamily: sFont.body, fontSize: '0.92rem', color: sColor.textDim, lineHeight: 1.7, margin: 0 }}>
            Every vehicle with VOP plugged in becomes a weather station. Intake Air Temperature, Barometric Pressure, and calculated humidity from onboard sensors are reported to the cloud, creating a real-time atmospheric data network. This isn't a weather app — it's actual sensor data from vehicles in the field. When you do a dyno pull, the SAE J1349 correction factor is calculated from REAL conditions reported by vehicles in your area, not a guess. No more arguing about correction factors — we know the conditions.
          </p>
        </div>

        {/* ── LIVE CONDITIONS ── */}
        {activeTab === 'live' && (
          <div className="ppei-anim-fade-up">
            {reportsQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: sColor.cyan }} />
              </div>
            ) : reports.length === 0 ? (
              <div style={{
                background: sColor.cardBg,
                border: `1px solid ${sColor.border}`,
                borderRadius: '3px',
                padding: '3rem',
                textAlign: 'center',
              }}>
                <CloudSun className="h-16 w-16 mx-auto mb-4" style={{ color: sColor.textDim, opacity: 0.4 }} />
                <h3 style={{ fontFamily: sFont.heading, fontSize: '1.3rem', color: 'white', margin: '0 0 8px 0' }}>
                  NO WEATHER DATA YET
                </h3>
                <p style={{ fontFamily: sFont.body, color: sColor.textDim, maxWidth: '400px', margin: '0 auto' }}>
                  When vehicles with VOP report atmospheric conditions, live data will appear here. Submit a manual report to get started.
                </p>
              </div>
            ) : (
              <>
                {/* Live Stats Grid */}
                {liveAvg && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                    <StatCard
                      icon={<Thermometer style={{ width: 18, height: 18 }} />}
                      label="AVG TEMP"
                      value={liveAvg.avgTempF != null ? `${liveAvg.avgTempF.toFixed(1)}°F` : '—'}
                      color={sColor.amber}
                    />
                    <StatCard
                      icon={<Gauge style={{ width: 18, height: 18 }} />}
                      label="AVG BARO"
                      value={liveAvg.avgBaroInHg != null ? `${liveAvg.avgBaroInHg.toFixed(3)}"` : '—'}
                      color={sColor.blue}
                    />
                    <StatCard
                      icon={<Droplets style={{ width: 18, height: 18 }} />}
                      label="AVG HUMIDITY"
                      value={liveAvg.avgHumidity != null ? `${liveAvg.avgHumidity.toFixed(0)}%` : '—'}
                      color={sColor.cyan}
                    />
                    <StatCard
                      icon={<Mountain style={{ width: 18, height: 18 }} />}
                      label="DENSITY ALT"
                      value={liveAvg.avgDensityAlt != null ? `${Math.round(liveAvg.avgDensityAlt).toLocaleString()} ft` : '—'}
                      color={sColor.purple}
                    />
                    <StatCard
                      icon={<Calculator style={{ width: 18, height: 18 }} />}
                      label="AVG SAE CF"
                      value={liveAvg.avgSaeCF != null ? liveAvg.avgSaeCF.toFixed(4) : '—'}
                      color={sColor.green}
                      large
                    />
                    <StatCard
                      icon={<Truck style={{ width: 18, height: 18 }} />}
                      label="REPORTS (24H)"
                      value={String(liveAvg.reportCount)}
                      color={sColor.red}
                    />
                  </div>
                )}

                {/* Recent Reports Table */}
                <div style={{
                  background: sColor.cardBg,
                  border: `1px solid ${sColor.border}`,
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr',
                    gap: '8px',
                    padding: '10px 14px',
                    background: 'oklch(0.08 0.004 260)',
                    borderBottom: `1px solid ${sColor.border}`,
                  }}>
                    {['LOCATION', 'TEMP', 'BARO', 'HUMIDITY', 'DENSITY ALT', 'SAE CF'].map(h => (
                      <div key={h} style={{
                        fontFamily: sFont.mono,
                        fontSize: '0.6rem',
                        color: sColor.textDim,
                        letterSpacing: '0.1em',
                        textAlign: h === 'LOCATION' ? 'left' : 'center',
                      }}>
                        {h}
                      </div>
                    ))}
                  </div>
                  {reports.slice(0, 20).map((report: any) => (
                    <ReportRow key={report.id} report={report} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── REPORT FEED ── */}
        {activeTab === 'reports' && (
          <div className="ppei-anim-fade-up">
            {showManualForm && isAuthenticated && (
              <div className="mb-6">
                <ManualReportForm onSuccess={() => { reportsQuery.refetch(); setShowManualForm(false); }} />
              </div>
            )}

            {!showManualForm && isAuthenticated && (
              <Button
                onClick={() => setShowManualForm(true)}
                className="ppei-btn-red mb-4"
                style={{ fontFamily: sFont.heading, letterSpacing: '0.08em' }}
              >
                <Radio className="h-4 w-4 mr-2" /> SUBMIT MANUAL REPORT
              </Button>
            )}

            <div style={{
              background: sColor.cardBg,
              border: `1px solid ${sColor.border}`,
              borderRadius: '3px',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '12px 14px',
                borderBottom: `1px solid ${sColor.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <h3 style={{ fontFamily: sFont.heading, fontSize: '1rem', color: 'white', margin: 0 }}>
                  ALL REPORTS (LAST 24H)
                </h3>
                <Badge variant="outline" style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.cyan }}>
                  {reports.length} REPORTS
                </Badge>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr',
                gap: '8px',
                padding: '10px 14px',
                background: 'oklch(0.08 0.004 260)',
                borderBottom: `1px solid ${sColor.border}`,
              }}>
                {['LOCATION', 'TEMP', 'BARO', 'HUMIDITY', 'DENSITY ALT', 'SAE CF'].map(h => (
                  <div key={h} style={{
                    fontFamily: sFont.mono,
                    fontSize: '0.6rem',
                    color: sColor.textDim,
                    letterSpacing: '0.1em',
                    textAlign: h === 'LOCATION' ? 'left' : 'center',
                  }}>
                    {h}
                  </div>
                ))}
              </div>
              {reports.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', fontFamily: sFont.body, color: sColor.textDim }}>
                  No reports in the last 24 hours. Submit one to get started.
                </div>
              ) : (
                reports.map((report: any) => <ReportRow key={report.id} report={report} />)
              )}
            </div>
          </div>
        )}

        {/* ── SAE CALCULATOR ── */}
        {activeTab === 'calculator' && (
          <div className="ppei-anim-fade-up">
            <SaeCalculator />
          </div>
        )}

        {/* ── NETWORK STATS ── */}
        {activeTab === 'network' && (
          <div className="ppei-anim-fade-up">
            {networkStatsQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: sColor.cyan }} />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                  <StatCard
                    icon={<Database style={{ width: 22, height: 22 }} />}
                    label="TOTAL REPORTS"
                    value={String(stats?.totalReports ?? 0)}
                    color={sColor.cyan}
                    large
                  />
                  <StatCard
                    icon={<Truck style={{ width: 22, height: 22 }} />}
                    label="UNIQUE VEHICLES"
                    value={String(stats?.totalVehicles ?? 0)}
                    color={sColor.green}
                    large
                  />
                  <StatCard
                    icon={<Signal style={{ width: 22, height: 22 }} />}
                    label="REPORTS (24H)"
                    value={String(stats?.reportsLast24h ?? 0)}
                    color={sColor.amber}
                    large
                  />
                  <StatCard
                    icon={<Activity style={{ width: 22, height: 22 }} />}
                    label="REPORTS (7D)"
                    value={String(stats?.reportsLast7d ?? 0)}
                    color={sColor.blue}
                  />
                  <StatCard
                    icon={<MapPin style={{ width: 22, height: 22 }} />}
                    label="STATES REPORTING"
                    value={String(stats?.statesReported ?? 0)}
                    color={sColor.purple}
                  />
                  <StatCard
                    icon={<BarChart3 style={{ width: 22, height: 22 }} />}
                    label="TOTAL USERS"
                    value={String(stats?.totalUsers ?? 0)}
                    color={sColor.red}
                  />
                </div>

                <div style={{
                  background: sColor.cardBg,
                  border: `1px solid ${sColor.border}`,
                  borderLeft: `4px solid ${sColor.cyan}`,
                  borderRadius: '3px',
                  padding: '1.5rem',
                }}>
                  <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: 'white', margin: '0 0 8px 0' }}>
                    HOW IT WORKS
                  </h3>
                  <div style={{ fontFamily: sFont.body, fontSize: '0.88rem', color: sColor.textDim, lineHeight: 1.8 }}>
                    <p style={{ marginBottom: '0.75rem' }}>
                      <strong style={{ color: 'white' }}>1. Vehicle Reports:</strong> Every vehicle with VOP plugged in reads IAT (Intake Air Temperature), BARO (Barometric Pressure), and calculates humidity from intake conditions. These readings are sent to the cloud with GPS coordinates.
                    </p>
                    <p style={{ marginBottom: '0.75rem' }}>
                      <strong style={{ color: 'white' }}>2. Area Aggregation:</strong> Reports from multiple vehicles in the same area are averaged to create reliable atmospheric conditions. More vehicles = more accurate data.
                    </p>
                    <p style={{ marginBottom: '0.75rem' }}>
                      <strong style={{ color: 'white' }}>3. SAE J1349 Correction:</strong> When a dyno pull is logged, the correction factor is calculated from ACTUAL conditions — not the standard 77°F / 29.235" / 0% humidity that everyone assumes.
                    </p>
                    <p>
                      <strong style={{ color: 'white' }}>4. Fair Competition:</strong> Dyno competitions use the same real atmospheric data for all participants. No more arguing about who had better air — we KNOW the conditions.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
