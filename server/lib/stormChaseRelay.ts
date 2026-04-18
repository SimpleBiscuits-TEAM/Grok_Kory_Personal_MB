/**
 * Storm Chase WebSocket Relay
 *
 * Real-time telemetry broadcast: driver → server → viewers
 *
 * Protocol:
 *   ws://host/ws/storm-chase?key=<streamKey>&role=driver|viewer
 *
 * Driver sends:
 *   { type: "telemetry", data: { rpm, mph, throttlePct, boostPsi, ... } }
 *   { type: "event", label: "Tornado spotted", data: {...} }
 *   { type: "health", status: "green"|"yellow"|"red" }
 *
 * Viewers receive:
 *   { type: "telemetry", data: {...}, ts: <epoch_ms> }
 *   { type: "event", label: "...", data: {...}, ts: <epoch_ms> }
 *   { type: "health", status: "...", ts: <epoch_ms> }
 *   { type: "viewer_count", count: <number> }
 *   { type: "session_ended" }
 *
 * Also stores telemetry snapshots to stream_telemetry at ~1Hz for replay.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import type { IncomingMessage } from "http";
import { getDb } from "../db";
import { streamTelemetry, liveWeatherStreams } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ── Types ──────────────────────────────────────────────────────────────────

interface TelemetryPayload {
  rpm?: number;
  mph?: number;
  throttlePct?: number;
  brakePct?: number;
  boostPsi?: number;
  gForceX?: number;
  gForceY?: number;
  egt?: number;
  coolantTemp?: number;
  oilTemp?: number;
  oilPressure?: number;
  fuelRailPressure?: number;
  transTemp?: number;
  [key: string]: number | string | boolean | undefined;
}

interface DriverMessage {
  type: "telemetry" | "event" | "health";
  data?: TelemetryPayload | Record<string, unknown>;
  label?: string;
  status?: "green" | "yellow" | "red";
}

interface Room {
  streamKey: string;
  driver: WebSocket | null;
  viewers: Set<WebSocket>;
  lastTelemetry: TelemetryPayload | null;
  lastSnapshotAt: number; // epoch ms — throttle DB writes to ~1Hz
  healthStatus: "green" | "yellow" | "red";
}

// ── State ──────────────────────────────────────────────────────────────────

const rooms = new Map<string, Room>();

function getOrCreateRoom(streamKey: string): Room {
  let room = rooms.get(streamKey);
  if (!room) {
    room = {
      streamKey,
      driver: null,
      viewers: new Set(),
      lastTelemetry: null,
      lastSnapshotAt: 0,
      healthStatus: "green",
    };
    rooms.set(streamKey, room);
  }
  return room;
}

function broadcastToViewers(room: Room, message: object): void {
  const payload = JSON.stringify(message);
  for (const viewer of room.viewers) {
    if (viewer.readyState === WebSocket.OPEN) {
      viewer.send(payload);
    }
  }
}

function broadcastViewerCount(room: Room): void {
  const count = room.viewers.size;
  const msg = { type: "viewer_count", count, ts: Date.now() };
  const payload = JSON.stringify(msg);

  // Send to driver too
  if (room.driver?.readyState === WebSocket.OPEN) {
    room.driver.send(payload);
  }
  for (const viewer of room.viewers) {
    if (viewer.readyState === WebSocket.OPEN) {
      viewer.send(payload);
    }
  }
}

async function storeTelemetrySnapshot(
  room: Room,
  data: TelemetryPayload,
  healthStatus: "green" | "yellow" | "red",
): Promise<void> {
  const now = Date.now();
  // Throttle to ~1Hz
  if (now - room.lastSnapshotAt < 900) return;
  room.lastSnapshotAt = now;

  try {
    const db = await getDb();
    if (!db) return;

    // Look up session ID from streamKey
    const [session] = await db
      .select({ id: liveWeatherStreams.id })
      .from(liveWeatherStreams)
      .where(eq(liveWeatherStreams.streamKey, room.streamKey))
      .limit(1);

    if (!session) return;

    await db.insert(streamTelemetry).values({
      sessionId: session.id,
      data,
      healthStatus,
    });
  } catch (err) {
    // Non-fatal — don't crash the relay for DB issues
    console.error("[StormChaseRelay] Failed to store telemetry snapshot:", err);
  }
}

// ── WebSocket Server Setup ─────────────────────────────────────────────────

export function attachStormChaseRelay(httpServer: HttpServer): void {
  const wss = new WebSocketServer({
    noServer: true,
  });

  // Handle upgrade requests for /ws/storm-chase
  httpServer.on("upgrade", (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (url.pathname !== "/ws/storm-chase") {
      // Not our path — let other upgrade handlers (if any) handle it
      return;
    }

    const streamKey = url.searchParams.get("key");
    const role = url.searchParams.get("role") as "driver" | "viewer" | null;

    if (!streamKey || !role || !["driver", "viewer"].includes(role)) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request, { streamKey, role });
    });
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, meta: { streamKey: string; role: "driver" | "viewer" }) => {
    const { streamKey, role } = meta;
    const room = getOrCreateRoom(streamKey);

    if (role === "driver") {
      // Only one driver per room
      if (room.driver && room.driver.readyState === WebSocket.OPEN) {
        room.driver.close(4001, "Replaced by new driver connection");
      }
      room.driver = ws;

      ws.on("message", async (raw) => {
        try {
          const msg: DriverMessage = JSON.parse(raw.toString());

          switch (msg.type) {
            case "telemetry": {
              const data = (msg.data ?? {}) as TelemetryPayload;
              room.lastTelemetry = data;
              broadcastToViewers(room, { type: "telemetry", data, ts: Date.now() });
              // Store snapshot at ~1Hz
              await storeTelemetrySnapshot(room, data, room.healthStatus);
              break;
            }
            case "event": {
              broadcastToViewers(room, {
                type: "event",
                label: msg.label ?? "Event",
                data: msg.data ?? {},
                ts: Date.now(),
              });
              break;
            }
            case "health": {
              const status = msg.status ?? "green";
              room.healthStatus = status;
              broadcastToViewers(room, { type: "health", status, ts: Date.now() });
              break;
            }
          }
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on("close", () => {
        if (room.driver === ws) {
          room.driver = null;
          broadcastToViewers(room, { type: "session_ended", ts: Date.now() });
        }
        cleanupRoom(streamKey);
      });

    } else {
      // Viewer
      room.viewers.add(ws);
      broadcastViewerCount(room);

      // Send last known telemetry so viewer isn't blank
      if (room.lastTelemetry) {
        ws.send(JSON.stringify({
          type: "telemetry",
          data: room.lastTelemetry,
          ts: Date.now(),
        }));
      }

      ws.on("close", () => {
        room.viewers.delete(ws);
        broadcastViewerCount(room);
        cleanupRoom(streamKey);
      });
    }

    // Heartbeat — close stale connections
    const heartbeat = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        clearInterval(heartbeat);
        return;
      }
      ws.ping();
    }, 30_000);

    ws.on("close", () => clearInterval(heartbeat));
  });

  console.log("[StormChaseRelay] WebSocket relay attached at /ws/storm-chase");
}

function cleanupRoom(streamKey: string): void {
  const room = rooms.get(streamKey);
  if (!room) return;
  if (!room.driver && room.viewers.size === 0) {
    rooms.delete(streamKey);
  }
}

// ── Public helpers for tRPC router ─────────────────────────────────────────

export function getActiveRoomCount(): number {
  return rooms.size;
}

export function getRoomViewerCount(streamKey: string): number {
  return rooms.get(streamKey)?.viewers.size ?? 0;
}

export function isDriverConnected(streamKey: string): boolean {
  const room = rooms.get(streamKey);
  return (room?.driver?.readyState === WebSocket.OPEN) || false;
}
