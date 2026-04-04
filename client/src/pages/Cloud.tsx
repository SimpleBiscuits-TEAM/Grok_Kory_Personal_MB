/**
 * V-OP Cloud Network — Crowd-Sourced Vehicle Analytics
 * 
 * Users opt-in their vehicles to contribute anonymized data (MPG, health, performance).
 * The network aggregates data by vehicle type so owners and fleets can see real-world
 * averages — no more guessing from forums. Fleets can benchmark against the crowd
 * and compare efficiency between fleets to make data-driven purchasing decisions.
 */
import { useState, useMemo } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Loader2, Cloud, Truck, BarChart3, Activity, Database,
  Shield, Users, Fuel, Thermometer, Gauge, Zap, AlertTriangle,
  TrendingUp, TrendingDown, Minus, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Trophy, Globe, Building2, Car,
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

type CloudTab = 'overview' | 'enroll' | 'compare' | 'fleet' | 'rankings';

// ── Trend Indicator ──
function TrendIcon({ value, avg, unit }: { value: number | null; avg: number | null; unit?: string }) {
  if (value === null || avg === null) return <Minus style={{ width: 14, height: 14, color: sColor.textDim }} />;
  const diff = value - avg;
  const pct = avg !== 0 ? ((diff / avg) * 100).toFixed(1) : '0';
  if (Math.abs(diff) < 0.01) return <Minus style={{ width: 14, height: 14, color: sColor.textDim }} />;
  return diff > 0
    ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: sColor.green, fontSize: 12, fontFamily: sFont.mono }}>
        <TrendingUp style={{ width: 14, height: 14 }} /> +{pct}%
      </span>
    : <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: sColor.red, fontSize: 12, fontFamily: sFont.mono }}>
        <TrendingDown style={{ width: 14, height: 14 }} /> {pct}%
      </span>;
}

// ── Stat Card ──
function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: sColor.cardBg, border: `1px solid ${sColor.border}`, borderRadius: 8,
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: color ?? sColor.cyan }}>{icon}</span>
        <span style={{ fontFamily: sFont.body, fontSize: 12, color: sColor.textDim, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      </div>
      <div style={{ fontFamily: sFont.heading, fontSize: 28, color: '#fff', letterSpacing: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: sFont.mono, fontSize: 11, color: sColor.textDim }}>{sub}</div>}
    </div>
  );
}

// ── Metric Row ──
function MetricRow({ label, value, avg, unit, icon, color }: {
  label: string; value: number | string | null; avg: number | null; unit?: string;
  icon: React.ReactNode; color?: string;
}) {
  const numVal = typeof value === 'string' ? parseFloat(value) : value;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0', borderBottom: `1px solid ${sColor.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: color ?? sColor.cyan }}>{icon}</span>
        <span style={{ fontFamily: sFont.body, fontSize: 14, color: '#ccc' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily: sFont.mono, fontSize: 14, color: '#fff' }}>
          {numVal !== null && numVal !== undefined ? `${numVal}${unit ?? ''}` : '—'}
        </span>
        <span style={{ fontFamily: sFont.mono, fontSize: 12, color: sColor.textDim }}>
          avg: {avg !== null && avg !== undefined ? `${avg}${unit ?? ''}` : '—'}
        </span>
        <TrendIcon value={numVal ?? null} avg={avg} />
      </div>
    </div>
  );
}

// ── Network Overview ──
function NetworkOverview() {
  const statsQuery = trpc.cloud.getNetworkStats.useQuery();
  const vehicleTypesQuery = trpc.cloud.getVehicleTypes.useQuery();
  const stats = statsQuery.data;
  const types = vehicleTypesQuery.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Network Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <StatCard icon={<Globe style={{ width: 18, height: 18 }} />} label="Total Vehicles" value={stats?.totalVehicles ?? 0} sub="enrolled in network" color={sColor.cyan} />
        <StatCard icon={<Activity style={{ width: 18, height: 18 }} />} label="Active" value={stats?.activeVehicles ?? 0} sub="currently reporting" color={sColor.green} />
        <StatCard icon={<Building2 style={{ width: 18, height: 18 }} />} label="Fleet Vehicles" value={stats?.fleetVehicles ?? 0} sub="from fleet orgs" color={sColor.amber} />
        <StatCard icon={<Car style={{ width: 18, height: 18 }} />} label="Individual" value={stats?.individualVehicles ?? 0} sub="personal vehicles" color={sColor.blue} />
        <StatCard icon={<Database style={{ width: 18, height: 18 }} />} label="Data Points" value={stats?.totalDataPoints ?? 0} sub="snapshots collected" color={sColor.purple} />
        <StatCard icon={<Truck style={{ width: 18, height: 18 }} />} label="Vehicle Types" value={stats?.uniqueVehicleTypes ?? 0} sub="unique platforms" color={sColor.red} />
      </div>

      {/* Vehicle Type Leaderboard */}
      <div style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}`, borderRadius: 8, padding: 20 }}>
        <h3 style={{ fontFamily: sFont.heading, fontSize: 20, color: '#fff', marginBottom: 16, letterSpacing: 1 }}>
          VEHICLE TYPES IN NETWORK
        </h3>
        {types.length === 0 ? (
          <div style={{ fontFamily: sFont.body, fontSize: 14, color: sColor.textDim, textAlign: 'center', padding: 40 }}>
            No vehicles enrolled yet. Be the first to join the cloud network.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {types.map((t, i) => (
              <div key={t.vehicleTypeKey} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: 6,
                background: i % 2 === 0 ? 'transparent' : 'oklch(0.12 0.005 260)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: sFont.mono, fontSize: 12, color: sColor.textDim, width: 24 }}>#{i + 1}</span>
                  <span style={{ fontFamily: sFont.body, fontSize: 14, color: '#fff' }}>{t.vehicleTypeLabel}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <Badge variant="outline" style={{ fontFamily: sFont.mono, fontSize: 11, borderColor: sColor.border }}>
                    {t.vehicleCount} vehicles
                  </Badge>
                  {t.avgMpg && (
                    <span style={{ fontFamily: sFont.mono, fontSize: 12, color: sColor.green }}>
                      {parseFloat(t.avgMpg).toFixed(1)} MPG avg
                    </span>
                  )}
                  {t.avgHealthScore && (
                    <span style={{ fontFamily: sFont.mono, fontSize: 12, color: sColor.cyan }}>
                      {parseFloat(t.avgHealthScore).toFixed(0)} health
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How It Works */}
      <div style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}`, borderRadius: 8, padding: 20 }}>
        <h3 style={{ fontFamily: sFont.heading, fontSize: 20, color: '#fff', marginBottom: 12, letterSpacing: 1 }}>
          HOW THE CLOUD NETWORK WORKS
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
          {[
            { icon: <Shield style={{ width: 20, height: 20 }} />, title: 'OPT-IN & ANONYMOUS', desc: 'You choose what data to share. All data is anonymized — no PII, no VIN, just vehicle type + metrics.' },
            { icon: <Database style={{ width: 20, height: 20 }} />, title: 'REAL SENSOR DATA', desc: 'VOP reads actual vehicle sensors — IAT, MAP, BARO, coolant, oil, EGT, fuel rail — not estimates.' },
            { icon: <BarChart3 style={{ width: 20, height: 20 }} />, title: 'CROWD AVERAGES', desc: 'Data is aggregated by vehicle type. See how YOUR vehicle compares to the real-world average.' },
            { icon: <Building2 style={{ width: 20, height: 20 }} />, title: 'FLEET BENCHMARKING', desc: 'Fleets compare their vehicles against the crowd. Know which vehicles work best based on actual data.' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: 12, borderRadius: 6, background: 'oklch(0.12 0.005 260)' }}>
              <span style={{ color: sColor.cyan, flexShrink: 0, marginTop: 2 }}>{item.icon}</span>
              <div>
                <div style={{ fontFamily: sFont.heading, fontSize: 14, color: '#fff', letterSpacing: 1, marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontFamily: sFont.body, fontSize: 13, color: sColor.textDim, lineHeight: 1.4 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Enrollment Panel ──
function EnrollmentPanel() {
  const { user } = useAuth();
  const enrollmentsQuery = trpc.cloud.getMyEnrollment.useQuery(undefined, { enabled: !!user });
  const enrollMut = trpc.cloud.enroll.useMutation({
    onSuccess: () => { toast.success('Vehicle enrolled in cloud network'); enrollmentsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.cloud.updateEnrollment.useMutation({
    onSuccess: () => { toast.success('Preferences updated'); enrollmentsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const unenrollMut = trpc.cloud.unenroll.useMutation({
    onSuccess: () => { toast.success('Vehicle removed from cloud network'); enrollmentsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    vehicleYear: '', vehicleMake: '', vehicleModel: '', vehicleEngine: '',
    vehicleClass: 'stock', region: '', state: '',
    shareMpg: true, shareHealth: true, sharePerformance: true, shareDtcs: true,
  });

  const enrollments = enrollmentsQuery.data ?? [];

  if (!user) {
    return (
      <div style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}`, borderRadius: 8, padding: 40, textAlign: 'center' }}>
        <Shield style={{ width: 48, height: 48, color: sColor.textDim, margin: '0 auto 16px' }} />
        <div style={{ fontFamily: sFont.heading, fontSize: 22, color: '#fff', marginBottom: 8 }}>SIGN IN TO JOIN</div>
        <div style={{ fontFamily: sFont.body, fontSize: 14, color: sColor.textDim }}>
          Sign in to enroll your vehicles in the cloud network and see how they compare.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Existing Enrollments */}
      {enrollments.length > 0 && (
        <div style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}`, borderRadius: 8, padding: 20 }}>
          <h3 style={{ fontFamily: sFont.heading, fontSize: 20, color: '#fff', marginBottom: 16, letterSpacing: 1 }}>
            MY ENROLLED VEHICLES ({enrollments.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {enrollments.map(e => (
              <div key={e.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: 14, borderRadius: 6, background: 'oklch(0.12 0.005 260)', border: `1px solid ${sColor.border}`,
              }}>
                <div>
                  <div style={{ fontFamily: sFont.body, fontSize: 15, color: '#fff' }}>
                    {e.vehicleYear} {e.vehicleMake} {e.vehicleModel} {e.vehicleEngine ? `(${e.vehicleEngine})` : ''}
                  </div>
                  <div style={{ fontFamily: sFont.mono, fontSize: 11, color: sColor.textDim, marginTop: 4 }}>
                    Type: {e.vehicleTypeKey} · Class: {e.vehicleClass ?? 'stock'}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    {e.shareMpg && <Badge variant="outline" style={{ fontSize: 10, borderColor: sColor.green, color: sColor.green }}>MPG</Badge>}
                    {e.shareHealth && <Badge variant="outline" style={{ fontSize: 10, borderColor: sColor.cyan, color: sColor.cyan }}>HEALTH</Badge>}
                    {e.sharePerformance && <Badge variant="outline" style={{ fontSize: 10, borderColor: sColor.amber, color: sColor.amber }}>PERF</Badge>}
                    {e.shareDtcs && <Badge variant="outline" style={{ fontSize: 10, borderColor: sColor.purple, color: sColor.purple }}>DTCs</Badge>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="outline" size="sm" onClick={() => unenrollMut.mutate({ enrollmentId: e.id })}
                    disabled={unenrollMut.isPending}
                    style={{ fontFamily: sFont.mono, fontSize: 11, borderColor: sColor.red, color: sColor.red }}>
                    <XCircle style={{ width: 14, height: 14, marginRight: 4 }} /> REMOVE
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Enroll New Vehicle */}
      <div style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}`, borderRadius: 8, padding: 20 }}>
        <h3 style={{ fontFamily: sFont.heading, fontSize: 20, color: '#fff', marginBottom: 16, letterSpacing: 1 }}>
          ENROLL A VEHICLE
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: 11, color: sColor.textDim, display: 'block', marginBottom: 4 }}>YEAR</label>
            <Input value={form.vehicleYear} onChange={e => setForm(f => ({ ...f, vehicleYear: e.target.value }))}
              placeholder="2020" style={{ fontFamily: sFont.mono, background: sColor.bg, borderColor: sColor.border }} />
          </div>
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: 11, color: sColor.textDim, display: 'block', marginBottom: 4 }}>MAKE</label>
            <Input value={form.vehicleMake} onChange={e => setForm(f => ({ ...f, vehicleMake: e.target.value }))}
              placeholder="Chevrolet" style={{ fontFamily: sFont.mono, background: sColor.bg, borderColor: sColor.border }} />
          </div>
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: 11, color: sColor.textDim, display: 'block', marginBottom: 4 }}>MODEL</label>
            <Input value={form.vehicleModel} onChange={e => setForm(f => ({ ...f, vehicleModel: e.target.value }))}
              placeholder="Silverado 2500HD" style={{ fontFamily: sFont.mono, background: sColor.bg, borderColor: sColor.border }} />
          </div>
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: 11, color: sColor.textDim, display: 'block', marginBottom: 4 }}>ENGINE</label>
            <Input value={form.vehicleEngine} onChange={e => setForm(f => ({ ...f, vehicleEngine: e.target.value }))}
              placeholder="6.6L Duramax L5P" style={{ fontFamily: sFont.mono, background: sColor.bg, borderColor: sColor.border }} />
          </div>
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: 11, color: sColor.textDim, display: 'block', marginBottom: 4 }}>CLASS</label>
            <select value={form.vehicleClass} onChange={e => setForm(f => ({ ...f, vehicleClass: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', fontFamily: sFont.mono, fontSize: 13, background: sColor.bg, border: `1px solid ${sColor.border}`, borderRadius: 6, color: '#fff' }}>
              <option value="stock">Stock</option>
              <option value="bolt-on">Bolt-On</option>
              <option value="tuned">Tuned</option>
              <option value="built">Built</option>
              <option value="deleted">Deleted</option>
            </select>
          </div>
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: 11, color: sColor.textDim, display: 'block', marginBottom: 4 }}>STATE</label>
            <Input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }))}
              placeholder="TX" maxLength={2} style={{ fontFamily: sFont.mono, background: sColor.bg, borderColor: sColor.border }} />
          </div>
        </div>

        {/* Data Sharing Preferences */}
        <div style={{ marginTop: 20 }}>
          <h4 style={{ fontFamily: sFont.heading, fontSize: 16, color: '#fff', marginBottom: 12, letterSpacing: 1 }}>
            DATA SHARING PREFERENCES
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {[
              { key: 'shareMpg' as const, label: 'Fuel Economy (MPG)', icon: <Fuel style={{ width: 14, height: 14 }} />, color: sColor.green },
              { key: 'shareHealth' as const, label: 'Health Metrics', icon: <Activity style={{ width: 14, height: 14 }} />, color: sColor.cyan },
              { key: 'sharePerformance' as const, label: 'Performance Data', icon: <Zap style={{ width: 14, height: 14 }} />, color: sColor.amber },
              { key: 'shareDtcs' as const, label: 'Diagnostic Codes', icon: <AlertTriangle style={{ width: 14, height: 14 }} />, color: sColor.purple },
            ].map(pref => (
              <div key={pref.key} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: 6, background: 'oklch(0.12 0.005 260)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: pref.color }}>{pref.icon}</span>
                  <span style={{ fontFamily: sFont.body, fontSize: 13, color: '#ccc' }}>{pref.label}</span>
                </div>
                <Switch checked={form[pref.key]} onCheckedChange={v => setForm(f => ({ ...f, [pref.key]: v }))} />
              </div>
            ))}
          </div>
        </div>

        <Button onClick={() => {
          if (!form.vehicleYear || !form.vehicleMake || !form.vehicleModel) {
            toast.error('Year, make, and model are required');
            return;
          }
          enrollMut.mutate({
            vehicleYear: parseInt(form.vehicleYear),
            vehicleMake: form.vehicleMake,
            vehicleModel: form.vehicleModel,
            vehicleEngine: form.vehicleEngine || undefined,
            vehicleClass: form.vehicleClass,
            state: form.state || undefined,
            shareMpg: form.shareMpg,
            shareHealth: form.shareHealth,
            sharePerformance: form.sharePerformance,
            shareDtcs: form.shareDtcs,
          });
        }} disabled={enrollMut.isPending}
          style={{ marginTop: 16, fontFamily: sFont.heading, fontSize: 16, letterSpacing: 1, background: sColor.cyan, color: '#000' }}>
          {enrollMut.isPending ? <Loader2 className="animate-spin" style={{ width: 16, height: 16, marginRight: 6 }} /> : <Cloud style={{ width: 16, height: 16, marginRight: 6 }} />}
          JOIN CLOUD NETWORK
        </Button>
      </div>
    </div>
  );
}

// ── Vehicle Comparison ──
function VehicleComparison() {
  const { user } = useAuth();
  const enrollmentsQuery = trpc.cloud.getMyEnrollment.useQuery(undefined, { enabled: !!user });
  const enrollments = enrollmentsQuery.data ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const activeId = selectedId ?? enrollments[0]?.id ?? null;
  const compareQuery = trpc.cloud.compareMyVehicle.useQuery(
    { enrollmentId: activeId! },
    { enabled: !!activeId }
  );
  const comparison = compareQuery.data;

  if (!user) {
    return (
      <div style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}`, borderRadius: 8, padding: 40, textAlign: 'center' }}>
        <BarChart3 style={{ width: 48, height: 48, color: sColor.textDim, margin: '0 auto 16px' }} />
        <div style={{ fontFamily: sFont.heading, fontSize: 22, color: '#fff', marginBottom: 8 }}>SIGN IN TO COMPARE</div>
        <div style={{ fontFamily: sFont.body, fontSize: 14, color: sColor.textDim }}>
          Enroll your vehicle and see how it stacks up against the real-world average.
        </div>
      </div>
    );
  }

  if (enrollments.length === 0) {
    return (
      <div style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}`, borderRadius: 8, padding: 40, textAlign: 'center' }}>
        <Truck style={{ width: 48, height: 48, color: sColor.textDim, margin: '0 auto 16px' }} />
        <div style={{ fontFamily: sFont.heading, fontSize: 22, color: '#fff', marginBottom: 8 }}>NO VEHICLES ENROLLED</div>
        <div style={{ fontFamily: sFont.body, fontSize: 14, color: sColor.textDim }}>
          Go to the Enroll tab to add your vehicle to the cloud network first.
        </div>
      </div>
    );
  }

  const snap = comparison?.latestSnapshot;
  const avg = comparison?.averages?.allVehicles;
  const fleetAvg = comparison?.averages?.fleetOnly;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Vehicle Selector */}
      {enrollments.length > 1 && (
        <div style={{ display: 'flex', gap: 8 }}>
          {enrollments.map(e => (
            <Button key={e.id} variant={activeId === e.id ? 'default' : 'outline'} size="sm"
              onClick={() => setSelectedId(e.id)}
              style={{ fontFamily: sFont.mono, fontSize: 11, ...(activeId === e.id ? { background: sColor.cyan, color: '#000' } : { borderColor: sColor.border }) }}>
              {e.vehicleYear} {e.vehicleMake} {e.vehicleModel}
            </Button>
          ))}
        </div>
      )}

      {/* Comparison Dashboard */}
      <div style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}`, borderRadius: 8, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontFamily: sFont.heading, fontSize: 20, color: '#fff', letterSpacing: 1 }}>
            YOUR VEHICLE VS FLEET AVERAGE
          </h3>
          {avg && (
            <Badge variant="outline" style={{ fontFamily: sFont.mono, fontSize: 11, borderColor: sColor.cyan, color: sColor.cyan }}>
              {avg.vehicleCount} vehicles in comparison
            </Badge>
          )}
        </div>

        {!snap ? (
          <div style={{ fontFamily: sFont.body, fontSize: 14, color: sColor.textDim, textAlign: 'center', padding: 30 }}>
            No data snapshots yet. VOP will automatically submit data when connected.
          </div>
        ) : (
          <div>
            <MetricRow label="Average MPG" value={snap.avgMpg} avg={avg?.avgMpg ? parseFloat(avg.avgMpg) : null} unit=" mpg"
              icon={<Fuel style={{ width: 14, height: 14 }} />} color={sColor.green} />
            <MetricRow label="Health Score" value={snap.healthScore} avg={avg?.avgHealthScore ? parseFloat(avg.avgHealthScore) : null} unit="/100"
              icon={<Activity style={{ width: 14, height: 14 }} />} color={sColor.cyan} />
            <MetricRow label="Coolant Temp" value={snap.coolantTempF} avg={avg?.avgCoolantTempF ? parseFloat(avg.avgCoolantTempF) : null} unit="°F"
              icon={<Thermometer style={{ width: 14, height: 14 }} />} color={sColor.amber} />
            <MetricRow label="Oil Temp" value={snap.oilTempF} avg={avg?.avgOilTempF ? parseFloat(avg.avgOilTempF) : null} unit="°F"
              icon={<Thermometer style={{ width: 14, height: 14 }} />} color={sColor.amber} />
            <MetricRow label="Trans Temp" value={snap.transTemp} avg={avg?.avgTransTemp ? parseFloat(avg.avgTransTemp) : null} unit="°F"
              icon={<Thermometer style={{ width: 14, height: 14 }} />} color={sColor.red} />
            <MetricRow label="Battery" value={snap.batteryVoltage} avg={avg?.avgBatteryVoltage ? parseFloat(avg.avgBatteryVoltage) : null} unit="V"
              icon={<Zap style={{ width: 14, height: 14 }} />} color={sColor.green} />
            <MetricRow label="Boost" value={snap.boostPsi} avg={avg?.avgBoostPsi ? parseFloat(avg.avgBoostPsi) : null} unit=" psi"
              icon={<Gauge style={{ width: 14, height: 14 }} />} color={sColor.purple} />
            <MetricRow label="EGT" value={snap.egtF} avg={avg?.avgEgtF ? parseFloat(avg.avgEgtF) : null} unit="°F"
              icon={<Thermometer style={{ width: 14, height: 14 }} />} color={sColor.red} />
            <MetricRow label="Active DTCs" value={snap.activeDtcCount} avg={avg?.avgDtcCount ? parseFloat(avg.avgDtcCount) : null}
              icon={<AlertTriangle style={{ width: 14, height: 14 }} />} color={sColor.amber} />
            <MetricRow label="Odometer" value={snap.odometerMiles} avg={avg?.avgOdometerMiles ?? null} unit=" mi"
              icon={<Truck style={{ width: 14, height: 14 }} />} color={sColor.textDim} />
          </div>
        )}
      </div>

      {/* Fleet vs Individual breakdown */}
      {fleetAvg && avg && (
        <div style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}`, borderRadius: 8, padding: 20 }}>
          <h3 style={{ fontFamily: sFont.heading, fontSize: 20, color: '#fff', marginBottom: 16, letterSpacing: 1 }}>
            FLEET VS INDIVIDUAL AVERAGES
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontFamily: sFont.mono, fontSize: 11, color: sColor.textDim, marginBottom: 8 }}>ALL VEHICLES ({avg.vehicleCount})</div>
              <div style={{ fontFamily: sFont.heading, fontSize: 24, color: sColor.cyan }}>{avg.avgMpg ? parseFloat(avg.avgMpg).toFixed(1) : '—'} MPG</div>
              <div style={{ fontFamily: sFont.mono, fontSize: 12, color: sColor.textDim }}>Health: {avg.avgHealthScore ? parseFloat(avg.avgHealthScore).toFixed(0) : '—'}/100</div>
            </div>
            <div>
              <div style={{ fontFamily: sFont.mono, fontSize: 11, color: sColor.textDim, marginBottom: 8 }}>FLEET ONLY ({fleetAvg.fleetVehicleCount})</div>
              <div style={{ fontFamily: sFont.heading, fontSize: 24, color: sColor.amber }}>{fleetAvg.avgMpg ? parseFloat(fleetAvg.avgMpg).toFixed(1) : '—'} MPG</div>
              <div style={{ fontFamily: sFont.mono, fontSize: 12, color: sColor.textDim }}>Health: {fleetAvg.avgHealthScore ? parseFloat(fleetAvg.avgHealthScore).toFixed(0) : '—'}/100</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Fleet Benchmarking ──
function FleetBenchmarking() {
  const bestForFleetQuery = trpc.cloud.getBestForFleet.useQuery();
  const rankings = bestForFleetQuery.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Best for Fleet Rankings */}
      <div style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}`, borderRadius: 8, padding: 20 }}>
        <h3 style={{ fontFamily: sFont.heading, fontSize: 20, color: '#fff', marginBottom: 8, letterSpacing: 1 }}>
          BEST VEHICLES FOR FLEET USE
        </h3>
        <div style={{ fontFamily: sFont.body, fontSize: 13, color: sColor.textDim, marginBottom: 16 }}>
          Rankings based on real-world data from fleet vehicles in the cloud network. No manufacturer specs — actual performance from the field.
        </div>

        {rankings.length === 0 ? (
          <div style={{ fontFamily: sFont.body, fontSize: 14, color: sColor.textDim, textAlign: 'center', padding: 40 }}>
            Not enough fleet data yet. As more fleets join the cloud network, rankings will appear here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rankings.map((r, i) => {
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', borderRadius: 8, border: `1px solid ${sColor.border}`,
                  background: i < 3 ? 'oklch(0.14 0.01 60 / 0.3)' : sColor.cardBg,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontFamily: sFont.heading, fontSize: 20, color: sColor.amber, width: 32, textAlign: 'center' }}>
                      {medal ?? `#${i + 1}`}
                    </span>
                    <div>
                      <div style={{ fontFamily: sFont.body, fontSize: 15, color: '#fff' }}>{r.vehicleTypeLabel}</div>
                      <div style={{ fontFamily: sFont.mono, fontSize: 11, color: sColor.textDim }}>
                        {r.fleetVehicleCount} fleet vehicles · {r.snapshotCount} data points
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: sFont.heading, fontSize: 20, color: sColor.green }}>
                        {r.avgMpg ? parseFloat(r.avgMpg).toFixed(1) : '—'}
                      </div>
                      <div style={{ fontFamily: sFont.mono, fontSize: 10, color: sColor.textDim }}>AVG MPG</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: sFont.heading, fontSize: 20, color: sColor.cyan }}>
                        {r.avgHealthScore ? parseFloat(r.avgHealthScore).toFixed(0) : '—'}
                      </div>
                      <div style={{ fontFamily: sFont.mono, fontSize: 10, color: sColor.textDim }}>HEALTH</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: sFont.heading, fontSize: 20, color: sColor.amber }}>
                        {r.avgOdometerMiles ? (r.avgOdometerMiles / 1000).toFixed(0) + 'K' : '—'}
                      </div>
                      <div style={{ fontFamily: sFont.mono, fontSize: 10, color: sColor.textDim }}>AVG MILES</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Fleet Comparison Info */}
      <div style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}`, borderRadius: 8, padding: 20 }}>
        <h3 style={{ fontFamily: sFont.heading, fontSize: 20, color: '#fff', marginBottom: 12, letterSpacing: 1 }}>
          WHY FLEET BENCHMARKING MATTERS
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {[
            { icon: <TrendingUp style={{ width: 20, height: 20 }} />, title: 'EFFICIENCY COMPARISON', desc: 'Compare your fleet\'s MPG against the network average. Know if your vehicles are performing above or below the crowd.' },
            { icon: <Trophy style={{ width: 20, height: 20 }} />, title: 'PURCHASING DECISIONS', desc: 'See which vehicle types actually perform best in fleet use. Real data from real fleets — not brochure specs.' },
            { icon: <Users style={{ width: 20, height: 20 }} />, title: 'FLEET VS FLEET', desc: 'How does your fleet compare to other fleets running the same vehicles? Identify operational improvements.' },
            { icon: <AlertTriangle style={{ width: 20, height: 20 }} />, title: 'COMMON ISSUES', desc: 'See the most common DTCs for each vehicle type across the network. Know what to watch for before it happens.' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: 12, borderRadius: 6, background: 'oklch(0.12 0.005 260)' }}>
              <span style={{ color: sColor.amber, flexShrink: 0, marginTop: 2 }}>{item.icon}</span>
              <div>
                <div style={{ fontFamily: sFont.heading, fontSize: 14, color: '#fff', letterSpacing: 1, marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontFamily: sFont.body, fontSize: 13, color: sColor.textDim, lineHeight: 1.4 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Top DTC Rankings ──
function DtcRankings() {
  const vehicleTypesQuery = trpc.cloud.getVehicleTypes.useQuery();
  const types = vehicleTypesQuery.data ?? [];
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const activeType = selectedType ?? types[0]?.vehicleTypeKey ?? null;
  const dtcQuery = trpc.cloud.getTopDtcs.useQuery(
    { vehicleTypeKey: activeType! },
    { enabled: !!activeType }
  );
  const dtcData = dtcQuery.data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: sColor.cardBg, border: `1px solid ${sColor.border}`, borderRadius: 8, padding: 20 }}>
        <h3 style={{ fontFamily: sFont.heading, fontSize: 20, color: '#fff', marginBottom: 16, letterSpacing: 1 }}>
          COMMON DTCs BY VEHICLE TYPE
        </h3>

        {/* Vehicle Type Selector */}
        {types.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {types.slice(0, 10).map(t => (
              <Button key={t.vehicleTypeKey} variant={activeType === t.vehicleTypeKey ? 'default' : 'outline'} size="sm"
                onClick={() => setSelectedType(t.vehicleTypeKey)}
                style={{ fontFamily: sFont.mono, fontSize: 11, ...(activeType === t.vehicleTypeKey ? { background: sColor.purple, color: '#fff' } : { borderColor: sColor.border }) }}>
                {t.vehicleTypeLabel}
              </Button>
            ))}
          </div>
        )}

        {!dtcData || dtcData.dtcs.length === 0 ? (
          <div style={{ fontFamily: sFont.body, fontSize: 14, color: sColor.textDim, textAlign: 'center', padding: 30 }}>
            {types.length === 0 ? 'No vehicle types in network yet.' : 'No DTC data available for this vehicle type.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {dtcData.dtcs.map((dtc: { code: string; count: number; pct: number }, i: number) => (
              <div key={dtc.code} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: 6,
                background: i % 2 === 0 ? 'transparent' : 'oklch(0.12 0.005 260)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AlertTriangle style={{ width: 14, height: 14, color: sColor.amber }} />
                  <span style={{ fontFamily: sFont.mono, fontSize: 14, color: '#fff' }}>{dtc.code}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontFamily: sFont.mono, fontSize: 12, color: sColor.textDim }}>{dtc.count} reports</span>
                  <Badge variant="outline" style={{ fontFamily: sFont.mono, fontSize: 11, borderColor: sColor.amber, color: sColor.amber }}>
                    {dtc.pct.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Cloud Content ──
export function CloudContent() {
  const [activeTab, setActiveTab] = useState<CloudTab>('overview');

  const tabs: { id: CloudTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'NETWORK', icon: <Globe style={{ width: 14, height: 14 }} /> },
    { id: 'enroll', label: 'ENROLL', icon: <Cloud style={{ width: 14, height: 14 }} /> },
    { id: 'compare', label: 'MY VEHICLE', icon: <BarChart3 style={{ width: 14, height: 14 }} /> },
    { id: 'fleet', label: 'FLEET RANKINGS', icon: <Trophy style={{ width: 14, height: 14 }} /> },
    { id: 'rankings', label: 'DTCs', icon: <AlertTriangle style={{ width: 14, height: 14 }} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <Cloud style={{ width: 28, height: 28, color: sColor.cyan }} />
        <div>
          <h2 style={{ fontFamily: sFont.heading, fontSize: 28, color: '#fff', letterSpacing: 2, lineHeight: 1 }}>
            CLOUD NETWORK
          </h2>
          <div style={{ fontFamily: sFont.body, fontSize: 13, color: sColor.textDim }}>
            Real-world vehicle analytics powered by the VOP sensor network
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: `1px solid ${sColor.border}`, paddingBottom: 8 }}>
        {tabs.map(t => (
          <Button key={t.id} variant="ghost" size="sm"
            onClick={() => setActiveTab(t.id)}
            style={{
              fontFamily: sFont.mono, fontSize: 12, gap: 6,
              color: activeTab === t.id ? sColor.cyan : sColor.textDim,
              borderBottom: activeTab === t.id ? `2px solid ${sColor.cyan}` : '2px solid transparent',
              borderRadius: 0, paddingBottom: 8,
            }}>
            {t.icon} {t.label}
          </Button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <NetworkOverview />}
      {activeTab === 'enroll' && <EnrollmentPanel />}
      {activeTab === 'compare' && <VehicleComparison />}
      {activeTab === 'fleet' && <FleetBenchmarking />}
      {activeTab === 'rankings' && <DtcRankings />}
    </div>
  );
}

export default function CloudPage() {
  return (
    <div style={{ minHeight: '100vh', background: sColor.bg, padding: '20px 24px' }}>
      <CloudContent />
    </div>
  );
}
