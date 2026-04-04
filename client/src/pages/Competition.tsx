/**
 * V-OP Competition — Drag Racing + Dyno Competitions
 * 
 * Combines drag racing and dyno features under a unified competition tab.
 * Dyno competitions use SAE J1349 correction factors from the V-OP Weather Network
 * for fair, conditions-aware performance comparisons.
 */
import React, { useState, useMemo } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Flag, Gauge, Trophy, Calculator, Clock, MapPin,
  BarChart3, ChevronDown, ChevronUp, Plus, Users, Zap,
  Car, Thermometer, Wind, Mountain, Activity,
} from 'lucide-react';
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
  orange: 'oklch(0.70 0.18 40)',
};

type CompetitionSubTab = 'drag' | 'dyno';

// Lazy-load the existing DragContent component
const DragPanel = React.lazy(() => import('./DragRacing').then(m => ({ default: m.DragContent })));

// ── Dyno Run Card ──
function DynoRunCard({ run }: { run: any }) {
  const [expanded, setExpanded] = useState(false);
  const saeCF = parseFloat(run.saeCorrectionFactor || '1');
  const cfColor = saeCF > 1.02 ? sColor.green : saeCF < 0.98 ? sColor.red : sColor.amber;

  return (
    <div style={{
      background: sColor.cardBg,
      border: `1px solid ${sColor.border}`,
      borderLeft: `4px solid ${sColor.orange}`,
      borderRadius: '3px',
      marginBottom: '8px',
      overflow: 'hidden',
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
          gap: '8px',
          padding: '12px 16px',
          cursor: 'pointer',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontFamily: sFont.body, color: 'white', fontWeight: 600, fontSize: '0.9rem' }}>
            {run.vehicleName || `${run.vehicleYear || ''} ${run.vehicleMake || ''} ${run.vehicleModel || ''}`.trim() || 'Unknown Vehicle'}
          </div>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim }}>
            {run.facilityName || 'Unknown Facility'} • {new Date(run.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: sFont.mono, fontSize: '1.1rem', color: sColor.orange, fontWeight: 700 }}>
            {parseFloat(run.peakHpObserved).toFixed(1)}
          </div>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textDim, letterSpacing: '0.08em' }}>
            OBSERVED HP
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: sFont.mono, fontSize: '1.1rem', color: sColor.green, fontWeight: 700 }}>
            {parseFloat(run.peakHpCorrected).toFixed(1)}
          </div>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textDim, letterSpacing: '0.08em' }}>
            SAE CORRECTED HP
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.9rem', color: cfColor, fontWeight: 700 }}>
            {saeCF.toFixed(4)}
          </div>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textDim, letterSpacing: '0.08em' }}>
            SAE CF
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          {expanded ? <ChevronUp className="h-4 w-4 mx-auto" style={{ color: sColor.textDim }} /> : <ChevronDown className="h-4 w-4 mx-auto" style={{ color: sColor.textDim }} />}
        </div>
      </div>

      {expanded && (
        <div style={{
          borderTop: `1px solid oklch(0.18 0.005 260)`,
          padding: '12px 16px',
          background: 'oklch(0.10 0.005 260)',
        }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat label="OBSERVED TQ" value={`${parseFloat(run.peakTqObserved).toFixed(1)} lb-ft`} color={sColor.orange} />
            <MiniStat label="CORRECTED TQ" value={`${parseFloat(run.peakTqCorrected).toFixed(1)} lb-ft`} color={sColor.green} />
            <MiniStat label="TEMPERATURE" value={`${parseFloat(run.temperatureF).toFixed(1)}°F`} color={sColor.amber} />
            <MiniStat label="BARO PRESSURE" value={`${parseFloat(run.baroPressureInHg).toFixed(3)} inHg`} color={sColor.blue} />
            <MiniStat label="DENSITY ALT" value={`${parseFloat(run.densityAltitudeFt).toLocaleString()} ft`} color={sColor.purple} />
            <MiniStat label="AIR DENSITY" value={`${parseFloat(run.airDensityLbFt3).toFixed(4)} lb/ft³`} color={sColor.cyan} />
            <MiniStat label="DYNO TYPE" value={(run.dynoType || 'chassis').toUpperCase()} color={sColor.textDim} />
            <MiniStat label="VEHICLE CLASS" value={(run.vehicleClass || 'Open').toUpperCase()} color={sColor.textDim} />
          </div>
          {run.notes && (
            <div style={{ marginTop: '8px', fontFamily: sFont.body, fontSize: '0.82rem', color: sColor.textDim }}>
              <strong style={{ color: 'white' }}>Notes:</strong> {run.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: sFont.mono, fontSize: '0.82rem', color, fontWeight: 600 }}>{value}</div>
      <div style={{ fontFamily: sFont.mono, fontSize: '0.5rem', color: sColor.textDim, letterSpacing: '0.1em' }}>{label}</div>
    </div>
  );
}

// ── Submit Dyno Run Form ──
function SubmitDynoRunForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({
    vehicleName: '', vehicleYear: '', vehicleMake: '', vehicleModel: '', vehicleClass: '',
    peakHpObserved: '', peakTqObserved: '', peakHpRpm: '', peakTqRpm: '',
    temperatureF: '', baroPressureInHg: '', humidityPct: '', altitudeFt: '',
    facilityName: '', dynoBrand: '', dynoType: 'chassis' as 'chassis' | 'engine' | 'hub',
    notes: '',
  });

  const submitMut = trpc.dyno.submitRun.useMutation({
    onSuccess: (data) => {
      toast.success(`Dyno run submitted! SAE CF: ${data.saeCorrectionFactor} | Corrected HP: ${data.peakHpCorrected}`);
      onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    const hp = parseFloat(form.peakHpObserved);
    const tq = parseFloat(form.peakTqObserved);
    const temp = parseFloat(form.temperatureF);
    const baro = parseFloat(form.baroPressureInHg);

    if (isNaN(hp) || isNaN(tq) || isNaN(temp) || isNaN(baro)) {
      toast.error('HP, TQ, temperature, and barometric pressure are required.');
      return;
    }

    submitMut.mutate({
      vehicleName: form.vehicleName || undefined,
      vehicleYear: form.vehicleYear ? parseInt(form.vehicleYear) : undefined,
      vehicleMake: form.vehicleMake || undefined,
      vehicleModel: form.vehicleModel || undefined,
      vehicleClass: form.vehicleClass || undefined,
      peakHpObserved: hp,
      peakTqObserved: tq,
      peakHpRpm: form.peakHpRpm ? parseInt(form.peakHpRpm) : undefined,
      peakTqRpm: form.peakTqRpm ? parseInt(form.peakTqRpm) : undefined,
      temperatureF: temp,
      baroPressureInHg: baro,
      humidityPct: form.humidityPct ? parseFloat(form.humidityPct) : undefined,
      altitudeFt: form.altitudeFt ? parseFloat(form.altitudeFt) : undefined,
      facilityName: form.facilityName || undefined,
      dynoBrand: form.dynoBrand || undefined,
      dynoType: form.dynoType,
      notes: form.notes || undefined,
    });
  };

  const update = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <div style={{
      background: sColor.cardBg,
      border: `1px solid ${sColor.border}`,
      borderLeft: `4px solid ${sColor.orange}`,
      borderRadius: '3px',
      padding: '1.5rem',
      marginBottom: '1.5rem',
    }}>
      <h3 style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white', margin: '0 0 4px 0' }}>
        SUBMIT DYNO RUN
      </h3>
      <p style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: sColor.textDim, marginBottom: '1rem' }}>
        Enter your dyno results and atmospheric conditions. SAE J1349 correction will be calculated automatically.
      </p>

      {/* Vehicle Info */}
      <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.orange, letterSpacing: '0.1em', marginBottom: '6px' }}>VEHICLE</div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[
          { key: 'vehicleName', label: 'Name', placeholder: 'My L5P' },
          { key: 'vehicleYear', label: 'Year', placeholder: '2024' },
          { key: 'vehicleMake', label: 'Make', placeholder: 'Chevrolet' },
          { key: 'vehicleModel', label: 'Model', placeholder: 'Silverado 2500HD' },
          { key: 'vehicleClass', label: 'Class', placeholder: 'Diesel Truck' },
        ].map(f => (
          <div key={f.key}>
            <Input
              placeholder={f.placeholder}
              value={(form as any)[f.key]}
              onChange={e => update(f.key, e.target.value)}
              style={{ background: 'oklch(0.08 0.004 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.mono, fontSize: '0.78rem' }}
            />
          </div>
        ))}
      </div>

      {/* Dyno Results */}
      <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.green, letterSpacing: '0.1em', marginBottom: '6px' }}>DYNO RESULTS *</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { key: 'peakHpObserved', label: 'Peak HP *', placeholder: '500' },
          { key: 'peakTqObserved', label: 'Peak TQ *', placeholder: '900' },
          { key: 'peakHpRpm', label: 'HP RPM', placeholder: '3200' },
          { key: 'peakTqRpm', label: 'TQ RPM', placeholder: '1800' },
        ].map(f => (
          <div key={f.key}>
            <Input
              type="number"
              placeholder={f.placeholder}
              value={(form as any)[f.key]}
              onChange={e => update(f.key, e.target.value)}
              style={{ background: 'oklch(0.08 0.004 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.mono, fontSize: '0.78rem' }}
            />
          </div>
        ))}
      </div>

      {/* Atmospheric Conditions */}
      <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.cyan, letterSpacing: '0.1em', marginBottom: '6px' }}>ATMOSPHERIC CONDITIONS *</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { key: 'temperatureF', label: 'Temp (°F) *', placeholder: '85' },
          { key: 'baroPressureInHg', label: 'Baro (inHg) *', placeholder: '29.92' },
          { key: 'humidityPct', label: 'Humidity (%)', placeholder: '45' },
          { key: 'altitudeFt', label: 'Altitude (ft)', placeholder: '150' },
        ].map(f => (
          <div key={f.key}>
            <Input
              type="number"
              step="any"
              placeholder={f.placeholder}
              value={(form as any)[f.key]}
              onChange={e => update(f.key, e.target.value)}
              style={{ background: 'oklch(0.08 0.004 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.mono, fontSize: '0.78rem' }}
            />
          </div>
        ))}
      </div>

      {/* Facility Info */}
      <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim, letterSpacing: '0.1em', marginBottom: '6px' }}>FACILITY</div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <Input placeholder="Facility Name" value={form.facilityName} onChange={e => update('facilityName', e.target.value)} style={{ background: 'oklch(0.08 0.004 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.mono, fontSize: '0.78rem' }} />
        <Input placeholder="Dyno Brand (e.g. DynoJet)" value={form.dynoBrand} onChange={e => update('dynoBrand', e.target.value)} style={{ background: 'oklch(0.08 0.004 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.mono, fontSize: '0.78rem' }} />
        <select
          value={form.dynoType}
          onChange={e => update('dynoType', e.target.value)}
          style={{ background: 'oklch(0.08 0.004 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.mono, fontSize: '0.78rem', padding: '6px 10px', borderRadius: '4px' }}
        >
          <option value="chassis">Chassis Dyno</option>
          <option value="engine">Engine Dyno</option>
          <option value="hub">Hub Dyno</option>
        </select>
      </div>

      <div className="mb-4">
        <Input placeholder="Notes (optional)" value={form.notes} onChange={e => update('notes', e.target.value)} style={{ background: 'oklch(0.08 0.004 260)', border: `1px solid ${sColor.border}`, color: 'white', fontFamily: sFont.mono, fontSize: '0.78rem' }} />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={submitMut.isPending}
        className="ppei-btn-red"
        style={{ fontFamily: sFont.heading, letterSpacing: '0.08em' }}
      >
        {submitMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Gauge className="h-4 w-4 mr-2" />}
        SUBMIT DYNO RUN
      </Button>
    </div>
  );
}

// ── Dyno Content ──
function DynoContent() {
  const { isAuthenticated } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<'leaderboard' | 'my-runs' | 'competitions'>('leaderboard');

  const leaderboardQuery = trpc.dyno.getLeaderboard.useQuery({ limit: 25 });
  const myRunsQuery = trpc.dyno.getMyRuns.useQuery({ limit: 50 }, { enabled: isAuthenticated });
  const competitionsQuery = trpc.dyno.getCompetitions.useQuery({ limit: 25 });

  return (
    <div>
      {/* Sub-nav */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {[
          { id: 'leaderboard' as const, label: 'LEADERBOARD', icon: Trophy },
          { id: 'my-runs' as const, label: 'MY RUNS', icon: Gauge },
          { id: 'competitions' as const, label: 'COMPETITIONS', icon: Users },
        ].map(v => {
          const Icon = v.icon;
          const isActive = view === v.id;
          return (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: isActive ? 'oklch(0.18 0.015 40)' : 'transparent',
                border: isActive ? `1px solid ${sColor.orange}` : `1px solid transparent`,
                color: isActive ? sColor.orange : sColor.textDim,
                padding: '6px 12px', borderRadius: '2px',
                fontFamily: sFont.heading, fontSize: '0.7rem', letterSpacing: '0.08em',
                transition: 'all 0.15s', cursor: 'pointer',
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              {v.label}
            </button>
          );
        })}

        {isAuthenticated && (
          <Button
            onClick={() => setShowForm(!showForm)}
            variant="outline"
            size="sm"
            style={{ fontFamily: sFont.heading, letterSpacing: '0.06em', fontSize: '0.7rem', marginLeft: 'auto', borderColor: sColor.orange, color: sColor.orange }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            {showForm ? 'HIDE FORM' : 'NEW RUN'}
          </Button>
        )}
      </div>

      {showForm && isAuthenticated && (
        <SubmitDynoRunForm onSuccess={() => {
          setShowForm(false);
          leaderboardQuery.refetch();
          myRunsQuery.refetch();
        }} />
      )}

      {/* About Dyno */}
      <div style={{
        background: 'oklch(0.12 0.008 260)',
        border: `1px solid ${sColor.border}`,
        borderLeft: `4px solid ${sColor.orange}`,
        borderRadius: '3px',
        padding: '16px 20px',
        marginBottom: '1rem',
      }}>
        <h3 style={{ fontFamily: sFont.heading, fontSize: '1rem', color: 'white', margin: '0 0 6px 0' }}>
          SAE-CORRECTED DYNO COMPETITION
        </h3>
        <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, margin: 0, lineHeight: 1.6 }}>
          Every dyno pull is corrected using <strong style={{ color: 'white' }}>SAE J1349</strong> with ACTUAL atmospheric conditions from the V-OP Weather Network. No more guessing the correction factor — we know the temperature, barometric pressure, and humidity from vehicle sensors in the area. This means fair competition: everyone's numbers are corrected to the same standard using real data, not assumptions.
        </p>
      </div>

      {/* Leaderboard */}
      {view === 'leaderboard' && (
        <div className="ppei-anim-fade-up">
          {leaderboardQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: sColor.orange }} />
            </div>
          ) : (leaderboardQuery.data?.length ?? 0) === 0 ? (
            <div style={{
              background: sColor.cardBg,
              border: `1px solid ${sColor.border}`,
              borderRadius: '3px',
              padding: '3rem',
              textAlign: 'center',
            }}>
              <Trophy className="h-12 w-12 mx-auto mb-3" style={{ color: sColor.textDim, opacity: 0.4 }} />
              <h3 style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white', margin: '0 0 8px 0' }}>
                NO DYNO RUNS YET
              </h3>
              <p style={{ fontFamily: sFont.body, color: sColor.textDim }}>
                Be the first to submit a dyno run and claim the top spot.
              </p>
            </div>
          ) : (
            <div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '40px 2fr 1fr 1fr 1fr 1fr',
                gap: '8px',
                padding: '8px 16px',
                fontFamily: sFont.mono,
                fontSize: '0.6rem',
                color: sColor.textDim,
                letterSpacing: '0.1em',
                borderBottom: `1px solid ${sColor.border}`,
              }}>
                <div>#</div>
                <div>VEHICLE</div>
                <div style={{ textAlign: 'center' }}>OBSERVED HP</div>
                <div style={{ textAlign: 'center' }}>CORRECTED HP</div>
                <div style={{ textAlign: 'center' }}>SAE CF</div>
                <div style={{ textAlign: 'center' }}>CONDITIONS</div>
              </div>
              {leaderboardQuery.data?.map((run: any, idx: number) => (
                <div key={run.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 2fr 1fr 1fr 1fr 1fr',
                  gap: '8px',
                  padding: '10px 16px',
                  borderBottom: `1px solid oklch(0.18 0.005 260)`,
                  alignItems: 'center',
                  background: idx < 3 ? 'oklch(0.12 0.008 40 / 0.1)' : 'transparent',
                }}>
                  <div style={{
                    fontFamily: sFont.heading,
                    fontSize: idx < 3 ? '1.2rem' : '0.9rem',
                    color: idx === 0 ? 'oklch(0.80 0.15 80)' : idx === 1 ? 'oklch(0.70 0.05 260)' : idx === 2 ? 'oklch(0.65 0.12 50)' : sColor.textDim,
                  }}>
                    {idx + 1}
                  </div>
                  <div>
                    <div style={{ fontFamily: sFont.body, color: 'white', fontWeight: 600, fontSize: '0.85rem' }}>
                      {run.vehicleName || `${run.vehicleYear || ''} ${run.vehicleMake || ''} ${run.vehicleModel || ''}`.trim() || 'Unknown'}
                    </div>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim }}>
                      {run.vehicleClass || 'Open'} • {run.facilityName || '—'}
                    </div>
                  </div>
                  <div style={{ fontFamily: sFont.mono, fontSize: '0.9rem', color: sColor.orange, textAlign: 'center' }}>
                    {parseFloat(run.peakHpObserved).toFixed(1)}
                  </div>
                  <div style={{ fontFamily: sFont.mono, fontSize: '0.9rem', color: sColor.green, textAlign: 'center', fontWeight: 700 }}>
                    {parseFloat(run.peakHpCorrected).toFixed(1)}
                  </div>
                  <div style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.cyan, textAlign: 'center' }}>
                    {parseFloat(run.saeCorrectionFactor).toFixed(4)}
                  </div>
                  <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim, textAlign: 'center' }}>
                    {parseFloat(run.temperatureF).toFixed(0)}°F / {parseFloat(run.baroPressureInHg).toFixed(2)}"
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* My Runs */}
      {view === 'my-runs' && (
        <div className="ppei-anim-fade-up">
          {!isAuthenticated ? (
            <div style={{
              background: sColor.cardBg,
              border: `1px solid ${sColor.border}`,
              borderRadius: '3px',
              padding: '2rem',
              textAlign: 'center',
            }}>
              <p style={{ fontFamily: sFont.body, color: sColor.textDim }}>Sign in to view your dyno runs.</p>
            </div>
          ) : myRunsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: sColor.orange }} />
            </div>
          ) : (myRunsQuery.data?.length ?? 0) === 0 ? (
            <div style={{
              background: sColor.cardBg,
              border: `1px solid ${sColor.border}`,
              borderRadius: '3px',
              padding: '2rem',
              textAlign: 'center',
            }}>
              <Gauge className="h-10 w-10 mx-auto mb-3" style={{ color: sColor.textDim, opacity: 0.4 }} />
              <p style={{ fontFamily: sFont.body, color: sColor.textDim }}>No dyno runs yet. Submit your first run above.</p>
            </div>
          ) : (
            myRunsQuery.data?.map((run: any) => <DynoRunCard key={run.id} run={run} />)
          )}
        </div>
      )}

      {/* Competitions */}
      {view === 'competitions' && (
        <div className="ppei-anim-fade-up">
          {competitionsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: sColor.orange }} />
            </div>
          ) : (competitionsQuery.data?.length ?? 0) === 0 ? (
            <div style={{
              background: sColor.cardBg,
              border: `1px solid ${sColor.border}`,
              borderRadius: '3px',
              padding: '3rem',
              textAlign: 'center',
            }}>
              <Users className="h-12 w-12 mx-auto mb-3" style={{ color: sColor.textDim, opacity: 0.4 }} />
              <h3 style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white', margin: '0 0 8px 0' }}>
                NO COMPETITIONS YET
              </h3>
              <p style={{ fontFamily: sFont.body, color: sColor.textDim, maxWidth: '400px', margin: '0 auto' }}>
                Dyno competitions with SAE-corrected results are coming soon. When a competition is created, all participants' runs will be corrected using the same real atmospheric conditions from the V-OP Weather Network.
              </p>
              <Badge variant="outline" className="mt-3" style={{ fontFamily: sFont.mono, color: sColor.orange, borderColor: sColor.orange }}>
                COMING SOON — DYNOJET INTEGRATION
              </Badge>
            </div>
          ) : (
            competitionsQuery.data?.map((comp: any) => (
              <div key={comp.id} style={{
                background: sColor.cardBg,
                border: `1px solid ${sColor.border}`,
                borderLeft: `4px solid ${comp.status === 'active' ? sColor.green : comp.status === 'upcoming' ? sColor.amber : sColor.textDim}`,
                borderRadius: '3px',
                padding: '16px',
                marginBottom: '8px',
              }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: 'white', margin: 0 }}>{comp.name}</h4>
                    <p style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: sColor.textDim, margin: '4px 0 0 0' }}>
                      {comp.facilityName || 'TBD'} • {comp.vehicleClass || 'Open Class'} • {comp.dynoType || 'Chassis'}
                    </p>
                  </div>
                  <Badge variant="outline" style={{
                    fontFamily: sFont.mono,
                    color: comp.status === 'active' ? sColor.green : comp.status === 'upcoming' ? sColor.amber : sColor.textDim,
                    borderColor: comp.status === 'active' ? sColor.green : comp.status === 'upcoming' ? sColor.amber : sColor.textDim,
                  }}>
                    {comp.status.toUpperCase()}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Competition Component ──
export function CompetitionContent() {
  return <CompetitionPage embedded />;
}

export default function CompetitionPage({ embedded = false }: { embedded?: boolean }) {
  const [subTab, setSubTab] = useState<CompetitionSubTab>('drag');

  const subTabs: { id: CompetitionSubTab; label: string; icon: any; color: string }[] = [
    { id: 'drag', label: 'DRAG RACING', icon: Flag, color: sColor.red },
    { id: 'dyno', label: 'DYNO', icon: Gauge, color: sColor.orange },
  ];

  return (
    <div>
      {/* Competition sub-tab nav */}
      <div className="flex items-center gap-2 mb-4 flex-wrap" style={{
        borderBottom: `1px solid ${sColor.border}`,
        paddingBottom: '8px',
        marginBottom: '1rem',
      }}>
        {subTabs.map(tab => {
          const isActive = subTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: isActive ? `oklch(0.18 0.015 ${tab.id === 'drag' ? '25' : '40'})` : 'transparent',
                border: isActive ? `1px solid ${tab.color}` : '1px solid transparent',
                color: isActive ? tab.color : sColor.textDim,
                padding: '8px 16px', borderRadius: '2px',
                fontFamily: sFont.heading, fontSize: '0.8rem', letterSpacing: '0.08em',
                transition: 'all 0.15s', cursor: 'pointer',
              }}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      {subTab === 'drag' && (
        <div className="ppei-anim-fade-up">
          <React.Suspense fallback={
            <div style={{ padding: '2rem', textAlign: 'center', fontFamily: sFont.mono, color: sColor.textDim }}>
              LOADING DRAG RACING...
            </div>
          }>
            <DragPanel />
          </React.Suspense>
        </div>
      )}

      {subTab === 'dyno' && (
        <div className="ppei-anim-fade-up">
          <DynoContent />
        </div>
      )}
    </div>
  );
}
