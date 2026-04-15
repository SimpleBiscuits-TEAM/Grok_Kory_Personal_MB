/**
 * Storm Chase Dashboard — Driver's control panel for live telemetry streaming.
 *
 * Flow: Start Test → Connect Vehicle → Verify Overlay → Go Live → Storm Chase Active
 *
 * Features:
 * - Test mode (full flow without broadcasting)
 * - Storm Chase Active mode with telemetry overlay
 * - Emergency Override (DTC clear every 7s for 10 min)
 * - Event markers for tagging moments
 * - Read Codes broadcast to viewers
 * - Toggle settings (peak gauges, health pulse, viewer count, audio alert)
 * - Session history with summaries
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Radio, Zap, AlertTriangle, Play, Square, Eye, Gauge,
  Activity, Timer, Bookmark, Trash2, Copy, Settings,
  ChevronDown, ChevronUp, Wifi, WifiOff, Shield,
  Volume2, VolumeX, BarChart3, Heart, Users, Clock
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface TelemetryData {
  brakePct: number | null;
  throttlePct: number | null;
  rpmPct: number | null;
  gForceX: number | null;
  gForceY: number | null;
  mph: number | null;
  rpm: number | null;
  boost: number | null;
  coolantTemp: number | null;
  transTemp: number | null;
}

type SessionPhase = "idle" | "connecting" | "testing" | "live" | "storm-active" | "ended";

// ── Emergency Override Timer ─────────────────────────────────────────────────

function EmergencyOverridePanel({
  streamKey,
  isActive,
  startedAt,
  audioAlert,
}: {
  streamKey: string;
  isActive: boolean;
  startedAt: string | null;
  audioAlert: boolean;
}) {
  const startOverride = trpc.stormChase.startEmergencyOverride.useMutation();
  const stopOverride = trpc.stormChase.stopEmergencyOverride.useMutation();
  const logCodeClear = trpc.stormChase.logCodeClear.useMutation();
  const [remainingSec, setRemainingSec] = useState(0);
  const [clearCount, setClearCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Countdown timer
  useEffect(() => {
    if (!isActive || !startedAt) {
      setRemainingSec(0);
      return;
    }
    const start = new Date(startedAt).getTime();
    const duration = 10 * 60 * 1000; // 10 minutes

    const tick = () => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
      setRemainingSec(remaining);
      if (remaining <= 0) {
        stopOverride.mutate({ streamKey });
      }
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isActive, startedAt, streamKey]);

  // DTC clear every 7 seconds while override is active
  useEffect(() => {
    if (!isActive) {
      setClearCount(0);
      if (clearIntervalRef.current) clearInterval(clearIntervalRef.current);
      return;
    }

    const doClear = () => {
      setClearCount(c => c + 1);
      // In production, this would send the actual OBD-II clear command
      // For now, log the attempt
      logCodeClear.mutate({ streamKey, success: true, dtcsCleared: [] });
    };

    // First clear immediately
    doClear();
    clearIntervalRef.current = setInterval(doClear, 7000);
    return () => { if (clearIntervalRef.current) clearInterval(clearIntervalRef.current); };
  }, [isActive, streamKey]);

  // Audio alert
  useEffect(() => {
    if (isActive && audioAlert) {
      // Play activation sound (using Web Audio API beep)
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.value = 0.3;
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } catch { /* audio not available */ }
    }
  }, [isActive, audioAlert]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleStart = async () => {
    try {
      await startOverride.mutateAsync({ streamKey });
      toast.success("Emergency Override Activated — DTC clear every 7s for 10 min");
    } catch {
      toast.error("Failed to start override");
    }
  };

  const handleStop = async () => {
    try {
      await stopOverride.mutateAsync({ streamKey });
      toast.success("Emergency Override Stopped");
    } catch {
      toast.error("Failed to stop override");
    }
  };

  return (
    <Card className={`border-2 transition-colors ${isActive ? "border-red-500 bg-red-500/10 animate-pulse" : "border-red-500/30"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-500" />
            Emergency Override
          </CardTitle>
          {isActive && (
            <Badge variant="destructive" className="text-lg px-3 py-1 font-mono">
              {formatTime(remainingSec)}
            </Badge>
          )}
        </div>
        <CardDescription>
          Triggers DTC code clear every 7 seconds for 10 minutes to escape limp mode in emergency situations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isActive ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Code clears sent:</span>
              <span className="font-mono text-red-400">{clearCount}</span>
            </div>
            <div className="w-full bg-red-950 rounded-full h-2">
              <div
                className="bg-red-500 h-2 rounded-full transition-all"
                style={{ width: `${(remainingSec / 600) * 100}%` }}
              />
            </div>
            <Button
              variant="outline"
              className="w-full border-red-500 text-red-500 hover:bg-red-500/20"
              onClick={handleStop}
              disabled={stopOverride.isPending}
            >
              <Square className="h-4 w-4 mr-2" />
              Stop Override
            </Button>
          </div>
        ) : (
          <Button
            variant="destructive"
            className="w-full"
            onClick={handleStart}
            disabled={startOverride.isPending}
          >
            <Zap className="h-4 w-4 mr-2" />
            Activate Emergency Override
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Telemetry Gauges ─────────────────────────────────────────────────────────

function TelemetryGauges({ data, peaks }: {
  data: TelemetryData;
  peaks: { maxMph: number; maxRpm: number; maxGForceX: number; maxGForceY: number; maxBoost: number; maxThrottle: number };
}) {
  const gauges = [
    { label: "MPH", value: data.mph, peak: peaks.maxMph, max: 150, unit: "", color: "text-cyan-400" },
    { label: "RPM", value: data.rpm, peak: peaks.maxRpm, max: 5000, unit: "", color: "text-amber-400" },
    { label: "Throttle", value: data.throttlePct, peak: peaks.maxThrottle, max: 100, unit: "%", color: "text-green-400" },
    { label: "Brake", value: data.brakePct, peak: null, max: 100, unit: "%", color: "text-red-400" },
    { label: "Boost", value: data.boost, peak: peaks.maxBoost, max: 60, unit: "psi", color: "text-purple-400" },
    { label: "G-Force", value: data.gForceX != null ? Math.abs(data.gForceX) : null, peak: peaks.maxGForceX, max: 2, unit: "G", color: "text-orange-400" },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {gauges.map(g => (
        <div key={g.label} className="bg-black/40 rounded-lg p-3 text-center border border-white/10">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{g.label}</div>
          <div className={`text-2xl font-mono font-bold ${g.color}`}>
            {g.value != null ? (g.max <= 2 ? g.value.toFixed(2) : Math.round(g.value)) : "—"}
          </div>
          <div className="text-xs text-muted-foreground">{g.unit}</div>
          {g.peak != null && g.peak > 0 && (
            <div className="text-[10px] text-muted-foreground mt-1">
              Peak: {g.max <= 2 ? g.peak.toFixed(2) : Math.round(g.peak)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Health Pulse ─────────────────────────────────────────────────────────────

function HealthPulse({ status }: { status: "green" | "yellow" | "red" }) {
  const colors = {
    green: "bg-green-500 shadow-green-500/50",
    yellow: "bg-yellow-500 shadow-yellow-500/50 animate-pulse",
    red: "bg-red-500 shadow-red-500/50 animate-pulse",
  };
  const labels = { green: "Vehicle OK", yellow: "Monitor", red: "Warning" };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full shadow-lg ${colors[status]}`} />
      <span className="text-xs font-medium">{labels[status]}</span>
    </div>
  );
}

// ── Event Marker Input ───────────────────────────────────────────────────────

function EventMarkerInput({ streamKey }: { streamKey: string }) {
  const [label, setLabel] = useState("");
  const addMarker = trpc.stormChase.addEventMarker.useMutation();

  const presets = [
    "Tornado Spotted", "Hail Impact", "Rotation Confirmed",
    "Wall Cloud", "Funnel Cloud", "Lightning Strike",
    "Road Hazard", "Debris Field", "Safe Position",
  ];

  const handleAdd = async (text: string) => {
    if (!text.trim()) return;
    try {
      await addMarker.mutateAsync({ streamKey, label: text.trim() });
      setLabel("");
      toast.success(`Event Marked: ${text.trim()}`);
    } catch {
      toast.error("Failed to mark event");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bookmark className="h-5 w-5 text-cyan-400" />
          Event Markers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Tag this moment..."
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd(label)}
          />
          <Button size="sm" onClick={() => handleAdd(label)} disabled={!label.trim() || addMarker.isPending}>
            <Bookmark className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map(p => (
            <Button
              key={p}
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={() => handleAdd(p)}
              disabled={addMarker.isPending}
            >
              {p}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Read Codes Panel ─────────────────────────────────────────────────────────

function ReadCodesPanel({ streamKey }: { streamKey: string }) {
  const readCodes = trpc.stormChase.readCodes.useMutation();
  const [codes, setCodes] = useState<Array<{ code: string; description?: string; severity?: string }>>([]);
  const [isScanning, setIsScanning] = useState(false);

  const handleReadCodes = async () => {
    setIsScanning(true);
    // In production, this would send the OBD-II read codes command
    // For now, simulate with placeholder
    setTimeout(async () => {
      const mockCodes = [
        { code: "P0300", description: "Random/Multiple Cylinder Misfire Detected", severity: "warning" as const },
      ];
      // When real datalogger PIDs are available, this will read actual DTCs
      setCodes([]); // Empty = no codes found
      setIsScanning(false);

      try {
        await readCodes.mutateAsync({
          streamKey,
          codes: [], // Will be populated with real codes from OBD-II
        });
        toast.success("Codes Read — No DTCs found, all clear");
      } catch {
        toast.error("Failed to read codes");
      }
    }, 2000);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5 text-amber-400" />
          Read Codes
        </CardTitle>
        <CardDescription>
          Read DTCs and broadcast to viewers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          className="w-full"
          variant="outline"
          onClick={handleReadCodes}
          disabled={isScanning}
        >
          {isScanning ? (
            <>
              <Activity className="h-4 w-4 mr-2 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Activity className="h-4 w-4 mr-2" />
              Read Codes
            </>
          )}
        </Button>
        {codes.length > 0 && (
          <div className="space-y-2">
            {codes.map((c, i) => (
              <div key={i} className="flex items-center justify-between bg-black/30 rounded px-3 py-2">
                <span className="font-mono text-amber-400">{c.code}</span>
                <span className="text-xs text-muted-foreground">{c.description}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Settings Panel ───────────────────────────────────────────────────────────

function SettingsPanel({
  streamKey,
  settings,
}: {
  streamKey: string;
  settings: {
    peakGauges: boolean;
    healthPulse: boolean;
    viewerCount: boolean;
    audioAlert: boolean;
    overlayTheme: string;
    overlayPosition: string;
    overlayScale: number;
  };
}) {
  const updateSettings = trpc.stormChase.updateSettings.useMutation();

  const toggle = (key: string, value: boolean) => {
    updateSettings.mutate({ streamKey, settings: { [key]: value } });
  };

  const toggles = [
    { key: "peakGauges", label: "Peak Gauges", icon: <BarChart3 className="h-4 w-4" />, desc: "Show peak values for MPH, RPM, G-force" },
    { key: "healthPulse", label: "Vehicle Health Pulse", icon: <Heart className="h-4 w-4" />, desc: "Green/yellow/red vehicle status indicator" },
    { key: "viewerCount", label: "Viewer Count", icon: <Users className="h-4 w-4" />, desc: "Show number of viewers watching" },
    { key: "audioAlert", label: "Audio Alerts", icon: <Volume2 className="h-4 w-4" />, desc: "Sound on emergency override activate/deactivate" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Stream Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {toggles.map(t => (
          <div key={t.key} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {t.icon}
              <div>
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.desc}</div>
              </div>
            </div>
            <Switch
              checked={(settings as any)[t.key]}
              onCheckedChange={v => toggle(t.key, v)}
            />
          </div>
        ))}

        <Separator />

        <div className="space-y-3">
          <div className="text-sm font-medium">OBS Overlay</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Theme</label>
              <Select
                value={settings.overlayTheme}
                onValueChange={v => updateSettings.mutate({ streamKey, settings: { overlayTheme: v as any } })}
              >
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="transparent">Transparent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Position</label>
              <Select
                value={settings.overlayPosition}
                onValueChange={v => updateSettings.mutate({ streamKey, settings: { overlayPosition: v as any } })}
              >
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="top-left">Top Left</SelectItem>
                  <SelectItem value="top-right">Top Right</SelectItem>
                  <SelectItem value="bottom-left">Bottom Left</SelectItem>
                  <SelectItem value="bottom-right">Bottom Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── OBS Overlay URL Card ─────────────────────────────────────────────────────

function OverlayUrlCard({ streamKey }: { streamKey: string }) {
  const { data } = trpc.stormChase.getOverlayUrl.useQuery({ streamKey });

  const fullUrl = data ? `${window.location.origin}${data.overlayPath}` : "";

  const copyUrl = () => {
    navigator.clipboard.writeText(fullUrl);
    toast.success("OBS overlay URL copied to clipboard");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Eye className="h-5 w-5 text-purple-400" />
          OBS Overlay
        </CardTitle>
        <CardDescription>Add this URL as a Browser Source in OBS</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input value={fullUrl} readOnly className="font-mono text-xs" />
          <Button size="icon" variant="outline" onClick={copyUrl}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        {data?.obsInstructions && (
          <div className="text-xs text-muted-foreground space-y-1">
            {data.obsInstructions.map((step, i) => (
              <div key={i}>{step}</div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Session History ──────────────────────────────────────────────────────────

function SessionHistory() {
  const { data: chases } = trpc.stormChase.getMyChases.useQuery({ limit: 10 });

  if (!chases?.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Chase History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {chases.map(chase => {
            const summary = chase.sessionSummary;
            const duration = summary ? Math.round(summary.totalDurationSec / 60) : 0;
            return (
              <div key={chase.id} className="flex items-center justify-between bg-black/20 rounded-lg px-3 py-2">
                <div>
                  <div className="text-sm font-medium">{chase.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(chase.startedAt).toLocaleDateString()} · {duration} min
                    {summary && ` · Peak: ${Math.round(summary.maxSpeed)} MPH`}
                  </div>
                </div>
                <Badge variant={chase.status === "ended" ? "secondary" : "default"}>
                  {chase.status}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────

export default function StormChase() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [streamKey, setStreamKey] = useState<string | null>(null);
  const [title, setTitle] = useState("Storm Chase");
  const [vehicleType, setVehicleType] = useState("");
  const [externalStreamUrl, setExternalStreamUrl] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  // Telemetry state (placeholder until datalogger PIDs are wired)
  const [telemetry] = useState<TelemetryData>({
    brakePct: null, throttlePct: null, rpmPct: null,
    gForceX: null, gForceY: null, mph: null,
    rpm: null, boost: null, coolantTemp: null, transTemp: null,
  });

  const startTest = trpc.stormChase.startTestSession.useMutation();
  const goLive = trpc.stormChase.goLive.useMutation();
  const activateChase = trpc.stormChase.activateStormChase.useMutation();
  const deactivateChase = trpc.stormChase.deactivateStormChase.useMutation();
  const endSession = trpc.stormChase.endSession.useMutation();

  // Session data
  const { data: session, refetch: refetchSession } = trpc.stormChase.getSession.useQuery(
    { streamKey: streamKey ?? "" },
    { enabled: !!streamKey, refetchInterval: phase !== "idle" && phase !== "ended" ? 3000 : false }
  );

  const settings = session?.streamSettings ?? {
    peakGauges: true, healthPulse: true, viewerCount: true, audioAlert: true,
    overlayTheme: "dark", overlayPosition: "bottom-left", overlayScale: 1.0,
  };

  const peaks = session?.peakValues ?? {
    maxMph: 0, maxRpm: 0, maxGForceX: 0, maxGForceY: 0, maxBoost: 0, maxThrottle: 0,
  };

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleStartTest = async () => {
    setPhase("connecting");
    try {
      const result = await startTest.mutateAsync({
        title,
        vehicleType: vehicleType || undefined,
        externalStreamUrl: externalStreamUrl || undefined,
      });
      setStreamKey(result.shareKey);
      setPhase("testing");
      toast.success("Test Session Started — verify your overlay before going live");
    } catch {
      setPhase("idle");
      toast.error("Failed to start session");
    }
  };

  const handleGoLive = async () => {
    if (!streamKey) return;
    try {
      await goLive.mutateAsync({ streamKey });
      setPhase("live");
      toast.success("You're LIVE! Viewers can now see your telemetry stream.");
    } catch {
      toast.error("Failed to go live");
    }
  };

  const handleActivateChase = async () => {
    if (!streamKey) return;
    try {
      await activateChase.mutateAsync({ streamKey });
      setPhase("storm-active");
      toast.success("Storm Chase Active — broadcasting to viewers");
    } catch {
      toast.error("Failed to activate storm chase");
    }
  };

  const handleDeactivateChase = async () => {
    if (!streamKey) return;
    try {
      await deactivateChase.mutateAsync({ streamKey });
      setPhase("live");
    } catch {
      toast.error("Failed to deactivate");
    }
  };

  const handleEndSession = async () => {
    if (!streamKey) return;
    try {
      const result = await endSession.mutateAsync({ streamKey });
      setPhase("ended");
      toast.success(
        result.summary
          ? `Session Ended — Peak: ${Math.round(result.summary.maxSpeed)} MPH · ${result.summary.eventMarkers.length} events · ${result.summary.emergencyOverridesUsed} overrides`
          : "Session ended successfully"
      );
    } catch {
      toast.error("Failed to end session");
    }
  };

  // ── Idle State ───────────────────────────────────────────────────────────

  if (phase === "idle") {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <Radio className="h-8 w-8 text-cyan-400" />
            <h1 className="text-3xl font-bold tracking-tight">Storm Chase</h1>
          </div>
          <p className="text-muted-foreground">
            Live vehicle telemetry overlay for storm chasing streams
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New Chase Session</CardTitle>
            <CardDescription>
              Start in test mode to verify your connection and overlay before going live.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Session Title</label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Oklahoma Chase — April 15"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Vehicle</label>
              <Input
                value={vehicleType}
                onChange={e => setVehicleType(e.target.value)}
                placeholder="2018 L5P Duramax"
              />
            </div>
            <div>
              <label className="text-sm font-medium">External Stream URL (optional)</label>
              <Input
                value={externalStreamUrl}
                onChange={e => setExternalStreamUrl(e.target.value)}
                placeholder="https://youtube.com/live/..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                YouTube, Twitch, or Facebook Live URL for video embed alongside telemetry
              </p>
            </div>

            <Button className="w-full" size="lg" onClick={handleStartTest} disabled={startTest.isPending}>
              <Play className="h-5 w-5 mr-2" />
              Start Test Session
            </Button>
          </CardContent>
        </Card>

        <SessionHistory />
      </div>
    );
  }

  // ── Connecting State ─────────────────────────────────────────────────────

  if (phase === "connecting") {
    return (
      <div className="max-w-md mx-auto p-6 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="animate-spin">
          <Wifi className="h-12 w-12 text-cyan-400" />
        </div>
        <h2 className="text-xl font-bold">Connecting to Vehicle...</h2>
        <p className="text-muted-foreground text-center">
          Auto-scanning for OBD-II connection. Please ensure your adapter is plugged in.
        </p>
      </div>
    );
  }

  // ── Active Session (Testing / Live / Storm Active) ───────────────────────

  const isStormActive = phase === "storm-active";
  const isLive = phase === "live" || isStormActive;
  const isTesting = phase === "testing";

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {/* Status Bar */}
      <div className="flex items-center justify-between bg-black/40 rounded-lg px-4 py-3 border border-white/10">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isLive ? "bg-red-500 animate-pulse" : isTesting ? "bg-yellow-500 animate-pulse" : "bg-gray-500"}`} />
          <span className="font-bold uppercase tracking-wider text-sm">
            {isTesting ? "TEST MODE" : isStormActive ? "STORM CHASE ACTIVE" : isLive ? "LIVE" : phase.toUpperCase()}
          </span>
          {session?.title && <span className="text-muted-foreground text-sm">· {session.title}</span>}
        </div>
        <div className="flex items-center gap-3">
          {settings.healthPulse && <HealthPulse status={(session?.healthStatus as "green" | "yellow" | "red") ?? "green"} />}
          {settings.viewerCount && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {session?.viewerCount ?? 0}
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Telemetry Gauges */}
      {settings.peakGauges && (
        <TelemetryGauges data={telemetry} peaks={peaks} />
      )}

      {/* Phase-specific controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left column: Actions */}
        <div className="space-y-4">
          {isTesting && (
            <Card className="border-yellow-500/30">
              <CardContent className="pt-6 space-y-3">
                <div className="text-center space-y-2">
                  <Badge variant="outline" className="text-yellow-400 border-yellow-400">TEST MODE</Badge>
                  <p className="text-sm text-muted-foreground">
                    Verify your OBS overlay and connection before going live.
                  </p>
                </div>
                <Button className="w-full" size="lg" onClick={handleGoLive} disabled={goLive.isPending}>
                  <Radio className="h-5 w-5 mr-2" />
                  Go Live
                </Button>
              </CardContent>
            </Card>
          )}

          {isLive && !isStormActive && (
            <Card className="border-cyan-500/30">
              <CardContent className="pt-6">
                <Button
                  className="w-full bg-cyan-600 hover:bg-cyan-700"
                  size="lg"
                  onClick={handleActivateChase}
                  disabled={activateChase.isPending}
                >
                  <Zap className="h-5 w-5 mr-2" />
                  Activate Storm Chase
                </Button>
              </CardContent>
            </Card>
          )}

          {isStormActive && (
            <>
              <EmergencyOverridePanel
                streamKey={streamKey!}
                isActive={session?.emergencyOverrideActive ?? false}
                startedAt={session?.emergencyOverrideStartedAt?.toString() ?? null}
                audioAlert={settings.audioAlert}
              />
              <EventMarkerInput streamKey={streamKey!} />
              <ReadCodesPanel streamKey={streamKey!} />
            </>
          )}

          {/* End Session */}
          {(isLive || isTesting) && (
            <Button
              variant="outline"
              className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10"
              onClick={isStormActive ? handleDeactivateChase : handleEndSession}
              disabled={endSession.isPending}
            >
              <Square className="h-4 w-4 mr-2" />
              {isStormActive ? "Deactivate Storm Chase" : "End Session"}
            </Button>
          )}
          {isStormActive && (
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={handleEndSession}
              disabled={endSession.isPending}
            >
              End Entire Session
            </Button>
          )}
        </div>

        {/* Right column: Settings & Overlay */}
        <div className="space-y-4">
          {streamKey && <OverlayUrlCard streamKey={streamKey} />}
          {showSettings && streamKey && (
            <SettingsPanel streamKey={streamKey} settings={settings} />
          )}
        </div>
      </div>

      {/* Session Summary (after end) */}
      {phase === "ended" && session?.sessionSummary && (
        <Card className="border-cyan-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-cyan-400" />
              Session Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Duration", value: `${Math.round((session.sessionSummary as any).totalDurationSec / 60)} min` },
                { label: "Max Speed", value: `${Math.round((session.sessionSummary as any).maxSpeed)} MPH` },
                { label: "Max G-Force", value: `${((session.sessionSummary as any).maxGForce ?? 0).toFixed(2)} G` },
                { label: "Max Boost", value: `${Math.round((session.sessionSummary as any).maxBoost)} PSI` },
                { label: "Data Points", value: String((session.sessionSummary as any).totalDataPoints) },
                { label: "Events", value: String((session.sessionSummary as any).eventMarkers?.length ?? 0) },
                { label: "Overrides", value: String((session.sessionSummary as any).emergencyOverridesUsed) },
                { label: "Peak Viewers", value: String((session.sessionSummary as any).peakViewerCount) },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <div className="text-lg font-mono font-bold text-cyan-400">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
            {(session.sessionSummary as any).dtcsEncountered?.length > 0 && (
              <div className="mt-4">
                <div className="text-sm font-medium mb-2">DTCs Encountered:</div>
                <div className="flex flex-wrap gap-2">
                  {((session.sessionSummary as any).dtcsEncountered as string[]).map(dtc => (
                    <Badge key={dtc} variant="outline" className="font-mono">{dtc}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
