/**
 * Flash Database Helpers — CRUD operations for flash sessions, logs,
 * queue, stats, snapshots, and file fingerprints.
 *
 * When `DATABASE_URL` is unset (common in local dev), MySQL is unavailable.
 * Session create/read/update use an in-memory map so PCAN dry run / simulator flows work;
 * logs, stats, fingerprints, and queue writes are no-ops or empty reads.
 */
import { drizzle } from "drizzle-orm/mysql2";
import { eq, desc } from "drizzle-orm";
import {
  flashSessions, flashSessionLogs, flashQueue, ecuSnapshots,
  flashStats, fileFingerprints,
  type FlashSession,
  type InsertFlashSession, type InsertFlashSessionLog,
  type InsertFlashQueueItem, type InsertEcuSnapshot,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

/** In-memory flash sessions when no DB (local dev). */
const devFlashSessionsByUuid = new Map<string, FlashSession>();
let devSessionIdCounter = 1;

function getDb(): ReturnType<typeof drizzle> | null {
  if (!_db && process.env.DATABASE_URL) {
    _db = drizzle(process.env.DATABASE_URL);
  }
  return _db;
}

function flashSessionFromInsert(data: InsertFlashSession, id: number): FlashSession {
  const now = new Date();
  return {
    id,
    uuid: data.uuid,
    userId: data.userId,
    ecuType: data.ecuType,
    ecuName: data.ecuName ?? null,
    flashMode: data.flashMode,
    connectionMode: data.connectionMode,
    status: data.status ?? "pending",
    fileHash: data.fileHash ?? null,
    fileName: data.fileName ?? null,
    fileSize: data.fileSize ?? null,
    vin: data.vin ?? null,
    fileId: data.fileId ?? null,
    totalBlocks: data.totalBlocks ?? 0,
    totalBytes: data.totalBytes ?? 0,
    progress: data.progress ?? 0,
    durationMs: data.durationMs ?? null,
    errorMessage: data.errorMessage ?? null,
    nrcCode: data.nrcCode ?? null,
    metadata: data.metadata ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

// ── SESSIONS ───────────────────────────────────────────────────────────────

export async function createFlashSession(data: InsertFlashSession) {
  const db = getDb();
  if (!db) {
    const id = devSessionIdCounter++;
    const row = flashSessionFromInsert(data, id);
    devFlashSessionsByUuid.set(data.uuid, row);
    return row;
  }
  await db.insert(flashSessions).values(data);
  const [row] = await db.select().from(flashSessions).where(eq(flashSessions.uuid, data.uuid));
  return row!;
}

export async function getFlashSession(uuid: string) {
  const db = getDb();
  if (!db) {
    return devFlashSessionsByUuid.get(uuid) ?? null;
  }
  const [row] = await db.select().from(flashSessions).where(eq(flashSessions.uuid, uuid));
  return row || null;
}

export async function updateFlashSession(
  uuid: string,
  updates: Partial<Pick<InsertFlashSession, 'status' | 'progress' | 'durationMs' | 'errorMessage' | 'nrcCode' | 'metadata'>>,
) {
  const db = getDb();
  if (!db) {
    const cur = devFlashSessionsByUuid.get(uuid);
    if (!cur) return;
    devFlashSessionsByUuid.set(uuid, {
      ...cur,
      ...updates,
      updatedAt: new Date(),
    });
    return;
  }
  await db.update(flashSessions).set(updates).where(eq(flashSessions.uuid, uuid));
}

export async function listFlashSessions(userId: number, limit = 50) {
  const db = getDb();
  if (!db) {
    return [...devFlashSessionsByUuid.values()]
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
  return db.select().from(flashSessions)
    .where(eq(flashSessions.userId, userId))
    .orderBy(desc(flashSessions.createdAt))
    .limit(limit);
}

// ── SESSION LOGS ───────────────────────────────────────────────────────────

export async function appendFlashLogs(logs: InsertFlashSessionLog[]) {
  if (!logs.length) return;
  const db = getDb();
  if (!db) return;
  await db.insert(flashSessionLogs).values(logs);
}

export async function getFlashSessionLogs(sessionId: number, limit = 500) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(flashSessionLogs)
    .where(eq(flashSessionLogs.sessionId, sessionId))
    .orderBy(flashSessionLogs.timestampMs)
    .limit(limit);
}

// ── SNAPSHOTS ──────────────────────────────────────────────────────────────

export async function saveEcuSnapshot(data: InsertEcuSnapshot) {
  const db = getDb();
  if (!db) return;
  await db.insert(ecuSnapshots).values(data);
}

export async function getSessionSnapshots(sessionId: number) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(ecuSnapshots)
    .where(eq(ecuSnapshots.sessionId, sessionId));
}

export async function compareSnapshots(sessionId: number) {
  const snapshots = await getSessionSnapshots(sessionId);
  const pre = snapshots.find(s => s.snapshotType === 'pre_flash');
  const post = snapshots.find(s => s.snapshotType === 'post_flash');
  if (!pre || !post) return null;
  const preSw = (pre.softwareVersions as string[] | null) || [];
  const postSw = (post.softwareVersions as string[] | null) || [];
  const changes: Array<{ field: string; before: string; after: string }> = [];
  for (let i = 0; i < Math.max(preSw.length, postSw.length); i++) {
    if (preSw[i] !== postSw[i]) {
      changes.push({ field: `SW Version ${i + 1}`, before: preSw[i] || 'N/A', after: postSw[i] || 'N/A' });
    }
  }
  if (pre.hardwareNumber !== post.hardwareNumber) {
    changes.push({ field: 'Hardware Number', before: pre.hardwareNumber || 'N/A', after: post.hardwareNumber || 'N/A' });
  }
  return { pre, post, changes, hasChanges: changes.length > 0 };
}

// ── QUEUE ──────────────────────────────────────────────────────────────────

export async function addToQueue(data: InsertFlashQueueItem) {
  const db = getDb();
  if (!db) return;
  await db.insert(flashQueue).values(data);
}

export async function getQueueItems(userId: number) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(flashQueue)
    .where(eq(flashQueue.userId, userId))
    .orderBy(flashQueue.priority, desc(flashQueue.createdAt));
}

export async function updateQueueItem(id: number, updates: Partial<InsertFlashQueueItem>) {
  const db = getDb();
  if (!db) return;
  await db.update(flashQueue).set(updates).where(eq(flashQueue.id, id));
}

// ── STATS ──────────────────────────────────────────────────────────────────

export async function updateFlashStats(ecuType: string, success: boolean, durationMs: number) {
  const db = getDb();
  if (!db) return;
  const [existing] = await db.select().from(flashStats).where(eq(flashStats.ecuType, ecuType));
  if (existing) {
    const newTotal = existing.totalAttempts + 1;
    const newAvg = Math.round(((existing.avgDurationMs || 0) * existing.totalAttempts + durationMs) / newTotal);
    await db.update(flashStats).set({
      totalAttempts: newTotal,
      successCount: existing.successCount + (success ? 1 : 0),
      failCount: existing.failCount + (success ? 0 : 1),
      avgDurationMs: newAvg,
      lastFlashAt: new Date(),
    }).where(eq(flashStats.id, existing.id));
  } else {
    await db.insert(flashStats).values({
      ecuType,
      totalAttempts: 1,
      successCount: success ? 1 : 0,
      failCount: success ? 0 : 1,
      avgDurationMs: durationMs,
      lastFlashAt: new Date(),
    });
  }
}

export async function getAllFlashStats() {
  const db = getDb();
  if (!db) return [];
  return db.select().from(flashStats).orderBy(desc(flashStats.totalAttempts));
}

export async function getOverallSuccessRate() {
  const db = getDb();
  if (!db) {
    return {
      totalAttempts: 0,
      totalSuccess: 0,
      totalFail: 0,
      successRate: 0,
      byEcu: [] as Awaited<ReturnType<typeof getAllFlashStats>>,
    };
  }
  const stats = await db.select().from(flashStats);
  const totalAttempts = stats.reduce((s, r) => s + r.totalAttempts, 0);
  const totalSuccess = stats.reduce((s, r) => s + r.successCount, 0);
  return {
    totalAttempts, totalSuccess,
    totalFail: totalAttempts - totalSuccess,
    successRate: totalAttempts > 0 ? (totalSuccess / totalAttempts) * 100 : 0,
    byEcu: stats,
  };
}

// ── FILE FINGERPRINTS ──────────────────────────────────────────────────────

export async function checkDuplicateFile(fileHash: string) {
  const db = getDb();
  if (!db) return null;
  const [existing] = await db.select().from(fileFingerprints)
    .where(eq(fileFingerprints.fileHash, fileHash));
  return existing || null;
}

export async function upsertFileFingerprint(
  fileHash: string, ecuType: string, fileName: string,
  fileSize: number, uploadedBy: number, sessionId: number, result: 'success' | 'failed',
) {
  const db = getDb();
  if (!db) return;
  const existing = await checkDuplicateFile(fileHash);
  if (existing) {
    await db.update(fileFingerprints).set({
      flashCount: existing.flashCount + 1,
      lastSessionId: sessionId,
      lastResult: result,
    }).where(eq(fileFingerprints.id, existing.id));
  } else {
    await db.insert(fileFingerprints).values({
      fileHash, ecuType, fileName, fileSize, uploadedBy,
      flashCount: 1, lastSessionId: sessionId, lastResult: result,
    });
  }
}

// ── SESSION COMPARISON ─────────────────────────────────────────────────────

export async function compareSessions(sessionIdA: number, sessionIdB: number) {
  const db = getDb();
  if (!db) {
    const a = [...devFlashSessionsByUuid.values()].find((s) => s.id === sessionIdA);
    const b = [...devFlashSessionsByUuid.values()].find((s) => s.id === sessionIdB);
    if (!a || !b) return null;
    return {
      sessionA: a, sessionB: b,
      comparison: {
        sameEcu: a.ecuType === b.ecuType,
        sameFile: a.fileHash === b.fileHash,
        durationDiff: (a.durationMs || 0) - (b.durationMs || 0),
        statusMatch: a.status === b.status,
      },
    };
  }
  const [a] = await db.select().from(flashSessions).where(eq(flashSessions.id, sessionIdA));
  const [b] = await db.select().from(flashSessions).where(eq(flashSessions.id, sessionIdB));
  if (!a || !b) return null;
  return {
    sessionA: a, sessionB: b,
    comparison: {
      sameEcu: a.ecuType === b.ecuType,
      sameFile: a.fileHash === b.fileHash,
      durationDiff: (a.durationMs || 0) - (b.durationMs || 0),
      statusMatch: a.status === b.status,
    },
  };
}

// ── EXPORT ─────────────────────────────────────────────────────────────────

export async function exportSessionAsJson(uuid: string) {
  const session = await getFlashSession(uuid);
  if (!session) return null;
  const logs = await getFlashSessionLogs(session.id);
  const snapshots = await getSessionSnapshots(session.id);
  return { session, logs, snapshots, exportedAt: new Date().toISOString() };
}
