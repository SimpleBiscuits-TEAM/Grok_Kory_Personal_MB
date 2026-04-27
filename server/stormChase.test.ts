import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createAuthContext(userId = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-storm-user-${userId}`,
    email: `storm${userId}@example.com`,
    name: `Storm Test User ${userId}`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

// ── Test Session Lifecycle ──────────────────────────────────────────────────

describe("stormChase.startTestSession", () => {
  it("creates a test session and returns a shareKey", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.stormChase.startTestSession({
      title: "Vitest Storm Chase",
      vehicleType: "2018 L5P Duramax",
    });

    expect(result.success).toBe(true);
    expect(result.shareKey).toBeDefined();
    expect(result.shareKey).toMatch(/^sc_/); // share keys start with sc_
    expect(result.status).toBe("testing");
    expect(typeof result.sessionId).toBe("number");
  });

  it("defaults title when not provided", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.stormChase.startTestSession({});

    expect(result.success).toBe(true);
    expect(result.shareKey).toBeDefined();
  });
});

describe("stormChase.goLive", () => {
  it("transitions a testing session to live", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const session = await caller.stormChase.startTestSession({ title: "Go Live Test" });

    const result = await caller.stormChase.goLive({ streamKey: session.shareKey });
    expect(result.success).toBe(true);
    expect(result.status).toBe("live");
  });

  it("returns error for non-existent stream key", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.stormChase.goLive({ streamKey: "nonexistent_key" });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("stormChase.activateStormChase / deactivateStormChase", () => {
  it("activates and deactivates storm chase mode", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const session = await caller.stormChase.startTestSession({ title: "Chase Toggle Test" });
    await caller.stormChase.goLive({ streamKey: session.shareKey });

    const activate = await caller.stormChase.activateStormChase({ streamKey: session.shareKey });
    expect(activate.success).toBe(true);

    // Verify via getSession
    const publicCaller = appRouter.createCaller(createPublicContext());
    const sessionData = await publicCaller.stormChase.getSession({ streamKey: session.shareKey });
    expect(sessionData?.stormChaseActive).toBe(true);

    const deactivate = await caller.stormChase.deactivateStormChase({ streamKey: session.shareKey });
    expect(deactivate.success).toBe(true);
  });
});

// ── Emergency Override ──────────────────────────────────────────────────────

describe("stormChase.emergencyOverride", () => {
  it("starts and stops emergency override", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const session = await caller.stormChase.startTestSession({ title: "Override Test" });

    const start = await caller.stormChase.startEmergencyOverride({ streamKey: session.shareKey });
    expect(start.success).toBe(true);
    expect(start.startedAt).toBeDefined();
    expect(start.expiresAt).toBeDefined();

    // Verify active via getSession
    const publicCaller = appRouter.createCaller(createPublicContext());
    const sessionData = await publicCaller.stormChase.getSession({ streamKey: session.shareKey });
    expect(sessionData?.emergencyOverrideActive).toBe(true);

    const stop = await caller.stormChase.stopEmergencyOverride({ streamKey: session.shareKey });
    expect(stop.success).toBe(true);
    expect(typeof stop.durationSec).toBe("number");
  });

  it("returns error for non-existent session", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.stormChase.startEmergencyOverride({ streamKey: "fake_key" });
    expect(result.success).toBe(false);
  });
});

// ── Code Clear Logging ──────────────────────────────────────────────────────

describe("stormChase.logCodeClear", () => {
  it("logs a successful code clear event", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const session = await caller.stormChase.startTestSession({ title: "Code Clear Test" });

    const result = await caller.stormChase.logCodeClear({
      streamKey: session.shareKey,
      success: true,
      dtcsCleared: ["P0300", "P0171"],
    });

    expect(result.success).toBe(true);
  });
});

// ── Read Codes ──────────────────────────────────────────────────────────────

describe("stormChase.readCodes", () => {
  it("broadcasts DTC codes and returns count", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const session = await caller.stormChase.startTestSession({ title: "Read Codes Test" });

    const result = await caller.stormChase.readCodes({
      streamKey: session.shareKey,
      codes: [
        { code: "P0300", description: "Random/Multiple Cylinder Misfire Detected", severity: "warning" },
        { code: "P0171", description: "System Too Lean", severity: "info" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.codesRead).toBe(2);
  });
});

// ── Event Markers ───────────────────────────────────────────────────────────

describe("stormChase.addEventMarker", () => {
  it("adds an event marker and it appears in getSessionEvents", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const session = await caller.stormChase.startTestSession({ title: "Marker Test" });

    const result = await caller.stormChase.addEventMarker({
      streamKey: session.shareKey,
      label: "Tornado Spotted",
    });
    expect(result.success).toBe(true);

    // Verify via public getSessionEvents
    const publicCaller = appRouter.createCaller(createPublicContext());
    const events = await publicCaller.stormChase.getSessionEvents({
      streamKey: session.shareKey,
      type: "event_marker",
    });

    expect(events.length).toBeGreaterThanOrEqual(1);
    const marker = events.find(e => e.label === "Tornado Spotted");
    expect(marker).toBeDefined();
  });
});

// ── Settings ────────────────────────────────────────────────────────────────

describe("stormChase.updateSettings", () => {
  it("merges partial settings update", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const session = await caller.stormChase.startTestSession({ title: "Settings Test" });

    const result = await caller.stormChase.updateSettings({
      streamKey: session.shareKey,
      settings: {
        peakGauges: false,
        overlayTheme: "light",
      },
    });

    expect(result.success).toBe(true);
    expect(result.settings?.peakGauges).toBe(false);
    expect(result.settings?.overlayTheme).toBe("light");
    // Unmodified settings should retain defaults
    expect(result.settings?.healthPulse).toBe(true);
    expect(result.settings?.viewerCount).toBe(true);
  });
});

// ── Peak Values ─────────────────────────────────────────────────────────────

describe("stormChase.updatePeaks", () => {
  it("updates peak values, keeping the max", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const session = await caller.stormChase.startTestSession({ title: "Peaks Test" });

    // First update
    const r1 = await caller.stormChase.updatePeaks({
      streamKey: session.shareKey,
      mph: 85,
      rpm: 3200,
      boost: 35,
    });
    expect(r1.success).toBe(true);
    expect(r1.peaks?.maxMph).toBe(85);

    // Second update with lower mph but higher boost
    const r2 = await caller.stormChase.updatePeaks({
      streamKey: session.shareKey,
      mph: 60,
      boost: 42,
    });
    expect(r2.success).toBe(true);
    expect(r2.peaks?.maxMph).toBe(85); // kept the higher value
    expect(r2.peaks?.maxBoost).toBe(42); // updated to new peak
  });
});

// ── Health Status ───────────────────────────────────────────────────────────

describe("stormChase.updateHealthStatus", () => {
  it("updates vehicle health status", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const session = await caller.stormChase.startTestSession({ title: "Health Test" });

    const result = await caller.stormChase.updateHealthStatus({
      streamKey: session.shareKey,
      status: "yellow",
    });
    expect(result.success).toBe(true);

    // Verify via getSession
    const publicCaller = appRouter.createCaller(createPublicContext());
    const sessionData = await publicCaller.stormChase.getSession({ streamKey: session.shareKey });
    expect(sessionData?.healthStatus).toBe("yellow");
  });
});

// ── End Session & Summary ───────────────────────────────────────────────────

describe("stormChase.endSession", () => {
  it("ends session and generates summary with events", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const session = await caller.stormChase.startTestSession({ title: "End Session Test" });

    // Add some events
    await caller.stormChase.addEventMarker({ streamKey: session.shareKey, label: "Wall Cloud" });
    await caller.stormChase.addEventMarker({ streamKey: session.shareKey, label: "Tornado Spotted" });
    await caller.stormChase.readCodes({
      streamKey: session.shareKey,
      codes: [{ code: "P0300" }],
    });
    await caller.stormChase.startEmergencyOverride({ streamKey: session.shareKey });
    await caller.stormChase.stopEmergencyOverride({ streamKey: session.shareKey });

    // End session
    const result = await caller.stormChase.endSession({ streamKey: session.shareKey });
    expect(result.success).toBe(true);
    expect(result.summary).toBeDefined();
    expect(result.summary!.eventMarkers.length).toBe(2);
    expect(result.summary!.dtcsEncountered).toContain("P0300");
    expect(result.summary!.emergencyOverridesUsed).toBe(1);
    expect(result.summary!.totalDurationSec).toBeGreaterThanOrEqual(0);
  });

  it("returns error for non-existent session", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.stormChase.endSession({ streamKey: "nonexistent" });
    expect(result.success).toBe(false);
  });
});

// ── Public Queries ──────────────────────────────────────────────────────────

describe("stormChase.getSession", () => {
  it("returns null for non-existent stream key", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.stormChase.getSession({ streamKey: "nonexistent" });
    expect(result).toBeNull();
  });

  it("returns session with typed settings and peaks", async () => {
    const authCaller = appRouter.createCaller(createAuthContext());
    const session = await authCaller.stormChase.startTestSession({ title: "Get Session Test" });

    const publicCaller = appRouter.createCaller(createPublicContext());
    const result = await publicCaller.stormChase.getSession({ streamKey: session.shareKey });

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Get Session Test");
    expect(result!.status).toBe("testing");
    expect(result!.streamSettings).toHaveProperty("peakGauges");
    expect(result!.streamSettings).toHaveProperty("healthPulse");
    expect(result!.streamSettings).toHaveProperty("viewerCount");
    expect(result!.streamSettings).toHaveProperty("audioAlert");
    expect(result!.peakValues).toHaveProperty("maxMph");
    expect(result!.peakValues).toHaveProperty("maxRpm");
    expect(result!.tags).toContain("storm-chase");
  });
});

describe("stormChase.getSessionEvents", () => {
  it("returns empty array for non-existent stream", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.stormChase.getSessionEvents({ streamKey: "nonexistent" });
    expect(result).toEqual([]);
  });

  it("filters events by type", async () => {
    const authCaller = appRouter.createCaller(createAuthContext());
    const session = await authCaller.stormChase.startTestSession({ title: "Events Filter Test" });

    // Add different event types
    await authCaller.stormChase.addEventMarker({ streamKey: session.shareKey, label: "Test Marker" });
    await authCaller.stormChase.logCodeClear({ streamKey: session.shareKey, success: true });

    const publicCaller = appRouter.createCaller(createPublicContext());

    // Filter for markers only
    const markers = await publicCaller.stormChase.getSessionEvents({
      streamKey: session.shareKey,
      type: "event_marker",
    });
    expect(markers.every(e => e.type === "event_marker")).toBe(true);

    // Filter for code_clear only
    const clears = await publicCaller.stormChase.getSessionEvents({
      streamKey: session.shareKey,
      type: "code_clear",
    });
    expect(clears.every(e => e.type === "code_clear")).toBe(true);
  });
});

describe("stormChase.getMyChases", () => {
  it("returns user's chase history", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    // Create a session first
    await caller.stormChase.startTestSession({ title: "History Test" });

    const result = await caller.stormChase.getMyChases({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);

    const chase = result[0];
    expect(chase).toHaveProperty("title");
    expect(chase).toHaveProperty("status");
    expect(chase).toHaveProperty("streamSettings");
    expect(chase).toHaveProperty("peakValues");
  });
});

// ── Overlay URL ─────────────────────────────────────────────────────────────

describe("stormChase.getOverlayUrl", () => {
  it("returns overlay path with stream key", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.stormChase.getOverlayUrl({
      streamKey: "test_key_123",
    });

    expect(result.overlayPath).toContain("/stream/overlay");
    expect(result.overlayPath).toContain("key=test_key_123");
    expect(result.obsInstructions).toBeDefined();
    expect(result.obsInstructions.length).toBeGreaterThan(0);
  });

  it("includes optional theme and position params", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.stormChase.getOverlayUrl({
      streamKey: "test_key_456",
      theme: "light",
      position: "top-right",
      scale: 1.5,
    });

    expect(result.overlayPath).toContain("theme=light");
    expect(result.overlayPath).toContain("pos=top-right");
    expect(result.overlayPath).toContain("scale=1.5");
  });
});
