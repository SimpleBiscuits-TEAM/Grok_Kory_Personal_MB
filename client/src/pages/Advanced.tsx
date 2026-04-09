/**
 * PPEI Advanced Mode — Beta Development Area
 * Full-featured diagnostic platform with:
 *   - LLM-powered AI Diagnostic Chat
 *   - a2L calibration file parser & viewer
 *   - Multi-vehicle knowledge base (L5P, LML, LBZ, LLY, LB7, LS/LT)
 *   - Full-text search across SAE J1979, J1979-2, GM Mode 6, OBD-II PIDs
 *   - Complete datalog analyzer (merged from normal mode)
 *   - Access gated behind sign-in + PPEI approval (no legacy passcode)
 */

import React, { useState, useMemo, useCallback, useRef, useEffect, Fragment } from 'react';
import {
  Search, Lock, ArrowLeft, Database, BookOpen,
  Hash, Terminal, ChevronDown, ChevronRight, X, Zap,
  FileText, Activity, AlertCircle, Clock, ShieldX, Users,
  Layers, Info, Brain, Upload, Loader2, Gauge, Cpu,
  BarChart3, Flag, Car, MessageSquare, FileCode2, CheckCircle, FileDown,
  Radio, Wrench, Key, Settings, Inbox, Fuel, Truck, ShieldCheck, MapPin,
  CloudSun, Trophy, Cloud
} from 'lucide-react';
import { useLocation } from 'wouter';
import { getSearchEngine, SearchResult, QueryIntent } from '@/lib/searchEngine';
import {
  OBD_PIDS, OBD_SERVICES, GM_MODE6_MONITORS, UDS_SERVICE_MAPPING,
  READINESS_GROUPS, KBCategory
} from '@/lib/knowledgeBase';
import { VEHICLE_PLATFORMS, getVehiclePlatform, VehiclePlatform, VehicleDTC } from '@/lib/vehicleKnowledgeBase';
import { parseA2L, searchA2L, a2lToSearchContext, A2LParseResult, A2LMeasurement, A2LCharacteristic } from '@/lib/a2lParser';
import { trpc } from '@/lib/trpc';
import type { Message } from '@/components/AIChatBox';
import { SpeechToTextButton } from '@/components/SpeechToTextButton';

// Normal mode imports for merged analyzer
import { parseCSV, processData, downsampleData, createBinnedData, ProcessedMetrics } from '@/lib/dataProcessor';
import { analyzeDiagnostics, DiagnosticReport } from '@/lib/diagnostics';
import { runReasoningEngine, ReasoningReport } from '@/lib/reasoningEngine';
import { generateHealthReport, HealthReportData } from '@/lib/healthReport';
import { extractVinFromFilename, decodeVinNhtsa } from '@/lib/vinLookup';
import { analyzeDragRuns, DragAnalysis } from '@/lib/dragAnalyzer';
import { generateHealthReportPdf } from '@/lib/healthReportPdf';
import { DynoHPChart, DynoChartHandle, BoostEfficiencyChart, RailPressureFaultChart, BoostFaultChart, EgtFaultChart, MafFaultChart, TccFaultChart, VgtFaultChart, RegulatorFaultChart, CoolantFaultChart, IdleRpmFaultChart, ConverterStallChart } from '@/components/DynoCharts';
import { StatsSummary, RPMvMAFChart, HPvsRPMChart, TimeSeriesChart } from '@/components/Charts';
import { DiagnosticReportComponent } from '@/components/DiagnosticReport';
import HealthReport from '@/components/HealthReport';
import DtcSearch from '@/components/DtcSearch';
import EcuReferencePanel from '@/components/EcuReferencePanel';
import { ReasoningPanel } from '@/components/ReasoningPanel';
import PidAuditPanel from '@/components/PidAuditPanel';
import DragTimeslip from '@/components/DragTimeslip';
import { usePdfExport } from '@/hooks/usePdfExport';
import DataloggerPanel from '@/components/DataloggerPanel';
import BinaryUploadPanel from '@/components/BinaryUploadPanel';
import FlashContainerPanel from '@/components/FlashContainerPanel';
import CalibrationEditor from '@/pages/CalibrationEditor';
import IntelliSpy from '@/components/IntelliSpy';
import VehicleCoding from '@/components/VehicleCoding';
import CanAmVinChanger from '@/components/CanAmVinChanger';
import ServiceProcedures from '@/components/ServiceProcedures';
import QAChecklistPanel from '@/components/QAChecklistPanel';
import AdminNotificationPanel from '@/components/AdminNotificationPanel';
import NotificationPrefsPanel from '@/components/NotificationPrefsPanel';
import VoiceCommandButton from '@/components/VoiceCommandButton';
import OffsetCalibrationPanel from '@/components/OffsetCalibrationPanel';
import CompareView from '@/components/CompareView';
import ReverseEngineeringPanel from '@/components/ReverseEngineeringPanel';
import SupportAdminPanel from '@/components/SupportAdminPanel';
import UserManagementPanel from '@/components/UserManagementPanel';
import GeofencePanel from '@/components/GeofencePanel';
import HondaTalonTuner from '@/components/HondaTalonTuner';
import KnoxDiagnosticAgent from '@/components/KnoxDiagnosticAgent';
import { WP8ParseResult } from '@/lib/wp8Parser';
import { useAuth } from '@/_core/hooks/useAuth';
import { APP_VERSION } from '@/lib/version';

import PpeiHeader from '@/components/PpeiHeader';

// Lazy-load Pitch and Tasks panels (moved from top-level nav to Advanced tabs)
const PitchPanel = React.lazy(() => import('@/pages/Pitch').then(m => ({ default: m.PitchContent })));
const StratPanel = React.lazy(() => import('@/pages/Strat').then(m => ({ default: m.StratContent })));
const TasksPanel = React.lazy(() => import('@/pages/Tasks').then(m => ({ default: m.TasksContent })));
// Lazy-load Fleet and Drag panels (moved from top-level nav to Advanced tabs)
const FleetPanel = React.lazy(() => import('@/pages/Fleet').then(m => ({ default: m.FleetContent })));
const CompetitionPanel = React.lazy(() => import('@/pages/Competition').then(m => ({ default: m.CompetitionContent })));
const WeatherPanel = React.lazy(() => import('@/pages/Weather').then(m => ({ default: m.WeatherContent })));
const CloudPanel = React.lazy(() => import('@/pages/Cloud').then(m => ({ default: m.CloudContent })));

const PPEI_LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663472908899/S5fEZ6uPndYXxpVXwwyEPy/PPEI Logo _b0d26c0f.png';

// ─── Shared Styles ──────────────────────────────────────────────────────────

const sFont = { heading: '"Bebas Neue", "Impact", sans-serif', body: '"Rajdhani", sans-serif', mono: '"Share Tech Mono", monospace' };
const sColor = {
  bg: 'oklch(0.10 0.005 260)', bgDark: 'oklch(0.08 0.004 260)', bgCard: 'oklch(0.33 0.006 260)',
  bgInput: 'oklch(0.30 0.005 260)', border: 'oklch(0.22 0.008 260)', borderLight: 'oklch(0.18 0.006 260)',
  red: 'oklch(0.52 0.22 25)', green: 'oklch(0.65 0.20 145)', blue: 'oklch(0.70 0.18 200)',
  yellow: 'oklch(0.75 0.18 60)', text: 'oklch(0.95 0.005 260)', textDim: 'oklch(0.68 0.010 260)',
  textMuted: 'oklch(0.58 0.008 260)',
};

// ─── Category Config ────────────────────────────────────────────────────────

const categoryConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pid: { label: 'PID', color: sColor.blue, icon: <Hash style={{ width: 10, height: 10 }} /> },
  mode6: { label: 'Mode 6', color: sColor.green, icon: <Activity style={{ width: 10, height: 10 }} /> },
  standard: { label: 'Standard', color: sColor.yellow, icon: <BookOpen style={{ width: 10, height: 10 }} /> },
  dtc: { label: 'DTC', color: sColor.red, icon: <AlertCircle style={{ width: 10, height: 10 }} /> },
};

const relevanceColors: Record<string, string> = {
  exact: sColor.green, high: sColor.blue, medium: sColor.yellow, low: sColor.textMuted,
};

// ─── Search Result Card ─────────────────────────────────────────────────────

function ResultCard({ result, isExpanded, onToggle }: { result: SearchResult; isExpanded: boolean; onToggle: () => void }) {
  const doc = result.document;
  const cat = categoryConfig[doc.category] || categoryConfig.standard;
  return (
    <div className="ppei-card-hover" style={{
      background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderLeft: `4px solid ${cat.color}`,
      borderRadius: '3px', marginBottom: '8px', cursor: 'pointer', transition: 'all 0.15s',
    }} onClick={onToggle}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ marginTop: '2px', flexShrink: 0 }}>
          {isExpanded ? <ChevronDown style={{ width: 16, height: 16, color: sColor.textDim }} /> : <ChevronRight style={{ width: 16, height: 16, color: sColor.textDim }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '2px', fontFamily: sFont.body, fontSize: '0.7rem', fontWeight: 600, background: `${cat.color}22`, border: `1px solid ${cat.color}44`, color: cat.color }}>
              {cat.icon} {cat.label.toUpperCase()}
            </span>
            <span style={{ padding: '2px 6px', borderRadius: '2px', fontFamily: sFont.mono, fontSize: '0.65rem', background: `${relevanceColors[result.relevanceLabel]}22`, border: `1px solid ${relevanceColors[result.relevanceLabel]}44`, color: relevanceColors[result.relevanceLabel] }}>
              {result.relevanceLabel.toUpperCase()}
            </span>
          </div>
          <h3 style={{ fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.05em', color: 'white', margin: 0, lineHeight: 1.3 }}>{doc.title}</h3>
          {!isExpanded && <p style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, margin: '4px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.snippet}</p>}
        </div>
        <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textMuted, flexShrink: 0 }}>{result.score.toFixed(1)}</div>
      </div>
      {isExpanded && (
        <div style={{ borderTop: `1px solid oklch(0.20 0.008 260)`, padding: '16px', background: 'oklch(0.11 0.005 260)' }}>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: 'oklch(0.75 0.010 260)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{doc.content}</div>
          <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: `1px solid ${sColor.borderLight}`, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: sFont.body, fontSize: '0.72rem', color: sColor.textMuted }}>Source: {doc.source}</span>
            {doc.metadata && Object.entries(doc.metadata).map(([key, val]) => (
              <span key={key} style={{ fontFamily: sFont.mono, fontSize: '0.65rem', padding: '1px 6px', background: 'oklch(0.16 0.006 260)', border: `1px solid ${sColor.border}`, borderRadius: '2px', color: 'oklch(0.60 0.010 260)' }}>{key}: {val}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section Header ─────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: '1rem', borderLeft: `4px solid ${sColor.red}`, marginBottom: '1rem' }}>
      {icon}
      <h2 style={{ fontFamily: sFont.heading, fontSize: '1.4rem', letterSpacing: '0.08em', color: 'white', margin: 0 }}>{title}</h2>
    </div>
  );
}

// ─── PID Reference Panel ────────────────────────────────────────────────────

function PidReferencePanel() {
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    if (!filter) return OBD_PIDS;
    const q = filter.toLowerCase();
    return OBD_PIDS.filter(p => p.description.toLowerCase().includes(q) || p.pidHex.toLowerCase().includes(q) || (p.units || '').toLowerCase().includes(q) || (p.formula || '').toLowerCase().includes(q));
  }, [filter]);
  return (
    <div>
      <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter PIDs..."
        style={{ width: '100%', padding: '10px 14px', fontFamily: sFont.mono, fontSize: '0.85rem', background: sColor.bgInput, border: `1px solid oklch(0.25 0.008 260)`, borderRadius: '3px', color: 'white', outline: 'none', marginBottom: '12px', boxSizing: 'border-box' }} />
      <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: sFont.mono, fontSize: '0.78rem' }}>
          <thead><tr style={{ borderBottom: `2px solid oklch(0.25 0.008 260)` }}>
            <th style={{ padding: '8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, letterSpacing: '0.06em', fontSize: '0.85rem' }}>PID</th>
            <th style={{ padding: '8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, letterSpacing: '0.06em', fontSize: '0.85rem' }}>DESCRIPTION</th>
            <th style={{ padding: '8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, letterSpacing: '0.06em', fontSize: '0.85rem' }}>RANGE</th>
            <th style={{ padding: '8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, letterSpacing: '0.06em', fontSize: '0.85rem' }}>FORMULA</th>
          </tr></thead>
          <tbody>{filtered.map((pid) => (
            <tr key={pid.pidHex} style={{ borderBottom: `1px solid ${sColor.borderLight}` }}>
              <td style={{ padding: '6px 8px', color: sColor.blue, fontWeight: 600 }}>${pid.pidHex}</td>
              <td style={{ padding: '6px 8px', color: 'oklch(0.80 0.010 260)', fontFamily: sFont.body, fontSize: '0.82rem' }}>{pid.description}</td>
              <td style={{ padding: '6px 8px', color: 'oklch(0.60 0.010 260)', whiteSpace: 'nowrap' }}>{pid.minValue && pid.maxValue ? `${pid.minValue}..${pid.maxValue} ${pid.units || ''}` : pid.notes ? pid.notes.substring(0, 30) : '-'}</td>
              <td style={{ padding: '6px 8px', color: sColor.green }}>{pid.formula || '-'}</td>
            </tr>
          ))}</tbody>
        </table>
        {filtered.length === 0 && <p style={{ textAlign: 'center', padding: '2rem', color: sColor.textMuted, fontFamily: sFont.body }}>No PIDs match your filter</p>}
      </div>
    </div>
  );
}

// ─── Mode 6 Panel ───────────────────────────────────────────────────────────

function Mode6Panel() {
  const [filter, setFilter] = useState('');
  const grouped = useMemo(() => {
    const groups: Record<string, typeof GM_MODE6_MONITORS> = {};
    for (const m of GM_MODE6_MONITORS) {
      const key = `${m.obdmid}-${m.obdmidName}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    }
    if (!filter) return groups;
    const q = filter.toLowerCase();
    const filtered: Record<string, typeof GM_MODE6_MONITORS> = {};
    for (const [key, monitors] of Object.entries(groups)) {
      const matching = monitors.filter(m => m.description.toLowerCase().includes(q) || m.obdmid.toLowerCase().includes(q) || m.obdmidName.toLowerCase().includes(q) || m.testId.toLowerCase().includes(q));
      if (matching.length > 0) filtered[key] = matching;
    }
    return filtered;
  }, [filter]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setExpanded(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  return (
    <div>
      <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter monitors (e.g. boost, EGR, misfire, 85)..."
        style={{ width: '100%', padding: '10px 14px', fontFamily: sFont.mono, fontSize: '0.85rem', background: sColor.bgInput, border: `1px solid oklch(0.25 0.008 260)`, borderRadius: '3px', color: 'white', outline: 'none', marginBottom: '12px', boxSizing: 'border-box' }} />
      <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
        {Object.entries(grouped).map(([key, monitors]) => {
          const isOpen = expanded.has(key);
          const first = monitors[0];
          return (
            <div key={key} style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid oklch(0.20 0.008 260)`, borderLeft: `3px solid ${sColor.green}`, borderRadius: '3px', marginBottom: '6px' }}>
              <div onClick={() => toggleGroup(key)} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                {isOpen ? <ChevronDown style={{ width: 14, height: 14, color: sColor.textDim, flexShrink: 0 }} /> : <ChevronRight style={{ width: 14, height: 14, color: sColor.textDim, flexShrink: 0 }} />}
                <span style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.green, fontWeight: 600 }}>${first.obdmid}</span>
                <span style={{ fontFamily: sFont.heading, fontSize: '0.9rem', letterSpacing: '0.04em', color: 'white', flex: 1 }}>{first.obdmidName}</span>
                <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textMuted }}>{monitors.length} tests</span>
              </div>
              {isOpen && (
                <div style={{ borderTop: `1px solid ${sColor.borderLight}`, padding: '8px 14px 12px' }}>
                  {monitors.map((m, idx) => (
                    <div key={idx} style={{ padding: '6px 0', borderBottom: idx < monitors.length - 1 ? `1px solid oklch(0.16 0.006 260)` : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.blue }}>TID ${m.testId}</span>
                        <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted }}>UASID ${m.uasid}</span>
                      </div>
                      <p style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: 'oklch(0.80 0.010 260)', margin: 0 }}>{m.description}</p>
                      <div style={{ display: 'flex', gap: '16px', marginTop: '2px' }}>
                        <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: 'oklch(0.63 0.010 260)' }}>Range: {m.range}</span>
                        <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: 'oklch(0.63 0.010 260)' }}>Res: {m.resolution}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── UDS Panel ──────────────────────────────────────────────────────────────

function UDSPanel() {
  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontFamily: sFont.heading, fontSize: '1.2rem', letterSpacing: '0.06em', color: 'white', marginBottom: '4px' }}>J1979 TO UDS SERVICE MAPPING</h3>
        <p style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: sColor.textDim }}>How classic OBD-II modes map to Unified Diagnostic Services (ISO 14229)</p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: sFont.mono, fontSize: '0.78rem' }}>
          <thead><tr style={{ borderBottom: `2px solid oklch(0.25 0.008 260)` }}>
            <th style={{ padding: '8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.85rem' }}>CLASSIC</th>
            <th style={{ padding: '8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.85rem' }}>DESCRIPTION</th>
            <th style={{ padding: '8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.85rem' }}>UDS SERVICE</th>
            <th style={{ padding: '8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.85rem' }}>NOTES</th>
          </tr></thead>
          <tbody>{UDS_SERVICE_MAPPING.map((svc) => (
            <tr key={svc.classicMode} style={{ borderBottom: `1px solid ${sColor.borderLight}` }}>
              <td style={{ padding: '8px', color: sColor.yellow, fontWeight: 600 }}>{svc.classicMode}</td>
              <td style={{ padding: '8px', color: 'oklch(0.80 0.010 260)', fontFamily: sFont.body, fontSize: '0.82rem' }}>{svc.classicDesc}</td>
              <td style={{ padding: '8px', color: sColor.green }}>{svc.udsService}</td>
              <td style={{ padding: '8px', color: 'oklch(0.60 0.010 260)', fontFamily: sFont.body, fontSize: '0.78rem' }}>{svc.notes}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div style={{ marginTop: '24px' }}>
        <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.06em', color: 'white', marginBottom: '12px' }}>READINESS GROUPS — COMPRESSION IGNITION (DIESEL)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '8px' }}>
          {READINESS_GROUPS.compressionIgnition.map((g) => (
            <div key={g.name} style={{ padding: '10px 14px', background: 'oklch(0.11 0.005 260)', border: `1px solid oklch(0.20 0.008 260)`, borderLeft: `3px solid ${sColor.green}`, borderRadius: '3px' }}>
              <div style={{ fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.04em', color: 'white', marginBottom: '4px' }}>{g.name.toUpperCase()}</div>
              <div style={{ fontFamily: sFont.body, fontSize: '0.78rem', color: sColor.textDim }}>{g.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── OBD Services Panel ─────────────────────────────────────────────────────

function OBDServicesPanel() {
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {OBD_SERVICES.map((svc) => (
        <div key={svc.mode} style={{ padding: '14px 16px', background: 'oklch(0.11 0.005 260)', border: `1px solid oklch(0.20 0.008 260)`, borderLeft: `3px solid ${sColor.yellow}`, borderRadius: '3px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ fontFamily: sFont.mono, fontSize: '0.85rem', color: sColor.yellow, fontWeight: 600 }}>{svc.hex}</span>
            <span style={{ fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.04em', color: 'white' }}>{svc.description.toUpperCase()}</span>
          </div>
          <p style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: 'oklch(0.60 0.010 260)', margin: 0, lineHeight: 1.5 }}>{svc.detail}</p>
        </div>
      ))}
    </div>
  );
}

// ─── AI Diagnostic Chat Panel ───────────────────────────────────────────────

function AIChatPanel({ a2lData }: { a2lData: A2LParseResult | null }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chatMutation = trpc.diagnostic.chat.useMutation();

  const engine = useMemo(() => getSearchEngine(), []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: content.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    // Build knowledge context from search results
    const { results } = engine.search(content);
    const topResults = results.slice(0, 5);
    const knowledgeContext = topResults.length > 0
      ? topResults.map(r => `[${r.document.category.toUpperCase()}] ${r.document.title}\n${r.document.content}`).join('\n\n---\n\n')
      : undefined;

    const a2lContext = a2lData ? a2lToSearchContext(a2lData) : undefined;

    try {
      const result = await chatMutation.mutateAsync({
        messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        knowledgeContext,
        a2lContext,
      });
      setMessages([...newMessages, { role: 'assistant', content: result.response }]);
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Failed to get response. Please try again.'}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, engine, a2lData, chatMutation]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const suggestedPrompts = [
    'What does DTC P0087 mean on a diesel truck?',
    'Explain the difference between CP3 and CP4 fuel pumps',
    'How do I interpret Mode 6 boost pressure test results?',
    'What are normal injector balance rates for an LML?',
    'My boost is 5 PSI below commanded at high RPM. What should I check?',
    'Explain UDS ReadDataByIdentifier vs classic Mode $01',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '600px' }}>
      {/* Messages area */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', background: 'oklch(0.09 0.004 260)', borderRadius: '3px 3px 0 0', border: `1px solid ${sColor.border}`, borderBottom: 'none' }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <Brain style={{ width: 48, height: 48, color: sColor.red, margin: '0 auto 16px', opacity: 0.6 }} />
            <h3 style={{ fontFamily: sFont.heading, fontSize: '1.3rem', letterSpacing: '0.08em', color: 'oklch(0.63 0.010 260)', marginBottom: '8px' }}>V-OP AI DIAGNOSTIC ASSISTANT</h3>
            <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textMuted, maxWidth: '500px', margin: '0 auto 24px' }}>
              Ask diagnostic questions about any vehicle — diesel, gas, or powersports. OBD-II PIDs, DTCs, Mode 6 data, UDS services, tuning parameters, and more. The AI has access to the full V-OP knowledge base.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '8px', maxWidth: '700px', margin: '0 auto' }}>
              {suggestedPrompts.map((prompt, i) => (
                <button key={i} onClick={() => sendMessage(prompt)} style={{
                  padding: '10px 14px', background: 'oklch(0.12 0.006 260)', border: `1px solid ${sColor.border}`,
                  borderRadius: '3px', color: sColor.textDim, fontFamily: sFont.body, fontSize: '0.8rem',
                  textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s', lineHeight: 1.4,
                }}
                  onMouseEnter={e => { (e.currentTarget).style.borderColor = sColor.red; (e.currentTarget).style.color = 'white'; }}
                  onMouseLeave={e => { (e.currentTarget).style.borderColor = sColor.border; (e.currentTarget).style.color = sColor.textDim; }}
                >{prompt}</button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {messages.filter(m => m.role !== 'system').map((msg, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: msg.role === 'user' ? 'flex-start' : 'flex-start' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '3px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: msg.role === 'user' ? `${sColor.blue}22` : `${sColor.red}22`,
                  border: `1px solid ${msg.role === 'user' ? `${sColor.blue}44` : `${sColor.red}44`}`,
                }}>
                  {msg.role === 'user'
                    ? <MessageSquare style={{ width: 14, height: 14, color: sColor.blue }} />
                    : <Brain style={{ width: 14, height: 14, color: sColor.red }} />
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: sFont.heading, fontSize: '0.75rem', letterSpacing: '0.06em', color: msg.role === 'user' ? sColor.blue : sColor.red, marginBottom: '4px' }}>
                    {msg.role === 'user' ? 'YOU' : 'PPEI AI'}
                  </div>
                  <div style={{
                    fontFamily: sFont.body, fontSize: '0.88rem', color: 'oklch(0.85 0.010 260)', lineHeight: 1.6,
                    background: msg.role === 'user' ? 'oklch(0.12 0.006 260)' : 'oklch(0.31 0.005 260)',
                    border: `1px solid ${sColor.borderLight}`, borderRadius: '3px', padding: '12px',
                  }}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-invert prose-sm max-w-none" style={{ fontFamily: sFont.body, fontSize: '0.88rem' }} dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`(.*?)`/g, '<code style="background:oklch(0.16 0.006 260);padding:1px 4px;border-radius:2px;font-family:Share Tech Mono,monospace;font-size:0.82rem">$1</code>') }} />
                    ) : msg.content}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '3px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${sColor.red}22`, border: `1px solid ${sColor.red}44` }}>
                  <Brain style={{ width: 14, height: 14, color: sColor.red }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.borderLight}`, borderRadius: '3px' }}>
                  <Loader2 style={{ width: 16, height: 16, color: sColor.red, animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: sColor.textDim }}>Analyzing...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {/* Input area */}
      <div style={{ padding: '12px', background: 'oklch(0.12 0.006 260)', border: `1px solid ${sColor.border}`, borderRadius: '0 0 3px 3px', display: 'flex', gap: '8px' }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
          placeholder="Ask a diagnostic question..."
          rows={2}
          style={{
            flex: 1, padding: '10px 14px', fontFamily: sFont.body, fontSize: '0.88rem', background: sColor.bgInput,
            border: `1px solid oklch(0.25 0.008 260)`, borderRadius: '3px', color: 'white', outline: 'none', resize: 'none',
          }}
        />
        <SpeechToTextButton
          onTranscript={(text) => setInput(prev => prev ? prev + ' ' + text : text)}
          disabled={isLoading}
          variant="dark"
        />
        <button onClick={() => sendMessage(input)} disabled={!input.trim() || isLoading} style={{
          padding: '10px 20px', background: input.trim() && !isLoading ? sColor.red : 'oklch(0.25 0.008 260)',
          color: 'white', fontFamily: sFont.heading, fontSize: '0.9rem', letterSpacing: '0.08em',
          border: 'none', borderRadius: '3px', cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.15s',
        }}>
          {isLoading ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> : <MessageSquare style={{ width: 16, height: 16 }} />}
          SEND
        </button>
      </div>
    </div>
  );
}

// ─── a2L Viewer Panel ───────────────────────────────────────────────────────

function A2LPanel({ a2lData, setA2lData }: { a2lData: A2LParseResult | null; setA2lData: (d: A2LParseResult | null) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [viewTab, setViewTab] = useState<'measurements' | 'characteristics'>('measurements');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const content = await file.text();
      const result = parseA2L(content, file.name);
      setA2lData(result);

      // Add a2L documents to search engine
      const engine = getSearchEngine();
      const docs = result.measurements.slice(0, 100).map(m => ({
        id: `a2l-m-${m.name}`,
        title: `a2L Measurement: ${m.name}`,
        source: `a2L File: ${file.name}`,
        category: 'pid' as KBCategory,
        tags: ['a2l', 'measurement', m.name.toLowerCase(), m.longIdentifier.toLowerCase()],
        content: `${m.name}: ${m.longIdentifier}\nType: ${m.dataType}\nRange: ${m.lowerLimit} to ${m.upperLimit}${m.unit ? ' ' + m.unit : ''}\nConversion: ${m.conversionMethod}`,
      }));
      engine.addDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse a2L file');
    } finally {
      setLoading(false);
    }
  }, [setA2lData]);

  const filteredData = useMemo(() => {
    if (!a2lData) return null;
    if (!filter) return { measurements: a2lData.measurements.slice(0, 100), characteristics: a2lData.characteristics.slice(0, 100) };
    return searchA2L(a2lData, filter);
  }, [a2lData, filter]);

  if (!a2lData) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <FileCode2 style={{ width: 48, height: 48, color: 'oklch(0.50 0.008 260)', margin: '0 auto 16px' }} />
        <h3 style={{ fontFamily: sFont.heading, fontSize: '1.3rem', letterSpacing: '0.08em', color: 'oklch(0.63 0.010 260)', marginBottom: '8px' }}>A2L CALIBRATION FILE VIEWER</h3>
        <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textMuted, maxWidth: '500px', margin: '0 auto 24px' }}>
          Upload an ASAP2 (.a2l) calibration file to browse measurements, characteristics, and conversion methods. Data will be cross-referenced with the AI assistant.
        </p>
        <input ref={fileInputRef} type="file" accept=".a2l,.A2L,*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} disabled={loading} style={{
          background: loading ? 'oklch(0.35 0.010 260)' : sColor.red, color: 'white', fontFamily: sFont.heading,
          fontSize: '1.1rem', letterSpacing: '0.1em', padding: '12px 32px', borderRadius: '3px', border: 'none',
          cursor: loading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px',
        }}>
          {loading ? <><Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />PARSING...</> : <><Upload style={{ width: 16, height: 16 }} />UPLOAD A2L FILE</>}
        </button>
        {error && <p style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: sColor.red, marginTop: '12px' }}>{error}</p>}
      </div>
    );
  }

  return (
    <div>
      {/* File info */}
      <div style={{ background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderLeft: `4px solid ${sColor.green}`, borderRadius: '3px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <p style={{ fontFamily: sFont.mono, fontSize: '0.85rem', color: 'white', fontWeight: 600, margin: 0 }}>{a2lData.fileName}</p>
          <p style={{ fontFamily: sFont.body, fontSize: '0.78rem', color: sColor.textDim, margin: 0 }}>
            {a2lData.stats.totalMeasurements} measurements · {a2lData.stats.totalCharacteristics} characteristics · {a2lData.stats.totalCompuMethods} conversion methods · Parsed in {a2lData.parseTime}ms
          </p>
        </div>
        <button onClick={() => { setA2lData(null); setFilter(''); }} style={{ background: 'transparent', color: sColor.textDim, fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.06em', padding: '6px 12px', border: `1px solid ${sColor.border}`, borderRadius: '3px', cursor: 'pointer' }}>
          NEW FILE
        </button>
      </div>

      {/* Filter + tabs */}
      <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search measurements & characteristics..."
        style={{ width: '100%', padding: '10px 14px', fontFamily: sFont.mono, fontSize: '0.85rem', background: sColor.bgInput, border: `1px solid oklch(0.25 0.008 260)`, borderRadius: '3px', color: 'white', outline: 'none', marginBottom: '12px', boxSizing: 'border-box' }} />

      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
        {(['measurements', 'characteristics'] as const).map(tab => (
          <button key={tab} onClick={() => setViewTab(tab)} style={{
            padding: '8px 16px', fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.06em',
            color: viewTab === tab ? 'white' : sColor.textDim, background: viewTab === tab ? 'oklch(0.16 0.008 260)' : 'transparent',
            border: 'none', borderBottom: viewTab === tab ? `2px solid ${sColor.red}` : '2px solid transparent', cursor: 'pointer',
          }}>{tab.toUpperCase()} ({viewTab === tab && filteredData ? (tab === 'measurements' ? filteredData.measurements.length : filteredData.characteristics.length) : (tab === 'measurements' ? a2lData.stats.totalMeasurements : a2lData.stats.totalCharacteristics)})</button>
        ))}
      </div>

      {/* Data table */}
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {viewTab === 'measurements' && filteredData && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: sFont.mono, fontSize: '0.75rem' }}>
            <thead><tr style={{ borderBottom: `2px solid oklch(0.25 0.008 260)` }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.8rem' }}>NAME</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.8rem' }}>DESCRIPTION</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.8rem' }}>RANGE</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.8rem' }}>TYPE</th>
            </tr></thead>
            <tbody>{filteredData.measurements.map((m) => (
              <tr key={m.name} style={{ borderBottom: `1px solid ${sColor.borderLight}` }}>
                <td style={{ padding: '5px 8px', color: sColor.blue, fontWeight: 600, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</td>
                <td style={{ padding: '5px 8px', color: 'oklch(0.75 0.010 260)', fontFamily: sFont.body, fontSize: '0.78rem' }}>{m.longIdentifier}</td>
                <td style={{ padding: '5px 8px', color: 'oklch(0.60 0.010 260)', whiteSpace: 'nowrap' }}>{m.lowerLimit}..{m.upperLimit}{m.unit ? ` ${m.unit}` : ''}</td>
                <td style={{ padding: '5px 8px', color: sColor.textMuted }}>{m.dataType}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {viewTab === 'characteristics' && filteredData && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: sFont.mono, fontSize: '0.75rem' }}>
            <thead><tr style={{ borderBottom: `2px solid oklch(0.25 0.008 260)` }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.8rem' }}>NAME</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.8rem' }}>DESCRIPTION</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.8rem' }}>TYPE</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.8rem' }}>RANGE</th>
            </tr></thead>
            <tbody>{filteredData.characteristics.map((c) => (
              <tr key={c.name} style={{ borderBottom: `1px solid ${sColor.borderLight}` }}>
                <td style={{ padding: '5px 8px', color: sColor.green, fontWeight: 600, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</td>
                <td style={{ padding: '5px 8px', color: 'oklch(0.75 0.010 260)', fontFamily: sFont.body, fontSize: '0.78rem' }}>{c.longIdentifier}</td>
                <td style={{ padding: '5px 8px', color: sColor.yellow }}>{c.type}</td>
                <td style={{ padding: '5px 8px', color: 'oklch(0.60 0.010 260)', whiteSpace: 'nowrap' }}>{c.lowerLimit}..{c.upperLimit}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Vehicle Explorer Panel ─────────────────────────────────────────────────

function VehiclePanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dtcExpanded, setDtcExpanded] = useState<Set<string>>(new Set());
  const selected = selectedId ? getVehiclePlatform(selectedId) : null;

  const toggleDtc = (code: string) => setDtcExpanded(prev => { const n = new Set(prev); if (n.has(code)) n.delete(code); else n.add(code); return n; });

  const severityColor = (s: string) => s === 'critical' ? sColor.red : s === 'moderate' ? sColor.yellow : sColor.blue;

  if (!selected) {
    return (
      <div>
        <h3 style={{ fontFamily: sFont.heading, fontSize: '1.2rem', letterSpacing: '0.06em', color: 'white', marginBottom: '16px' }}>VEHICLE PLATFORM DATABASE</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          {VEHICLE_PLATFORMS.map(p => (
            <div key={p.id} onClick={() => setSelectedId(p.id)} className="ppei-card-hover" style={{
              background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderTop: `3px solid ${p.fuelType === 'diesel' ? sColor.red : sColor.blue}`,
              borderRadius: '3px', padding: '16px', cursor: 'pointer', transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Car style={{ width: 20, height: 20, color: p.fuelType === 'diesel' ? sColor.red : sColor.blue }} />
                <div>
                  <h4 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>{p.name.toUpperCase()}</h4>
                  <p style={{ fontFamily: sFont.mono, fontSize: '0.72rem', color: sColor.textDim, margin: 0 }}>{p.years} · {p.displacement}</p>
                </div>
              </div>
              <p style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: 'oklch(0.60 0.010 260)', margin: 0, lineHeight: 1.5 }}>
                {p.description.substring(0, 120)}...
              </p>
              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textMuted }}>{p.commonDTCs.length} DTCs</span>
                <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textMuted }}>{p.specificPIDs.length} PIDs</span>
                <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: p.fuelType === 'diesel' ? sColor.red : sColor.blue }}>{p.fuelType.toUpperCase()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => setSelectedId(null)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: sColor.textDim, fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.06em', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>
        <ArrowLeft style={{ width: 14, height: 14 }} /> ALL VEHICLES
      </button>

      {/* Platform header */}
      <div style={{ background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderLeft: `4px solid ${selected.fuelType === 'diesel' ? sColor.red : sColor.blue}`, borderRadius: '3px', padding: '20px', marginBottom: '20px' }}>
        <h2 style={{ fontFamily: sFont.heading, fontSize: '1.6rem', letterSpacing: '0.08em', color: 'white', margin: '0 0 4px 0' }}>{selected.name.toUpperCase()}</h2>
        <p style={{ fontFamily: sFont.mono, fontSize: '0.82rem', color: sColor.textDim, margin: '0 0 12px 0' }}>{selected.years} · {selected.displacement} · {selected.engineCode}</p>
        <p style={{ fontFamily: sFont.body, fontSize: '0.88rem', color: 'oklch(0.70 0.010 260)', margin: 0, lineHeight: 1.6 }}>{selected.description}</p>
      </div>

      {/* Key specs */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.06em', color: 'white', marginBottom: '10px' }}>KEY SPECIFICATIONS</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px' }}>
          {Object.entries(selected.keySpecs).map(([k, v]) => (
            <div key={k} style={{ padding: '8px 12px', background: 'oklch(0.11 0.005 260)', border: `1px solid oklch(0.20 0.008 260)`, borderRadius: '3px', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontFamily: sFont.body, fontSize: '0.78rem', color: sColor.textDim }}>{k}</span>
              <span style={{ fontFamily: sFont.mono, fontSize: '0.78rem', color: 'white', textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Common DTCs */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.06em', color: 'white', marginBottom: '10px' }}>COMMON DIAGNOSTIC TROUBLE CODES</h3>
        {selected.commonDTCs.map(dtc => (
          <div key={dtc.code} style={{ background: 'oklch(0.11 0.005 260)', border: `1px solid oklch(0.20 0.008 260)`, borderLeft: `3px solid ${severityColor(dtc.severity)}`, borderRadius: '3px', marginBottom: '6px' }}>
            <div onClick={() => toggleDtc(dtc.code)} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              {dtcExpanded.has(dtc.code) ? <ChevronDown style={{ width: 14, height: 14, color: sColor.textDim }} /> : <ChevronRight style={{ width: 14, height: 14, color: sColor.textDim }} />}
              <span style={{ fontFamily: sFont.mono, fontSize: '0.82rem', color: severityColor(dtc.severity), fontWeight: 600 }}>{dtc.code}</span>
              <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: 'white', flex: 1 }}>{dtc.description}</span>
              <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', padding: '2px 6px', background: `${severityColor(dtc.severity)}22`, border: `1px solid ${severityColor(dtc.severity)}44`, borderRadius: '2px', color: severityColor(dtc.severity) }}>{dtc.severity.toUpperCase()}</span>
            </div>
            {dtcExpanded.has(dtc.code) && (
              <div style={{ borderTop: `1px solid ${sColor.borderLight}`, padding: '12px 14px' }}>
                <div style={{ marginBottom: '10px' }}>
                  <h4 style={{ fontFamily: sFont.heading, fontSize: '0.85rem', color: sColor.yellow, letterSpacing: '0.04em', marginBottom: '6px' }}>COMMON CAUSES</h4>
                  {dtc.commonCauses.map((c, i) => (
                    <p key={i} style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: 'oklch(0.70 0.010 260)', margin: '2px 0', paddingLeft: '12px', borderLeft: `2px solid oklch(0.20 0.008 260)` }}>{c}</p>
                  ))}
                </div>
                <div>
                  <h4 style={{ fontFamily: sFont.heading, fontSize: '0.85rem', color: sColor.green, letterSpacing: '0.04em', marginBottom: '6px' }}>DIAGNOSTIC STEPS</h4>
                  {dtc.diagnosticSteps.map((s, i) => (
                    <p key={i} style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: 'oklch(0.70 0.010 260)', margin: '2px 0', paddingLeft: '12px', borderLeft: `2px solid oklch(0.20 0.008 260)` }}>{i + 1}. {s}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Platform PIDs */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.06em', color: 'white', marginBottom: '10px' }}>PLATFORM-SPECIFIC PIDS</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: sFont.mono, fontSize: '0.75rem' }}>
            <thead><tr style={{ borderBottom: `2px solid oklch(0.25 0.008 260)` }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.8rem' }}>PARAMETER</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.8rem' }}>HP TUNERS</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.8rem' }}>RANGE</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.8rem' }}>DIAGNOSTIC RELEVANCE</th>
            </tr></thead>
            <tbody>{selected.specificPIDs.map((pid) => (
              <tr key={pid.name} style={{ borderBottom: `1px solid ${sColor.borderLight}` }}>
                <td style={{ padding: '5px 8px', color: sColor.blue, fontWeight: 600 }}>{pid.name}</td>
                <td style={{ padding: '5px 8px', color: 'oklch(0.65 0.010 260)' }}>{pid.hpTunersName || '-'}</td>
                <td style={{ padding: '5px 8px', color: 'oklch(0.60 0.010 260)', whiteSpace: 'nowrap' }}>{pid.normalRange}</td>
                <td style={{ padding: '5px 8px', color: 'oklch(0.70 0.010 260)', fontFamily: sFont.body, fontSize: '0.78rem' }}>{pid.diagnosticRelevance}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {/* Diagnostic notes */}
      <div>
        <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.06em', color: 'white', marginBottom: '10px' }}>DIAGNOSTIC NOTES</h3>
        {selected.diagnosticNotes.map((note, i) => (
          <div key={i} style={{ padding: '10px 14px', background: 'oklch(0.11 0.005 260)', border: `1px solid oklch(0.20 0.008 260)`, borderLeft: `3px solid ${sColor.yellow}`, borderRadius: '3px', marginBottom: '6px' }}>
            <p style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: 'oklch(0.70 0.010 260)', margin: 0, lineHeight: 1.5 }}>{note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Analyzer Panel (Merged Normal Mode) ────────────────────────────────────

function AnalyzerPanel({ injectedCSV, onInjectedConsumed, onWP8Detected }: { injectedCSV?: { csv: string; filename: string } | null; onInjectedConsumed?: () => void; onWP8Detected?: (wp8: WP8ParseResult) => void }) {
  const [analyzerMode, setAnalyzerMode] = useState<'analyze' | 'compare'>('analyze');
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
  const [reasoningReport, setReasoningReport] = useState<ReasoningReport | null>(null);
  const [dragAnalysis, setDragAnalysis] = useState<DragAnalysis | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastInjectedId, setLastInjectedId] = useState<string | null>(null);
  const cacheDatalogMutation = trpc.datalogCache.cacheDatalog.useMutation();

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

  // Process raw CSV string (used by both file upload and datalogger injection)
  const processCSVContent = useCallback(async (content: string, name: string) => {
    setLoading(true);
    setError(null);
    try {
      const rawData = parseCSV(content);
      const processed = processData(rawData);
      const downsampled = downsampleData(processed, 2000);
      const binned = createBinnedData(processed, 40);
      setData(downsampled);
      setBinnedData(binned);
      setFileName(name);
      const diagnosticReport = analyzeDiagnostics(downsampled);
      setDiagnostics(diagnosticReport);
      const reasoning = runReasoningEngine(downsampled, diagnosticReport);
      setReasoningReport(reasoning);
      const drag = analyzeDragRuns(processed);
      setDragAnalysis(drag);
      const reportNoVin = generateHealthReport(downsampled, undefined);
      setHealthReport(reportNoVin);
      const detectedVin = extractVinFromFilename(name);
      setVinFromFile(detectedVin);
      if (detectedVin) {
        decodeVinNhtsa(detectedVin).then(vehicleInfo => {
          const reportWithVin = generateHealthReport(downsampled, vehicleInfo);
          setHealthReport(reportWithVin);
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process data');
      setData(null); setBinnedData(undefined); setDiagnostics(null); setHealthReport(null); setVinFromFile(null); setManualVin(''); setReasoningReport(null); setDragAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-process injected CSV from Datalogger
  useEffect(() => {
    if (injectedCSV && injectedCSV.filename !== lastInjectedId) {
      setLastInjectedId(injectedCSV.filename);
      processCSVContent(injectedCSV.csv, injectedCSV.filename);
      if (onInjectedConsumed) onInjectedConsumed();
    }
  }, [injectedCSV, lastInjectedId, processCSVContent, onInjectedConsumed]);

  const processFile = useCallback(async (file: File) => {
    // Handle .wp8 files (Dynojet Power Vision datalogs)
    if (file.name.toLowerCase().endsWith('.wp8')) {
      setLoading(true);
      setError(null);
      try {
        const { parseWP8, wp8ToCSV } = await import('@/lib/wp8Parser');
        const buffer = await file.arrayBuffer();
        const wp8Result = parseWP8(buffer);

        // If Honda Talon detected, switch to Talon tab
        if (wp8Result.vehicleType === 'HONDA_TALON' && onWP8Detected) {
          onWP8Detected(wp8Result);
          // Cache datalog (fire-and-forget)
          try {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              const base64 = dataUrl.split(',')[1] || '';
              if (base64) cacheDatalogMutation.mutate({ fileName: file.name, fileBase64: base64, sourcePage: 'advanced-talon' });
            };
            reader.readAsDataURL(file);
          } catch { /* silent */ }
          if (fileInputRef.current) fileInputRef.current.value = '';
          setLoading(false);
          return;
        }

        // Non-Talon WP8: convert to CSV and process through standard pipeline
        const csvContent = wp8ToCSV(wp8Result);
        await processCSVContent(csvContent, file.name);

        // Cache datalog (fire-and-forget)
        try {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const base64 = dataUrl.split(',')[1] || '';
            if (base64) cacheDatalogMutation.mutate({ fileName: file.name, fileBase64: base64, sourcePage: 'advanced' });
          };
          reader.readAsDataURL(file);
        } catch { /* silent */ }
        if (fileInputRef.current) fileInputRef.current.value = '';
        setLoading(false);
        return;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse WP8 file');
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    // Standard CSV processing — handle both UTF-8 and Latin-1 encoded files
    // Banks iDash logs use Latin-1 degree symbols (°F) that fail with UTF-8
    const buf = await file.arrayBuffer();
    let content: string;
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      content = new TextDecoder('latin1').decode(buf);
    }
    await processCSVContent(content, file.name);
    // Cache datalog to S3 for dev/debug (fire-and-forget)
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1] || '';
        if (base64) cacheDatalogMutation.mutate({ fileName: file.name, fileBase64: base64, sourcePage: 'advanced' });
      };
      reader.readAsDataURL(file);
    } catch { /* silent */ }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [processCSVContent, onWP8Detected]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.wp8'))) processFile(file);
    else setError('Please drop a CSV or WP8 file.');
  }, [processFile]);

  const handleExportPdf = () => {
    if (!data || !fileName) return;
    exportToPdf(data, fileName, diagnostics, healthReport, {
      dynoRef: dynoContainerRef, boostEffRef, railFaultRef, boostFaultRef, egtFaultRef,
      mafFaultRef, tccFaultRef, vgtFaultRef, regulatorFaultRef, coolantFaultRef, idleRpmFaultRef, converterStallRef, statsRef, healthRef,
    });
  };

  const applyManualVin = useCallback(async () => {
    if (!data || !manualVin.trim()) return;
    const vin = manualVin.trim().toUpperCase();
    if (vin.length !== 17) return;
    setVinFromFile(vin);
    const vehicleInfo = await decodeVinNhtsa(vin);
    const report = generateHealthReport(data, vehicleInfo);
    setHealthReport(report);
  }, [data, manualVin]);

  const hasReasoningFaults = reasoningReport?.findings?.some(
    f => (f.id === 'converter-stall-turbo-mismatch' || f.id === 'boost-leak-suspicion') && (f.type === 'warning' || f.type === 'fault')
  ) ?? false;
  const hasFaults = (diagnostics && diagnostics.issues.length > 0) || hasReasoningFaults;

  // Mode toggle component (shared between upload and results views)
  const ModeToggle = () => (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 0, marginBottom: '1.5rem' }}>
      <button onClick={() => setAnalyzerMode('analyze')} style={{
        background: analyzerMode === 'analyze' ? sColor.red : 'oklch(0.14 0.006 260)',
        color: analyzerMode === 'analyze' ? 'white' : sColor.textDim,
        fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.08em', padding: '10px 28px',
        border: analyzerMode === 'analyze' ? `1px solid ${sColor.red}` : `1px solid oklch(0.48 0.008 260)`,
        borderRadius: '3px 0 0 3px', cursor: 'pointer', transition: 'all 0.15s',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <BarChart3 style={{ width: 16, height: 16 }} />ANALYZE
      </button>
      <button onClick={() => setAnalyzerMode('compare')} style={{
        background: analyzerMode === 'compare' ? sColor.red : 'oklch(0.14 0.006 260)',
        color: analyzerMode === 'compare' ? 'white' : sColor.textDim,
        fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.08em', padding: '10px 28px',
        border: analyzerMode === 'compare' ? `1px solid ${sColor.red}` : `1px solid oklch(0.48 0.008 260)`,
        borderRadius: '0 3px 3px 0', cursor: 'pointer', transition: 'all 0.15s',
        display: 'flex', alignItems: 'center', gap: '8px', borderLeft: 'none',
      }}>
        <Gauge style={{ width: 16, height: 16 }} />COMPARE
      </button>
    </div>
  );

  // When no data loaded and compare mode — show standalone CompareView with upload zones
  if (!data && analyzerMode === 'compare') {
    return (
      <div>
        <ModeToggle />
        <CompareView onBack={() => setAnalyzerMode('analyze')} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="ppei-gradient-text" style={{ fontFamily: sFont.heading, fontSize: '2.2rem', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>DATALOG ANALYZER</h2>
          <p style={{ fontFamily: sFont.body, fontSize: '0.9rem', color: sColor.textDim }}>Upload your CSV datalog for full diagnostic analysis, dyno chart, and PDF report</p>
        </div>
        <ModeToggle />
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          className={`ppei-dropzone${isDragOver ? ' active' : ''}${loading ? ' ppei-loading-scan' : ''}`}
          style={{
            border: isDragOver ? `2px dashed ${sColor.red}` : `2px dashed oklch(0.50 0.008 260)`,
            background: isDragOver ? 'oklch(0.14 0.012 25)' : 'oklch(0.11 0.005 260)',
            borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: isDragOver ? `0 0 30px ${sColor.red}33` : 'none',
          }}
          onClick={() => !loading && fileInputRef.current?.click()}
        >
          <div className="p-14 flex flex-col items-center justify-center gap-5">
            <div style={{ width: '80px', height: '80px', borderRadius: '4px', background: isDragOver ? `${sColor.red}33` : 'oklch(0.16 0.008 260)', border: `2px solid ${isDragOver ? sColor.red : sColor.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {loading ? <Loader2 style={{ width: '36px', height: '36px', color: sColor.red, animation: 'spin 1s linear infinite' }} /> : <Upload style={{ width: '36px', height: '36px', color: isDragOver ? sColor.red : sColor.textDim }} />}
            </div>
            <div className="text-center">
              <h3 style={{ fontFamily: sFont.heading, fontSize: '1.8rem', letterSpacing: '0.06em', color: 'white', marginBottom: '0.4rem' }}>
                {loading ? 'PROCESSING LOG...' : isDragOver ? 'DROP TO ANALYZE' : 'UPLOAD YOUR DATALOG'}
              </h3>
              <p style={{ fontFamily: sFont.body, color: sColor.textDim, fontSize: '0.9rem' }}>Drag & drop your CSV or WP8 file here, or click to browse</p>
              <p style={{ fontFamily: sFont.mono, color: 'oklch(0.60 0.010 260)', fontSize: '0.75rem', marginTop: '0.5rem', letterSpacing: '0.05em' }}>CSV & WP8 FORMATS SUPPORTED</p>

            </div>
            <input ref={fileInputRef} type="file" accept=".csv,.wp8,.WP8,*" onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} disabled={loading} className="hidden" />
            <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} disabled={loading} style={{
              background: loading ? 'oklch(0.35 0.010 260)' : sColor.red, color: 'white', fontFamily: sFont.heading,
              fontSize: '1.1rem', letterSpacing: '0.1em', padding: '10px 32px', borderRadius: '3px', border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              {loading ? <><Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />PROCESSING...</> : <><Upload style={{ width: 16, height: 16 }} />SELECT FILE</>}
            </button>
          </div>
        </div>
        {error && (
          <div style={{ marginTop: '16px', padding: '12px 16px', background: sColor.bgCard, border: `1px solid ${sColor.red}`, borderLeft: `4px solid ${sColor.red}`, borderRadius: '3px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle style={{ width: 18, height: 18, color: sColor.red, flexShrink: 0 }} />
            <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: 'oklch(0.80 0.010 260)', margin: 0 }}>{error}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ModeToggle />
      {/* File info bar */}
      <div style={{ background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderLeft: hasFaults ? `4px solid ${sColor.red}` : `4px solid ${sColor.green}`, borderRadius: '3px', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <CheckCircle style={{ width: '20px', height: '20px', color: sColor.green, flexShrink: 0 }} />
          <div>
            <p style={{ fontFamily: sFont.mono, fontSize: '0.85rem', color: 'white', fontWeight: 600, margin: 0 }}>{fileName}</p>
            <p style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, margin: 0 }}>
              {data.stats.duration.toFixed(1)}s · {data.rpm.length.toLocaleString()} samples
              {hasFaults ? <span style={{ color: 'oklch(0.65 0.18 25)' }}> · {diagnostics!.issues.length} potential fault area(s)</span> : <span style={{ color: sColor.green }}> · No fault areas detected</span>}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={handleExportPdf} disabled={isExporting} style={{
            background: isExporting ? 'oklch(0.35 0.010 260)' : sColor.red, color: 'white', fontFamily: sFont.heading,
            fontSize: '0.95rem', letterSpacing: '0.08em', padding: '8px 20px', borderRadius: '3px', border: 'none',
            cursor: isExporting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            {isExporting ? <><Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />GENERATING PDF...</> : <><FileDown style={{ width: 14, height: 14 }} />EXPORT PDF</>}
          </button>
          <button onClick={() => { setData(null); setBinnedData(undefined); setDiagnostics(null); setHealthReport(null); setFileName(null); setReasoningReport(null); setDragAnalysis(null); }} style={{
            background: 'transparent', color: sColor.textDim, fontFamily: sFont.heading, fontSize: '0.95rem',
            letterSpacing: '0.08em', padding: '8px 16px', borderRadius: '3px', border: `1px solid ${sColor.border}`, cursor: 'pointer',
          }}>NEW FILE</button>
        </div>
      </div>

      {/* Manual VIN */}
      {!vinFromFile && (
        <div style={{ background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderLeft: `4px solid ${sColor.blue}`, borderRadius: '3px', padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem' }}>
            <div style={{ background: `${sColor.blue}26`, border: `1px solid ${sColor.blue}66`, borderRadius: '3px', padding: '4px 8px', fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.blue }}>VIN</div>
            <div>
              <p style={{ fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>NO VIN DETECTED</p>
              <p style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, margin: 0 }}>Enter your VIN for vehicle identification</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="text" value={manualVin} onChange={(e) => setManualVin(e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17))} placeholder="Enter 17-character VIN" maxLength={17}
              style={{ flex: 1, padding: '8px 12px', fontFamily: sFont.mono, fontSize: '0.85rem', background: sColor.bgInput, border: `1px solid ${sColor.border}`, borderRadius: '3px', color: 'white', outline: 'none' }}
              onKeyDown={(e) => e.key === 'Enter' && applyManualVin()} />
            <button onClick={applyManualVin} disabled={manualVin.length !== 17} style={{
              background: manualVin.length === 17 ? sColor.blue : 'oklch(0.25 0.008 260)', color: 'white', fontFamily: sFont.heading,
              fontSize: '0.95rem', letterSpacing: '0.08em', padding: '8px 20px', borderRadius: '3px', border: 'none',
              cursor: manualVin.length === 17 ? 'pointer' : 'not-allowed',
            }}>DECODE VIN</button>
          </div>
        </div>
      )}

      {healthReport && <div ref={healthRef}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <SectionHeader icon={<Activity style={{ width: 18, height: 18, color: sColor.red }} />} title="VEHICLE HEALTH REPORT" />
          <button
            onClick={() => { if (data && healthReport && fileName) generateHealthReportPdf(healthReport, data, fileName, data.stats.hpTorqueMax > 0, dragAnalysis); }}
            style={{ background: sColor.blue, color: 'white', fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.08em', padding: '6px 14px', borderRadius: '3px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
          >
            <FileDown style={{ width: 14, height: 14 }} />DOWNLOAD HEALTH REPORT PDF
          </button>
        </div>
        <HealthReport report={healthReport} />
      </div>}
      {diagnostics && <div><SectionHeader icon={<Zap style={{ width: 18, height: 18, color: sColor.red }} />} title="DIAGNOSTIC ANALYSIS" /><DiagnosticReportComponent report={diagnostics} /></div>}
      {reasoningReport && <div><SectionHeader icon={<Brain style={{ width: 18, height: 18, color: sColor.red }} />} title="PPEI AI REASONING ENGINE" /><div style={{ background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderLeft: `4px solid ${sColor.red}`, borderRadius: '3px', padding: '1.25rem' }}><ReasoningPanel report={reasoningReport} /></div></div>}

      {(data.pidSubstitutions?.length > 0 || data.pidsMissing?.length > 0) && (
        <div style={{ background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderLeft: `4px solid ${sColor.blue}`, borderRadius: '3px', padding: '0' }}>
          <PidAuditPanel substitutions={data.pidSubstitutions ?? []} missing={data.pidsMissing ?? []} fileFormat={data.fileFormat} boostCalibration={data.boostCalibration} />
        </div>
      )}

      <div ref={statsRef}><StatsSummary data={data} /></div>

      <div><RPMvMAFChart data={data} binnedData={binnedData} /></div>
      <div><HPvsRPMChart data={data} binnedData={binnedData} /></div>
      <div><TimeSeriesChart data={data} /></div>

      {dragAnalysis && <div><SectionHeader icon={<Flag style={{ width: 18, height: 18, color: sColor.red }} />} title="DRAG RACING ANALYZER" /><div style={{ background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderLeft: `4px solid ${sColor.red}`, borderRadius: '3px', padding: '1.25rem' }}><DragTimeslip analysis={dragAnalysis} /></div></div>}

      <div><SectionHeader icon={<BarChart3 style={{ width: 18, height: 18, color: sColor.red }} />} title="LOG DETAILS" /><div ref={dynoContainerRef}><DynoHPChart ref={dynoRef} data={data} binnedData={binnedData} /></div></div>
      <div><SectionHeader icon={<Gauge style={{ width: 18, height: 18, color: sColor.red }} />} title="AIRFLOW OUTLOOK" /><BoostEfficiencyChart ref={boostEffRef} data={data} /></div>

      {hasFaults && (
        <div className="space-y-6">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '0.75rem', borderBottom: `1px solid ${sColor.red}4d` }}>
            <AlertCircle style={{ width: 20, height: 20, color: sColor.red }} />
            <h2 style={{ fontFamily: sFont.heading, fontSize: '1.4rem', letterSpacing: '0.08em', color: 'white', margin: 0 }}>FAULT ZONE ANALYSIS</h2>
          </div>
          <RailPressureFaultChart ref={railFaultRef} data={data} diagnostics={diagnostics!} binnedData={binnedData} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} reasoningReport={reasoningReport} />
          <BoostFaultChart ref={boostFaultRef} data={data} diagnostics={diagnostics!} binnedData={binnedData} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} reasoningReport={reasoningReport} />
          <ConverterStallChart ref={converterStallRef} data={data} diagnostics={diagnostics!} binnedData={binnedData} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} reasoningReport={reasoningReport} />
          <EgtFaultChart ref={egtFaultRef} data={data} diagnostics={diagnostics!} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
          <MafFaultChart ref={mafFaultRef} data={data} diagnostics={diagnostics!} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
          <TccFaultChart ref={tccFaultRef} data={data} diagnostics={diagnostics!} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
          <VgtFaultChart ref={vgtFaultRef} data={data} diagnostics={diagnostics!} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
          <RegulatorFaultChart ref={regulatorFaultRef} data={data} diagnostics={diagnostics!} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
          <CoolantFaultChart ref={coolantFaultRef} data={data} diagnostics={diagnostics!} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
          <IdleRpmFaultChart ref={idleRpmFaultRef} data={data} diagnostics={diagnostics!} onJumpToTime={(s, e) => dynoRef.current?.jumpToTime(s, e)} />
        </div>
      )}

      <div><SectionHeader icon={<Search style={{ width: 18, height: 18, color: sColor.red }} />} title="DIAGNOSTIC CODE LOOKUP" /><DtcSearch /></div>
      <div><SectionHeader icon={<Cpu style={{ width: 18, height: 18, color: sColor.red }} />} title="ENGINE REFERENCE DATABASE" /><EcuReferencePanel /></div>

      {/* Compare section — shown when compare mode is active, data already loaded above */}
      {analyzerMode === 'compare' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '0.75rem', borderBottom: `1px solid ${sColor.red}4d`, marginBottom: '1rem' }}>
            <Gauge style={{ width: 20, height: 20, color: sColor.red }} />
            <h2 style={{ fontFamily: sFont.heading, fontSize: '1.4rem', letterSpacing: '0.08em', color: 'white', margin: 0 }}>DATALOG COMPARISON</h2>
          </div>
          <CompareView onBack={() => setAnalyzerMode('analyze')} embedded />
        </div>
      )}

      {(error || exportError) && (
        <div style={{ position: 'fixed', bottom: '1rem', right: '1rem', background: sColor.bgCard, border: `1px solid ${sColor.red}`, borderLeft: `4px solid ${sColor.red}`, borderRadius: '3px', padding: '1rem 1.25rem', display: 'flex', alignItems: 'flex-start', gap: '12px', maxWidth: '420px', zIndex: 50 }}>
          <AlertCircle style={{ width: 18, height: 18, color: sColor.red, flexShrink: 0, marginTop: '2px' }} />
          <div>
            <p style={{ fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>{error ? 'ERROR PROCESSING FILE' : 'PDF EXPORT FAILED'}</p>
            <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: 'oklch(0.65 0.010 260)', margin: 0 }}>{error || exportError}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Editor Passcode Gate ───────────────────────────────────────────────────

const EDITOR_CODE = 'KINGKONG';
const EDITOR_STORAGE_KEY = 'ppei_editor_unlocked';

function EditorGate() {
  // DEV BYPASS: skip access code gate for faster development
  const [unlocked, setUnlocked] = useState(true /* was: () => localStorage.getItem(EDITOR_STORAGE_KEY) === 'true' */);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = () => {
    if (code.toUpperCase() === EDITOR_CODE) {
      localStorage.setItem(EDITOR_STORAGE_KEY, 'true');
      setUnlocked(true);
    } else {
      setError(true);
      setShake(true);
      setAttempts(prev => prev + 1);
      setTimeout(() => setShake(false), 500);
      setTimeout(() => setError(false), 2000);
    }
  };

  const funnyMessages = [
    "Wrong code. The ECU is judging you right now.",
    "Nope. Even your mom's minivan has better security than your guesses.",
    "Access denied. Try turning the key off and back on... oh wait, wrong tool.",
    "That ain't it chief. The turbo just spooled down in disappointment.",
    "Incorrect. The injectors are crying.",
    "Wrong again. At this rate, you'll need a flash tool just to unlock the door.",
    "Still no. Your ECU called — it wants a competent operator.",
    "Denied. Even the DPF has more flow than your password game.",
  ];

  if (unlocked) {
    return (
      <div className="flex flex-col" style={{ height: '100vh', overflow: 'hidden' }}>
        <CalibrationEditor />
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', textAlign: 'center', padding: '2rem',
    }}>
      {/* Big lock icon with glow */}
      <div style={{
        width: '80px', height: '80px', borderRadius: '50%',
        background: 'oklch(0.14 0.008 260)', border: `2px solid ${sColor.red}4d`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '1.5rem', boxShadow: `0 0 30px ${sColor.red}1a`,
      }}>
        <Lock style={{ width: 36, height: 36, color: sColor.red }} />
      </div>

      <h2 style={{
        fontFamily: sFont.heading, fontSize: '2rem', letterSpacing: '0.12em',
        color: 'white', marginBottom: '0.5rem',
      }}>
        CALIBRATION EDITOR
      </h2>

      <p style={{
        fontFamily: sFont.body, fontSize: '0.95rem', color: sColor.textDim,
        maxWidth: '400px', marginBottom: '0.5rem',
      }}>
        This area is restricted to authorized calibrators only.
      </p>

      <p style={{
        fontFamily: sFont.mono, fontSize: '0.75rem', color: 'oklch(0.58 0.010 260)',
        maxWidth: '400px', marginBottom: '2rem', fontStyle: 'italic',
      }}>
        "I asked my ECU for the password. It said 'knock knock.' I said 'who's there?' It threw a P0300."
      </p>

      <div className={shake ? 'ppei-shake' : ''} style={{ width: '100%', maxWidth: '320px' }}>
        <div style={{
          display: 'flex', gap: '8px', marginBottom: '12px',
        }}>
          <input
            ref={inputRef}
            type="password"
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Enter access code..."
            style={{
              flex: 1, padding: '12px 16px',
              fontFamily: sFont.mono, fontSize: '1rem', letterSpacing: '0.15em',
              background: sColor.bgDark,
              border: `2px solid ${error ? sColor.red : 'oklch(0.25 0.008 260)'}`,
              borderRadius: '3px', color: 'white', outline: 'none',
              textAlign: 'center', textTransform: 'uppercase',
              transition: 'border-color 0.2s',
            }}
          />
          <button
            onClick={handleSubmit}
            style={{
              padding: '12px 20px',
              background: `${sColor.red}33`, border: `1px solid ${sColor.red}80`,
              borderRadius: '3px', color: sColor.red,
              fontFamily: sFont.heading, fontSize: '0.9rem', letterSpacing: '0.08em',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            UNLOCK
          </button>
        </div>

        {error && attempts > 0 && (
          <p style={{
            fontFamily: sFont.body, fontSize: '0.8rem',
            color: sColor.red, marginTop: '8px',
            animation: 'fadeIn 0.3s ease',
          }}>
            {funnyMessages[(attempts - 1) % funnyMessages.length]}
          </p>
        )}
      </div>

      {attempts >= 3 && (
        <p style={{
          fontFamily: sFont.mono, fontSize: '0.7rem',
          color: 'oklch(0.55 0.008 260)', marginTop: '2rem',
        }}>
          Hint: Think big. Think primate. Think chest-pounding dominance.
        </p>
      )}
    </div>
  );
}

// ─── Main Advanced Dashboard ────────────────────────────────────────────────

type TabId = 'analyzer' | 'datalogger' | 'editor' | 'binary' | 'ai' | 'search' | 'vehicles' | 'a2l' | 'pids' | 'mode6' | 'uds' | 'services' | 'intellispy' | 'coding' | 'canam' | 'procedures' | 'talon' | 'reverseeng' | 'qa' | 'notifications' | 'notifprefs' | 'offsets' | 'support' | 'users' | 'flash' | 'fleet' | 'competition' | 'weather' | 'cloud' | 'diagnostic' | 'pitch' | 'tasks' | 'devtools';

/* ── User-facing tabs (visible to all users) ── */
const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'analyzer', label: 'ANALYZER', icon: <BarChart3 style={{ width: 16, height: 16 }} /> },
  { id: 'datalogger', label: 'DATALOGGER', icon: <Gauge style={{ width: 16, height: 16 }} /> },
  { id: 'ai', label: 'AI CHAT', icon: <Brain style={{ width: 16, height: 16 }} /> },
  { id: 'editor', label: 'EDITOR', icon: <FileCode2 style={{ width: 16, height: 16, color: 'oklch(0.52 0.22 25)' }} /> },
  { id: 'intellispy', label: 'INTELLISPY', icon: <Radio style={{ width: 16, height: 16, color: 'oklch(0.65 0.20 145)' }} /> },
  { id: 'flash', label: 'FLASH', icon: <Zap style={{ width: 16, height: 16, color: 'oklch(0.75 0.18 60)' }} /> },
  { id: 'fleet', label: 'FLEET', icon: <Truck style={{ width: 16, height: 16, color: 'oklch(0.65 0.20 145)' }} /> },
  { id: 'weather' as TabId, label: 'WEATHER', icon: <CloudSun style={{ width: 16, height: 16, color: 'oklch(0.72 0.16 210)' }} /> },
  { id: 'competition' as TabId, label: 'COMPETITION', icon: <Trophy style={{ width: 16, height: 16, color: 'oklch(0.70 0.18 40)' }} /> },
  { id: 'cloud' as TabId, label: 'CLOUD', icon: <Cloud style={{ width: 16, height: 16, color: 'oklch(0.70 0.18 200)' }} /> },
  { id: 'pitch', label: 'PITCH', icon: <MessageSquare style={{ width: 16, height: 16, color: 'oklch(0.70 0.18 200)' }} /> },
  { id: 'tasks', label: 'TASKS', icon: <CheckCircle style={{ width: 16, height: 16, color: 'oklch(0.65 0.20 145)' }} /> },
  { id: 'support' as TabId, label: 'SUPPORT', icon: <Inbox style={{ width: 16, height: 16, color: 'oklch(0.72 0.15 200)' }} /> },
];

/* ── Internal/dev tabs (admin only) ── */
const devTabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'search', label: 'SEARCH', icon: <Search style={{ width: 16, height: 16 }} /> },
  { id: 'vehicles', label: 'VEHICLES', icon: <Car style={{ width: 16, height: 16 }} /> },
  { id: 'binary', label: 'EDITOR', icon: <Cpu style={{ width: 16, height: 16 }} /> },
  { id: 'a2l', label: 'A2L FILES', icon: <FileCode2 style={{ width: 16, height: 16 }} /> },
  { id: 'pids', label: 'PIDS', icon: <Hash style={{ width: 16, height: 16 }} /> },
  { id: 'mode6', label: 'MODE 6', icon: <Activity style={{ width: 16, height: 16 }} /> },
  { id: 'uds', label: 'UDS', icon: <Terminal style={{ width: 16, height: 16 }} /> },
  { id: 'services', label: 'SERVICES', icon: <BookOpen style={{ width: 16, height: 16 }} /> },
  { id: 'coding', label: 'CODING', icon: <Settings style={{ width: 16, height: 16, color: 'oklch(0.70 0.18 200)' }} /> },
  { id: 'canam', label: 'CAN-AM VIN', icon: <Key style={{ width: 16, height: 16, color: 'oklch(0.75 0.18 60)' }} /> },
  { id: 'procedures', label: 'PROCEDURES', icon: <Wrench style={{ width: 16, height: 16 }} /> },
  { id: 'talon', label: 'HONDA TALON', icon: <Fuel style={{ width: 16, height: 16, color: 'oklch(0.70 0.20 40)' }} /> },
];

const adminTabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'diagnostic', label: 'DIAGNOSTIC', icon: <ShieldCheck style={{ width: 16, height: 16, color: 'oklch(0.65 0.20 30)' }} /> },
  { id: 'devtools', label: 'DEV TOOLS', icon: <Wrench style={{ width: 16, height: 16, color: 'oklch(0.52 0.22 25)' }} /> },
];

function AdvancedDashboard({ onLock }: { onLock: () => void }) {
  const [activeTab, setActiveTab] = useState<TabId>('analyzer');
  const [query, setQuery] = useState('');
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isSuperAdmin = user?.role === 'super_admin';
  const superAdminTabs: { id: TabId; label: string; icon: React.ReactNode }[] = [];
  const [devSubTab, setDevSubTab] = useState<string>('search');
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<KBCategory | 'all'>('all');
  const [a2lData, setA2lData] = useState<A2LParseResult | null>(null);
  const [injectedCSV, setInjectedCSV] = useState<{ csv: string; filename: string } | null>(null);
  const [injectedWP8, setInjectedWP8] = useState<WP8ParseResult | null>(null);
  const [diagnosticPids, setDiagnosticPids] = useState<{ pid: number; service: number; name: string; shortName: string }[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Dynamically add Honda Talon tab when WP8 data is loaded or activeTab is talon
  const talonTab = { id: 'talon' as TabId, label: 'HONDA TALON', icon: <Fuel style={{ width: 16, height: 16, color: 'oklch(0.70 0.20 40)' }} /> };
  const showTalonTab = activeTab === 'talon' || injectedWP8 !== null;
  const allTabs = isAdmin
    ? [...tabs, ...(showTalonTab ? [talonTab] : []), ...adminTabs, ...superAdminTabs]
    : [...tabs, ...(showTalonTab ? [talonTab] : [])];
  const mainTabCountBeforeAdmin = tabs.length + (showTalonTab ? 1 : 0);

  // Pick up WP8 data from sessionStorage (set by Home.tsx on .wp8 upload)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'talon') {
      // Show Honda Talon as a top-level tab for any user who uploads a WP8 file
      setActiveTab('talon');
      const raw = sessionStorage.getItem('pendingWP8');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          // Reconstruct Float32Array from serialized regular arrays
          if (parsed.rows) {
            parsed.rows = parsed.rows.map((r: any) => ({
              timestamp: r.timestamp,
              values: new Float32Array(Array.isArray(r.values) ? r.values : []),
            }));
          }
          setInjectedWP8(parsed as WP8ParseResult);
          sessionStorage.removeItem('pendingWP8');
        } catch { /* ignore parse errors */ }
      }
      // Clean URL params
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const engine = useMemo(() => getSearchEngine(), []);
  const stats = useMemo(() => engine.getStats(), [engine]);

  const searchResults = useMemo(() => {
    if (!query.trim()) return null;
    const { results, intent } = engine.search(query);
    const filtered = categoryFilter === 'all' ? results : results.filter(r => r.document.category === categoryFilter);
    return { results: filtered, intent };
  }, [query, engine, categoryFilter]);

  const toggleResult = useCallback((id: string) => {
    setExpandedResults(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  return (
    <div className="min-h-screen" style={{ background: sColor.bg, color: sColor.text }}>
      {/* Shared PPEI Header */}
      <PpeiHeader />

      {/* Advanced mode sub-header with status badges */}
      <div style={{ background: sColor.bgDark, borderBottom: `1px solid oklch(0.20 0.008 260)`, padding: '6px 0' }}>
        <div className="container mx-auto px-4">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.06em', color: sColor.red }}>ADVANCED MODE</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: `${sColor.green}1f`, border: `1px solid ${sColor.green}4d`, borderRadius: '2px' }}>
                <Database style={{ width: 12, height: 12, color: sColor.green }} />
                <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.green }}>{stats.totalDocuments} DOCS</span>
              </div>
              {a2lData && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: `${sColor.blue}1f`, border: `1px solid ${sColor.blue}4d`, borderRadius: '2px' }}>
                  <FileCode2 style={{ width: 12, height: 12, color: sColor.blue }} />
                  <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.blue }}>A2L LOADED</span>
                </div>
              )}
            </div>
            <button onClick={onLock} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: `${sColor.red}1f`, border: `1px solid ${sColor.red}4d`, borderRadius: '2px', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.8rem', letterSpacing: '0.08em', cursor: 'pointer' }}>
              <Lock style={{ width: 14, height: 14 }} /> LOCK
            </button>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-6">
        {/* Tab navigation */}
        <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', borderBottom: `1px solid oklch(0.20 0.008 260)`, overflowX: 'auto' }}>
          {allTabs.map((tab, idx) => (
            <Fragment key={tab.id}>
              {/* Admin section divider */}
              {isAdmin && idx === mainTabCountBeforeAdmin && (
                <div style={{ width: '1px', background: 'oklch(0.30 0.010 260)', margin: '4px 6px', alignSelf: 'stretch' }} />
              )}
              <button onClick={() => { setActiveTab(tab.id); }} style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px',
                fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.06em',
                color: activeTab === tab.id ? 'white' : 'oklch(0.63 0.010 260)',
                background: activeTab === tab.id ? 'oklch(0.16 0.008 260)' : 'transparent',
                border: 'none', borderBottom: activeTab === tab.id ? `2px solid ${sColor.red}` : '2px solid transparent',
                cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}>
                {tab.icon} {tab.label}
              </button>
            </Fragment>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'analyzer' && <div className="ppei-anim-fade-up"><AnalyzerPanel injectedCSV={injectedCSV} onInjectedConsumed={() => setInjectedCSV(null)} onWP8Detected={(wp8) => { setInjectedWP8(wp8); setActiveTab('talon'); }} /></div>}

        {activeTab === 'ai' && <div className="ppei-anim-fade-up"><AIChatPanel a2lData={a2lData} /></div>}

        {/* DEV TOOLS — consolidated admin panel */}
        {activeTab === 'devtools' && isAdmin && (
          <div className="ppei-anim-fade-up">
            {/* Dev sub-tab navigation */}
            <div style={{ display: 'flex', gap: '2px', marginBottom: '16px', borderBottom: `1px solid oklch(0.20 0.008 260)`, overflowX: 'auto', flexWrap: 'wrap' }}>
              {[
                { id: 'search', label: 'SEARCH', icon: <Search style={{ width: 13, height: 13 }} /> },
                { id: 'vehicles', label: 'VEHICLES', icon: <Car style={{ width: 13, height: 13 }} /> },
                { id: 'binary', label: 'EDITOR', icon: <Cpu style={{ width: 13, height: 13 }} /> },
                { id: 'a2l', label: 'A2L FILES', icon: <FileCode2 style={{ width: 13, height: 13 }} /> },
                { id: 'pids', label: 'PIDS', icon: <Hash style={{ width: 13, height: 13 }} /> },
                { id: 'mode6', label: 'MODE 6', icon: <Activity style={{ width: 13, height: 13 }} /> },
                { id: 'uds', label: 'UDS', icon: <Terminal style={{ width: 13, height: 13 }} /> },
                { id: 'services', label: 'SERVICES', icon: <BookOpen style={{ width: 13, height: 13 }} /> },
                { id: 'coding', label: 'CODING', icon: <Settings style={{ width: 13, height: 13 }} /> },
                { id: 'canam', label: 'CAN-AM VIN', icon: <Key style={{ width: 13, height: 13 }} /> },
                { id: 'procedures', label: 'PROCEDURES', icon: <Wrench style={{ width: 13, height: 13 }} /> },
                { id: 'talon', label: 'HONDA TALON', icon: <Fuel style={{ width: 13, height: 13 }} /> },
                { id: 'users', label: 'USER MGMT', icon: <Users style={{ width: 13, height: 13 }} /> },
                { id: 'geofence', label: 'GEOFENCE', icon: <MapPin style={{ width: 13, height: 13 }} /> },
                { id: 'qa', label: 'QA TESTS', icon: <CheckCircle style={{ width: 13, height: 13 }} /> },
                { id: 'notifications', label: 'NOTIFICATIONS', icon: <MessageSquare style={{ width: 13, height: 13 }} /> },
                { id: 'offsets', label: 'OFFSETS', icon: <Wrench style={{ width: 13, height: 13 }} /> },
                { id: 'reverseeng', label: 'REVERSE ENG', icon: <Cpu style={{ width: 13, height: 13 }} /> },
                { id: 'notifprefs', label: 'NOTIF PREFS', icon: <Settings style={{ width: 13, height: 13 }} /> },
              ].map(st => (
                <button key={st.id} onClick={() => setDevSubTab(st.id)} style={{
                  display: 'flex', alignItems: 'center', gap: '4px', padding: '7px 10px',
                  fontFamily: sFont.heading, fontSize: '0.72rem', letterSpacing: '0.05em',
                  color: devSubTab === st.id ? 'white' : 'oklch(0.60 0.010 260)',
                  background: devSubTab === st.id ? 'oklch(0.18 0.010 260)' : 'transparent',
                  border: 'none', borderBottom: devSubTab === st.id ? `2px solid ${sColor.red}` : '2px solid transparent',
                  cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}>
                  {st.icon} {st.label}
                </button>
              ))}
            </div>

            {/* Dev sub-tab content */}
            {devSubTab === 'search' && (
              <div>
                <div style={{ background: 'oklch(0.12 0.006 260)', border: `1px solid ${sColor.border}`, borderRadius: '3px', padding: '20px', marginBottom: '16px' }}>
                  <div style={{ position: 'relative' }}>
                    <Search style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', width: '18px', height: '18px', color: sColor.textMuted }} />
                    <input ref={searchInputRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                      placeholder='Search knowledge base (e.g. "boost pressure PID", "P0087 L5P", "CP4 failure")'
                      style={{ width: '100%', padding: '14px 14px 14px 44px', fontFamily: sFont.mono, fontSize: '0.95rem', background: sColor.bgDark, border: `2px solid oklch(0.25 0.008 260)`, borderRadius: '3px', color: 'white', outline: 'none', boxSizing: 'border-box' }}
                      onFocus={(e) => { (e.target).style.borderColor = sColor.red; }}
                      onBlur={(e) => { (e.target).style.borderColor = 'oklch(0.25 0.008 260)'; }}
                    />
                    {query && <button onClick={() => { setQuery(''); searchInputRef.current?.focus(); }} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X style={{ width: 16, height: 16, color: 'oklch(0.63 0.010 260)' }} /></button>}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
                    <button onClick={() => setCategoryFilter('all')} style={{ padding: '4px 10px', fontFamily: sFont.body, fontSize: '0.75rem', fontWeight: 600, background: categoryFilter === 'all' ? `${sColor.red}33` : 'oklch(0.16 0.006 260)', border: `1px solid ${categoryFilter === 'all' ? `${sColor.red}80` : sColor.border}`, borderRadius: '2px', color: categoryFilter === 'all' ? sColor.red : sColor.textDim, cursor: 'pointer' }}>ALL</button>
                    {Object.entries(categoryConfig).map(([key, cfg]) => (
                      <button key={key} onClick={() => setCategoryFilter(key as KBCategory)} style={{ padding: '4px 10px', fontFamily: sFont.body, fontSize: '0.75rem', fontWeight: 600, background: categoryFilter === key ? `${cfg.color}33` : 'oklch(0.16 0.006 260)', border: `1px solid ${categoryFilter === key ? `${cfg.color}66` : sColor.border}`, borderRadius: '2px', color: categoryFilter === key ? cfg.color : sColor.textDim, cursor: 'pointer' }}>{cfg.label.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
                {searchResults?.intent?.description && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: `${sColor.green}14`, border: `1px solid ${sColor.green}33`, borderRadius: '3px', marginBottom: '12px' }}>
                    <Zap style={{ width: 14, height: 14, color: sColor.green }} />
                    <span style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: sColor.green }}>{searchResults.intent.description}</span>
                    <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: 'oklch(0.63 0.010 260)', marginLeft: 'auto' }}>{searchResults.results.length} results</span>
                  </div>
                )}
                {searchResults && searchResults.results.length > 0 && <div>{searchResults.results.map((result) => <ResultCard key={result.document.id} result={result} isExpanded={expandedResults.has(result.document.id)} onToggle={() => toggleResult(result.document.id)} />)}</div>}
                {searchResults && searchResults.results.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '3rem', background: 'oklch(0.12 0.006 260)', border: `1px solid oklch(0.20 0.008 260)`, borderRadius: '3px' }}>
                    <Search style={{ width: 32, height: 32, color: 'oklch(0.50 0.008 260)', margin: '0 auto 12px' }} />
                    <p style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.06em', color: 'oklch(0.63 0.010 260)' }}>NO RESULTS FOUND</p>
                  </div>
                )}
                {!searchResults && (
                  <div style={{ textAlign: 'center', padding: '3rem', background: 'oklch(0.12 0.006 260)', border: `1px solid oklch(0.20 0.008 260)`, borderRadius: '3px' }}>
                    <Database style={{ width: 40, height: 40, color: 'oklch(0.45 0.008 260)', margin: '0 auto 16px' }} />
                    <p style={{ fontFamily: sFont.heading, fontSize: '1.3rem', letterSpacing: '0.08em', color: 'oklch(0.63 0.010 260)', marginBottom: '8px' }}>KNOWLEDGE BASE READY</p>
                    <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textMuted, maxWidth: '500px', margin: '0 auto' }}>
                      Search across SAE J1979, J1979-2, GM Mode 6, OBD-II PIDs, and multi-vehicle databases. Now includes L5P, LML, LBZ, LLY, LB7, and LS/LT platforms.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginTop: '24px', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
                      {Object.entries(stats.categories).map(([cat, count]) => {
                        const cfg = categoryConfig[cat] || categoryConfig.standard;
                        return (
                          <div key={cat} style={{ padding: '10px', background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.borderLight}`, borderTop: `2px solid ${cfg.color}`, borderRadius: '3px', textAlign: 'center' }}>
                            <div style={{ fontFamily: sFont.mono, fontSize: '1.2rem', color: cfg.color, fontWeight: 700 }}>{count}</div>
                            <div style={{ fontFamily: sFont.body, fontSize: '0.72rem', color: 'oklch(0.63 0.010 260)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cfg.label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {devSubTab === 'vehicles' && <VehiclePanel />}
            {devSubTab === 'a2l' && <A2LPanel a2lData={a2lData} setA2lData={setA2lData} />}
            {devSubTab === 'pids' && <PidReferencePanel />}
            {devSubTab === 'mode6' && <Mode6Panel />}
            {devSubTab === 'uds' && <UDSPanel />}
            {devSubTab === 'services' && <OBDServicesPanel />}
            {devSubTab === 'binary' && <BinaryUploadPanel />}
            {devSubTab === 'coding' && <div style={{ height: 'calc(100vh - 280px)' }}><VehicleCoding /></div>}
            {devSubTab === 'canam' && <div style={{ height: 'calc(100vh - 280px)' }}><CanAmVinChanger /></div>}
            {devSubTab === 'procedures' && <div style={{ height: 'calc(100vh - 280px)' }}><ServiceProcedures /></div>}
            {devSubTab === 'talon' && <HondaTalonTuner wp8Data={injectedWP8} onBack={() => setActiveTab('analyzer')} />}
            {devSubTab === 'users' && <UserManagementPanel />}
            {devSubTab === 'geofence' && <GeofencePanel />}
            {devSubTab === 'qa' && <QAChecklistPanel />}
            {devSubTab === 'notifications' && <AdminNotificationPanel onClose={() => setActiveTab('analyzer')} />}
            {devSubTab === 'offsets' && <OffsetCalibrationPanel binary={new Uint8Array()} a2lOffsets={new Map()} />}
            {devSubTab === 'reverseeng' && <ReverseEngineeringPanel />}
            {devSubTab === 'notifprefs' && <NotificationPrefsPanel />}
          </div>
        )}
        {activeTab === 'diagnostic' && <div className="ppei-anim-fade-up" style={{ height: 'calc(100vh - 120px)' }}><KnoxDiagnosticAgent onInjectPids={(pids) => { setDiagnosticPids(pids); setActiveTab('datalogger'); }} onSwitchToDatalogger={() => setActiveTab('datalogger')} onSwitchToAnalyzer={() => setActiveTab('analyzer')} /></div>}
        {activeTab === 'datalogger' && <div className="ppei-anim-fade-up"><DataloggerPanel onOpenInAnalyzer={(csv: string, filename: string) => { setInjectedCSV({ csv, filename }); setActiveTab('analyzer'); }} injectedPids={diagnosticPids} /></div>}
        {activeTab === 'editor' && (
          <div className="ppei-anim-fade-up">
            <EditorGate />
          </div>
        )}

        {activeTab === 'intellispy' && <div className="ppei-anim-fade-up" style={{ height: 'calc(100vh - 200px)' }}><IntelliSpy /></div>}
        {activeTab === 'flash' && <div className="ppei-anim-fade-up" style={{ height: 'calc(100vh - 200px)', padding: '1rem' }}><FlashContainerPanel /></div>}
        {activeTab === 'talon' && <div className="ppei-anim-fade-up"><HondaTalonTuner wp8Data={injectedWP8} onBack={() => setActiveTab('analyzer')} /></div>}
        {activeTab === 'support' && <div className="ppei-anim-fade-up"><React.Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', fontFamily: sFont.mono, color: sColor.textDim }}>LOADING...</div>}><StratPanel /></React.Suspense>{isSuperAdmin && <div style={{ marginTop: '2rem', borderTop: '1px solid oklch(0.25 0.008 260)', paddingTop: '1.5rem' }}><SupportAdminPanel /></div>}</div>}
        {activeTab === 'pitch' && <div className="ppei-anim-fade-up"><React.Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', fontFamily: sFont.mono, color: sColor.textDim }}>LOADING...</div>}><PitchPanel /></React.Suspense></div>}
        {activeTab === 'tasks' && <div className="ppei-anim-fade-up"><TasksGate /></div>}
        {activeTab === ('fleet' as TabId) && <div className="ppei-anim-fade-up"><React.Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', fontFamily: sFont.mono, color: sColor.textDim }}>LOADING...</div>}><FleetPanel /></React.Suspense></div>}
        {activeTab === ('competition' as TabId) && <div className="ppei-anim-fade-up"><React.Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', fontFamily: sFont.mono, color: sColor.textDim }}>LOADING...</div>}><CompetitionPanel /></React.Suspense></div>}
        {activeTab === ('weather' as TabId) && <div className="ppei-anim-fade-up"><React.Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', fontFamily: sFont.mono, color: sColor.textDim }}>LOADING...</div>}><WeatherPanel /></React.Suspense></div>}
        {activeTab === ('cloud' as TabId) && <div className="ppei-anim-fade-up"><React.Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', fontFamily: sFont.mono, color: sColor.textDim }}>LOADING...</div>}><CloudPanel /></React.Suspense></div>}
      </main>

      {/* Voice Command Button */}
      <VoiceCommandButton position="bottom-right" />

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${sColor.borderLight}`, marginTop: '3rem', padding: '1.5rem 0' }}>
        <div style={{ height: '2px', background: `linear-gradient(90deg, ${sColor.red} 0%, oklch(0.65 0.20 40) 40%, ${sColor.yellow} 60%, ${sColor.green} 80%, ${sColor.blue} 100%)`, marginBottom: '1rem' }} />
        <div className="container mx-auto px-4 text-center">
          <p style={{ fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.12em', color: 'oklch(0.55 0.008 260)' }}>
            PPEI CUSTOM TUNING · V-OP PRO · PPEI.COM
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── Tasks Access Gate ──────────────────────────────────────────────────────

const TASKS_CODE = 'KINGKONG';

function TasksGate() {
  // DEV BYPASS: skip access code gate for faster development
  const [unlocked, setUnlocked] = useState(true /* was: false */);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = () => {
    if (code.toUpperCase() === TASKS_CODE) {
      setUnlocked(true);
    } else {
      setError(true);
      setShake(true);
      setAttempts(prev => prev + 1);
      setTimeout(() => setShake(false), 500);
      setTimeout(() => setError(false), 2000);
    }
  };

  const funnyMessages = [
    "Wrong code. The task tracker doesn't trust you yet.",
    "Nope. Even the bug backlog has better luck than your guesses.",
    "Access denied. Try reading the sprint notes... oh wait.",
    "That ain't it chief. The CI pipeline just failed in sympathy.",
    "Incorrect. The unit tests are weeping.",
  ];

  if (unlocked) {
    return (
      <React.Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', fontFamily: sFont.mono, color: sColor.textDim }}>LOADING...</div>}>
        <TasksPanel />
      </React.Suspense>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '3rem 2rem', minHeight: '400px',
    }}>
      <div style={{
        width: '64px', height: '64px', borderRadius: '50%',
        background: 'oklch(0.14 0.008 260)', border: `2px solid ${sColor.red}4d`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '1.5rem', boxShadow: `0 0 30px ${sColor.red}1a`,
      }}>
        <Lock style={{ width: 28, height: 28, color: sColor.red }} />
      </div>

      <h3 style={{
        fontFamily: sFont.heading, fontSize: '1.6rem', letterSpacing: '0.12em',
        color: 'white', marginBottom: '0.5rem',
      }}>QA TASK TRACKER</h3>

      <p style={{
        fontFamily: sFont.body, fontSize: '0.9rem', color: sColor.textDim,
        maxWidth: '360px', marginBottom: '2rem',
      }}>Enter the access code to view the task tracker.</p>

      <div className={shake ? 'ppei-shake' : ''} style={{ width: '100%', maxWidth: '320px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input
            ref={inputRef}
            type="password"
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Enter access code..."
            style={{
              flex: 1, padding: '10px 14px',
              fontFamily: sFont.mono, fontSize: '0.95rem', letterSpacing: '0.15em',
              background: sColor.bgDark,
              border: `2px solid ${error ? sColor.red : 'oklch(0.25 0.008 260)'}`,
              borderRadius: '3px', color: 'white', outline: 'none',
              textAlign: 'center', textTransform: 'uppercase',
              transition: 'border-color 0.2s',
            }}
          />
          <button
            onClick={handleSubmit}
            style={{
              padding: '10px 18px',
              background: `${sColor.red}33`, border: `1px solid ${sColor.red}80`,
              borderRadius: '3px', color: sColor.red,
              fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.08em',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >UNLOCK</button>
        </div>

        {error && attempts > 0 && (
          <p style={{
            fontFamily: sFont.body, fontSize: '0.8rem',
            color: sColor.red, marginTop: '8px',
            animation: 'fadeIn 0.3s ease',
          }}>
            {funnyMessages[(attempts - 1) % funnyMessages.length]}
          </p>
        )}
      </div>

      {attempts >= 3 && (
        <p style={{
          fontFamily: sFont.mono, fontSize: '0.7rem',
          color: 'oklch(0.55 0.008 260)', marginTop: '2rem',
        }}>Hint: Think big. Think primate. Think chest-pounding dominance.</p>
      )}
    </div>
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────

export default function Advanced() {
  const [, navigate] = useLocation();
  return <AdvancedDashboard onLock={() => navigate('/')} />;
}
