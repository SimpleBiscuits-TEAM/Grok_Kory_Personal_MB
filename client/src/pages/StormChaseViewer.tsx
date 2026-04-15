/**
 * Storm Chase Viewer — Standalone page for viewers to watch live telemetry.
 *
 * URL: /stream/:streamKey
 *
 * Shows:
 * - Live telemetry gauges
 * - Vehicle health pulse
 * - Event markers timeline
 * - Emergency override status
 * - External stream embed (YouTube/Twitch)
 * - Session summary when ended
 */
import { useState, useEffect, useMemo } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Radio, Shield, Bookmark, Activity, BarChart3, Clock, Users, Heart
} from "lucide-react";

// ── Health Pulse ─────────────────────────────────────────────────────────────

function ViewerHealthPulse({ status }: { status: "green" | "yellow" | "red" }) {
  const colors = {
    green: "bg-green-500 shadow-green-500/50",
    yellow: "bg-yellow-500 shadow-yellow-500/50 animate-pulse",
    red: "bg-red-500 shadow-red-500/50 animate-pulse",
  };
  const labels = { green: "Vehicle OK", yellow: "Monitor", red: "Warning" };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full shadow-lg ${colors[status]}`} />
      <span className="text-sm font-medium">{labels[status]}</span>
    </div>
  );
}

// ── Gauge ────────────────────────────────────────────────────────────────────

function ViewerGauge({
  label, value, peak, unit, max, color, showPeak,
}: {
  label: string; value: number | null; peak?: number | null;
  unit: string; max: number; color: string; showPeak: boolean;
}) {
  const pct = value != null ? Math.min(100, (Math.abs(value) / max) * 100) : 0;

  return (
    <div className="bg-black/40 rounded-lg p-4 text-center border border-white/10 backdrop-blur-sm">
      <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{label}</div>
      <div className={`text-3xl font-mono font-bold ${color} leading-tight`}>
        {value != null ? (max <= 2 ? value.toFixed(2) : Math.round(value)) : "—"}
      </div>
      <div className="text-xs text-muted-foreground">{unit}</div>
      <div className="h-1.5 bg-white/5 rounded-full mt-2">
        <div className={`h-full rounded-full transition-all duration-300`} style={{ width: `${pct}%`, backgroundColor: color.replace("text-", "").includes("cyan") ? "#22d3ee" : color.includes("amber") ? "#fbbf24" : color.includes("green") ? "#4ade80" : color.includes("red") ? "#f87171" : color.includes("purple") ? "#a78bfa" : "#fb923c" }} />
      </div>
      {showPeak && peak != null && peak > 0 && (
        <div className="text-[10px] text-muted-foreground mt-1">
          Peak: {max <= 2 ? peak.toFixed(2) : Math.round(peak)}
        </div>
      )}
    </div>
  );
}

// ── Event Timeline ───────────────────────────────────────────────────────────

function EventTimeline({ streamKey }: { streamKey: string }) {
  const { data: events } = trpc.stormChase.getSessionEvents.useQuery(
    { streamKey, type: "event_marker", limit: 50 },
    { refetchInterval: 5000 }
  );

  if (!events?.length) return null;

  return (
    <Card className="border-cyan-500/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-cyan-400" />
          Event Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {events.map((e) => (
            <div key={e.id} className="flex items-center gap-3 text-sm">
              <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                {new Date(e.timestamp).toLocaleTimeString()}
              </span>
              <div className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
              <span>{e.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Emergency Override Banner ─────────────────────────────────────────────────

function EmergencyBanner({ startedAt }: { startedAt: string }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const duration = 10 * 60 * 1000;
    const tick = () => {
      setRemaining(Math.max(0, Math.ceil((duration - (Date.now() - start)) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (remaining <= 0) return null;

  const m = Math.floor(remaining / 60);
  const s = remaining % 60;

  return (
    <div className="bg-red-500/10 border-2 border-red-500 rounded-lg px-4 py-3 flex items-center justify-between animate-pulse">
      <div className="flex items-center gap-3">
        <Shield className="h-5 w-5 text-red-500" />
        <span className="font-bold text-red-400 uppercase tracking-wider text-sm">Emergency Override Active</span>
      </div>
      <Badge variant="destructive" className="text-lg px-3 py-1 font-mono">
        {m}:{s.toString().padStart(2, "0")}
      </Badge>
    </div>
  );
}

// ── Main Viewer ──────────────────────────────────────────────────────────────

export default function StormChaseViewer() {
  const params = useParams<{ streamKey: string }>();
  const streamKey = params.streamKey ?? "";

  const { data: session, isLoading } = trpc.stormChase.getSession.useQuery(
    { streamKey },
    { enabled: !!streamKey, refetchInterval: 2000 }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-3">
          <Radio className="h-10 w-10 text-cyan-400 animate-pulse mx-auto" />
          <p className="text-muted-foreground">Connecting to stream...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-3">
          <Radio className="h-10 w-10 text-muted-foreground mx-auto" />
          <h2 className="text-xl font-bold">Stream Not Found</h2>
          <p className="text-muted-foreground">This stream may have ended or the link is invalid.</p>
        </div>
      </div>
    );
  }

  const streamSettings = session.streamSettings;
  const peaks = session.peakValues;
  const isLive = session.status === "live" || session.status === "testing";
  const isEnded = session.status === "ended";

  // Build telemetry from stream columns
  const telemetry = {
    mph: session.speedMph ? parseFloat(session.speedMph) : null,
    rpm: session.engineRpm ?? null,
    boost: session.boostPsi ? parseFloat(session.boostPsi) : null,
    throttlePct: session.throttlePct ? parseFloat(session.throttlePct) : null,
    brakePct: null as number | null,
    gForceX: null as number | null,
  };

  const gauges = [
    { label: "MPH", value: telemetry.mph, peak: peaks.maxMph, max: 150, unit: "", color: "text-cyan-400" },
    { label: "RPM", value: telemetry.rpm, peak: peaks.maxRpm, max: 5000, unit: "", color: "text-amber-400" },
    { label: "Boost", value: telemetry.boost, peak: peaks.maxBoost, max: 60, unit: "PSI", color: "text-purple-400" },
    { label: "Throttle", value: telemetry.throttlePct, peak: peaks.maxThrottle, max: 100, unit: "%", color: "text-green-400" },
    { label: "Brake", value: telemetry.brakePct, peak: null, max: 100, unit: "%", color: "text-red-400" },
    { label: "G-Force", value: telemetry.gForceX != null ? Math.abs(telemetry.gForceX) : null, peak: peaks.maxGForceX, max: 2, unit: "G", color: "text-orange-400" },
  ];

  const summary = session.sessionSummary;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isLive && (
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            )}
            <h1 className="text-lg font-bold">{session.title}</h1>
            {session.vehicleType && (
              <span className="text-sm text-muted-foreground">· {session.vehicleType}</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {streamSettings.healthPulse && (
              <ViewerHealthPulse status={(session.healthStatus as "green" | "yellow" | "red") ?? "green"} />
            )}
            {streamSettings.viewerCount && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                {session.viewerCount}
              </div>
            )}
            <Badge variant={isLive ? "default" : isEnded ? "secondary" : "outline"}>
              {session.stormChaseActive ? "STORM CHASE" : session.status.toUpperCase()}
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Emergency Override */}
        {session.emergencyOverrideActive && session.emergencyOverrideStartedAt && (
          <EmergencyBanner startedAt={session.emergencyOverrideStartedAt.toString()} />
        )}

        {/* External Stream Embed */}
        {session.externalStreamUrl && isLive && (
          <div className="aspect-video bg-black/50 rounded-lg border border-white/10 overflow-hidden">
            <iframe
              src={getEmbedUrl(session.externalStreamUrl)}
              className="w-full h-full"
              allowFullScreen
              allow="autoplay; encrypted-media"
            />
          </div>
        )}

        {/* Telemetry Gauges */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {gauges.map(g => (
            <ViewerGauge
              key={g.label}
              label={g.label}
              value={g.value}
              peak={g.peak}
              unit={g.unit}
              max={g.max}
              color={g.color}
              showPeak={streamSettings.peakGauges}
            />
          ))}
        </div>

        {/* Event Timeline */}
        <EventTimeline streamKey={streamKey} />

        {/* Session Summary (when ended) */}
        {isEnded && summary && (
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
                  { label: "Duration", value: `${Math.round(summary.totalDurationSec / 60)} min` },
                  { label: "Max Speed", value: `${Math.round(summary.maxSpeed)} MPH` },
                  { label: "Max G-Force", value: `${(summary.maxGForce ?? 0).toFixed(2)} G` },
                  { label: "Max Boost", value: `${Math.round(summary.maxBoost)} PSI` },
                  { label: "Data Points", value: String(summary.totalDataPoints) },
                  { label: "Events", value: String(summary.eventMarkers?.length ?? 0) },
                  { label: "Overrides", value: String(summary.emergencyOverridesUsed) },
                  { label: "Peak Viewers", value: String(summary.peakViewerCount) },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <div className="text-lg font-mono font-bold text-cyan-400">{s.value}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
              {summary.dtcsEncountered?.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-medium mb-2">DTCs Encountered:</div>
                  <div className="flex flex-wrap gap-2">
                    {summary.dtcsEncountered.map((dtc: string) => (
                      <Badge key={dtc} variant="outline" className="font-mono">{dtc}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground pt-4">
          V-OP Storm Chase by PPEI
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getEmbedUrl(url: string): string {
  // Convert YouTube watch URL to embed URL
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`;

  // Convert Twitch URL to embed
  const twitchMatch = url.match(/twitch\.tv\/([^/?]+)/);
  if (twitchMatch) return `https://player.twitch.tv/?channel=${twitchMatch[1]}&parent=${window.location.hostname}`;

  return url;
}
