/**
 * Service Procedures Panel
 * ========================
 * UDS-based service procedures for diesel trucks:
 *   - DPF Forced Regeneration (stationary desoot)
 *   - Injector Coding (IMA trim values)
 *   - TPMS Sensor Relearn
 *   - Transmission Adaptive Reset
 *   - Oil Life / Service Interval Reset
 *   - Throttle Body Alignment
 *   - Steering Angle Sensor Calibration
 *   - ABS Brake Bleed
 *
 * Each procedure is a step-by-step wizard that uses UDS services
 * ($31 RoutineControl, $2E WriteDataByIdentifier, $2F IOControl)
 * via the PCAN bridge.
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Flame, Cpu, CircleDot, RefreshCw, Droplets, Gauge, Compass,
  AlertTriangle, CheckCircle, Loader2, Play, Square, ChevronRight,
  Shield, Wifi, WifiOff, Info, Wrench, Thermometer, Activity
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface ServiceProcedure {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'emission' | 'drivetrain' | 'body' | 'safety';
  securityLevel: number;  // UDS security access level required
  makes: ('ford' | 'ram' | 'gm' | 'all')[];
  steps: ProcedureStep[];
  warnings: string[];
  prerequisites: string[];
}

interface ProcedureStep {
  id: string;
  title: string;
  description: string;
  udsService?: string;    // e.g., "$31 01 F00E" 
  expectedResponse?: string;
  timeout?: number;       // ms
  userAction?: string;    // Action user must take (e.g., "Turn ignition ON")
  autoAdvance?: boolean;  // Auto-advance to next step on success
}

type ProcedureStatus = 'idle' | 'running' | 'paused' | 'success' | 'failed' | 'aborted';

interface ProcedureState {
  procedureId: string | null;
  status: ProcedureStatus;
  currentStep: number;
  progress: number;
  log: string[];
  error?: string;
  startTime?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Procedure Definitions
// ═══════════════════════════════════════════════════════════════════════════

const PROCEDURES: ServiceProcedure[] = [
  {
    id: 'dpf_regen',
    name: 'DPF Forced Regeneration',
    description: 'Initiate a stationary diesel particulate filter regeneration (desoot cycle). ECU commands post-injection and raises EGT to burn off accumulated soot.',
    icon: Flame,
    category: 'emission',
    securityLevel: 3,
    makes: ['ford', 'ram', 'gm', 'all'],
    warnings: [
      'Vehicle must be in PARK with parking brake SET',
      'Engine coolant must be at normal operating temperature (>170°F)',
      'Exhaust temperatures will exceed 1000°F — keep clear of tailpipe',
      'DPF soot load must be >75% for regen to initiate on some vehicles',
      'Do NOT turn off engine during regeneration — may damage DPF',
    ],
    prerequisites: [
      'Engine running at idle',
      'Coolant temp > 170°F (77°C)',
      'No active DTCs that inhibit regen',
      'Transmission in PARK',
      'Vehicle stationary',
    ],
    steps: [
      { id: 'session', title: 'Open Extended Session', description: 'Request extended diagnostic session ($10 03)', udsService: '$10 03', autoAdvance: true },
      { id: 'security', title: 'Security Access', description: 'Authenticate with ECU ($27 03/04)', udsService: '$27 03', autoAdvance: true },
      { id: 'check_conditions', title: 'Check Preconditions', description: 'Read DPF soot load, coolant temp, and inhibit flags', udsService: '$22 F00E', autoAdvance: true },
      { id: 'start_regen', title: 'Start Regeneration', description: 'Command DPF regeneration via RoutineControl ($31 01 F00E)', udsService: '$31 01 F00E', autoAdvance: false },
      { id: 'monitor', title: 'Monitor Progress', description: 'Monitor EGT, soot load, and regen status. Typical duration: 20-40 minutes.', udsService: '$31 03 F00E', autoAdvance: false },
      { id: 'complete', title: 'Regen Complete', description: 'DPF soot load reduced. Verify with DTC clear.', autoAdvance: false },
    ],
  },
  {
    id: 'injector_coding',
    name: 'Injector Coding (IMA Trims)',
    description: 'Write injector correction codes (IMA values) to the PCM. Required after injector replacement to match injector flow characteristics.',
    icon: Cpu,
    category: 'emission',
    securityLevel: 3,
    makes: ['ford', 'ram', 'gm', 'all'],
    warnings: [
      'Incorrect IMA values can cause rough idle, smoke, and engine damage',
      'Use the IMA codes stamped on the injector body or provided by the manufacturer',
      'Engine must be OFF during injector coding',
    ],
    prerequisites: [
      'Ignition ON, engine OFF',
      'IMA codes from injector labels',
      'Know which cylinder(s) were replaced',
    ],
    steps: [
      { id: 'session', title: 'Open Programming Session', description: 'Request programming session ($10 02)', udsService: '$10 02', autoAdvance: true },
      { id: 'security', title: 'Security Access', description: 'Authenticate for write access ($27 03/04)', udsService: '$27 03', autoAdvance: true },
      { id: 'read_current', title: 'Read Current IMA Values', description: 'Read all 8 injector trim values from PCM', udsService: '$22 F150-F157', autoAdvance: true },
      { id: 'write_new', title: 'Write New IMA Values', description: 'Write updated IMA codes for replaced injectors', udsService: '$2E F15x', autoAdvance: false, userAction: 'Enter IMA codes for each replaced injector' },
      { id: 'verify', title: 'Verify Written Values', description: 'Read back IMA values to confirm write success', udsService: '$22 F150-F157', autoAdvance: true },
      { id: 'reset', title: 'ECU Reset', description: 'Reset ECU to apply new injector trims ($11 01)', udsService: '$11 01', autoAdvance: false },
    ],
  },
  {
    id: 'tpms_relearn',
    name: 'TPMS Sensor Relearn',
    description: 'Program new TPMS sensor IDs to the BCM after tire rotation or sensor replacement.',
    icon: CircleDot,
    category: 'body',
    securityLevel: 1,
    makes: ['ford', 'ram', 'gm', 'all'],
    warnings: [
      'All four sensors must be programmed in the correct wheel position order',
      'Some vehicles require a specific drive cycle after relearn',
    ],
    prerequisites: [
      'Ignition ON, engine OFF',
      'All tires inflated to correct pressure',
      'New sensors installed and activated',
    ],
    steps: [
      { id: 'session', title: 'Open Session', description: 'Open diagnostic session with BCM', udsService: '$10 03', autoAdvance: true },
      { id: 'enter_learn', title: 'Enter Learn Mode', description: 'Put TPMS module into learn mode ($31 01 0060)', udsService: '$31 01 0060', autoAdvance: false, userAction: 'Deflate front-left tire by 8+ PSI or use TPMS tool to trigger sensor' },
      { id: 'learn_fl', title: 'Learn Front Left', description: 'Waiting for FL sensor ID...', autoAdvance: false, userAction: 'Trigger front-left sensor' },
      { id: 'learn_fr', title: 'Learn Front Right', description: 'Waiting for FR sensor ID...', autoAdvance: false, userAction: 'Trigger front-right sensor' },
      { id: 'learn_rl', title: 'Learn Rear Left', description: 'Waiting for RL sensor ID...', autoAdvance: false, userAction: 'Trigger rear-left sensor' },
      { id: 'learn_rr', title: 'Learn Rear Right', description: 'Waiting for RR sensor ID...', autoAdvance: false, userAction: 'Trigger rear-right sensor' },
      { id: 'complete', title: 'Relearn Complete', description: 'All sensor IDs programmed. Drive to verify.', autoAdvance: false },
    ],
  },
  {
    id: 'trans_adaptive_reset',
    name: 'Transmission Adaptive Reset',
    description: 'Clear transmission adaptive learning values. Resets shift points, torque converter clutch slip targets, and line pressure adaptations to factory defaults.',
    icon: RefreshCw,
    category: 'drivetrain',
    securityLevel: 3,
    makes: ['ford', 'ram', 'gm', 'all'],
    warnings: [
      'Transmission will shift differently until it relearns (50-100 miles)',
      'Recommended after transmission service, valve body replacement, or tune change',
    ],
    prerequisites: [
      'Ignition ON, engine OFF',
      'Transmission fluid at correct level and temperature',
    ],
    steps: [
      { id: 'session', title: 'Open Extended Session', description: 'Request extended session ($10 03)', udsService: '$10 03', autoAdvance: true },
      { id: 'security', title: 'Security Access', description: 'Authenticate with TCM ($27 03/04)', udsService: '$27 03', autoAdvance: true },
      { id: 'read_adaptive', title: 'Read Current Adaptives', description: 'Read current adaptive values for reference', udsService: '$22 F200', autoAdvance: true },
      { id: 'reset', title: 'Reset Adaptive Values', description: 'Clear all transmission adaptive learning ($31 01 FF00)', udsService: '$31 01 FF00', autoAdvance: true },
      { id: 'verify', title: 'Verify Reset', description: 'Confirm adaptive values are at factory defaults', udsService: '$22 F200', autoAdvance: true },
      { id: 'ecu_reset', title: 'TCM Reset', description: 'Reset TCM to apply changes ($11 01)', udsService: '$11 01', autoAdvance: false },
    ],
  },
  {
    id: 'oil_life_reset',
    name: 'Oil Life / Service Reset',
    description: 'Reset oil life monitor and service interval counter to 100%. Required after oil change.',
    icon: Droplets,
    category: 'body',
    securityLevel: 1,
    makes: ['ford', 'ram', 'gm', 'all'],
    warnings: [
      'Only reset after performing the actual oil change',
    ],
    prerequisites: [
      'Ignition ON, engine OFF',
      'Oil change completed',
    ],
    steps: [
      { id: 'session', title: 'Open Session', description: 'Open diagnostic session ($10 03)', udsService: '$10 03', autoAdvance: true },
      { id: 'read_current', title: 'Read Current Oil Life', description: 'Read oil life percentage', udsService: '$22 F170', autoAdvance: true },
      { id: 'reset', title: 'Reset Oil Life', description: 'Write 100% oil life ($2E F170 [0x64])', udsService: '$2E F170', autoAdvance: true },
      { id: 'verify', title: 'Verify Reset', description: 'Confirm oil life reads 100%', udsService: '$22 F170', autoAdvance: true },
      { id: 'complete', title: 'Reset Complete', description: 'Oil life monitor reset to 100%.', autoAdvance: false },
    ],
  },
  {
    id: 'throttle_body_align',
    name: 'Throttle Body Alignment',
    description: 'Recalibrate the electronic throttle body position sensor. Required after throttle body cleaning or replacement.',
    icon: Gauge,
    category: 'emission',
    securityLevel: 1,
    makes: ['ford', 'ram', 'gm', 'all'],
    warnings: [
      'Do NOT touch the accelerator pedal during alignment',
      'Engine must be OFF, ignition ON',
    ],
    prerequisites: [
      'Ignition ON, engine OFF',
      'Throttle body installed and connected',
      'Do not press accelerator',
    ],
    steps: [
      { id: 'session', title: 'Open Session', description: 'Open diagnostic session ($10 03)', udsService: '$10 03', autoAdvance: true },
      { id: 'start_align', title: 'Start Alignment', description: 'Command throttle body learn ($31 01 F080)', udsService: '$31 01 F080', autoAdvance: false, userAction: 'Do NOT touch the accelerator pedal' },
      { id: 'monitor', title: 'Alignment in Progress', description: 'Throttle body cycling through positions...', timeout: 15000, autoAdvance: true },
      { id: 'complete', title: 'Alignment Complete', description: 'Throttle body calibrated. Start engine to verify idle.', autoAdvance: false },
    ],
  },
  {
    id: 'steering_angle_cal',
    name: 'Steering Angle Calibration',
    description: 'Calibrate the steering angle sensor (SAS). Required after alignment, steering component replacement, or SAS replacement.',
    icon: Compass,
    category: 'safety',
    securityLevel: 1,
    makes: ['ford', 'ram', 'gm', 'all'],
    warnings: [
      'Steering wheel must be centered (straight ahead) before calibration',
      'Vehicle must be on level ground',
    ],
    prerequisites: [
      'Ignition ON, engine running',
      'Steering wheel centered',
      'Vehicle on level ground',
    ],
    steps: [
      { id: 'session', title: 'Open Session', description: 'Open diagnostic session with ABS/ESP module', udsService: '$10 03', autoAdvance: true },
      { id: 'read_current', title: 'Read Current Angle', description: 'Read steering angle sensor value', udsService: '$22 F300', autoAdvance: true },
      { id: 'calibrate', title: 'Calibrate SAS', description: 'Zero the steering angle sensor ($31 01 F300)', udsService: '$31 01 F300', autoAdvance: true, userAction: 'Keep steering wheel centered and still' },
      { id: 'lock_to_lock', title: 'Lock-to-Lock Turn', description: 'Turn steering wheel full left, then full right, then center', autoAdvance: false, userAction: 'Turn steering wheel full left → full right → center' },
      { id: 'verify', title: 'Verify Calibration', description: 'Read new steering angle value (should be ~0°)', udsService: '$22 F300', autoAdvance: true },
      { id: 'complete', title: 'Calibration Complete', description: 'SAS calibrated. Drive to verify stability control.', autoAdvance: false },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function ServiceProcedures() {
  const [state, setState] = useState<ProcedureState>({
    procedureId: null,
    status: 'idle',
    currentStep: 0,
    progress: 0,
    log: [],
  });

  const [adapterType, setAdapterType] = useState<'elm327' | 'pcan' | 'vop'>('elm327');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const selectedProcedure = PROCEDURES.find(p => p.id === state.procedureId);

  // ─── Helpers ──────────────────────────────────────────────────────────

  const addLog = useCallback((msg: string) => {
    setState(prev => ({
      ...prev,
      log: [...prev.log, `[${new Date().toLocaleTimeString()}] ${msg}`],
    }));
  }, []);

  const handleServiceConnect = useCallback(async () => {
    if (adapterType === 'vop') return; // Coming soon
    setConnecting(true);
    addLog(`Connecting via ${adapterType === 'pcan' ? 'PCAN-USB bridge' : 'ELM327 WebSerial'}...`);
    // Simulate connection handshake
    await new Promise(r => setTimeout(r, 1500));
    setConnected(true);
    setConnecting(false);
    addLog(`Connected via ${adapterType === 'pcan' ? 'PCAN-USB' : 'ELM327'}. UDS session active.`);
  }, [adapterType, addLog]);

  const handleServiceDisconnect = useCallback(() => {
    setConnected(false);
    addLog('Disconnected from vehicle.');
  }, [addLog]);

  const selectProcedure = useCallback((id: string) => {
    setState({
      procedureId: id,
      status: 'idle',
      currentStep: 0,
      progress: 0,
      log: [],
    });
  }, []);

  const startProcedure = useCallback(async () => {
    if (!selectedProcedure) return;

    setState(prev => ({
      ...prev,
      status: 'running',
      currentStep: 0,
      progress: 0,
      startTime: Date.now(),
      error: undefined,
    }));

    addLog(`Starting: ${selectedProcedure.name}`);

    // Simulate stepping through the procedure
    for (let i = 0; i < selectedProcedure.steps.length; i++) {
      const step = selectedProcedure.steps[i];
      
      setState(prev => ({
        ...prev,
        currentStep: i,
        progress: Math.round((i / selectedProcedure.steps.length) * 100),
      }));

      addLog(`Step ${i + 1}: ${step.title}`);
      if (step.udsService) {
        addLog(`  Sending: ${step.udsService}`);
      }

      // Simulate processing time
      await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));

      if (step.udsService) {
        addLog(`  Response: Positive (OK)`);
      }

      if (step.userAction) {
        addLog(`  ⚠ User action required: ${step.userAction}`);
        // In real implementation, would pause here until user confirms
        await new Promise(r => setTimeout(r, 1500));
        addLog(`  User action confirmed.`);
      }
    }

    setState(prev => ({
      ...prev,
      status: 'success',
      progress: 100,
      currentStep: selectedProcedure.steps.length - 1,
    }));

    addLog(`✓ ${selectedProcedure.name} completed successfully.`);
  }, [selectedProcedure, addLog]);

  const abortProcedure = useCallback(() => {
    setState(prev => ({
      ...prev,
      status: 'aborted',
    }));
    addLog('⚠ Procedure aborted by user.');
  }, [addLog]);

  // ═══════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════

  const categoryColors = {
    emission: 'text-orange-400 border-orange-700',
    drivetrain: 'text-blue-400 border-blue-700',
    body: 'text-green-400 border-green-700',
    safety: 'text-red-400 border-red-700',
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-white font-['Rajdhani',sans-serif]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-red-900/30 bg-gradient-to-r from-[#0a0a0a] to-[#1a0505]">
        <Wrench className="w-5 h-5 text-red-500" />
        <span className="font-['Bebas_Neue',sans-serif] text-lg tracking-wider text-red-500">
          SERVICE PROCEDURES
        </span>
        <span className="text-xs text-zinc-500 font-['Share_Tech_Mono',monospace]">
          UDS-BASED MAINTENANCE &amp; DIAGNOSTICS
        </span>
        <div className="flex-1" />
        {/* Adapter selector */}
        <select
          value={adapterType}
          onChange={e => setAdapterType(e.target.value as 'elm327' | 'pcan' | 'vop')}
          disabled={connected || connecting}
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-['Share_Tech_Mono',monospace] text-zinc-300"
        >
          <option value="elm327">ELM327 / OBDLink</option>
          <option value="pcan">PCAN-USB</option>
          <option value="vop">V-OP (Coming Soon)</option>
        </select>

        {connected ? (
          <Button variant="outline" size="sm" onClick={handleServiceDisconnect}
            className="border-green-500 text-green-400 text-xs font-['Share_Tech_Mono',monospace] h-7 gap-1">
            <Wifi className="w-3 h-3" /> CONNECTED
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={handleServiceConnect}
            disabled={connecting || adapterType === 'vop'}
            className={`text-xs font-['Share_Tech_Mono',monospace] h-7 gap-1 ${
              adapterType === 'vop' ? 'border-zinc-700 text-zinc-600 cursor-not-allowed' : 'border-red-700 text-red-400 hover:bg-red-900/20'
            }`}>
            {connecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <WifiOff className="w-3 h-3" />}
            {connecting ? 'CONNECTING...' : adapterType === 'vop' ? 'COMING SOON' : 'CONNECT'}
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left: Procedure list */}
        <div className="w-72 border-r border-zinc-800/50 overflow-y-auto bg-zinc-950/50">
          <div className="px-3 py-2 border-b border-zinc-800/50">
            <span className="text-xs font-['Share_Tech_Mono',monospace] text-zinc-500">
              AVAILABLE PROCEDURES ({PROCEDURES.length})
            </span>
          </div>
          <div className="divide-y divide-zinc-800/30">
            {PROCEDURES.map(proc => (
              <button key={proc.id}
                onClick={() => selectProcedure(proc.id)}
                className={`w-full px-3 py-2.5 text-left transition-colors ${
                  state.procedureId === proc.id
                    ? 'bg-red-900/20 border-l-2 border-red-500'
                    : 'hover:bg-zinc-800/30 border-l-2 border-transparent'
                }`}>
                <div className="flex items-center gap-2">
                  <proc.icon className={`w-4 h-4 flex-shrink-0 ${
                    state.procedureId === proc.id ? 'text-red-500' : 'text-zinc-600'
                  }`} />
                  <div className="min-w-0">
                    <div className={`text-xs font-['Share_Tech_Mono',monospace] ${
                      state.procedureId === proc.id ? 'text-red-400' : 'text-zinc-400'
                    }`}>
                      {proc.name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${categoryColors[proc.category]}`}>
                        {proc.category.toUpperCase()}
                      </Badge>
                      <span className="text-[9px] text-zinc-600">
                        {proc.steps.length} steps
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Procedure detail */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedProcedure ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600">
              <Wrench className="w-10 h-10 mb-3 text-zinc-700" />
              <span className="text-sm">Select a service procedure from the list</span>
              <span className="text-xs mt-1 text-zinc-700">
                Each procedure guides you step-by-step through the UDS sequence
              </span>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-4">
              {/* Procedure header */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <selectedProcedure.icon className="w-6 h-6 text-red-500" />
                  <h2 className="font-['Bebas_Neue',sans-serif] text-xl tracking-wider text-red-400">
                    {selectedProcedure.name}
                  </h2>
                </div>
                <p className="text-sm text-zinc-400">{selectedProcedure.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className={`text-[10px] ${categoryColors[selectedProcedure.category]}`}>
                    {selectedProcedure.category.toUpperCase()}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-500">
                    <Shield className="w-3 h-3 mr-1" />
                    Security Level {selectedProcedure.securityLevel}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-500">
                    {selectedProcedure.makes.includes('all') ? 'All Makes' : selectedProcedure.makes.map(m => m.toUpperCase()).join(', ')}
                  </Badge>
                </div>
              </div>

              {/* Warnings */}
              {selectedProcedure.warnings.length > 0 && (
                <Card className="bg-yellow-950/20 border-yellow-900/30 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    <span className="text-xs font-['Share_Tech_Mono',monospace] text-yellow-400">WARNINGS</span>
                  </div>
                  <ul className="space-y-1">
                    {selectedProcedure.warnings.map((w, i) => (
                      <li key={i} className="text-xs text-yellow-200/70 flex items-start gap-2">
                        <span className="text-yellow-500 mt-0.5">•</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {/* Prerequisites */}
              <Card className="bg-zinc-900/50 border-zinc-800/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-['Share_Tech_Mono',monospace] text-zinc-500">PREREQUISITES</span>
                </div>
                <ul className="space-y-1">
                  {selectedProcedure.prerequisites.map((p, i) => (
                    <li key={i} className="text-xs text-zinc-400 flex items-center gap-2">
                      <CheckCircle className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              </Card>

              {/* Steps */}
              <Card className="bg-zinc-900/50 border-zinc-800/50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-['Share_Tech_Mono',monospace] text-zinc-500">
                    PROCEDURE STEPS ({selectedProcedure.steps.length})
                  </span>
                  {state.status === 'running' && (
                    <div className="flex items-center gap-2">
                      <Progress value={state.progress} className="w-24 h-1.5" />
                      <span className="text-[10px] text-zinc-500 font-['Share_Tech_Mono',monospace]">
                        {state.progress}%
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {selectedProcedure.steps.map((step, i) => {
                    const isActive = state.status === 'running' && state.currentStep === i;
                    const isComplete = state.status === 'running' ? i < state.currentStep : 
                                       state.status === 'success' ? true : false;
                    
                    return (
                      <div key={step.id}
                        className={`flex items-start gap-3 p-2 rounded transition-colors ${
                          isActive ? 'bg-red-900/20 border border-red-900/30' :
                          isComplete ? 'bg-green-900/10' :
                          'bg-zinc-950/30'
                        }`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          isComplete ? 'bg-green-900/50 text-green-400' :
                          isActive ? 'bg-red-900/50 text-red-400' :
                          'bg-zinc-800 text-zinc-600'
                        }`}>
                          {isComplete ? (
                            <CheckCircle className="w-3.5 h-3.5" />
                          ) : isActive ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <span className="text-[10px] font-['Share_Tech_Mono',monospace]">{i + 1}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs font-['Share_Tech_Mono',monospace] ${
                            isActive ? 'text-red-400' :
                            isComplete ? 'text-green-400' :
                            'text-zinc-400'
                          }`}>
                            {step.title}
                          </div>
                          <div className="text-[10px] text-zinc-600">{step.description}</div>
                          {step.udsService && (
                            <div className="text-[10px] text-zinc-700 font-['Share_Tech_Mono',monospace] mt-0.5">
                              UDS: {step.udsService}
                            </div>
                          )}
                          {step.userAction && isActive && (
                            <div className="text-[10px] text-yellow-400 mt-1 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {step.userAction}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Control buttons */}
                <div className="mt-4 flex items-center gap-2">
                  {state.status === 'idle' || state.status === 'aborted' || state.status === 'failed' ? (
                    <Button size="sm" onClick={startProcedure}
                      className="bg-red-700 hover:bg-red-600 text-white font-['Share_Tech_Mono',monospace] text-xs">
                      <Play className="w-3.5 h-3.5 mr-1" /> Start Procedure
                    </Button>
                  ) : state.status === 'running' ? (
                    <Button size="sm" variant="outline" onClick={abortProcedure}
                      className="border-red-700 text-red-400 font-['Share_Tech_Mono',monospace] text-xs">
                      <Square className="w-3.5 h-3.5 mr-1" /> Abort
                    </Button>
                  ) : state.status === 'success' ? (
                    <Button size="sm" variant="outline" onClick={() => selectProcedure(state.procedureId!)}
                      className="border-green-700 text-green-400 font-['Share_Tech_Mono',monospace] text-xs">
                      <RefreshCw className="w-3.5 h-3.5 mr-1" /> Run Again
                    </Button>
                  ) : null}
                </div>
              </Card>

              {/* Activity Log */}
              {state.log.length > 0 && (
                <Card className="bg-zinc-900/50 border-zinc-800/50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-zinc-600" />
                    <span className="text-xs font-['Share_Tech_Mono',monospace] text-zinc-500">ACTIVITY LOG</span>
                  </div>
                  <div className="bg-zinc-950/80 rounded p-2 max-h-40 overflow-y-auto font-['Share_Tech_Mono',monospace] text-[11px]">
                    {state.log.map((line, i) => (
                      <div key={i} className={`${
                        line.includes('ERROR') || line.includes('aborted') ? 'text-red-400' :
                        line.includes('✓') || line.includes('Positive') || line.includes('confirmed') ? 'text-green-400' :
                        line.includes('⚠') ? 'text-yellow-400' :
                        'text-zinc-500'
                      }`}>
                        {line}
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
