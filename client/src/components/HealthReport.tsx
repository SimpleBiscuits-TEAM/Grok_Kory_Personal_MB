/**
 * PPEI Custom Tuning — HealthReport Component
 * Dark theme: black bg, red/amber/green status indicators
 * Typography: Bebas Neue headings, Rajdhani body, Share Tech Mono for data
 */

import { AlertCircle, CheckCircle, AlertTriangle, Car, Cpu, Wrench, Fuel, Shield, MapPin, Hash, Zap } from "lucide-react";
import { HealthReportData } from "@/lib/healthReport";

interface HealthReportProps {
  report: HealthReportData;
}

function VinRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: '6px 0',
      borderBottom: '1px solid oklch(0.20 0.006 260)'
    }}>
      <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.75rem', color: 'oklch(0.50 0.010 260)', width: '160px', flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.75rem', color: 'oklch(0.80 0.010 260)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

const scoreColor = (score: number) => {
  if (score >= 90) return 'oklch(0.65 0.20 145)';
  if (score >= 75) return 'oklch(0.70 0.18 200)';
  if (score >= 60) return 'oklch(0.75 0.18 60)';
  return 'oklch(0.52 0.22 25)';
};

const statusBorderColor = (status: string) => {
  if (status === 'excellent') return 'oklch(0.65 0.20 145)';
  if (status === 'good') return 'oklch(0.70 0.18 200)';
  if (status === 'fair') return 'oklch(0.75 0.18 60)';
  return 'oklch(0.52 0.22 25)';
};

export default function HealthReport({ report }: HealthReportProps) {
  const v = report.vehicleInfo;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* ── VEHICLE IDENTITY CARD ── */}
      {v && (
        <div style={{
          background: 'oklch(0.13 0.006 260)',
          border: '1px solid oklch(0.22 0.008 260)',
          borderRadius: '3px',
          overflow: 'hidden'
        }}>
          {/* Header banner */}
          <div style={{
            background: 'linear-gradient(135deg, oklch(0.10 0.005 260) 0%, oklch(0.16 0.010 260) 100%)',
            borderBottom: '1px solid oklch(0.22 0.008 260)',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                background: 'oklch(0.52 0.22 25 / 0.15)',
                border: '1px solid oklch(0.52 0.22 25 / 0.4)',
                borderRadius: '3px',
                padding: '8px'
              }}>
                <Car style={{ width: '24px', height: '24px', color: 'oklch(0.52 0.22 25)' }} />
              </div>
              <div>
                <div style={{
                  fontFamily: '"Bebas Neue", "Impact", sans-serif',
                  fontSize: '1.4rem',
                  letterSpacing: '0.06em',
                  color: 'white'
                }}>{v.year} {v.make} {v.model}</div>
                <div style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.55 0.010 260)' }}>
                  {v.series} · {v.trim} · {v.bodyStyle}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.7rem', color: 'oklch(0.45 0.010 260)', letterSpacing: '0.08em', marginBottom: '4px' }}>VIN</div>
              <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.85rem', color: 'oklch(0.70 0.18 200)', letterSpacing: '0.12em' }}>{v.vin}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {/* Engine & Drivetrain */}
            <div style={{ padding: '1rem', borderRight: '1px solid oklch(0.20 0.006 260)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Zap style={{ width: '14px', height: '14px', color: 'oklch(0.52 0.22 25)' }} />
                <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem', letterSpacing: '0.1em', color: 'oklch(0.50 0.010 260)' }}>ENGINE & DRIVETRAIN</span>
              </div>
              <VinRow label="Engine" value={v.engine} />
              <VinRow label="Engine Code" value={v.engineCode} />
              <VinRow label="Displacement" value={v.displacement} />
              <VinRow label="Cylinders" value={`${v.cylinders}-cylinder V8`} />
              <VinRow label="Fuel Type" value={v.fuelType} />
              <VinRow label="Injection System" value={v.injectionSystem} />
              <VinRow label="Max Rail Pressure" value={v.maxRailPressure} />
              <VinRow label="Turbocharger" value={v.turbocharger} />
              <VinRow label="Aftertreatment" value={v.aftertreatment} />
              <VinRow label="Transmission" value={v.transmission} />
              <VinRow label="Trans. Code" value={v.transmissionCode} />
              <VinRow label="Drive Type" value={v.driveType} />
            </div>

            {/* Performance & Capacities */}
            <div style={{ padding: '1rem', borderRight: '1px solid oklch(0.20 0.006 260)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Fuel style={{ width: '14px', height: '14px', color: 'oklch(0.75 0.18 40)' }} />
                <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem', letterSpacing: '0.1em', color: 'oklch(0.50 0.010 260)' }}>PERFORMANCE & CAPACITIES</span>
              </div>
              <VinRow label="Factory Horsepower" value={`${v.factoryHp} HP @ ${v.peakHpRpm} RPM`} />
              <VinRow label="Factory Torque" value={`${v.factoryTorque} lb·ft @ ${v.peakTorqueRpm} RPM`} />
              <VinRow label="Redline" value={`${v.redline} RPM`} />
              <VinRow label="GVWR" value={v.gvwr} />
              <VinRow label="Towing Capacity" value={v.towingCapacity} />
              <VinRow label="Payload Capacity" value={v.payloadCapacity} />
              <VinRow label="Fuel Tank" value={v.fuelTankCapacity} />
              <VinRow label="Oil Capacity" value={v.oilCapacity} />
              <VinRow label="Coolant Capacity" value={v.coolantCapacity} />
              <VinRow label="DEF Tank" value={v.defTankCapacity} />
            </div>

            {/* VIN Decode Breakdown */}
            <div style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Hash style={{ width: '14px', height: '14px', color: 'oklch(0.70 0.18 200)' }} />
                <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem', letterSpacing: '0.1em', color: 'oklch(0.50 0.010 260)' }}>VIN POSITION BREAKDOWN</span>
              </div>
              <div style={{
                background: 'oklch(0.10 0.005 260)',
                border: '1px solid oklch(0.20 0.008 260)',
                borderRadius: '2px',
                padding: '8px 10px',
                marginBottom: '10px'
              }}>
                <div style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.7rem', color: 'oklch(0.45 0.010 260)', marginBottom: '4px' }}>World Manufacturer Identifier (WMI)</div>
                <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.9rem', color: 'oklch(0.70 0.18 200)', fontWeight: 'bold' }}>{v.wmi}</div>
                <div style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.75rem', color: 'oklch(0.60 0.010 260)' }}>{v.manufacturer}</div>
              </div>
              <VinRow label="Pos 1 — Country" value={v.pos1_country} />
              <VinRow label="Pos 2 — Make" value={v.pos2_make} />
              <VinRow label="Pos 3 — Vehicle Type" value={v.pos3_vehicleType} />
              <VinRow label="Pos 4 — GVWR Class" value={v.pos4_gvwr} />
              <VinRow label="Pos 5 — Series" value={v.pos5_series} />
              <VinRow label="Pos 6 — Body Style" value={v.pos6_body} />
              <VinRow label="Pos 7 — Restraint" value={v.pos7_restraint} />
              <VinRow label="Pos 8 — Engine" value={v.pos8_engine} />
              <VinRow label="Pos 9 — Check Digit" value={v.pos9_check} />
              <VinRow label="Pos 10 — Model Year" value={v.pos10_year} />
              <VinRow label="Pos 11 — Plant" value={v.pos11_plant} />
              <VinRow label="Pos 12–17 — Sequence" value={v.pos12_17_sequence} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid oklch(0.20 0.006 260)' }}>
                <MapPin style={{ width: '12px', height: '12px', color: 'oklch(0.45 0.010 260)' }} />
                <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.75rem', color: 'oklch(0.45 0.010 260)' }}>Assembly Plant: {v.plant}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── OVERALL HEALTH SUMMARY ── */}
      <div style={{
        background: 'oklch(0.13 0.006 260)',
        border: '1px solid oklch(0.22 0.008 260)',
        borderLeft: `4px solid ${statusBorderColor(report.overallStatus)}`,
        borderRadius: '3px',
        padding: '1rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {report.overallStatus === 'excellent' && <CheckCircle style={{ width: '40px', height: '40px', color: 'oklch(0.65 0.20 145)', flexShrink: 0 }} />}
          {report.overallStatus === 'good' && <CheckCircle style={{ width: '40px', height: '40px', color: 'oklch(0.70 0.18 200)', flexShrink: 0 }} />}
          {report.overallStatus === 'fair' && <AlertTriangle style={{ width: '40px', height: '40px', color: 'oklch(0.75 0.18 60)', flexShrink: 0 }} />}
          {report.overallStatus === 'poor' && <AlertCircle style={{ width: '40px', height: '40px', color: 'oklch(0.52 0.22 25)', flexShrink: 0 }} />}
          <div>
            <h3 style={{
              fontFamily: '"Bebas Neue", "Impact", sans-serif',
              fontSize: '1.1rem',
              letterSpacing: '0.06em',
              color: 'white',
              margin: 0,
              marginBottom: '4px'
            }}>VEHICLE HEALTH ASSESSMENT</h3>
            <div style={{
              display: 'inline-block',
              background: `${statusBorderColor(report.overallStatus)}22`,
              border: `1px solid ${statusBorderColor(report.overallStatus)}66`,
              borderRadius: '2px',
              padding: '2px 10px',
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: '0.8rem',
              letterSpacing: '0.1em',
              color: statusBorderColor(report.overallStatus),
              marginBottom: '6px'
            }}>
              {report.overallStatus.toUpperCase()}
            </div>
            <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.60 0.010 260)', margin: 0 }}>
              {report.overallStatus === 'excellent' && 'All systems operating optimally. No immediate service required.'}
              {report.overallStatus === 'good' && 'Minor issues detected. Monitor closely and schedule service soon.'}
              {report.overallStatus === 'fair' && 'Service recommended. Address findings before next heavy use.'}
              {report.overallStatus === 'poor' && 'Immediate service required. Do not operate under heavy load.'}
            </p>
            <p style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.7rem', color: 'oklch(0.40 0.008 260)', margin: 0, marginTop: '4px' }}>
              {report.timestamp.toLocaleString()}
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontFamily: '"Bebas Neue", "Impact", sans-serif',
            fontSize: '3.5rem',
            color: scoreColor(report.overallScore),
            lineHeight: 1
          }}>{report.overallScore}</div>
          <div style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.75rem', color: 'oklch(0.45 0.010 260)' }}>/ 100</div>
        </div>
      </div>

      {/* ── SYSTEM SCORES GRID ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
        <SystemScoreCard title="ENGINE" score={report.engineHealth.score} status={report.engineHealth.status} />
        <SystemScoreCard title="FUEL SYSTEM" score={report.fuelSystem.score} status={report.fuelSystem.status} />
        <SystemScoreCard title="TRANSMISSION" score={report.transmission.score} status={report.transmission.status} />
        <SystemScoreCard title="THERMAL MGMT" score={report.thermalManagement.score} status={report.thermalManagement.status} />
      </div>

      {/* ── ENGINE HEALTH ── */}
      <SystemCard icon={<Cpu style={{ width: '16px', height: '16px', color: 'oklch(0.70 0.18 200)' }} />} title="ENGINE HEALTH">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
          <StatusItem label="Turbocharger" status={report.engineHealth.turbochargerStatus} />
          <StatusItem label="EGT Status" status={report.engineHealth.egtStatus} />
          <StatusItem label="MAF Status" status={report.engineHealth.mafStatus} />
        </div>
        <FindingsList findings={report.engineHealth.findings} />
      </SystemCard>

      {/* ── FUEL SYSTEM ── */}
      <SystemCard icon={<Fuel style={{ width: '16px', height: '16px', color: 'oklch(0.75 0.18 40)' }} />} title="FUEL SYSTEM">
        <div style={{ marginBottom: '1rem' }}>
          <StatusItem label="Pressure Regulation" status={report.fuelSystem.pressureRegulation} />
        </div>
        <FindingsList findings={report.fuelSystem.findings} />
      </SystemCard>

      {/* ── TRANSMISSION ── */}
      <SystemCard icon={<Wrench style={{ width: '16px', height: '16px', color: 'oklch(0.70 0.20 300)' }} />} title="TRANSMISSION">
        <div style={{ marginBottom: '1rem' }}>
          <StatusItem label="Converter Slip" status={report.transmission.converterSlipStatus} />
        </div>
        <FindingsList findings={report.transmission.findings} />
      </SystemCard>

      {/* ── THERMAL MANAGEMENT ── */}
      <SystemCard icon={<Shield style={{ width: '16px', height: '16px', color: 'oklch(0.65 0.20 145)' }} />} title="THERMAL MANAGEMENT">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
          <StatusItem label="Oil System" status={report.thermalManagement.oilSystemStatus} />
          <StatusItem label="Cooling System" status={report.thermalManagement.coolingSystemStatus} />
        </div>
        <FindingsList findings={report.thermalManagement.findings} />
      </SystemCard>

      {/* ── DIAGNOSTIC FAULT SUMMARY ── */}
      {report.diagnosticSummary.anyFaultDetected && (
        <div style={{
          background: 'oklch(0.13 0.006 260)',
          border: '1px solid oklch(0.22 0.008 260)',
          borderLeft: '4px solid oklch(0.52 0.22 25)',
          borderRadius: '3px',
          padding: '1rem 1.25rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
            <AlertCircle style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />
            <h3 style={{
              fontFamily: '"Bebas Neue", "Impact", sans-serif',
              fontSize: '1rem',
              letterSpacing: '0.06em',
              color: 'white',
              margin: 0,
              flex: 1
            }}>POTENTIAL FAULT AREA SUMMARY</h3>
            <div style={{
              background: 'oklch(0.52 0.22 25 / 0.15)',
              border: '1px solid oklch(0.52 0.22 25 / 0.4)',
              borderRadius: '2px',
              padding: '2px 10px',
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: '0.75rem',
              letterSpacing: '0.08em',
              color: 'oklch(0.75 0.18 25)'
            }}>
              {report.diagnosticSummary.detectedCodes.length} AREA{report.diagnosticSummary.detectedCodes.length > 1 ? 'S' : ''} DETECTED
            </div>
          </div>
          <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.55 0.010 260)', marginBottom: '1rem' }}>
            The following conditions were detected in the datalog. Use the Diagnostic Code Lookup below for full remedies.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
            {report.diagnosticSummary.p0087Status.includes('DETECTED') && (
              <FaultItem code="P0087" status={report.diagnosticSummary.p0087Status} />
            )}
            {report.diagnosticSummary.p0088Status.includes('DETECTED') && (
              <FaultItem code="P0088" status={report.diagnosticSummary.p0088Status} />
            )}
            {report.diagnosticSummary.p0299Status.includes('DETECTED') && (
              <FaultItem code="P0299" status={report.diagnosticSummary.p0299Status} />
            )}
            {(report.diagnosticSummary.egtStatus.includes('DETECTED') || report.diagnosticSummary.egtStatus.includes('WARNING')) && (
              <FaultItem code="EGT" status={report.diagnosticSummary.egtStatus} />
            )}
            {report.diagnosticSummary.p0101Status.includes('DETECTED') && (
              <FaultItem code="P0101" status={report.diagnosticSummary.p0101Status} />
            )}
            {(report.diagnosticSummary.converterSlipStatus.includes('DETECTED') || report.diagnosticSummary.converterSlipStatus.includes('WARNING')) && (
              <FaultItem code="TCC Slip" status={report.diagnosticSummary.converterSlipStatus} />
            )}
          </div>
        </div>
      )}

      {/* ── RECOMMENDATIONS ── */}
      <div style={{
        background: 'oklch(0.13 0.006 260)',
        border: '1px solid oklch(0.22 0.008 260)',
        borderLeft: '4px solid oklch(0.70 0.18 200)',
        borderRadius: '3px',
        padding: '1rem 1.25rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem' }}>
          <CheckCircle style={{ width: '16px', height: '16px', color: 'oklch(0.70 0.18 200)' }} />
          <h3 style={{
            fontFamily: '"Bebas Neue", "Impact", sans-serif',
            fontSize: '1rem',
            letterSpacing: '0.06em',
            color: 'white',
            margin: 0
          }}>MAINTENANCE RECOMMENDATIONS</h3>
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {report.recommendations.map((rec, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontFamily: '"Rajdhani", sans-serif', fontSize: '0.9rem', color: 'oklch(0.70 0.010 260)' }}>
              <span style={{ color: 'oklch(0.70 0.18 200)', fontWeight: 'bold', flexShrink: 0 }}>→</span>{rec}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SystemCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'oklch(0.13 0.006 260)',
      border: '1px solid oklch(0.22 0.008 260)',
      borderRadius: '3px',
      padding: '1rem 1.25rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid oklch(0.20 0.006 260)' }}>
        {icon}
        <h4 style={{
          fontFamily: '"Bebas Neue", "Impact", sans-serif',
          fontSize: '0.9rem',
          letterSpacing: '0.08em',
          color: 'oklch(0.75 0.010 260)',
          margin: 0
        }}>{title}</h4>
      </div>
      {children}
    </div>
  );
}

function FindingsList({ findings }: { findings: string[] }) {
  return (
    <div style={{ borderTop: '1px solid oklch(0.20 0.006 260)', paddingTop: '0.75rem' }}>
      <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem', letterSpacing: '0.08em', color: 'oklch(0.45 0.010 260)', marginBottom: '6px' }}>FINDINGS:</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {findings.map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.65 0.010 260)' }}>
            <span style={{ color: 'oklch(0.65 0.20 145)', flexShrink: 0 }}>•</span>{f}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SystemScoreCard({ title, score, status }: { title: string; score: number; status: string }) {
  const color = scoreColor(score);
  return (
    <div style={{
      background: 'oklch(0.13 0.006 260)',
      border: '1px solid oklch(0.22 0.008 260)',
      borderTop: `3px solid ${color}`,
      borderRadius: '3px',
      padding: '1rem',
      textAlign: 'center'
    }}>
      <div style={{
        fontFamily: '"Bebas Neue", "Impact", sans-serif',
        fontSize: '2.5rem',
        color,
        lineHeight: 1
      }}>{score}</div>
      <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.8rem', letterSpacing: '0.08em', color: 'oklch(0.65 0.010 260)', marginTop: '4px' }}>{title}</div>
      <div style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.75rem', color: 'oklch(0.45 0.010 260)', marginTop: '2px' }}>{status}</div>
    </div>
  );
}

function StatusItem({ label, status }: { label: string; status: string }) {
  const isNotLogged = status.startsWith('—');
  const isGood = !isNotLogged && (status.includes('✓') || status.toLowerCase().includes('normal') || status.toLowerCase().includes('optimal'));
  const isWarn = status.includes('⚠') || status.toLowerCase().includes('warning');
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
      {isNotLogged ? (
        <span style={{ width: '16px', height: '16px', flexShrink: 0, color: 'oklch(0.40 0.008 260)', fontSize: '0.85rem', fontWeight: 'bold' }}>—</span>
      ) : isGood ? (
        <CheckCircle style={{ width: '16px', height: '16px', color: 'oklch(0.65 0.20 145)', flexShrink: 0, marginTop: '2px' }} />
      ) : isWarn ? (
        <AlertTriangle style={{ width: '16px', height: '16px', color: 'oklch(0.75 0.18 60)', flexShrink: 0, marginTop: '2px' }} />
      ) : (
        <AlertCircle style={{ width: '16px', height: '16px', color: 'oklch(0.52 0.22 25)', flexShrink: 0, marginTop: '2px' }} />
      )}
      <div>
        <div style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', fontWeight: 600, color: isNotLogged ? 'oklch(0.40 0.008 260)' : 'oklch(0.80 0.010 260)' }}>{label}</div>
        <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.72rem', color: isNotLogged ? 'oklch(0.35 0.008 260)' : 'oklch(0.55 0.010 260)' }}>{status}</div>
      </div>
    </div>
  );
}

function FaultItem({ code, status }: { code: string; status: string }) {
  const isCritical = status.includes('✗');
  const borderColor = isCritical ? 'oklch(0.52 0.22 25)' : 'oklch(0.75 0.18 60)';
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      padding: '10px 12px',
      background: 'oklch(0.10 0.005 260)',
      border: `1px solid ${borderColor}44`,
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: '2px'
    }}>
      {isCritical ? (
        <AlertCircle style={{ width: '14px', height: '14px', color: 'oklch(0.52 0.22 25)', flexShrink: 0, marginTop: '2px' }} />
      ) : (
        <AlertTriangle style={{ width: '14px', height: '14px', color: 'oklch(0.75 0.18 60)', flexShrink: 0, marginTop: '2px' }} />
      )}
      <div>
        <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.8rem', fontWeight: 'bold', color: isCritical ? 'oklch(0.75 0.18 25)' : 'oklch(0.80 0.18 60)' }}>{code}</div>
        <div style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.8rem', color: 'oklch(0.60 0.010 260)', marginTop: '2px' }}>
          {status.replace('✗ DETECTED — ', '').replace('⚠ WARNING — ', '')}
        </div>
      </div>
    </div>
  );
}
