/**
 * CAN-am VIN Changer — Step-by-step wizard for VIN write via PEAK device
 *
 * Flow:
 *  1. Connect to PCAN bridge (PEAK USB adapter)
 *  2. Identify ECU (MED17.8.5 vs MG1CA920)
 *  3. Read current VIN (DID F190)
 *  4. Enter new VIN
 *  5. Security access (seed/key level 3)
 *  6. Write new VIN ($2E F190)
 *  7. ECU reset
 *  8. DESS key re-learn guidance
 *
 * Uses UDSTransport for all CAN communication via the PCAN bridge.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Wifi, WifiOff, Shield, ShieldCheck, ShieldX, Key, FileText,
  AlertTriangle, CheckCircle, XCircle, Loader2, ArrowRight,
  ArrowLeft, RotateCcw, Cpu, Radio, Fingerprint, Edit3,
  RefreshCw, Info, AlertCircle, ChevronDown, ChevronRight, Zap
} from 'lucide-react';
import { UDSTransport } from '@/lib/udsTransport';
import { computeCanamKey, computeBrpDashKey } from '@/lib/udsReference';

// ─── Styles (matching PPEI industrial theme) ────────────────────────────────

const sFont = { heading: '"Bebas Neue", "Impact", sans-serif', body: '"Rajdhani", sans-serif', mono: '"Share Tech Mono", monospace' };
const sColor = {
  bg: 'oklch(0.10 0.005 260)', bgCard: 'oklch(0.13 0.006 260)',
  border: 'oklch(0.22 0.008 260)', borderLight: 'oklch(0.18 0.006 260)',
  red: 'oklch(0.52 0.22 25)', green: 'oklch(0.65 0.20 145)', blue: 'oklch(0.70 0.18 200)',
  yellow: 'oklch(0.75 0.18 60)', orange: 'oklch(0.65 0.20 55)',
  text: 'oklch(0.95 0.005 260)', textDim: 'oklch(0.68 0.010 260)',
  textMuted: 'oklch(0.58 0.008 260)', purple: 'oklch(0.60 0.20 300)',
};

// ─── Types ──────────────────────────────────────────────────────────────────

type WizardStep = 'connect' | 'identify' | 'read-vin' | 'enter-vin' | 'security' | 'write-vin' | 'reset' | 'dess-keys' | 'complete';

interface ECUInfo {
  softwareNumber?: string;
  hardwareNumber?: string;
  ecuType: 'MED17.8.5' | 'MG1CA920' | 'unknown';
  activeSession?: number;
  bootVersion?: string;
}

interface StepLog {
  timestamp: number;
  step: WizardStep;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning' | 'data';
  hex?: string;
}

// ─── VIN Validation ─────────────────────────────────────────────────────────

function isValidVIN(vin: string): { valid: boolean; reason?: string } {
  if (vin.length !== 17) return { valid: false, reason: `VIN must be exactly 17 characters (got ${vin.length})` };
  if (/[IOQ]/i.test(vin)) return { valid: false, reason: 'VIN cannot contain I, O, or Q' };
  if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) return { valid: false, reason: 'VIN contains invalid characters' };
  return { valid: true };
}

function isBRPVin(vin: string): boolean {
  // BRP WMIs: 2BP (Can-Am on-road), 3JB (Sea-Doo), 2BV (Can-Am off-road)
  const wmi = vin.substring(0, 3).toUpperCase();
  return ['2BP', '3JB', '2BV', '2B2', '3B4'].includes(wmi);
}

// ─── Step Indicator ─────────────────────────────────────────────────────────

const STEPS: { id: WizardStep; label: string; icon: React.ReactNode }[] = [
  { id: 'connect', label: 'CONNECT', icon: <Wifi style={{ width: 14, height: 14 }} /> },
  { id: 'identify', label: 'IDENTIFY ECU', icon: <Cpu style={{ width: 14, height: 14 }} /> },
  { id: 'read-vin', label: 'READ VIN', icon: <Fingerprint style={{ width: 14, height: 14 }} /> },
  { id: 'enter-vin', label: 'NEW VIN', icon: <Edit3 style={{ width: 14, height: 14 }} /> },
  { id: 'security', label: 'SECURITY', icon: <Shield style={{ width: 14, height: 14 }} /> },
  { id: 'write-vin', label: 'WRITE VIN', icon: <FileText style={{ width: 14, height: 14 }} /> },
  { id: 'reset', label: 'ECU RESET', icon: <RotateCcw style={{ width: 14, height: 14 }} /> },
  { id: 'dess-keys', label: 'DESS KEYS', icon: <Key style={{ width: 14, height: 14 }} /> },
  { id: 'complete', label: 'DONE', icon: <CheckCircle style={{ width: 14, height: 14 }} /> },
];

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const currentIdx = STEPS.findIndex(s => s.id === currentStep);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', overflowX: 'auto', padding: '12px 0' }}>
      {STEPS.map((step, i) => {
        const isActive = i === currentIdx;
        const isDone = i < currentIdx;
        const color = isDone ? sColor.green : isActive ? sColor.red : sColor.textMuted;
        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px',
              background: isActive ? 'oklch(0.18 0.02 25)' : isDone ? 'oklch(0.15 0.01 145)' : 'transparent',
              border: `1px solid ${isActive ? sColor.red : isDone ? 'oklch(0.30 0.10 145)' : sColor.borderLight}`,
              borderRadius: '2px', whiteSpace: 'nowrap',
            }}>
              <span style={{ color }}>{step.icon}</span>
              <span style={{
                fontFamily: sFont.mono, fontSize: '0.65rem', letterSpacing: '0.05em', color,
              }}>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <ArrowRight style={{ width: 10, height: 10, color: isDone ? sColor.green : sColor.textMuted, flexShrink: 0 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Log Panel ──────────────────────────────────────────────────────────────

function LogPanel({ logs }: { logs: StepLog[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const typeColor: Record<StepLog['type'], string> = {
    info: sColor.textDim,
    success: sColor.green,
    error: sColor.red,
    warning: sColor.yellow,
    data: sColor.blue,
  };

  return (
    <div style={{
      background: 'oklch(0.06 0.003 260)', border: `1px solid ${sColor.borderLight}`,
      borderRadius: '2px', padding: '8px', maxHeight: '200px', overflowY: 'auto',
      fontFamily: sFont.mono, fontSize: '0.7rem', lineHeight: '1.6',
    }}>
      {logs.length === 0 && (
        <div style={{ color: sColor.textMuted, fontStyle: 'italic' }}>Waiting for activity...</div>
      )}
      {logs.map((log, i) => (
        <div key={i} style={{ display: 'flex', gap: '8px', color: typeColor[log.type] }}>
          <span style={{ color: sColor.textMuted, flexShrink: 0 }}>
            {new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span>{log.message}</span>
          {log.hex && <span style={{ color: sColor.purple, marginLeft: '4px' }}>[{log.hex}]</span>}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function CanAmVinChanger() {
  const [step, setStep] = useState<WizardStep>('connect');
  const [logs, setLogs] = useState<StepLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Connection state
  const transportRef = useRef<UDSTransport | null>(null);
  const [connected, setConnected] = useState(false);

  // ECU state
  const [ecuInfo, setEcuInfo] = useState<ECUInfo | null>(null);

  // VIN state
  const [currentVin, setCurrentVin] = useState<string | null>(null);
  const [newVin, setNewVin] = useState('');
  const [vinValidation, setVinValidation] = useState<{ valid: boolean; reason?: string } | null>(null);

  // Security state
  const [securityUnlocked, setSecurityUnlocked] = useState(false);
  const [seed, setSeed] = useState<number | null>(null);
  const [computedKey, setComputedKey] = useState<number | null>(null);

  // Write state
  const [writeSuccess, setWriteSuccess] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  // Confirmation
  const [confirmWrite, setConfirmWrite] = useState(false);

  const addLog = useCallback((stepId: WizardStep, message: string, type: StepLog['type'] = 'info', hex?: string) => {
    setLogs(prev => [...prev, { timestamp: Date.now(), step: stepId, message, type, hex }]);
  }, []);

  // ─── Step 1: Connect ────────────────────────────────────────────────────

  const handleConnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    addLog('connect', 'Initializing UDS transport...');

    try {
      const transport = new UDSTransport({ timeout: 5000 });
      transport.onLog((event) => {
        if (event.message) addLog('connect', event.message, 'info');
      });

      const ok = await transport.connect();
      if (!ok) {
        setError('Could not connect to PCAN bridge. Make sure pcan_bridge.py is running and PEAK adapter is plugged in.');
        addLog('connect', 'Connection failed', 'error');
        setLoading(false);
        return;
      }

      transportRef.current = transport;
      setConnected(true);
      addLog('connect', 'Connected to PCAN bridge', 'success');
      setStep('identify');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      addLog('connect', `Error: ${msg}`, 'error');
    }
    setLoading(false);
  }, [addLog]);

  // ─── Step 2: Identify ECU ───────────────────────────────────────────────

  const handleIdentify = useCallback(async () => {
    const transport = transportRef.current;
    if (!transport) return;
    setLoading(true);
    setError(null);

    try {
      // Switch to extended diagnostic session
      addLog('identify', 'Switching to Extended Diagnostic Session ($10 03)...');
      const sessionResp = await transport.diagnosticSessionControl('extended');
      if (!sessionResp.success) {
        addLog('identify', `Session switch failed: ${sessionResp.nrcDescription || 'Unknown error'}`, 'error');
        // Try default session first, then extended
        addLog('identify', 'Trying default session first...');
        await transport.diagnosticSessionControl('default');
        await new Promise(r => setTimeout(r, 500));
        const retry = await transport.diagnosticSessionControl('extended');
        if (!retry.success) {
          setError(`Cannot enter extended session: ${retry.nrcDescription || 'ECU rejected'}`);
          setLoading(false);
          return;
        }
      }
      addLog('identify', 'Extended session active', 'success');

      // Start tester present to keep session alive
      transport.startTesterPresent(2000);

      // Read ECU software number (F188)
      addLog('identify', 'Reading ECU Software Number (DID F188)...');
      const swResp = await transport.readECUSoftwareNumber();
      const swNumber = swResp || 'Unknown';
      addLog('identify', `Software: ${swNumber}`, 'data');

      // Read ECU hardware number (F191)
      addLog('identify', 'Reading ECU Hardware Number (DID F191)...');
      const hwResp = await transport.readDataByIdentifier(0xF191);
      let hwNumber = 'Unknown';
      if (hwResp.success && hwResp.data.length > 2) {
        hwNumber = String.fromCharCode(...hwResp.data.slice(2).filter(b => b >= 0x20 && b <= 0x7E));
      }
      addLog('identify', `Hardware: ${hwNumber}`, 'data');

      // Read boot software version (F180)
      addLog('identify', 'Reading Boot Software ID (DID F180)...');
      const bootResp = await transport.readDataByIdentifier(0xF180);
      let bootVersion = 'Unknown';
      if (bootResp.success && bootResp.data.length > 2) {
        bootVersion = String.fromCharCode(...bootResp.data.slice(2).filter(b => b >= 0x20 && b <= 0x7E));
      }
      addLog('identify', `Boot SW: ${bootVersion}`, 'data');

      // Determine ECU type
      let ecuType: ECUInfo['ecuType'] = 'unknown';
      const combined = (swNumber + hwNumber + bootVersion).toLowerCase();
      if (combined.includes('mg1ca920') || combined.includes('mg1c')) {
        ecuType = 'MG1CA920';
      } else if (combined.includes('med17') || combined.includes('med 17')) {
        ecuType = 'MED17.8.5';
      } else if (combined.includes('bosch') || combined.includes('rotax')) {
        // Heuristic: newer firmware versions likely MG1CA920
        ecuType = 'MED17.8.5'; // Default to older, more likely to work
      }

      const info: ECUInfo = { softwareNumber: swNumber, hardwareNumber: hwNumber, ecuType, bootVersion };
      setEcuInfo(info);
      addLog('identify', `ECU identified: ${ecuType}`, ecuType === 'unknown' ? 'warning' : 'success');

      if (ecuType === 'MG1CA920') {
        addLog('identify', '⚠ MG1CA920 detected — post-2022.5 models may have locked security access', 'warning');
        addLog('identify', 'VIN write uses dealer-level security (Level 3), which may still work', 'info');
      }

      setStep('read-vin');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      addLog('identify', `Error: ${msg}`, 'error');
    }
    setLoading(false);
  }, [addLog]);

  // ─── Step 3: Read Current VIN ───────────────────────────────────────────

  const handleReadVin = useCallback(async () => {
    const transport = transportRef.current;
    if (!transport) return;
    setLoading(true);
    setError(null);

    try {
      addLog('read-vin', 'Reading VIN from ECU (DID F190)...');
      const vin = await transport.readVIN();

      if (vin) {
        setCurrentVin(vin);
        addLog('read-vin', `Current VIN: ${vin}`, 'success');

        if (isBRPVin(vin)) {
          addLog('read-vin', 'BRP/CAN-am VIN confirmed', 'success');
        } else {
          addLog('read-vin', 'Warning: VIN does not match known BRP/CAN-am WMI codes', 'warning');
        }

        // Also read engine serial (F18C)
        addLog('read-vin', 'Reading Engine Serial Number (DID F18C)...');
        const serialResp = await transport.readDataByIdentifier(0xF18C);
        if (serialResp.success && serialResp.data.length > 2) {
          const serial = String.fromCharCode(...serialResp.data.slice(2).filter(b => b >= 0x20 && b <= 0x7E));
          addLog('read-vin', `Engine Serial: ${serial}`, 'data');
        }

        setStep('enter-vin');
      } else {
        setError('Could not read VIN from ECU. The ECU may not support DID F190 or communication failed.');
        addLog('read-vin', 'VIN read failed', 'error');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      addLog('read-vin', `Error: ${msg}`, 'error');
    }
    setLoading(false);
  }, [addLog]);

  // ─── Step 4: Enter New VIN ──────────────────────────────────────────────

  const handleVinInput = useCallback((value: string) => {
    const upper = value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17);
    setNewVin(upper);
    if (upper.length > 0) {
      setVinValidation(isValidVIN(upper));
    } else {
      setVinValidation(null);
    }
  }, []);

  const handleProceedToSecurity = useCallback(() => {
    if (!vinValidation?.valid) return;
    if (newVin === currentVin) {
      setError('New VIN is the same as the current VIN');
      return;
    }
    setError(null);
    setStep('security');
  }, [vinValidation, newVin, currentVin]);

  // ─── Step 5: Security Access ────────────────────────────────────────────

  const handleSecurityAccess = useCallback(async () => {
    const transport = transportRef.current;
    if (!transport) return;
    setLoading(true);
    setError(null);

    try {
      // Request seed at level 3
      addLog('security', 'Requesting security seed ($27 03)...');
      const seedResp = await transport.securityAccessRequestSeed(0x03);

      if (!seedResp.success) {
        if (seedResp.nrc === 0x37) {
          addLog('security', 'requiredTimeDelayNotExpired — ECU needs cooldown. Wait 10 seconds and retry.', 'warning');
          setError('ECU security cooldown active. Wait 10 seconds and try again.');
        } else if (seedResp.nrc === 0x36) {
          addLog('security', 'exceededNumberOfAttempts — ECU locked out. Power cycle the vehicle.', 'error');
          setError('Security access locked out. Power cycle the vehicle and try again.');
        } else if (seedResp.nrc === 0x12) {
          addLog('security', 'subFunctionNotSupported — This ECU may not support Level 3 security', 'error');
          setError('ECU does not support security access Level 3. This may be a locked MG1CA920.');
        } else {
          addLog('security', `Seed request failed: ${seedResp.nrcDescription || `NRC 0x${(seedResp.nrc || 0).toString(16)}`}`, 'error');
          setError(`Security access failed: ${seedResp.nrcDescription || 'Unknown error'}`);
        }
        setLoading(false);
        return;
      }

      // Extract 16-bit seed from response
      // Response data: [subFunction, seedHi, seedLo]
      if (seedResp.data.length < 3) {
        addLog('security', 'Seed response too short', 'error');
        setError('Invalid seed response from ECU');
        setLoading(false);
        return;
      }

      const seedValue = (seedResp.data[1] << 8) | seedResp.data[2];
      setSeed(seedValue);
      addLog('security', `Seed received: 0x${seedValue.toString(16).padStart(4, '0')}`, 'data',
        seedResp.data.map(b => b.toString(16).padStart(2, '0')).join(' '));

      if (seedValue === 0x0000) {
        addLog('security', 'Seed is 0x0000 — ECU is already unlocked!', 'success');
        setSecurityUnlocked(true);
        setStep('write-vin');
        setLoading(false);
        return;
      }

      // Compute key using CAN-am algorithm
      const key = computeCanamKey(seedValue, 3);
      setComputedKey(key);
      addLog('security', `Key computed: 0x${key.toString(16).padStart(4, '0')}`, 'data');

      // Send key ($27 04)
      const keyHi = (key >> 8) & 0xFF;
      const keyLo = key & 0xFF;
      addLog('security', `Sending key ($27 04 ${keyHi.toString(16).padStart(2, '0')} ${keyLo.toString(16).padStart(2, '0')})...`);
      const keyResp = await transport.securityAccessSendKey(0x03, [keyHi, keyLo]);

      if (keyResp.success) {
        addLog('security', 'Security access GRANTED — Level 3 unlocked', 'success');
        setSecurityUnlocked(true);
        setStep('write-vin');
      } else {
        if (keyResp.nrc === 0x35) {
          addLog('security', 'invalidKey — The computed key was rejected by the ECU', 'error');
          addLog('security', 'This may indicate a different seed/key algorithm (newer MG1CA920 firmware)', 'warning');
          setError('Security key rejected. The ECU may use an updated algorithm not yet supported.');
        } else if (keyResp.nrc === 0x36) {
          addLog('security', 'exceededNumberOfAttempts — Too many failed attempts. Power cycle required.', 'error');
          setError('Too many failed security attempts. Power cycle the vehicle.');
        } else {
          addLog('security', `Key rejected: ${keyResp.nrcDescription || `NRC 0x${(keyResp.nrc || 0).toString(16)}`}`, 'error');
          setError(`Key rejected: ${keyResp.nrcDescription || 'Unknown error'}`);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      addLog('security', `Error: ${msg}`, 'error');
    }
    setLoading(false);
  }, [addLog]);

  // ─── Step 6: Write VIN ──────────────────────────────────────────────────

  const handleWriteVin = useCallback(async () => {
    const transport = transportRef.current;
    if (!transport || !securityUnlocked || !confirmWrite) return;
    setLoading(true);
    setError(null);

    try {
      // Convert VIN string to bytes
      const vinBytes = Array.from(newVin).map(c => c.charCodeAt(0));
      addLog('write-vin', `Writing new VIN: ${newVin} (${vinBytes.length} bytes)`);
      addLog('write-vin', `Hex: ${vinBytes.map(b => b.toString(16).padStart(2, '0')).join(' ')}`, 'data');

      // Write VIN via DID F190
      addLog('write-vin', 'Sending WriteDataByIdentifier ($2E F190)...');
      const writeResp = await transport.writeDataByIdentifier(0xF190, vinBytes);

      if (writeResp.success) {
        addLog('write-vin', 'VIN WRITTEN SUCCESSFULLY', 'success');
        setWriteSuccess(true);

        // Verify by reading back
        addLog('write-vin', 'Verifying — reading VIN back...');
        const verifyVin = await transport.readVIN();
        if (verifyVin === newVin) {
          addLog('write-vin', `Verified: ${verifyVin} ✓`, 'success');
        } else {
          addLog('write-vin', `Readback mismatch: got "${verifyVin}" expected "${newVin}"`, 'warning');
        }

        setStep('reset');
      } else {
        addLog('write-vin', `Write failed: ${writeResp.nrcDescription || `NRC 0x${(writeResp.nrc || 0).toString(16)}`}`, 'error');
        if (writeResp.nrc === 0x33) {
          setError('Security access denied — session may have timed out. Go back to Security step.');
        } else if (writeResp.nrc === 0x72) {
          setError('General programming failure — ECU rejected the write. The VIN area may be protected.');
        } else if (writeResp.nrc === 0x73) {
          setError('Wrong block sequence number — multi-frame write issue. Try again.');
        } else {
          setError(`Write failed: ${writeResp.nrcDescription || 'Unknown error'}`);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      addLog('write-vin', `Error: ${msg}`, 'error');
    }
    setLoading(false);
  }, [addLog, newVin, securityUnlocked, confirmWrite]);

  // ─── Step 7: ECU Reset ──────────────────────────────────────────────────

  const handleReset = useCallback(async () => {
    const transport = transportRef.current;
    if (!transport) return;
    setLoading(true);
    setError(null);

    try {
      addLog('reset', 'Sending ECU Hard Reset ($11 01)...');
      const resetResp = await transport.ecuReset(0x01);

      if (resetResp.success) {
        addLog('reset', 'ECU reset command accepted', 'success');
      } else {
        addLog('reset', `Reset response: ${resetResp.nrcDescription || 'No positive response (expected — ECU is resetting)'}`, 'warning');
      }

      // Stop tester present
      transport.stopTesterPresent();

      addLog('reset', 'Waiting for ECU to restart (5 seconds)...', 'info');
      await new Promise(r => setTimeout(r, 5000));

      addLog('reset', 'ECU reset complete. VIN change is now active.', 'success');
      setResetDone(true);
      setStep('dess-keys');
    } catch (e) {
      // Timeout is expected — ECU is resetting
      addLog('reset', 'ECU is resetting (connection lost as expected)', 'success');
      setResetDone(true);
      setStep('dess-keys');
    }
    setLoading(false);
  }, [addLog]);

  // ─── Disconnect ─────────────────────────────────────────────────────────

  const handleDisconnect = useCallback(() => {
    transportRef.current?.disconnect();
    transportRef.current = null;
    setConnected(false);
    setStep('connect');
    setEcuInfo(null);
    setCurrentVin(null);
    setNewVin('');
    setVinValidation(null);
    setSecurityUnlocked(false);
    setSeed(null);
    setComputedKey(null);
    setWriteSuccess(false);
    setResetDone(false);
    setConfirmWrite(false);
    setError(null);
    addLog('connect', 'Disconnected', 'info');
  }, [addLog]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: sFont.body, color: sColor.text }}>
      {/* Header */}
      <div style={{
        background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderLeft: `3px solid ${sColor.red}`,
        padding: '16px 20px', marginBottom: '16px', borderRadius: '2px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontFamily: sFont.heading, fontSize: '1.4rem', letterSpacing: '0.08em', margin: 0, color: sColor.red }}>
              CAN-AM VIN CHANGER
            </h2>
            <p style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim, margin: '4px 0 0' }}>
              PEAK DEVICE · UDS PROTOCOL · WRITEBYIDENTIFIER ($2E F190)
            </p>
          </div>
          {connected && (
            <button onClick={handleDisconnect} style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
              background: 'transparent', border: `1px solid ${sColor.border}`, borderRadius: '2px',
              color: sColor.textDim, fontFamily: sFont.mono, fontSize: '0.7rem', cursor: 'pointer',
            }}>
              <WifiOff style={{ width: 12, height: 12 }} /> DISCONNECT
            </button>
          )}
        </div>
      </div>

      {/* Step Indicator */}
      <StepIndicator currentStep={step} />

      {/* Error Banner */}
      {error && (
        <div style={{
          background: 'oklch(0.15 0.04 25)', border: `1px solid oklch(0.30 0.10 25)`,
          borderRadius: '2px', padding: '12px 16px', marginBottom: '16px',
          display: 'flex', alignItems: 'flex-start', gap: '10px',
        }}>
          <AlertCircle style={{ width: 16, height: 16, color: sColor.red, flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.red, lineHeight: '1.5' }}>{error}</div>
          <button onClick={() => setError(null)} style={{
            background: 'none', border: 'none', color: sColor.textMuted, cursor: 'pointer', marginLeft: 'auto', flexShrink: 0,
          }}>✕</button>
        </div>
      )}

      {/* Step Content */}
      <div style={{
        background: sColor.bgCard, border: `1px solid ${sColor.border}`,
        borderRadius: '2px', padding: '20px', marginBottom: '16px',
      }}>

        {/* ── CONNECT ────────────────────────────────────────────────── */}
        {step === 'connect' && (
          <div>
            <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.06em', margin: '0 0 12px', color: sColor.text }}>
              STEP 1: CONNECT TO PEAK DEVICE
            </h3>
            <div style={{
              background: 'oklch(0.08 0.003 260)', border: `1px solid ${sColor.borderLight}`,
              borderRadius: '2px', padding: '16px', marginBottom: '16px',
            }}>
              <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, margin: '0 0 8px', lineHeight: '1.6' }}>
                This tool uses a PEAK PCAN-USB adapter to communicate with the CAN-am ECU via raw CAN bus.
                The PCAN bridge script must be running on your computer.
              </p>
              <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.blue, lineHeight: '1.8' }}>
                <div>1. Plug PEAK PCAN-USB into your computer</div>
                <div>2. Connect PCAN-USB to the CAN-am OBD port (or direct CAN bus)</div>
                <div>3. Turn ignition ON (engine off)</div>
                <div>4. Run: <span style={{ color: sColor.yellow }}>python pcan_bridge.py</span></div>
                <div>5. Click CONNECT below</div>
              </div>
            </div>
            <button onClick={handleConnect} disabled={loading} style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px',
              background: sColor.red, border: 'none', borderRadius: '2px',
              fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.08em',
              color: 'white', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
            }}>
              {loading ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> : <Wifi style={{ width: 16, height: 16 }} />}
              {loading ? 'CONNECTING...' : 'CONNECT'}
            </button>
          </div>
        )}

        {/* ── IDENTIFY ECU ───────────────────────────────────────────── */}
        {step === 'identify' && (
          <div>
            <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.06em', margin: '0 0 12px', color: sColor.text }}>
              STEP 2: IDENTIFY ECU
            </h3>
            <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, margin: '0 0 16px', lineHeight: '1.6' }}>
              Reading ECU identification data to determine the hardware platform and firmware version.
            </p>
            {ecuInfo && (
              <div style={{
                background: 'oklch(0.08 0.003 260)', border: `1px solid ${sColor.borderLight}`,
                borderRadius: '2px', padding: '16px', marginBottom: '16px',
              }}>
                <table style={{ width: '100%', fontFamily: sFont.mono, fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['ECU Type', ecuInfo.ecuType, ecuInfo.ecuType === 'unknown' ? sColor.yellow : sColor.green],
                      ['Software', ecuInfo.softwareNumber || 'N/A', sColor.text],
                      ['Hardware', ecuInfo.hardwareNumber || 'N/A', sColor.text],
                      ['Boot SW', ecuInfo.bootVersion || 'N/A', sColor.textDim],
                    ].map(([label, value, color]) => (
                      <tr key={label as string}>
                        <td style={{ padding: '4px 12px 4px 0', color: sColor.textDim, whiteSpace: 'nowrap' }}>{label}</td>
                        <td style={{ padding: '4px 0', color: color as string }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button onClick={handleIdentify} disabled={loading} style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px',
              background: ecuInfo ? sColor.green : sColor.red, border: 'none', borderRadius: '2px',
              fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.08em',
              color: 'white', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
            }}>
              {loading ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> : <Cpu style={{ width: 16, height: 16 }} />}
              {loading ? 'IDENTIFYING...' : ecuInfo ? 'RE-IDENTIFY' : 'IDENTIFY ECU'}
            </button>
          </div>
        )}

        {/* ── READ VIN ───────────────────────────────────────────────── */}
        {step === 'read-vin' && (
          <div>
            <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.06em', margin: '0 0 12px', color: sColor.text }}>
              STEP 3: READ CURRENT VIN
            </h3>
            {currentVin && (
              <div style={{
                background: 'oklch(0.08 0.003 260)', border: `1px solid oklch(0.30 0.10 145)`,
                borderRadius: '2px', padding: '16px', marginBottom: '16px', textAlign: 'center',
              }}>
                <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim, marginBottom: '4px' }}>CURRENT VIN</div>
                <div style={{ fontFamily: sFont.heading, fontSize: '1.8rem', letterSpacing: '0.15em', color: sColor.green }}>{currentVin}</div>
              </div>
            )}
            <button onClick={handleReadVin} disabled={loading} style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px',
              background: sColor.red, border: 'none', borderRadius: '2px',
              fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.08em',
              color: 'white', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
            }}>
              {loading ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> : <Fingerprint style={{ width: 16, height: 16 }} />}
              {loading ? 'READING...' : 'READ VIN'}
            </button>
          </div>
        )}

        {/* ── ENTER NEW VIN ──────────────────────────────────────────── */}
        {step === 'enter-vin' && (
          <div>
            <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.06em', margin: '0 0 12px', color: sColor.text }}>
              STEP 4: ENTER NEW VIN
            </h3>
            {currentVin && (
              <div style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.textDim, marginBottom: '12px' }}>
                Current: <span style={{ color: sColor.yellow }}>{currentVin}</span>
              </div>
            )}
            <div style={{ marginBottom: '16px' }}>
              <input
                type="text"
                value={newVin}
                onChange={(e) => handleVinInput(e.target.value)}
                placeholder="Enter 17-character VIN"
                maxLength={17}
                style={{
                  width: '100%', padding: '12px 16px', background: 'oklch(0.08 0.003 260)',
                  border: `1px solid ${vinValidation === null ? sColor.border : vinValidation.valid ? 'oklch(0.30 0.10 145)' : 'oklch(0.30 0.10 25)'}`,
                  borderRadius: '2px', fontFamily: sFont.heading, fontSize: '1.4rem', letterSpacing: '0.15em',
                  color: sColor.text, outline: 'none', textTransform: 'uppercase',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: vinValidation?.valid ? sColor.green : vinValidation ? sColor.red : sColor.textMuted }}>
                  {vinValidation ? (vinValidation.valid ? '✓ Valid VIN format' : vinValidation.reason) : `${newVin.length}/17 characters`}
                </span>
                {newVin.length > 0 && isBRPVin(newVin) && (
                  <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.blue }}>BRP/CAN-am VIN detected</span>
                )}
              </div>
            </div>

            {/* Warning */}
            <div style={{
              background: 'oklch(0.12 0.03 60)', border: `1px solid oklch(0.30 0.10 60)`,
              borderRadius: '2px', padding: '12px 16px', marginBottom: '16px',
              display: 'flex', alignItems: 'flex-start', gap: '10px',
            }}>
              <AlertTriangle style={{ width: 16, height: 16, color: sColor.yellow, flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.yellow, lineHeight: '1.6' }}>
                <strong>WARNING:</strong> Changing the VIN will require DESS keys to be re-programmed.
                All existing keys will need to be re-learned after the VIN change.
                Make sure you have access to BuDS2 or a key programming tool.
              </div>
            </div>

            <button onClick={handleProceedToSecurity} disabled={!vinValidation?.valid || newVin === currentVin} style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px',
              background: vinValidation?.valid && newVin !== currentVin ? sColor.red : sColor.textMuted,
              border: 'none', borderRadius: '2px',
              fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.08em',
              color: 'white', cursor: vinValidation?.valid ? 'pointer' : 'not-allowed',
              opacity: vinValidation?.valid && newVin !== currentVin ? 1 : 0.5,
            }}>
              <ArrowRight style={{ width: 16, height: 16 }} /> PROCEED TO SECURITY ACCESS
            </button>
          </div>
        )}

        {/* ── SECURITY ACCESS ────────────────────────────────────────── */}
        {step === 'security' && (
          <div>
            <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.06em', margin: '0 0 12px', color: sColor.text }}>
              STEP 5: SECURITY ACCESS (LEVEL 3)
            </h3>
            <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, margin: '0 0 16px', lineHeight: '1.6' }}>
              The ECU requires security access before allowing VIN writes. This sends a seed request ($27 03),
              computes the key using the CAN-am algorithm, and sends it back ($27 04).
            </p>

            {seed !== null && (
              <div style={{
                background: 'oklch(0.08 0.003 260)', border: `1px solid ${sColor.borderLight}`,
                borderRadius: '2px', padding: '12px 16px', marginBottom: '16px',
              }}>
                <table style={{ fontFamily: sFont.mono, fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '3px 12px 3px 0', color: sColor.textDim }}>Seed</td>
                      <td style={{ color: sColor.blue }}>0x{seed.toString(16).padStart(4, '0').toUpperCase()}</td>
                    </tr>
                    {computedKey !== null && (
                      <tr>
                        <td style={{ padding: '3px 12px 3px 0', color: sColor.textDim }}>Key</td>
                        <td style={{ color: sColor.purple }}>0x{computedKey.toString(16).padStart(4, '0').toUpperCase()}</td>
                      </tr>
                    )}
                    <tr>
                      <td style={{ padding: '3px 12px 3px 0', color: sColor.textDim }}>Status</td>
                      <td style={{ color: securityUnlocked ? sColor.green : sColor.yellow }}>
                        {securityUnlocked ? 'UNLOCKED ✓' : 'Pending...'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <button onClick={handleSecurityAccess} disabled={loading || securityUnlocked} style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px',
              background: securityUnlocked ? sColor.green : sColor.red, border: 'none', borderRadius: '2px',
              fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.08em',
              color: 'white', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
            }}>
              {loading ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> :
                securityUnlocked ? <ShieldCheck style={{ width: 16, height: 16 }} /> : <Shield style={{ width: 16, height: 16 }} />}
              {loading ? 'AUTHENTICATING...' : securityUnlocked ? 'UNLOCKED — PROCEED' : 'REQUEST SECURITY ACCESS'}
            </button>
          </div>
        )}

        {/* ── WRITE VIN ──────────────────────────────────────────────── */}
        {step === 'write-vin' && (
          <div>
            <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.06em', margin: '0 0 12px', color: sColor.text }}>
              STEP 6: WRITE NEW VIN
            </h3>

            <div style={{
              background: 'oklch(0.08 0.003 260)', border: `1px solid ${sColor.borderLight}`,
              borderRadius: '2px', padding: '16px', marginBottom: '16px',
            }}>
              <table style={{ fontFamily: sFont.mono, fontSize: '0.8rem', borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '6px 16px 6px 0', color: sColor.textDim }}>Current VIN</td>
                    <td style={{ color: sColor.yellow, letterSpacing: '0.1em' }}>{currentVin}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 16px 6px 0', color: sColor.textDim }}>New VIN</td>
                    <td style={{ color: sColor.green, letterSpacing: '0.1em', fontWeight: 'bold' }}>{newVin}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 16px 6px 0', color: sColor.textDim }}>Security</td>
                    <td style={{ color: sColor.green }}>Level 3 Unlocked ✓</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Danger zone confirmation */}
            <div style={{
              background: 'oklch(0.12 0.04 25)', border: `1px solid oklch(0.35 0.12 25)`,
              borderRadius: '2px', padding: '16px', marginBottom: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <AlertTriangle style={{ width: 18, height: 18, color: sColor.red }} />
                <span style={{ fontFamily: sFont.heading, fontSize: '0.95rem', letterSpacing: '0.06em', color: sColor.red }}>
                  DANGER ZONE — IRREVERSIBLE OPERATION
                </span>
              </div>
              <p style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: 'oklch(0.80 0.10 25)', lineHeight: '1.6', margin: '0 0 12px' }}>
                This will permanently overwrite the VIN stored in the ECU. After writing:
              </p>
              <ul style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: 'oklch(0.80 0.10 25)', lineHeight: '1.8', margin: '0 0 12px', paddingLeft: '16px' }}>
                <li>All DESS keys must be re-programmed</li>
                <li>The ECU will reset</li>
                <li>Vehicle registration must match the new VIN</li>
              </ul>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={confirmWrite}
                  onChange={(e) => setConfirmWrite(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: sColor.red }}
                />
                <span style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.red }}>
                  I understand this is irreversible and have a way to re-learn DESS keys
                </span>
              </label>
            </div>

            <button onClick={handleWriteVin} disabled={loading || !confirmWrite || writeSuccess} style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px',
              background: confirmWrite && !writeSuccess ? sColor.red : sColor.textMuted,
              border: 'none', borderRadius: '2px',
              fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.08em',
              color: 'white', cursor: confirmWrite && !loading ? 'pointer' : 'not-allowed',
              opacity: confirmWrite && !writeSuccess ? 1 : 0.5,
            }}>
              {loading ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> :
                writeSuccess ? <CheckCircle style={{ width: 16, height: 16 }} /> : <Zap style={{ width: 16, height: 16 }} />}
              {loading ? 'WRITING VIN...' : writeSuccess ? 'VIN WRITTEN ✓' : 'WRITE NEW VIN'}
            </button>
          </div>
        )}

        {/* ── ECU RESET ──────────────────────────────────────────────── */}
        {step === 'reset' && (
          <div>
            <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.06em', margin: '0 0 12px', color: sColor.text }}>
              STEP 7: ECU RESET
            </h3>
            <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, margin: '0 0 16px', lineHeight: '1.6' }}>
              The ECU must be reset for the new VIN to take effect. This sends a hard reset command ($11 01).
              The ECU will restart and the CAN bus connection will be temporarily lost.
            </p>
            <button onClick={handleReset} disabled={loading || resetDone} style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px',
              background: resetDone ? sColor.green : sColor.red, border: 'none', borderRadius: '2px',
              fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.08em',
              color: 'white', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
            }}>
              {loading ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> :
                resetDone ? <CheckCircle style={{ width: 16, height: 16 }} /> : <RotateCcw style={{ width: 16, height: 16 }} />}
              {loading ? 'RESETTING...' : resetDone ? 'RESET COMPLETE' : 'RESET ECU'}
            </button>
          </div>
        )}

        {/* ── DESS KEY RE-LEARN ──────────────────────────────────────── */}
        {step === 'dess-keys' && (
          <div>
            <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.06em', margin: '0 0 12px', color: sColor.text }}>
              STEP 8: DESS KEY RE-LEARN
            </h3>
            <div style={{
              background: 'oklch(0.08 0.003 260)', border: `1px solid oklch(0.30 0.10 60)`,
              borderRadius: '2px', padding: '16px', marginBottom: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Key style={{ width: 18, height: 18, color: sColor.yellow }} />
                <span style={{ fontFamily: sFont.heading, fontSize: '0.95rem', letterSpacing: '0.06em', color: sColor.yellow }}>
                  DESS KEYS MUST BE RE-PROGRAMMED
                </span>
              </div>
              <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, lineHeight: '1.6', margin: '0 0 12px' }}>
                After a VIN change, all DESS keys stored in the ECM are invalidated. You must re-learn each key
                using BuDS2 or a compatible key programming tool.
              </p>
              <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.blue, lineHeight: '2' }}>
                <div style={{ fontWeight: 'bold', color: sColor.text, marginBottom: '4px' }}>Re-learn procedure (BuDS2):</div>
                <div>1. Connect vehicle to BuDS2</div>
                <div>2. Press START/STOP to power ECM</div>
                <div>3. Install tether cord on engine cut-off switch</div>
                <div>4. Go to Keys tab in BuDS2</div>
                <div>5. Activate anti-theft system if not already active</div>
                <div>6. Place DESS key on RF D.E.S.S. post</div>
                <div>7. Press READ button, then select key type (Normal/Learning)</div>
                <div>8. Press ADD to register the key</div>
                <div>9. Repeat for each key (up to 8 total)</div>
              </div>
              <div style={{
                marginTop: '12px', padding: '8px 12px', background: 'oklch(0.10 0.02 260)',
                border: `1px solid ${sColor.borderLight}`, borderRadius: '2px',
              }}>
                <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim }}>
                  <strong style={{ color: sColor.yellow }}>Key types:</strong> Normal (Yellow/Black float) = full power · Learning (Green float) = 25mph limit
                </div>
                <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim, marginTop: '4px' }}>
                  <strong style={{ color: sColor.yellow }}>Beep codes:</strong> 0.5s every 5s = reading · 2 short = recognized · 1s every 5s = NOT recognized
                </div>
              </div>
            </div>

            <button onClick={() => setStep('complete')} style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px',
              background: sColor.green, border: 'none', borderRadius: '2px',
              fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.08em',
              color: 'white', cursor: 'pointer',
            }}>
              <CheckCircle style={{ width: 16, height: 16 }} /> COMPLETE
            </button>
          </div>
        )}

        {/* ── COMPLETE ───────────────────────────────────────────────── */}
        {step === 'complete' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <CheckCircle style={{ width: 48, height: 48, color: sColor.green, margin: '0 auto 16px' }} />
            <h3 style={{ fontFamily: sFont.heading, fontSize: '1.4rem', letterSpacing: '0.08em', margin: '0 0 8px', color: sColor.green }}>
              VIN CHANGE COMPLETE
            </h3>
            <div style={{
              fontFamily: sFont.heading, fontSize: '2rem', letterSpacing: '0.15em',
              color: sColor.text, margin: '16px 0',
            }}>
              {newVin}
            </div>
            <p style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.textDim, margin: '0 0 20px' }}>
              {currentVin} → {newVin}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button onClick={handleDisconnect} style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 20px',
                background: 'transparent', border: `1px solid ${sColor.border}`, borderRadius: '2px',
                fontFamily: sFont.heading, fontSize: '0.9rem', letterSpacing: '0.06em',
                color: sColor.textDim, cursor: 'pointer',
              }}>
                <RefreshCw style={{ width: 14, height: 14 }} /> START OVER
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Log Panel */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          fontFamily: sFont.heading, fontSize: '0.8rem', letterSpacing: '0.06em',
          color: sColor.textDim, marginBottom: '6px',
        }}>
          UDS COMMUNICATION LOG
        </div>
        <LogPanel logs={logs} />
      </div>

      {/* Info Footer */}
      <div style={{
        background: 'oklch(0.08 0.003 260)', border: `1px solid ${sColor.borderLight}`,
        borderRadius: '2px', padding: '12px 16px',
      }}>
        <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted, lineHeight: '1.6' }}>
          <strong style={{ color: sColor.textDim }}>Protocol:</strong> UDS (ISO 14229) over CAN (ISO 15765-4) · 500kbps · 11-bit addressing
          <br />
          <strong style={{ color: sColor.textDim }}>ECU:</strong> Bosch MED17.8.5 / MG1CA920 · ECM @ 0x7E0/0x7E8
          <br />
          <strong style={{ color: sColor.textDim }}>Security:</strong> Level 3 ($27 03/04) · CAN-am seed/key algorithm (cuakeyA/cucakeysB lookup)
          <br />
          <strong style={{ color: sColor.textDim }}>VIN DID:</strong> F190 (standard UDS) · WriteDataByIdentifier ($2E)
          <br />
          <strong style={{ color: sColor.textDim }}>Note:</strong> Post-2022.5 MG1CA920 ECUs may have updated security. VIN write uses dealer-level access, not flash-level.
        </div>
      </div>
    </div>
  );
}
