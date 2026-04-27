/**
 * V-OP by PPEI — HealthReport Component
 * Dark theme: black bg, red/amber/green status indicators
 * Typography: Bebas Neue headings, Rajdhani body, Share Tech Mono for data
 * Features: Full detailed view + "Quick Rundown" simplified summary toggle
 */

import { useState } from "react";
import { AlertCircle, CheckCircle, AlertTriangle, Car, Cpu, Wrench, Fuel, Shield, MapPin, Hash, Zap, ChevronDown, ChevronRight, Gauge } from "lucide-react";
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
      <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.75rem', color: 'oklch(0.63 0.010 260)', width: '160px', flexShrink: 0 }}>{label}</span>
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

const statusEmoji = (status: string) => {
  if (status === 'excellent') return '🟢';
  if (status === 'good') return '🔵';
  if (status === 'fair') return '🟡';
  return '🔴';
};

/* ── Quick Rundown: simplified one-card summary ── */
function QuickRundown({ report }: { report: HealthReportData }) {
  const v = report.vehicleInfo;
  const faultCount = report.diagnosticSummary.detectedCodes.length;
  const sections = [
    { name: 'Engine', score: report.engineHealth.score, status: report.engineHealth.status },
    { name: 'Fuel System', score: report.fuelSystem.score, status: report.fuelSystem.status },
    { name: 'Transmission', score: report.transmission.score, status: report.transmission.status },
    { name: 'Thermal', score: report.thermalManagement.score, status: report.thermalManagement.status },
  ];

  // Build a plain-English verdict
  const getVerdict = () => {
    if (report.overallScore >= 90) return "Your truck's running strong. No red flags in the log — keep doing what you're doing.";
    if (report.overallScore >= 75) return "Mostly good, but a couple things worth keeping an eye on. Nothing urgent, but don't ignore it.";
    if (report.overallScore >= 60) return "Some areas need attention soon. Schedule a look before your next tow or hard pull.";
    return "Multiple issues detected. Recommend service before any heavy-duty use.";
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, oklch(0.12 0.008 260) 0%, oklch(0.14 0.006 260) 100%)',
      border: `1px solid ${statusBorderColor(report.overallStatus)}44`,
      borderLeft: `4px solid ${statusBorderColor(report.overallStatus)}`,
      borderRadius: '3px',
      padding: '1.25rem 1.5rem',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
        <Gauge style={{ width: '22px', height: '22px', color: statusBorderColor(report.overallStatus) }} />
        <div style={{ flex: 1 }}>
          <h3 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '1.1rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>
            QUICK RUNDOWN
          </h3>
          <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.78rem', color: 'oklch(0.58 0.008 260)', margin: 0 }}>
            The short version — no jargon, just what matters
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '2.8rem', color: scoreColor(report.overallScore), lineHeight: 1 }}>
            {report.overallScore}
          </div>
          <div style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.7rem', color: 'oklch(0.55 0.008 260)' }}>/ 100</div>
        </div>
      </div>

      {/* Vehicle (if available) */}
      {v && (
        <div style={{
          background: 'oklch(0.10 0.005 260)',
          border: '1px solid oklch(0.20 0.008 260)',
          borderRadius: '2px',
          padding: '8px 12px',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <Car style={{ width: '16px', height: '16px', color: 'oklch(0.60 0.010 260)', flexShrink: 0 }} />
          <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.82rem', color: 'oklch(0.75 0.010 260)' }}>
            {v.year} {v.make} {v.model} · {v.engine} · {v.vin}
          </span>
        </div>
      )}

      {/* Plain English Verdict */}
      <div style={{
        background: 'oklch(0.10 0.005 260)',
        border: '1px solid oklch(0.20 0.008 260)',
        borderRadius: '2px',
        padding: '12px 14px',
        marginBottom: '1rem',
      }}>
        <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.95rem', color: 'oklch(0.80 0.010 260)', margin: 0, lineHeight: 1.5 }}>
          {getVerdict()}
        </p>
      </div>

      {/* System Scores — horizontal bar style */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '1rem' }}>
        {sections.map(s => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.78rem', letterSpacing: '0.06em', color: 'oklch(0.65 0.010 260)', width: '100px', flexShrink: 0 }}>
              {s.name.toUpperCase()}
            </span>
            <div style={{ flex: 1, height: '8px', background: 'oklch(0.18 0.005 260)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${s.score}%`, height: '100%', background: scoreColor(s.score), borderRadius: '4px', transition: 'width 0.5s ease' }} />
            </div>
            <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.78rem', color: scoreColor(s.score), width: '30px', textAlign: 'right' }}>
              {s.score}
            </span>
            <span style={{ fontSize: '0.7rem', width: '18px' }}>{statusEmoji(s.status)}</span>
          </div>
        ))}
      </div>

      {/* Fault summary */}
      {faultCount > 0 ? (
        <div style={{
          background: 'oklch(0.52 0.22 25 / 0.08)',
          border: '1px solid oklch(0.52 0.22 25 / 0.25)',
          borderRadius: '2px',
          padding: '10px 14px',
          marginBottom: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <AlertCircle style={{ width: '14px', height: '14px', color: 'oklch(0.52 0.22 25)' }} />
            <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.8rem', letterSpacing: '0.06em', color: 'oklch(0.75 0.18 25)' }}>
              {faultCount} POTENTIAL FAULT AREA{faultCount > 1 ? 'S' : ''} FOUND
            </span>
          </div>
          <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.68 0.010 260)', margin: 0 }}>
            {report.diagnosticSummary.detectedCodes.join(' · ')}
          </p>
        </div>
      ) : (
        <div style={{
          background: 'oklch(0.65 0.20 145 / 0.08)',
          border: '1px solid oklch(0.65 0.20 145 / 0.25)',
          borderRadius: '2px',
          padding: '10px 14px',
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <CheckCircle style={{ width: '14px', height: '14px', color: 'oklch(0.65 0.20 145)' }} />
          <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.88rem', color: 'oklch(0.65 0.20 145)' }}>
            No fault areas detected — looking clean
          </span>
        </div>
      )}

      {/* Top recommendations (max 3) */}
      {report.recommendations.length > 0 && (
        <div>
          <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem', letterSpacing: '0.08em', color: 'oklch(0.55 0.008 260)', marginBottom: '6px' }}>
            TOP ACTIONS:
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {report.recommendations.slice(0, 3).map((rec, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.70 0.010 260)' }}>
                <span style={{ color: 'oklch(0.70 0.18 200)', fontWeight: 'bold', flexShrink: 0 }}>→</span>{rec}
              </li>
            ))}
            {report.recommendations.length > 3 && (
              <li style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.8rem', color: 'oklch(0.55 0.008 260)', paddingLeft: '20px' }}>
                + {report.recommendations.length - 3} more in full report
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function HealthReport({ report }: HealthReportProps) {
  const v = report.vehicleInfo;
  const [basicMode, setBasicMode] = useState(true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* ── BASIC BREAKDOWN / FULL REPORT TOGGLE ── */}
      <div style={{
        display: 'flex',
        gap: '0',
        borderRadius: '4px',
        overflow: 'hidden',
        border: '1px solid oklch(0.28 0.010 260)',
        alignSelf: 'stretch',
      }}>
        <button
          onClick={() => setBasicMode(true)}
          style={{
            flex: 1,
            background: basicMode ? 'oklch(0.52 0.22 25)' : 'oklch(0.14 0.006 260)',
            color: basicMode ? 'white' : 'oklch(0.55 0.010 260)',
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: '0.95rem',
            letterSpacing: '0.08em',
            padding: '10px 20px',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <Gauge style={{ width: '15px', height: '15px' }} />
          BASIC BREAKDOWN
        </button>
        <button
          onClick={() => setBasicMode(false)}
          style={{
            flex: 1,
            background: !basicMode ? 'oklch(0.70 0.18 200)' : 'oklch(0.14 0.006 260)',
            color: !basicMode ? 'white' : 'oklch(0.55 0.010 260)',
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: '0.95rem',
            letterSpacing: '0.08em',
            padding: '10px 20px',
            border: 'none',
            borderLeft: '1px solid oklch(0.22 0.008 260)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <Wrench style={{ width: '15px', height: '15px' }} />
          FULL DETAILED REPORT
        </button>
      </div>

      {basicMode ? (
        <QuickRundown report={report} />
      ) : (
        <>
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
                background: 'linear-gradient(135deg, oklch(0.10 0.005 260) 0%, oklch(0.36 0.010 260) 100%)',
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid oklch(0.22 0.008 260)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Car style={{ width: '24px', height: '24px', color: 'oklch(0.52 0.22 25)' }} />
                  <div>
                    <h3 style={{ fontFamily: '"Bebas Neue", "Impact", sans-serif', fontSize: '1.2rem', letterSpacing: '0.08em', color: 'white', margin: 0 }}>
                      {v.year} {v.make} {v.model}
                    </h3>
                    <p style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.75rem', color: 'oklch(0.65 0.010 260)', margin: 0, letterSpacing: '0.05em' }}>
                      VIN: {v.vin}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem', letterSpacing: '0.08em', color: 'oklch(0.52 0.22 25)' }}>
                    {v.engine}
                  </div>
                  <div style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.75rem', color: 'oklch(0.60 0.010 260)' }}>
                    {v.factoryHp} HP · {v.factoryTorque} lb·ft
                  </div>
                </div>
              </div>

              {/* Detail grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {/* Powertrain & Drivetrain */}
                <div style={{ padding: '1rem', borderRight: '1px solid oklch(0.20 0.006 260)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Cpu style={{ width: '14px', height: '14px', color: 'oklch(0.70 0.18 200)' }} />
                    <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem', letterSpacing: '0.1em', color: 'oklch(0.63 0.010 260)' }}>POWERTRAIN & DRIVETRAIN</span>
                  </div>
                  <VinRow label="Engine Code" value={v.engineCode} />
                  <VinRow label="Displacement" value={v.displacement} />
                  <VinRow label="Fuel Type" value={v.fuelType} />
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
                    <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem', letterSpacing: '0.1em', color: 'oklch(0.63 0.010 260)' }}>PERFORMANCE & CAPACITIES</span>
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
                    <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem', letterSpacing: '0.1em', color: 'oklch(0.63 0.010 260)' }}>VIN POSITION BREAKDOWN</span>
                  </div>
                  <div style={{
                    background: 'oklch(0.10 0.005 260)',
                    border: '1px solid oklch(0.20 0.008 260)',
                    borderRadius: '2px',
                    padding: '8px 10px',
                    marginBottom: '10px'
                  }}>
                    <div style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.7rem', color: 'oklch(0.60 0.010 260)', marginBottom: '4px' }}>World Manufacturer Identifier (WMI)</div>
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
                    <MapPin style={{ width: '12px', height: '12px', color: 'oklch(0.60 0.010 260)' }} />
                    <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.75rem', color: 'oklch(0.60 0.010 260)' }}>Assembly Plant: {v.plant}</span>
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
                <p style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.7rem', color: 'oklch(0.58 0.008 260)', margin: 0, marginTop: '4px' }}>
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
              <div style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.75rem', color: 'oklch(0.60 0.010 260)' }}>/ 100</div>
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
              <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.68 0.010 260)', marginBottom: '1rem' }}>
                The following conditions were analyzed in the datalog. Review the Fault Zone Analysis charts for detailed visualization.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                {report.diagnosticSummary.p0087Status.includes('DETECTED') && (
                  <FaultItem code="Low Rail Pressure" status={report.diagnosticSummary.p0087Status} />
                )}
                {report.diagnosticSummary.highRailStatus.includes('DETECTED') && (
                  <FaultItem code="High Rail Pressure" status={report.diagnosticSummary.highRailStatus} />
                )}
                {report.diagnosticSummary.p0299Status.includes('DETECTED') && (
                  <FaultItem code="Low Boost" status={report.diagnosticSummary.p0299Status} />
                )}
                {(report.diagnosticSummary.egtStatus.includes('DETECTED') || report.diagnosticSummary.egtStatus.includes('WARNING')) && (
                  <FaultItem code="EGT" status={report.diagnosticSummary.egtStatus} />
                )}
                {report.diagnosticSummary.p0101Status.includes('DETECTED') && (
                  <FaultItem code="MAF Idle" status={report.diagnosticSummary.p0101Status} />
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
        </>
      )}
    </div>
  );
}

function SystemCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      background: 'oklch(0.13 0.006 260)',
      border: '1px solid oklch(0.22 0.008 260)',
      borderRadius: '3px',
      padding: '1rem 1.25rem'
    }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          marginBottom: expanded ? '1rem' : 0,
          paddingBottom: expanded ? '0.5rem' : 0,
          borderBottom: expanded ? '1px solid oklch(0.20 0.006 260)' : 'none',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {icon}
        <h4 style={{
          fontFamily: '"Bebas Neue", "Impact", sans-serif',
          fontSize: '0.9rem',
          letterSpacing: '0.08em',
          color: 'oklch(0.75 0.010 260)',
          margin: 0,
          flex: 1,
        }}>{title}</h4>
        {expanded
          ? <ChevronDown style={{ width: '14px', height: '14px', color: 'oklch(0.60 0.010 260)', transition: 'transform 0.15s' }} />
          : <ChevronRight style={{ width: '14px', height: '14px', color: 'oklch(0.60 0.010 260)', transition: 'transform 0.15s' }} />
        }
      </div>
      {expanded && children}
    </div>
  );
}

function FindingsList({ findings }: { findings: string[] }) {
  return (
    <div style={{ borderTop: '1px solid oklch(0.20 0.006 260)', paddingTop: '0.75rem' }}>
      <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem', letterSpacing: '0.08em', color: 'oklch(0.60 0.010 260)', marginBottom: '6px' }}>FINDINGS:</div>
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
      <div style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.75rem', color: 'oklch(0.60 0.010 260)', marginTop: '2px' }}>{status}</div>
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
        <span style={{ width: '16px', height: '16px', flexShrink: 0, color: 'oklch(0.58 0.008 260)', fontSize: '0.85rem', fontWeight: 'bold' }}>—</span>
      ) : isGood ? (
        <CheckCircle style={{ width: '16px', height: '16px', color: 'oklch(0.65 0.20 145)', flexShrink: 0, marginTop: '2px' }} />
      ) : isWarn ? (
        <AlertTriangle style={{ width: '16px', height: '16px', color: 'oklch(0.75 0.18 60)', flexShrink: 0, marginTop: '2px' }} />
      ) : (
        <AlertCircle style={{ width: '16px', height: '16px', color: 'oklch(0.52 0.22 25)', flexShrink: 0, marginTop: '2px' }} />
      )}
      <div>
        <div style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', fontWeight: 600, color: isNotLogged ? 'oklch(0.58 0.008 260)' : 'oklch(0.80 0.010 260)' }}>{label}</div>
        <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.72rem', color: isNotLogged ? 'oklch(0.55 0.008 260)' : 'oklch(0.68 0.010 260)' }}>{status}</div>
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
