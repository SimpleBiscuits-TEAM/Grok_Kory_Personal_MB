/**
 * Knox Diagnostic Agent — AI-powered diagnostic helper
 * 
 * Flow:
 * 1. Knox greets: "What are you trying to figure out?"
 * 2. Customer describes the problem in plain English
 * 3. Knox maps complaint → PIDs + test conditions
 * 4. Customer clicks "Accept PIDs" → auto-populates Datalogger
 * 5. Customer records data → uploads → Knox analyzes
 * 6. Knox suggests additional PIDs if needed → customer clicks Accept
 * 
 * Design: PPEI Industrial Dark theme with red accents
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { Streamdown } from 'streamdown';
import {
  Brain, Send, Loader2, CheckCircle, AlertTriangle,
  ChevronDown, ChevronRight, Upload, Gauge, ClipboardList,
  Zap, ArrowRight, RotateCcw, Info, Shield, Target
} from 'lucide-react';

// ─── Theme constants ────────────────────────────────────────────────────────
const sColor = {
  bg: '#0a0a0a',
  panel: 'oklch(0.14 0.005 260)',
  panelLight: 'oklch(0.18 0.005 260)',
  red: 'oklch(0.52 0.22 25)',
  redBright: 'oklch(0.60 0.22 25)',
  green: 'oklch(0.72 0.19 145)',
  yellow: 'oklch(0.80 0.18 85)',
  text: '#e0e0e0',
  textDim: '#888',
  border: 'oklch(0.25 0.005 260)',
};

const sFont = {
  heading: "'Bebas Neue', sans-serif",
  body: "'Rajdhani', sans-serif",
  mono: "'Share Tech Mono', monospace",
};

// ─── Types ──────────────────────────────────────────────────────────────────
interface RecommendedPid {
  pid: number;
  service: number;
  name: string;
  shortName: string;
  unit: string;
  category: string;
}

interface TestCondition {
  title: string;
  description: string;
  steps: string[];
  duration: string;
  warnings: string[];
}

interface DiagnosticMessage {
  id: string;
  role: 'knox' | 'user' | 'system';
  content: string;
  timestamp: number;
  pids?: RecommendedPid[];
  testCondition?: TestCondition;
  confidence?: 'high' | 'medium' | 'low';
  missingPids?: RecommendedPid[];
}

export interface KnoxDiagnosticAgentProps {
  onInjectPids?: (pids: { pid: number; service: number; name: string; shortName: string }[]) => void;
  onSwitchToDatalogger?: () => void;
  onSwitchToAnalyzer?: () => void;
}

// ─── PID Card Component ─────────────────────────────────────────────────────
function PidCard({ pids, onAccept, accepted, label }: {
  pids: RecommendedPid[];
  onAccept: () => void;
  accepted: boolean;
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const groupedByCategory = pids.reduce((acc, p) => {
    const cat = p.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {} as Record<string, RecommendedPid[]>);

  return (
    <div style={{
      background: sColor.panelLight,
      border: `1px solid ${accepted ? sColor.green : sColor.red}`,
      borderLeft: `3px solid ${accepted ? sColor.green : sColor.red}`,
      borderRadius: 4,
      padding: '12px 16px',
      marginTop: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Gauge style={{ width: 16, height: 16, color: accepted ? sColor.green : sColor.red }} />
          <span style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: 'white', letterSpacing: 1 }}>
            {label} — {pids.length} PIDs
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: 'transparent', border: `1px solid ${sColor.border}`, color: sColor.textDim,
              padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: sFont.body, fontSize: '0.8rem',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {expanded ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronRight style={{ width: 14, height: 14 }} />}
            {expanded ? 'Hide' : 'View PIDs'}
          </button>
          <button
            onClick={onAccept}
            disabled={accepted}
            style={{
              background: accepted ? sColor.green : sColor.red,
              color: 'white', border: 'none', padding: '4px 14px', borderRadius: 3,
              cursor: accepted ? 'default' : 'pointer', fontFamily: sFont.heading,
              fontSize: '0.9rem', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 4,
              opacity: accepted ? 0.7 : 1,
            }}
          >
            {accepted ? <><CheckCircle style={{ width: 14, height: 14 }} /> ACCEPTED</> : <><Zap style={{ width: 14, height: 14 }} /> ACCEPT PIDs</>}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12 }}>
          {Object.entries(groupedByCategory).map(([cat, catPids]) => (
            <div key={cat} style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.red, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                {cat}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 4 }}>
                {catPids.map(p => (
                  <div key={`${p.service}-${p.pid}`} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '4px 8px', background: 'oklch(0.12 0.005 260)', borderRadius: 2,
                    fontFamily: sFont.mono, fontSize: '0.75rem',
                  }}>
                    <span style={{ color: sColor.text }}>{p.name}</span>
                    <span style={{ color: sColor.textDim }}>
                      {p.service === 0x22 ? 'M22' : 'M01'} 0x{p.pid.toString(16).toUpperCase()} [{p.unit}]
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Test Condition Card ────────────────────────────────────────────────────
function TestConditionCard({ condition }: { condition: TestCondition }) {
  return (
    <div style={{
      background: sColor.panelLight,
      border: `1px solid oklch(0.55 0.15 200)`,
      borderLeft: `3px solid oklch(0.55 0.15 200)`,
      borderRadius: 4,
      padding: '12px 16px',
      marginTop: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Target style={{ width: 16, height: 16, color: 'oklch(0.55 0.15 200)' }} />
        <span style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: 'white', letterSpacing: 1 }}>
          TEST CONDITIONS — {condition.title}
        </span>
      </div>
      <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.text, margin: '0 0 8px 0' }}>
        {condition.description}
      </p>
      <div style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.text }}>
        <div style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: sColor.red, marginBottom: 4, letterSpacing: 1 }}>STEPS:</div>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {condition.steps.map((step, i) => (
            <li key={i} style={{ marginBottom: 4 }}>{step}</li>
          ))}
        </ol>
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontFamily: sFont.mono, fontSize: '0.75rem' }}>
        <span style={{ color: sColor.textDim }}>Duration: <span style={{ color: sColor.green }}>{condition.duration}</span></span>
      </div>
      {condition.warnings.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {condition.warnings.map((w, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.yellow,
              padding: '4px 8px', background: 'oklch(0.15 0.03 85)', borderRadius: 2, marginTop: 4,
            }}>
              <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Confidence Badge ───────────────────────────────────────────────────────
function ConfidenceBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  const colors = {
    high: sColor.green,
    medium: sColor.yellow,
    low: sColor.red,
  };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 2,
      background: `color-mix(in oklch, ${colors[level]} 20%, transparent)`,
      border: `1px solid ${colors[level]}`,
      fontFamily: sFont.mono, fontSize: '0.7rem', color: colors[level],
      textTransform: 'uppercase', letterSpacing: 1,
    }}>
      <Shield style={{ width: 12, height: 12 }} />
      {level} confidence
    </span>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function KnoxDiagnosticAgent({
  onInjectPids,
  onSwitchToDatalogger,
  onSwitchToAnalyzer,
}: KnoxDiagnosticAgentProps) {
  const [messages, setMessages] = useState<DiagnosticMessage[]>([
    {
      id: 'welcome',
      role: 'knox',
      content: "I'm Knox, your diagnostic agent. **What are you trying to figure out?** Describe the problem and I'll set up the right PIDs and test conditions for you.",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [acceptedPidSets, setAcceptedPidSets] = useState<Set<string>>(new Set());
  const [vehicleYear, setVehicleYear] = useState<number | undefined>();
  const [vehicleEngine, setVehicleEngine] = useState<string | undefined>();
  const [datalogFile, setDatalogFile] = useState<File | null>(null);
  const [showDatalogUpload, setShowDatalogUpload] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mapComplaint = trpc.diagnosticAgent.mapComplaint.useMutation();
  const analyzeDatalog = trpc.diagnosticAgent.analyzeDatalog.useMutation();

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = useCallback((msg: Omit<DiagnosticMessage, 'id' | 'timestamp'>) => {
    setMessages(prev => [...prev, {
      ...msg,
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
    }]);
  }, []);

  const handleAcceptPids = useCallback((msgId: string, pids: RecommendedPid[]) => {
    setAcceptedPidSets(prev => { const next = new Set(prev); next.add(msgId); return next; });
    if (onInjectPids) {
      onInjectPids(pids.map(p => ({
        pid: p.pid,
        service: p.service,
        name: p.name,
        shortName: p.shortName,
      })));
    }
    addMessage({
      role: 'system',
      content: `✓ ${pids.length} PIDs loaded into Datalogger. Connect your adapter and start recording.`,
    });
  }, [onInjectPids, addMessage]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    setInput('');

    addMessage({ role: 'user', content: userMessage });
    setIsLoading(true);

    try {
      const result = await mapComplaint.mutateAsync({
        complaint: userMessage,
        vehicleYear,
        vehicleEngine,
      });

      addMessage({
        role: 'knox',
        content: result.knoxExplanation,
        pids: result.recommendedPids,
        testCondition: result.testCondition,
      });

      // Show datalog upload option after first diagnosis
      setShowDatalogUpload(true);
    } catch (err) {
      addMessage({
        role: 'knox',
        content: "I had trouble processing that. Could you describe the problem differently? For example: 'rapid soot loading and reduced engine power' or 'turbo lag above 3000 RPM'.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, mapComplaint, vehicleYear, vehicleEngine, addMessage]);

  const handleDatalogUpload = useCallback(async (file: File) => {
    setDatalogFile(file);
    setIsLoading(true);

    addMessage({
      role: 'system',
      content: `Uploading datalog: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`,
    });

    try {
      const text = await file.text();
      const lines = text.split('\n');
      const headers = lines[0]?.split(',').map(h => h.trim().replace(/"/g, '')) || [];

      // Build a quick data summary for Knox
      const dataRows = lines.slice(1).filter(l => l.trim());
      const numRows = dataRows.length;

      // Extract key stats from first/last/min/max of numeric columns
      const stats: string[] = [`Rows: ${numRows}`, `Columns: ${headers.length}`];
      const numericCols: Record<string, number[]> = {};
      headers.forEach((h, i) => {
        const vals: number[] = [];
        for (let r = 0; r < Math.min(dataRows.length, 500); r++) {
          const cells = dataRows[r].split(',');
          const v = parseFloat(cells[i]);
          if (!isNaN(v)) vals.push(v);
        }
        if (vals.length > 10) numericCols[h] = vals;
      });

      for (const [col, vals] of Object.entries(numericCols).slice(0, 20)) {
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        stats.push(`${col}: min=${min.toFixed(1)}, max=${max.toFixed(1)}, avg=${avg.toFixed(1)}`);
      }

      // Get the last complaint from messages
      const lastComplaint = messages.filter(m => m.role === 'user').pop()?.content || 'general diagnostic';

      const result = await analyzeDatalog.mutateAsync({
        complaint: lastComplaint,
        availablePids: headers,
        dataSummary: stats.join('\n'),
        vehicleYear,
        vehicleEngine,
      });

      addMessage({
        role: 'knox',
        content: result.analysis,
        confidence: result.confidence as 'high' | 'medium' | 'low',
        missingPids: result.missingPids,
      });

      if (result.missingPids.length > 0) {
        addMessage({
          role: 'knox',
          content: `I can work with what we have, but I'd be more confident with ${result.missingPids.length} additional PID${result.missingPids.length > 1 ? 's' : ''}. Accept them below and record another datalog to dial it in.`,
          pids: result.missingPids,
        });
      }
    } catch (err) {
      addMessage({
        role: 'knox',
        content: "I had trouble reading that datalog. Make sure it's a CSV file from your datalogger.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [messages, analyzeDatalog, vehicleYear, vehicleEngine, addMessage]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: sColor.bg, fontFamily: sFont.body,
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 20px',
        background: sColor.panel,
        borderBottom: `1px solid ${sColor.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Brain style={{ width: 22, height: 22, color: sColor.red }} />
          <span style={{ fontFamily: sFont.heading, fontSize: '1.4rem', color: 'white', letterSpacing: 2 }}>
            KNOX DIAGNOSTIC AGENT
          </span>
          <span style={{
            fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim,
            padding: '2px 6px', background: sColor.panelLight, borderRadius: 2,
          }}>
            AI-POWERED
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Vehicle context selector */}
          <select
            value={vehicleYear || ''}
            onChange={e => setVehicleYear(e.target.value ? parseInt(e.target.value) : undefined)}
            style={{
              background: sColor.panelLight, color: sColor.text, border: `1px solid ${sColor.border}`,
              padding: '4px 8px', borderRadius: 3, fontFamily: sFont.mono, fontSize: '0.75rem',
            }}
          >
            <option value="">Year</option>
            {Array.from({ length: 27 }, (_, i) => 2000 + i).reverse().map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={vehicleEngine || ''}
            onChange={e => setVehicleEngine(e.target.value || undefined)}
            style={{
              background: sColor.panelLight, color: sColor.text, border: `1px solid ${sColor.border}`,
              padding: '4px 8px', borderRadius: 3, fontFamily: sFont.mono, fontSize: '0.75rem',
            }}
          >
            <option value="">Engine</option>
            <option value="L5P 6.6L">L5P 6.6L (2017+)</option>
            <option value="LML 6.6L">LML 6.6L (2011-2016)</option>
            <option value="LBZ 6.6L">LBZ 6.6L (2006-2007)</option>
            <option value="LLY 6.6L">LLY 6.6L (2004-2006)</option>
            <option value="LB7 6.6L">LB7 6.6L (2001-2004)</option>
            <option value="3.0L Duramax">3.0L Duramax (LM2/LZ0)</option>
          </select>
          {onSwitchToDatalogger && (
            <button
              onClick={onSwitchToDatalogger}
              style={{
                background: sColor.red, color: 'white', border: 'none',
                padding: '4px 12px', borderRadius: 3, cursor: 'pointer',
                fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: 1,
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <Gauge style={{ width: 14, height: 14 }} /> DATALOGGER
            </button>
          )}
        </div>
      </div>

      {/* ── Chat Messages ── */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px 20px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {messages.map(msg => (
          <div key={msg.id} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: msg.role === 'system' ? '100%' : '85%',
              padding: msg.role === 'system' ? '6px 12px' : '12px 16px',
              borderRadius: 6,
              background: msg.role === 'user'
                ? sColor.red
                : msg.role === 'system'
                  ? 'oklch(0.12 0.01 200)'
                  : sColor.panel,
              border: msg.role === 'system'
                ? `1px solid oklch(0.25 0.01 200)`
                : msg.role === 'knox'
                  ? `1px solid ${sColor.border}`
                  : 'none',
              borderLeft: msg.role === 'knox' ? `3px solid ${sColor.red}` : undefined,
            }}>
              {msg.role === 'knox' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
                  fontFamily: sFont.heading, fontSize: '0.85rem', color: sColor.red, letterSpacing: 1,
                }}>
                  <Brain style={{ width: 14, height: 14 }} /> KNOX
                  {msg.confidence && <ConfidenceBadge level={msg.confidence} />}
                </div>
              )}
              {msg.role === 'system' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: sFont.mono, fontSize: '0.8rem', color: 'oklch(0.55 0.15 200)',
                }}>
                  <Info style={{ width: 14, height: 14 }} />
                  {msg.content}
                </div>
              )}
              {msg.role !== 'system' && (
                <div style={{
                  fontFamily: sFont.body, fontSize: '0.9rem', color: 'white',
                  lineHeight: 1.5,
                }}>
                  <Streamdown>{msg.content}</Streamdown>
                </div>
              )}

              {/* PID suggestion card */}
              {msg.pids && msg.pids.length > 0 && (
                <PidCard
                  pids={msg.pids}
                  onAccept={() => handleAcceptPids(msg.id, msg.pids!)}
                  accepted={acceptedPidSets.has(msg.id)}
                  label={msg.missingPids ? 'ADDITIONAL PIDs NEEDED' : 'RECOMMENDED PIDs'}
                />
              )}

              {/* Test condition card */}
              {msg.testCondition && (
                <TestConditionCard condition={msg.testCondition} />
              )}

              {/* Missing PIDs card */}
              {msg.missingPids && msg.missingPids.length > 0 && !msg.pids && (
                <PidCard
                  pids={msg.missingPids}
                  onAccept={() => handleAcceptPids(msg.id, msg.missingPids!)}
                  accepted={acceptedPidSets.has(msg.id)}
                  label="ADDITIONAL PIDs TO DIAL IT IN"
                />
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 16px', background: sColor.panel,
            border: `1px solid ${sColor.border}`, borderLeft: `3px solid ${sColor.red}`,
            borderRadius: 6,
          }}>
            <Loader2 style={{ width: 16, height: 16, color: sColor.red, animation: 'spin 1s linear infinite' }} />
            <span style={{ fontFamily: sFont.body, fontSize: '0.9rem', color: sColor.textDim }}>
              Knox is analyzing...
            </span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* ── Datalog Upload Section ── */}
      {showDatalogUpload && (
        <div style={{
          padding: '8px 20px',
          background: sColor.panel,
          borderTop: `1px solid ${sColor.border}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Info style={{ width: 14, height: 14, color: sColor.textDim }} />
          <span style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim }}>
            Already have a datalog?
          </span>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: sColor.panelLight, color: sColor.text,
              border: `1px solid ${sColor.border}`, padding: '4px 10px',
              borderRadius: 3, cursor: 'pointer', fontFamily: sFont.heading,
              fontSize: '0.8rem', letterSpacing: 1,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Upload style={{ width: 14, height: 14 }} /> UPLOAD DATALOG FOR ANALYSIS
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.log,.txt"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleDatalogUpload(file);
              e.target.value = '';
            }}
          />
          {datalogFile && (
            <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.green }}>
              ✓ {datalogFile.name}
            </span>
          )}
        </div>
      )}

      {/* ── Input Area ── */}
      <div style={{
        padding: '12px 20px',
        background: sColor.panel,
        borderTop: `1px solid ${sColor.border}`,
        display: 'flex', gap: 8,
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          placeholder="Describe the problem... e.g. 'rapid soot loading and reduced engine power'"
          disabled={isLoading}
          style={{
            flex: 1, background: sColor.panelLight, color: 'white',
            border: `1px solid ${sColor.border}`, padding: '10px 14px',
            borderRadius: 4, fontFamily: sFont.body, fontSize: '0.9rem',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          style={{
            background: sColor.red, color: 'white', border: 'none',
            padding: '10px 18px', borderRadius: 4, cursor: 'pointer',
            fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: 1,
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: (!input.trim() || isLoading) ? 0.5 : 1,
          }}
        >
          <Send style={{ width: 16, height: 16 }} /> SEND
        </button>
      </div>

      {/* Spin animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
