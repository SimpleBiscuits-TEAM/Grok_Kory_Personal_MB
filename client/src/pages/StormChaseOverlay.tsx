/**
 * Storm Chase OBS Overlay — Embeddable browser source for OBS Studio.
 *
 * URL: /overlay/:streamKey?theme=dark&position=bottom-left&scale=1&opacity=0.9
 *
 * Features:
 * - Transparent background (perfect for OBS browser source)
 * - Live telemetry gauges (MPH, RPM, Boost, Throttle, Brake, G-Force)
 * - Vehicle health pulse indicator
 * - Peak gauge values
 * - Emergency override countdown
 * - Event marker banners
 * - DTC code display
 * - Customizable via URL params: theme, position, scale, opacity
 */
import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";

// ── Types ────────────────────────────────────────────────────────────────────

interface OverlaySettings {
  theme: "dark" | "light" | "transparent";
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  scale: number;
  opacity: number;
}

interface EventBanner {
  label: string;
  timestamp: number;
  fadeOut: boolean;
}

// ── Parse URL params ─────────────────────────────────────────────────────────

function useOverlayParams(): OverlaySettings {
  const search = window.location.search;
  const params = useMemo(() => new URLSearchParams(search), [search]);

  return useMemo(() => ({
    theme: (params.get("theme") as OverlaySettings["theme"]) || "dark",
    position: (params.get("position") as OverlaySettings["position"]) || "bottom-left",
    scale: Math.max(0.5, Math.min(2, parseFloat(params.get("scale") || "1"))),
    opacity: Math.max(0.1, Math.min(1, parseFloat(params.get("opacity") || "0.9"))),
  }), [params]);
}

// ── Gauge Component ──────────────────────────────────────────────────────────

function OverlayGauge({
  label,
  value,
  peak,
  unit,
  max,
  color,
  showPeak,
  theme,
}: {
  label: string;
  value: number | null;
  peak?: number | null;
  unit: string;
  max: number;
  color: string;
  showPeak: boolean;
  theme: string;
}) {
  const pct = value != null ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  const bg = theme === "light" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.4)";
  const textColor = theme === "light" ? "#111" : "#fff";
  const mutedColor = theme === "light" ? "#666" : "#999";

  return (
    <div style={{
      background: bg,
      borderRadius: 8,
      padding: "8px 12px",
      minWidth: 90,
      textAlign: "center",
      backdropFilter: "blur(8px)",
      border: `1px solid ${theme === "light" ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.08)"}`,
    }}>
      <div style={{ fontSize: 10, color: mutedColor, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "monospace", color, lineHeight: 1.1 }}>
        {value != null ? (max <= 2 ? value.toFixed(2) : Math.round(value)) : "—"}
      </div>
      <div style={{ fontSize: 10, color: mutedColor }}>{unit}</div>
      {/* Progress bar */}
      <div style={{ height: 3, background: "rgba(128,128,128,0.3)", borderRadius: 2, marginTop: 4 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
      {showPeak && peak != null && peak > 0 && (
        <div style={{ fontSize: 9, color: mutedColor, marginTop: 2 }}>
          Peak: {max <= 2 ? peak.toFixed(2) : Math.round(peak)}
        </div>
      )}
    </div>
  );
}

// ── Health Pulse ─────────────────────────────────────────────────────────────

function OverlayHealthPulse({ status }: { status: "green" | "yellow" | "red" }) {
  const colors = { green: "#22c55e", yellow: "#eab308", red: "#ef4444" };
  const labels = { green: "OK", yellow: "MONITOR", red: "WARNING" };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: colors[status],
        boxShadow: `0 0 8px ${colors[status]}`,
        animation: status !== "green" ? "pulse 1.5s infinite" : undefined,
      }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: colors[status], letterSpacing: 1 }}>
        {labels[status]}
      </span>
    </div>
  );
}

// ── Emergency Override Countdown ─────────────────────────────────────────────

function OverlayEmergencyCountdown({ startedAt, theme }: { startedAt: string; theme: string }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const duration = 10 * 60 * 1000;

    const tick = () => {
      const r = Math.max(0, Math.ceil((duration - (Date.now() - start)) / 1000));
      setRemaining(r);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (remaining <= 0) return null;

  const m = Math.floor(remaining / 60);
  const s = remaining % 60;

  return (
    <div style={{
      background: "rgba(239,68,68,0.2)",
      border: "2px solid #ef4444",
      borderRadius: 8,
      padding: "8px 16px",
      display: "flex",
      alignItems: "center",
      gap: 10,
      backdropFilter: "blur(8px)",
      animation: "pulse 1s infinite",
    }}>
      <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
        EMERGENCY OVERRIDE
      </div>
      <div style={{ fontSize: 24, fontFamily: "monospace", fontWeight: 800, color: "#ef4444" }}>
        {m}:{s.toString().padStart(2, "0")}
      </div>
    </div>
  );
}

// ── Event Banner ─────────────────────────────────────────────────────────────

function OverlayEventBanner({ label, fadeOut }: { label: string; fadeOut: boolean }) {
  return (
    <div style={{
      background: "rgba(6,182,212,0.2)",
      border: "1px solid rgba(6,182,212,0.5)",
      borderRadius: 6,
      padding: "6px 14px",
      backdropFilter: "blur(8px)",
      opacity: fadeOut ? 0 : 1,
      transition: "opacity 1s",
    }}>
      <div style={{ fontSize: 10, color: "#06b6d4", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
        EVENT
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
        {label}
      </div>
    </div>
  );
}

// ── DTC Display ──────────────────────────────────────────────────────────────

function OverlayDtcCodes({ codes }: { codes: Array<{ code: string; description?: string }> }) {
  if (!codes.length) return null;

  return (
    <div style={{
      background: "rgba(245,158,11,0.15)",
      border: "1px solid rgba(245,158,11,0.4)",
      borderRadius: 6,
      padding: "6px 12px",
      backdropFilter: "blur(8px)",
    }}>
      <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
        DIAGNOSTIC CODES
      </div>
      {codes.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
          <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>{c.code}</span>
          {c.description && <span style={{ fontSize: 10, color: "#999" }}>{c.description}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Main Overlay ─────────────────────────────────────────────────────────────

export default function StormChaseOverlay() {
  // Overlay uses ?key= query param (from OBS browser source URL)
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const streamKey = searchParams.get("key") ?? "";
  const settings = useOverlayParams();
  const [eventBanners, setEventBanners] = useState<EventBanner[]>([]);
  const prevEventsRef = useRef<number>(0);

  // Poll session data
  const { data: session } = trpc.stormChase.getSession.useQuery(
    { streamKey },
    { enabled: !!streamKey, refetchInterval: 1500 }
  );

  // Poll events
  const { data: events } = trpc.stormChase.getSessionEvents.useQuery(
    { streamKey, limit: 20 },
    { enabled: !!streamKey, refetchInterval: 3000 }
  );

  // Show new event banners
  useEffect(() => {
    if (!events?.length) return;
    if (events.length > prevEventsRef.current) {
      const newEvents = events.slice(0, events.length - prevEventsRef.current);
      newEvents.forEach(e => {
        if (e.type === "event_marker") {
          const banner: EventBanner = { label: e.label ?? "Event", timestamp: Date.now(), fadeOut: false };
          setEventBanners(prev => [banner, ...prev].slice(0, 3));
          // Fade out after 8 seconds
          setTimeout(() => {
            setEventBanners(prev => prev.map(b => b.timestamp === banner.timestamp ? { ...b, fadeOut: true } : b));
          }, 8000);
          // Remove after 10 seconds
          setTimeout(() => {
            setEventBanners(prev => prev.filter(b => b.timestamp !== banner.timestamp));
          }, 10000);
        }
      });
    }
    prevEventsRef.current = events.length;
  }, [events]);

  if (!session) {
    return (
      <div style={{ background: "transparent", width: "100vw", height: "100vh" }}>
        {/* No session — blank overlay */}
      </div>
    );
  }

  const streamSettings = session.streamSettings ?? {
    peakGauges: true, healthPulse: true, viewerCount: true,
    overlayTheme: "dark", overlayPosition: "bottom-left", overlayScale: 1,
  };

  const peaks = session.peakValues ?? {
    maxMph: 0, maxRpm: 0, maxGForceX: 0, maxGForceY: 0, maxBoost: 0, maxThrottle: 0,
  };

  // Build telemetry from the stream's latest columns
  const telemetry = {
    mph: session.speedMph ? parseFloat(session.speedMph) : null,
    rpm: session.engineRpm ?? null,
    boost: session.boostPsi ? parseFloat(session.boostPsi) : null,
    throttlePct: session.throttlePct ? parseFloat(session.throttlePct) : null,
    brakePct: null as number | null,
    gForceX: null as number | null,
  };

  const theme = settings.theme;
  const showPeaks = streamSettings.peakGauges;

  // Position styles
  const positionStyles: Record<string, React.CSSProperties> = {
    "top-left": { top: 16, left: 16 },
    "top-right": { top: 16, right: 16 },
    "bottom-left": { bottom: 16, left: 16 },
    "bottom-right": { bottom: 16, right: 16 },
  };

  const gaugeData = [
    { label: "MPH", value: telemetry.mph, peak: peaks.maxMph, max: 150, unit: "", color: "#22d3ee" },
    { label: "RPM", value: telemetry.rpm, peak: peaks.maxRpm, max: 5000, unit: "", color: "#fbbf24" },
    { label: "Boost", value: telemetry.boost, peak: peaks.maxBoost, max: 60, unit: "PSI", color: "#a78bfa" },
    { label: "Throttle", value: telemetry.throttlePct, peak: peaks.maxThrottle, max: 100, unit: "%", color: "#4ade80" },
    { label: "Brake", value: telemetry.brakePct, peak: null, max: 100, unit: "%", color: "#f87171" },
    { label: "G-Force", value: telemetry.gForceX != null ? Math.abs(telemetry.gForceX) : null, peak: peaks.maxGForceX, max: 2, unit: "G", color: "#fb923c" },
  ];

  return (
    <>
      {/* Global pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: transparent !important; overflow: hidden; }
      `}</style>

      <div style={{
        position: "fixed",
        ...positionStyles[settings.position],
        transform: `scale(${settings.scale})`,
        transformOrigin: settings.position.replace("-", " "),
        opacity: settings.opacity,
        fontFamily: "'Inter', -apple-system, sans-serif",
        color: theme === "light" ? "#111" : "#fff",
        zIndex: 9999,
        maxWidth: 600,
      }}>
        {/* Header: Title + Health + Viewers */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {session.stormChaseActive && (
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: "#ef4444",
                boxShadow: "0 0 6px #ef4444",
                animation: "pulse 1s infinite",
              }} />
            )}
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
              {session.title ?? "STORM CHASE"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {streamSettings.healthPulse && (
              <OverlayHealthPulse status={(session.healthStatus as "green" | "yellow" | "red") ?? "green"} />
            )}
            {streamSettings.viewerCount && (
              <span style={{ fontSize: 11, color: "#999" }}>
                👁 {session.viewerCount ?? 0}
              </span>
            )}
          </div>
        </div>

        {/* Gauges Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 6,
          marginBottom: 8,
        }}>
          {gaugeData.map(g => (
            <OverlayGauge
              key={g.label}
              label={g.label}
              value={g.value}
              peak={g.peak}
              unit={g.unit}
              max={g.max}
              color={g.color}
              showPeak={showPeaks}
              theme={theme}
            />
          ))}
        </div>

        {/* Emergency Override Countdown */}
        {session.emergencyOverrideActive && session.emergencyOverrideStartedAt && (
          <div style={{ marginBottom: 8 }}>
            <OverlayEmergencyCountdown
              startedAt={session.emergencyOverrideStartedAt.toString()}
              theme={theme}
            />
          </div>
        )}

        {/* Event Banners */}
        {eventBanners.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
            {eventBanners.map((b, i) => (
              <OverlayEventBanner key={b.timestamp} label={b.label} fadeOut={b.fadeOut} />
            ))}
          </div>
        )}

        {/* DTC Codes */}
        {/* DTC codes shown via events */}

        {/* V-OP Branding */}
        <div style={{
          textAlign: "right",
          fontSize: 9,
          color: "rgba(128,128,128,0.5)",
          marginTop: 4,
          letterSpacing: 1,
        }}>
          V-OP STORM CHASE
        </div>
      </div>
    </>
  );
}
