/**
 * PPEI Custom Tuning — Engine Reference Panel
 * Dark theme: black bg, red/amber/cyan accents
 * Typography: Bebas Neue headings, Rajdhani body, Share Tech Mono for data
 */

import { useState } from 'react';
import { L5P_SPECS, ECU_PARAMETERS, DTC_DEFINITIONS } from '@/lib/ecuReference';
import {
  Cpu, Gauge, Zap, ChevronDown, ChevronRight, BookOpen, Settings2, AlertTriangle, Info,
} from 'lucide-react';

interface EcuReferencePanelProps {
  className?: string;
}

const categoryColors: Record<string, string> = {
  fuel_rail: 'oklch(0.70 0.18 200)',
  boost_turbo: 'oklch(0.75 0.18 40)',
  exhaust_thermal: 'oklch(0.52 0.22 25)',
  airflow: 'oklch(0.65 0.20 145)',
  transmission: 'oklch(0.70 0.20 300)',
  engine_speed: 'oklch(0.65 0.20 145)',
  engine_load: 'oklch(0.75 0.18 60)',
  thermal: 'oklch(0.70 0.18 200)',
};

const categoryLabels: Record<string, string> = {
  fuel_rail: 'Fuel Rail',
  boost_turbo: 'Boost/Turbo',
  exhaust_thermal: 'Exhaust',
  airflow: 'Airflow',
  transmission: 'Transmission',
  engine_speed: 'Engine Speed',
  engine_load: 'Engine Load',
  thermal: 'Thermal',
};

const severityColors: Record<string, string> = {
  critical: 'oklch(0.52 0.22 25)',
  warning: 'oklch(0.75 0.18 60)',
  info: 'oklch(0.70 0.18 200)',
};

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: '5px 0',
      borderBottom: '1px solid oklch(0.20 0.006 260)'
    }}>
      <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.75rem', color: 'oklch(0.50 0.010 260)', width: '160px', flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.75rem', color: 'oklch(0.80 0.010 260)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function ParameterCard({ paramKey }: { paramKey: string }) {
  const param = ECU_PARAMETERS[paramKey];
  const [expanded, setExpanded] = useState(false);
  const catColor = categoryColors[param.category] || 'oklch(0.55 0.010 260)';
  const catLabel = categoryLabels[param.category] || param.category;

  return (
    <div
      style={{
        background: 'oklch(0.13 0.006 260)',
        border: '1px solid oklch(0.22 0.008 260)',
        borderLeft: `3px solid ${catColor}`,
        borderRadius: '3px',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 0.15s'
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: expanded ? 'oklch(0.15 0.007 260)' : 'transparent' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{
            padding: '2px 8px',
            borderRadius: '2px',
            fontFamily: '"Rajdhani", sans-serif',
            fontSize: '0.7rem',
            fontWeight: 600,
            background: `${catColor}22`,
            border: `1px solid ${catColor}44`,
            color: catColor,
            flexShrink: 0
          }}>{catLabel}</span>
          <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', fontWeight: 600, color: 'oklch(0.80 0.010 260)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{param.displayName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '8px' }}>
          <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.72rem', color: 'oklch(0.45 0.010 260)' }}>{param.unit}</span>
          {expanded
            ? <ChevronDown style={{ width: '16px', height: '16px', color: 'oklch(0.45 0.010 260)' }} />
            : <ChevronRight style={{ width: '16px', height: '16px', color: 'oklch(0.45 0.010 260)' }} />
          }
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '10px 12px', background: 'oklch(0.11 0.005 260)', borderTop: '1px solid oklch(0.20 0.006 260)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.65 0.010 260)', margin: 0, lineHeight: 1.6 }}>{param.description}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ background: 'oklch(0.14 0.006 260)', border: '1px solid oklch(0.22 0.008 260)', borderRadius: '2px', padding: '8px' }}>
              <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.65rem', letterSpacing: '0.08em', color: 'oklch(0.45 0.010 260)', marginBottom: '4px' }}>INTERNAL VARIABLE</div>
              <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.75rem', color: 'oklch(0.70 0.18 200)', wordBreak: 'break-all' }}>{param.internalName}</div>
            </div>
            {param.ecuAddress && (
              <div style={{ background: 'oklch(0.14 0.006 260)', border: '1px solid oklch(0.22 0.008 260)', borderRadius: '2px', padding: '8px' }}>
                <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.65rem', letterSpacing: '0.08em', color: 'oklch(0.45 0.010 260)', marginBottom: '4px' }}>ECU ADDRESS</div>
                <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.75rem', color: 'oklch(0.65 0.010 260)' }}>{param.ecuAddress}</div>
              </div>
            )}
          </div>
          {(param.normalMin !== undefined || param.normalMax !== undefined) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              {param.normalMin !== undefined && (
                <div style={{ background: 'oklch(0.65 0.20 145 / 0.1)', border: '1px solid oklch(0.65 0.20 145 / 0.3)', borderRadius: '2px', padding: '6px', textAlign: 'center' }}>
                  <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.65rem', letterSpacing: '0.06em', color: 'oklch(0.65 0.20 145)' }}>NORMAL MIN</div>
                  <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '1.1rem', color: 'oklch(0.75 0.20 145)' }}>{param.normalMin}</div>
                  <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.65rem', color: 'oklch(0.50 0.010 260)' }}>{param.unit}</div>
                </div>
              )}
              {param.normalMax !== undefined && (
                <div style={{ background: 'oklch(0.65 0.20 145 / 0.1)', border: '1px solid oklch(0.65 0.20 145 / 0.3)', borderRadius: '2px', padding: '6px', textAlign: 'center' }}>
                  <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.65rem', letterSpacing: '0.06em', color: 'oklch(0.65 0.20 145)' }}>NORMAL MAX</div>
                  <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '1.1rem', color: 'oklch(0.75 0.20 145)' }}>{param.normalMax}</div>
                  <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.65rem', color: 'oklch(0.50 0.010 260)' }}>{param.unit}</div>
                </div>
              )}
              {param.critMax !== undefined && (
                <div style={{ background: 'oklch(0.52 0.22 25 / 0.1)', border: '1px solid oklch(0.52 0.22 25 / 0.3)', borderRadius: '2px', padding: '6px', textAlign: 'center' }}>
                  <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.65rem', letterSpacing: '0.06em', color: 'oklch(0.75 0.18 25)' }}>CRITICAL MAX</div>
                  <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '1.1rem', color: 'oklch(0.75 0.18 25)' }}>{param.critMax}</div>
                  <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.65rem', color: 'oklch(0.50 0.010 260)' }}>{param.unit}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DtcCard({ dtc }: { dtc: (typeof DTC_DEFINITIONS)[0] }) {
  const [expanded, setExpanded] = useState(false);
  const sevColor = severityColors[dtc.severity] || 'oklch(0.55 0.010 260)';

  return (
    <div
      style={{
        background: 'oklch(0.13 0.006 260)',
        border: '1px solid oklch(0.22 0.008 260)',
        borderLeft: `3px solid ${sevColor}`,
        borderRadius: '3px',
        overflow: 'hidden',
        cursor: 'pointer'
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: expanded ? 'oklch(0.15 0.007 260)' : 'transparent' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.85rem', fontWeight: 'bold', color: 'white' }}>{dtc.code}</span>
          <span style={{
            padding: '1px 8px',
            borderRadius: '2px',
            fontFamily: '"Rajdhani", sans-serif',
            fontSize: '0.7rem',
            fontWeight: 600,
            letterSpacing: '0.05em',
            background: `${sevColor}22`,
            border: `1px solid ${sevColor}44`,
            color: sevColor
          }}>{dtc.severity.toUpperCase()}</span>
          <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.75rem', color: 'oklch(0.50 0.010 260)' }}>{dtc.system}</span>
        </div>
        {expanded
          ? <ChevronDown style={{ width: '16px', height: '16px', color: 'oklch(0.45 0.010 260)', flexShrink: 0 }} />
          : <ChevronRight style={{ width: '16px', height: '16px', color: 'oklch(0.45 0.010 260)', flexShrink: 0 }} />
        }
      </div>
      {expanded && (
        <div style={{ padding: '10px 12px', background: 'oklch(0.11 0.005 260)', borderTop: '1px solid oklch(0.20 0.006 260)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h4 style={{ fontFamily: '"Bebas Neue", "Impact", sans-serif', fontSize: '0.9rem', letterSpacing: '0.05em', color: 'white', margin: 0 }}>{dtc.title}</h4>
          <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.65 0.010 260)', margin: 0, lineHeight: 1.6 }}>{dtc.description}</p>
          {dtc.thresholds && (
            <div style={{ background: 'oklch(0.70 0.18 200 / 0.08)', border: '1px solid oklch(0.70 0.18 200 / 0.25)', borderRadius: '2px', padding: '8px 10px' }}>
              <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.65rem', letterSpacing: '0.08em', color: 'oklch(0.70 0.18 200)', marginBottom: '4px' }}>TRIGGER THRESHOLDS</div>
              <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.78rem', color: 'oklch(0.75 0.010 260)' }}>{dtc.thresholds}</div>
            </div>
          )}
          {dtc.causes && dtc.causes.length > 0 && (
            <div>
              <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.65rem', letterSpacing: '0.08em', color: 'oklch(0.75 0.18 40)', marginBottom: '6px' }}>COMMON CAUSES</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {dtc.causes.map((c, i) => (
                  <li key={i} style={{ display: 'flex', gap: '6px', fontFamily: '"Rajdhani", sans-serif', fontSize: '0.82rem', color: 'oklch(0.60 0.010 260)' }}>
                    <span style={{ color: 'oklch(0.75 0.18 40)', flexShrink: 0 }}>•</span>{c}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {dtc.remedies && dtc.remedies.length > 0 && (
            <div>
              <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.65rem', letterSpacing: '0.08em', color: 'oklch(0.65 0.20 145)', marginBottom: '6px' }}>RECOMMENDED REMEDIES</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {dtc.remedies.map((r, i) => (
                  <li key={i} style={{ display: 'flex', gap: '6px', fontFamily: '"Rajdhani", sans-serif', fontSize: '0.82rem', color: 'oklch(0.60 0.010 260)' }}>
                    <span style={{ color: 'oklch(0.65 0.20 145)', flexShrink: 0 }}>✓</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ background: 'oklch(0.14 0.006 260)', border: '1px solid oklch(0.22 0.008 260)', borderRadius: '2px', padding: '6px 10px' }}>
            <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.65rem', letterSpacing: '0.08em', color: 'oklch(0.40 0.008 260)', marginBottom: '3px' }}>INTERNAL ID</div>
            <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.72rem', color: 'oklch(0.55 0.010 260)' }}>{dtc.internalId}</div>
          </div>
        </div>
      )}
    </div>
  );
}

type TabKey = 'specs' | 'parameters' | 'dtcs' | 'subsystems';

export default function EcuReferencePanel({ className = '' }: EcuReferencePanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('specs');

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'specs', label: 'ENGINE SPECS', icon: <Gauge style={{ width: '12px', height: '12px' }} /> },
    { key: 'parameters', label: 'PARAMETERS', icon: <Settings2 style={{ width: '12px', height: '12px' }} /> },
    { key: 'dtcs', label: 'FAULT CODES', icon: <AlertTriangle style={{ width: '12px', height: '12px' }} /> },
    { key: 'subsystems', label: 'SUBSYSTEMS', icon: <BookOpen style={{ width: '12px', height: '12px' }} /> },
  ];

  return (
    <div style={{
      background: 'oklch(0.13 0.006 260)',
      border: '1px solid oklch(0.22 0.008 260)',
      borderRadius: '3px',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.25rem',
        borderBottom: '1px solid oklch(0.20 0.006 260)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          background: 'oklch(0.70 0.18 200)',
          borderRadius: '3px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Cpu style={{ width: '18px', height: '18px', color: 'white' }} />
        </div>
        <div>
          <h3 style={{ fontFamily: '"Bebas Neue", "Impact", sans-serif', fontSize: '1rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>
            ENGINE REFERENCE DATABASE
          </h3>
          <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.8rem', color: 'oklch(0.50 0.010 260)', margin: 0 }}>
            GM OBD Documentation · 2017–2023 Duramax L5P · Cross-referenced with GM TechLink &amp; TSBs
          </p>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid oklch(0.20 0.006 260)',
        background: 'oklch(0.11 0.005 260)'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: '10px 8px',
              fontFamily: '"Bebas Neue", "Impact", sans-serif',
              fontSize: '0.75rem',
              letterSpacing: '0.08em',
              border: 'none',
              borderBottom: `2px solid ${activeTab === tab.key ? 'oklch(0.52 0.22 25)' : 'transparent'}`,
              background: activeTab === tab.key ? 'oklch(0.13 0.006 260)' : 'transparent',
              color: activeTab === tab.key ? 'white' : 'oklch(0.50 0.010 260)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s'
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ padding: '1rem 1.25rem' }}>
        {activeTab === 'specs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Zap style={{ width: '16px', height: '16px', color: 'oklch(0.52 0.22 25)' }} />
              <h3 style={{ fontFamily: '"Bebas Neue", "Impact", sans-serif', fontSize: '1rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>{L5P_SPECS.engine.name}</h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <h4 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.72rem', letterSpacing: '0.1em', color: 'oklch(0.45 0.010 260)', marginBottom: '8px' }}>ENGINE CONFIGURATION</h4>
                <div style={{ background: 'oklch(0.11 0.005 260)', border: '1px solid oklch(0.20 0.008 260)', borderRadius: '2px', padding: '10px 12px' }}>
                  <SpecRow label="Displacement" value={L5P_SPECS.engine.displacement} />
                  <SpecRow label="Configuration" value={L5P_SPECS.engine.configuration} />
                  <SpecRow label="Bore × Stroke" value={`${L5P_SPECS.engine.bore} × ${L5P_SPECS.engine.stroke}`} />
                  <SpecRow label="Compression" value={L5P_SPECS.engine.compressionRatio} />
                  <SpecRow label="Injection" value={L5P_SPECS.engine.injectionSystem} />
                  <SpecRow label="Max Rail Pressure" value={L5P_SPECS.engine.maxRailPressure} />
                  <SpecRow label="Turbocharger" value={L5P_SPECS.engine.turbocharger} />
                  <SpecRow label="Intercooler" value={L5P_SPECS.engine.intercooler} />
                  <SpecRow label="Aftertreatment" value={L5P_SPECS.engine.aftertreatment} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <h4 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.72rem', letterSpacing: '0.1em', color: 'oklch(0.45 0.010 260)', marginBottom: '8px' }}>PERFORMANCE (STOCK)</h4>
                  <div style={{ background: 'oklch(0.11 0.005 260)', border: '1px solid oklch(0.20 0.008 260)', borderRadius: '2px', padding: '10px 12px' }}>
                    <SpecRow label="Peak Horsepower" value={`${L5P_SPECS.performance.stockHp} HP @ ${L5P_SPECS.performance.peakHpRpm} RPM`} />
                    <SpecRow label="Peak Torque" value={`${L5P_SPECS.performance.stockTorque} lb·ft @ ${L5P_SPECS.performance.peakTorqueRpm} RPM`} />
                    <SpecRow label="Redline" value={`${L5P_SPECS.performance.redline} RPM`} />
                    <SpecRow label="Idle Speed" value={`${L5P_SPECS.performance.idleRpm} RPM (warm)`} />
                    <SpecRow label="Max Boost (Stock)" value={`~${L5P_SPECS.performance.maxBoostStock} psi`} />
                  </div>
                </div>

                <div>
                  <h4 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.72rem', letterSpacing: '0.1em', color: 'oklch(0.45 0.010 260)', marginBottom: '8px' }}>OPERATING LIMITS</h4>
                  <div style={{ background: 'oklch(0.11 0.005 260)', border: '1px solid oklch(0.20 0.008 260)', borderRadius: '2px', padding: '10px 12px' }}>
                    <SpecRow label="EGT Warning" value={`>${L5P_SPECS.operatingLimits.maxEgt1_F}°F (sustained >5s)`} />
                    <SpecRow label="EGT Sensor Fail" value={`>${L5P_SPECS.operatingLimits.maxEgt1_stuck_F}°F (stuck = disconnected)`} />
                    <SpecRow label="Max Rail Pressure" value={`${L5P_SPECS.operatingLimits.maxRailPressure_psi.toLocaleString()} psi`} />
                    <SpecRow label="MAF Idle (Normal)" value={`~${L5P_SPECS.operatingLimits.mafIdleNormal_gs} g/s (clean filter)`} />
                    <SpecRow label="MAF Idle (Range)" value={`${L5P_SPECS.operatingLimits.mafIdleMin_lbMin}–${L5P_SPECS.operatingLimits.mafIdleMax_lbMin} lb/min`} />
                    <SpecRow label="MAF at WOT (Stock)" value={`~${L5P_SPECS.operatingLimits.mafMaxLoad_lbMin} lb/min`} />
                    <SpecRow label="TCC Slip Warning" value={`>±${L5P_SPECS.operatingLimits.tccSlipWarning_rpm} RPM`} />
                    <SpecRow label="DPF Regen Trigger" value={`~${L5P_SPECS.operatingLimits.dpfRegenTrigger_pct}% soot`} />
                    <SpecRow label="DPF Service Regen" value={`${L5P_SPECS.operatingLimits.dpfServiceRegen_pct}% soot`} />
                  </div>
                </div>
              </div>
            </div>

            {/* Data Source Banner */}
            <div style={{ background: 'oklch(0.70 0.18 200 / 0.08)', border: '1px solid oklch(0.70 0.18 200 / 0.25)', borderRadius: '2px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Info style={{ width: '14px', height: '14px', color: 'oklch(0.70 0.18 200)' }} />
                <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem', letterSpacing: '0.08em', color: 'oklch(0.70 0.18 200)' }}>DATA SOURCE</span>
              </div>
              <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.82rem', color: 'oklch(0.60 0.010 260)', margin: 0, lineHeight: 1.6 }}>
                All parameter definitions, operating limits, and diagnostic thresholds are derived from the
                Duramax engine management database, cross-referenced with official GM TechLink
                bulletins, GDS2 service data, TSBs, and real-world scan logs from DuramaxForum. Thresholds
                may vary slightly by calibration year and software update.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'parameters' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.50 0.010 260)', margin: 0, marginBottom: '4px' }}>
              Click any parameter to expand its definition, internal variable name, ECU address, and operating thresholds.
            </p>
            {Object.keys(ECU_PARAMETERS).map((key) => (
              <ParameterCard key={key} paramKey={key} />
            ))}
          </div>
        )}

        {activeTab === 'dtcs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.50 0.010 260)', margin: 0, marginBottom: '4px' }}>
              Click any fault code to expand its description, causes, and recommended remedies.
            </p>
            {DTC_DEFINITIONS.map((dtc) => (
              <DtcCard key={dtc.code} dtc={dtc} />
            ))}
          </div>
        )}

        {activeTab === 'subsystems' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.50 0.010 260)', margin: 0, marginBottom: '4px' }}>
              ECU software subsystem descriptions from the Duramax engine management system.
            </p>
            {Object.entries(L5P_SPECS.subsystems).map(([key, desc]) => (
              <div key={key} style={{
                background: 'oklch(0.13 0.006 260)',
                border: '1px solid oklch(0.22 0.008 260)',
                borderLeft: '3px solid oklch(0.70 0.18 200)',
                borderRadius: '3px',
                padding: '10px 12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{
                    fontFamily: '"Share Tech Mono", monospace',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                    color: 'oklch(0.70 0.18 200)',
                    background: 'oklch(0.70 0.18 200 / 0.12)',
                    border: '1px solid oklch(0.70 0.18 200 / 0.3)',
                    padding: '2px 8px',
                    borderRadius: '2px'
                  }}>{key}</span>
                  <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', fontWeight: 600, color: 'oklch(0.75 0.010 260)' }}>
                    {key === 'FRPR' && 'Fuel Rail Pressure Regulation'}
                    {key === 'BSTR' && 'Boost Pressure Regulation'}
                    {key === 'EGTR' && 'Exhaust Gas Temperature Monitoring'}
                    {key === 'MAFR' && 'Mass Airflow Regulation'}
                    {key === 'SPDR' && 'Speed / Idle Control'}
                    {key === 'AICR' && 'Air Intake Control'}
                    {key === 'DPFR' && 'DPF Regeneration Control'}
                    {key === 'SCRR' && 'SCR / DEF System'}
                  </span>
                </div>
                <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.60 0.010 260)', margin: 0, lineHeight: 1.6 }}>{desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
