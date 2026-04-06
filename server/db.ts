import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, feedback, InsertFeedback, knoxFiles, accessCodes, shareTokens, ndaSubmissions, pitchAnalytics, geofenceZones, geofenceUserOverrides } from "../drizzle/schema";
import { like, desc, sql, count, eq, and } from "drizzle-orm";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// Known PPEI team openIds for auto-promotion on login
const OWNER_OPEN_ID = 'V2pCAkSwLyG7ZZ2xtxe89a'; // Kory Willis
const ADMIN_OPEN_IDS = new Set([
  'ksBHGV5iqfKpCgoi3TKgYG', // Erik (ppei.com)
  'nWh2tQUgLAjdSidvActMnF', // Erik Fontenot (yahoo.com)
  'firEtjYyGRNJ9ENvVTrCq3', // Carmen Savant
]);
const ADMIN_EMAILS = new Set([
  'kory@ppei.com',
]);

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }

    const normalizedEmail = (user.email ?? "").trim().toLowerCase();

    // Auto-promote: owner → super_admin, known employees/emails → admin
    if (user.openId === OWNER_OPEN_ID || user.openId === ENV.ownerOpenId) {
      values.role = 'super_admin';
      updateSet.role = 'super_admin';
      values.advancedAccess = 'approved';
      updateSet.advancedAccess = 'approved';
      values.accessLevel = 3;
      updateSet.accessLevel = 3;
    } else if (ADMIN_OPEN_IDS.has(user.openId) || ADMIN_EMAILS.has(normalizedEmail)) {
      values.role = 'admin';
      updateSet.role = 'admin';
      values.advancedAccess = 'approved';
      updateSet.advancedAccess = 'approved';
      values.accessLevel = 3;
      updateSet.accessLevel = 3;
    } else if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ── Feedback ─────────────────────────────────────────────────────────────────────────
// ── Knox ECU File Library ────────────────────────────────────────────────────

export async function getKnoxFiles(opts: {
  search?: string;
  platform?: string;
  fileType?: string;
  collection?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { files: [], total: 0 };

  const conditions: any[] = [];
  if (opts.search) {
    conditions.push(like(knoxFiles.filename, `%${opts.search}%`));
  }
  if (opts.platform) {
    conditions.push(like(knoxFiles.platform, `%${opts.platform}%`));
  }
  if (opts.fileType) {
    conditions.push(eq(knoxFiles.fileType, opts.fileType));
  }
  if (opts.collection) {
    conditions.push(eq(knoxFiles.sourceCollection, opts.collection));
  }

  const where = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;

  const [files, totalResult] = await Promise.all([
    db.select({
      id: knoxFiles.id,
      filename: knoxFiles.filename,
      fileType: knoxFiles.fileType,
      sizeMb: knoxFiles.sizeMb,
      platform: knoxFiles.platform,
      ecuId: knoxFiles.ecuId,
      projectId: knoxFiles.projectId,
      projectName: knoxFiles.projectName,
      version: knoxFiles.version,
      cpuType: knoxFiles.cpuType,
      totalCalibratables: knoxFiles.totalCalibratables,
      totalMeasurements: knoxFiles.totalMeasurements,
      totalFunctions: knoxFiles.totalFunctions,
      sourceCollection: knoxFiles.sourceCollection,
      s3Url: knoxFiles.s3Url,
      createdAt: knoxFiles.createdAt,
    }).from(knoxFiles)
      .where(where)
      .orderBy(desc(knoxFiles.createdAt))
      .limit(opts.limit || 50)
      .offset(opts.offset || 0),
    db.select({ cnt: count() }).from(knoxFiles).where(where),
  ]);

  return { files, total: totalResult[0]?.cnt || 0 };
}

export async function getKnoxFileById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(knoxFiles).where(eq(knoxFiles.id, id)).limit(1);
  return result[0] || null;
}

export async function getKnoxPlatformSummary() {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({
    platform: knoxFiles.platform,
    cnt: count(),
  }).from(knoxFiles).groupBy(knoxFiles.platform).orderBy(desc(count()));
  return result;
}

export async function getKnoxCollectionSummary() {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({
    collection: knoxFiles.sourceCollection,
    cnt: count(),
  }).from(knoxFiles).groupBy(knoxFiles.sourceCollection).orderBy(desc(count()));
  return result;
}

/**
 * Build a compact Knox file library summary for LLM context injection.
 * Returns platform → file list with key metadata (filename, calibratables, ECU ID).
 */
export async function getKnoxFileContextForLLM(): Promise<string> {
  const db = await getDb();
  if (!db) return 'Knox file library: not available (database offline).';
  const files = await db.select({
    filename: knoxFiles.filename,
    fileType: knoxFiles.fileType,
    platform: knoxFiles.platform,
    ecuId: knoxFiles.ecuId,
    totalCalibratables: knoxFiles.totalCalibratables,
    totalMeasurements: knoxFiles.totalMeasurements,
    sourceCollection: knoxFiles.sourceCollection,
  }).from(knoxFiles).orderBy(knoxFiles.platform);

  if (files.length === 0) return 'Knox file library: empty (no files stored yet).';

  // Group by platform
  const byPlatform: Record<string, typeof files> = {};
  for (const f of files) {
    const key = f.platform || 'Unknown';
    if (!byPlatform[key]) byPlatform[key] = [];
    byPlatform[key].push(f);
  }

  let ctx = `## Knox ECU File Library (${files.length} files across ${Object.keys(byPlatform).length} platforms)\n\n`;
  for (const [platform, pFiles] of Object.entries(byPlatform)) {
    ctx += `### ${platform} (${pFiles.length} files)\n`;
    for (const f of pFiles) {
      const parts = [f.filename];
      if (f.fileType) parts.push(`[${f.fileType}]`);
      if (f.ecuId) parts.push(`ECU: ${f.ecuId}`);
      if (f.totalCalibratables) parts.push(`${f.totalCalibratables} cals`);
      if (f.totalMeasurements) parts.push(`${f.totalMeasurements} meas`);
      if (f.sourceCollection) parts.push(`(${f.sourceCollection})`);
      ctx += `- ${parts.join(' | ')}\n`;
    }
    ctx += '\n';
  }
  return ctx;
}

export async function insertFeedback(data: InsertFeedback): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot insert feedback: database not available");
    return false;
  }
  try {
    await db.insert(feedback).values(data);
    return true;
  } catch (error) {
    console.error("[Database] Failed to insert feedback:", error);
    return false;
  }
}

/**
 * Verify an access code for unauthenticated entry.
 * Returns the code record if valid, null otherwise.
 */
export async function verifyAccessCode(code: string): Promise<{ id: number; label: string | null } | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const [row] = await db
      .select({ id: accessCodes.id, label: accessCodes.label, isActive: accessCodes.isActive, maxUses: accessCodes.maxUses, currentUses: accessCodes.currentUses, expiresAt: accessCodes.expiresAt })
      .from(accessCodes)
      .where(eq(accessCodes.code, code.trim().toUpperCase()))
      .limit(1);
    if (!row) return null;
    if (!row.isActive) return null;
    if (row.expiresAt && row.expiresAt <= new Date()) return null;
    if (row.maxUses !== null && row.currentUses >= row.maxUses) return null;
    // Increment usage counter
    await db.update(accessCodes).set({ currentUses: sql`${accessCodes.currentUses} + 1` }).where(eq(accessCodes.id, row.id));
    return { id: row.id, label: row.label };
  } catch (error) {
    console.error("[Database] Failed to verify access code:", error);
    return null;
  }
}

// ── Share Token helpers ─────────────────────────────────────────────────

/**
 * Generate a cryptographically random share token string.
 */
function generateTokenString(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < bytes.length; i++) token += chars[bytes[i] % chars.length];
  return token;
}

/**
 * Create a new single-session share token for a specific page.
 * Returns the token string and full URL path.
 */
export async function createShareToken(
  allowedPath: string,
  createdBy: number | null,
  label?: string,
  expiresInHours: number = 24
): Promise<{ token: string; allowedPath: string; expiresAt: Date } | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const token = generateTokenString();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    await db.insert(shareTokens).values({
      token,
      allowedPath: allowedPath.replace(/\/+$/, '') || '/',
      label: label || null,
      createdBy,
      consumed: false,
      expiresAt,
    });
    const normalizedPath = allowedPath.replace(/\/+$/, '') || '/';
    return { token, allowedPath: normalizedPath, expiresAt };
  } catch (error) {
    console.error("[Database] Failed to create share token:", error);
    return null;
  }
}

/**
 * Validate a share token. Checks validity but does NOT consume it.
 * Tokens are reusable until expiry (user may need multiple visits before NDA is verified).
 * Returns the allowed path and token ID, or null if invalid/expired.
 */
export async function validateShareToken(token: string): Promise<{ id: number; allowedPath: string } | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const [row] = await db
      .select({
        id: shareTokens.id,
        allowedPath: shareTokens.allowedPath,
        expiresAt: shareTokens.expiresAt,
      })
      .from(shareTokens)
      .where(eq(shareTokens.token, token.trim()))
      .limit(1);
    if (!row) return null;
    if (row.expiresAt && row.expiresAt <= new Date()) return null;
    return { id: row.id, allowedPath: row.allowedPath };
  } catch (error) {
    console.error("[Database] Failed to validate share token:", error);
    return null;
  }
}

// ── NDA Submissions ──────────────────────────────────────────────────────

/**
 * Submit an NDA signature. Tied to signer email — once verified, all share links work.
 */
export async function submitNda(data: {
  tokenId: number;
  signerName: string;
  signerEmail: string;
  signatureImageUrl: string;
}): Promise<{ id: number } | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const [result] = await db.insert(ndaSubmissions).values({
      tokenId: data.tokenId,
      signerName: data.signerName,
      signerEmail: data.signerEmail.toLowerCase().trim(),
      signatureImageUrl: data.signatureImageUrl,
      status: 'pending',
    }).$returningId();
    return { id: result.id };
  } catch (error) {
    console.error("[Database] Failed to submit NDA:", error);
    return null;
  }
}

/**
 * Check NDA status by email. Returns the most recent NDA submission for this email.
 * If verified, user can access any share link.
 */
export async function checkNdaStatus(signerEmail: string): Promise<{
  id: number;
  status: 'pending' | 'verified' | 'rejected';
  signerName: string;
  signatureImageUrl: string | null;
  rejectionReason: string | null;
  createdAt: Date;
} | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const [row] = await db
      .select({
        id: ndaSubmissions.id,
        status: ndaSubmissions.status,
        signerName: ndaSubmissions.signerName,
        signatureImageUrl: ndaSubmissions.signatureImageUrl,
        rejectionReason: ndaSubmissions.rejectionReason,
        createdAt: ndaSubmissions.createdAt,
      })
      .from(ndaSubmissions)
      .where(eq(ndaSubmissions.signerEmail, signerEmail.toLowerCase().trim()))
      .orderBy(desc(ndaSubmissions.createdAt))
      .limit(1);
    return row ?? null;
  } catch (error) {
    console.error("[Database] Failed to check NDA status:", error);
    return null;
  }
}

/**
 * Get all pending NDA submissions for admin review.
 */
export async function getPendingNdas(): Promise<Array<{
  id: number;
  tokenId: number;
  signerName: string;
  signerEmail: string | null;
  signatureImageUrl: string | null;
  uploadedDocUrl: string | null;
  status: string;
  createdAt: Date;
}>> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db
      .select({
        id: ndaSubmissions.id,
        tokenId: ndaSubmissions.tokenId,
        signerName: ndaSubmissions.signerName,
        signerEmail: ndaSubmissions.signerEmail,
        signatureImageUrl: ndaSubmissions.signatureImageUrl,
        uploadedDocUrl: ndaSubmissions.uploadedDocUrl,
        status: ndaSubmissions.status,
        createdAt: ndaSubmissions.createdAt,
      })
      .from(ndaSubmissions)
      .orderBy(desc(ndaSubmissions.createdAt));
  } catch (error) {
    console.error("[Database] Failed to get pending NDAs:", error);
    return [];
  }
}

/**
 * Admin verify or reject an NDA submission.
 */
export async function verifyNda(
  ndaId: number,
  adminId: number,
  action: 'verified' | 'rejected',
  rejectionReason?: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db
      .update(ndaSubmissions)
      .set({
        status: action,
        verifiedBy: adminId,
        verifiedAt: new Date(),
        rejectionReason: action === 'rejected' ? (rejectionReason || null) : null,
      })
      .where(eq(ndaSubmissions.id, ndaId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to verify NDA:", error);
    return false;
  }
}

/**
 * Get share token ID by token string (without consuming it).
 * Used to associate NDA submissions with tokens.
 */
export async function getShareTokenId(token: string): Promise<{ id: number; allowedPath: string } | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const [row] = await db
      .select({ id: shareTokens.id, allowedPath: shareTokens.allowedPath })
      .from(shareTokens)
      .where(eq(shareTokens.token, token.trim()))
      .limit(1);
    return row ?? null;
  } catch (error) {
    console.error("[Database] Failed to get share token ID:", error);
    return null;
  }
}

// ── Pitch Analytics ─────────────────────────────────────────────────────────

/**
 * Log a pitch analytics event.
 */
export async function logPitchEvent(data: {
  userId: number | null;
  eventType: "tab_view" | "chat_message" | "prompt_click" | "session_end";
  metadata?: Record<string, unknown>;
  sessionId?: string;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.insert(pitchAnalytics).values({
      userId: data.userId ?? null,
      eventType: data.eventType,
      metadata: data.metadata ?? null,
      sessionId: data.sessionId ?? null,
    });
    return true;
  } catch (error) {
    console.error("[Database] Failed to log pitch event:", error);
    return false;
  }
}

/**
 * Get pitch analytics summary for admin dashboard.
 * Returns aggregated counts by event type and daily breakdown.
 */
export async function getPitchAnalyticsSummary(days: number = 30): Promise<{
  totals: { eventType: string; count: number }[];
  daily: { date: string; eventType: string; count: number }[];
  uniqueUsers: number;
  avgSessionDuration: number | null;
}> {
  const db = await getDb();
  if (!db) return { totals: [], daily: [], uniqueUsers: 0, avgSessionDuration: null };
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Totals by event type
    const totals = await db
      .select({
        eventType: pitchAnalytics.eventType,
        count: count(),
      })
      .from(pitchAnalytics)
      .where(sql`${pitchAnalytics.createdAt} >= ${since}`)
      .groupBy(pitchAnalytics.eventType);

    // Daily breakdown
    const daily = await db
      .select({
        date: sql<string>`DATE(${pitchAnalytics.createdAt})`.as("date"),
        eventType: pitchAnalytics.eventType,
        count: count(),
      })
      .from(pitchAnalytics)
      .where(sql`${pitchAnalytics.createdAt} >= ${since}`)
      .groupBy(sql`DATE(${pitchAnalytics.createdAt})`, pitchAnalytics.eventType)
      .orderBy(sql`DATE(${pitchAnalytics.createdAt})`);

    // Unique users
    const [uniqueRow] = await db
      .select({
        uniqueUsers: sql<number>`COUNT(DISTINCT ${pitchAnalytics.userId})`.as("uniqueUsers"),
      })
      .from(pitchAnalytics)
      .where(and(
        sql`${pitchAnalytics.createdAt} >= ${since}`,
        sql`${pitchAnalytics.userId} IS NOT NULL`
      ));

    // Average session duration from session_end events
    const [avgRow] = await db
      .select({
        avgDuration: sql<number>`AVG(JSON_EXTRACT(${pitchAnalytics.metadata}, '$.durationSec'))`.as("avgDuration"),
      })
      .from(pitchAnalytics)
      .where(and(
        sql`${pitchAnalytics.createdAt} >= ${since}`,
        eq(pitchAnalytics.eventType, "session_end")
      ));

    return {
      totals: totals.map(t => ({ eventType: t.eventType, count: Number(t.count) })),
      daily: daily.map(d => ({ date: String(d.date), eventType: d.eventType, count: Number(d.count) })),
      uniqueUsers: Number(uniqueRow?.uniqueUsers ?? 0),
      avgSessionDuration: avgRow?.avgDuration ? Number(avgRow.avgDuration) : null,
    };
  } catch (error) {
    console.error("[Database] Failed to get pitch analytics:", error);
    return { totals: [], daily: [], uniqueUsers: 0, avgSessionDuration: null };
  }
}

// ── Geo-Fencing ─────────────────────────────────────────────────────────────

export type GeofenceZoneRow = {
  id: number;
  name: string;
  description: string | null;
  restrictionType: "block_upload" | "block_download" | "block_both";
  color: string | null;
  polygon: Array<{ lat: number; lng: number }>;
  centerLat: string | null;
  centerLng: string | null;
  isActive: boolean;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * List all geofence zones, optionally filtered by active status.
 */
export async function listGeofenceZones(activeOnly = false): Promise<GeofenceZoneRow[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const query = db.select().from(geofenceZones).orderBy(desc(geofenceZones.createdAt));
    if (activeOnly) {
      return await query.where(eq(geofenceZones.isActive, true)) as unknown as GeofenceZoneRow[];
    }
    return await query as unknown as GeofenceZoneRow[];
  } catch (error) {
    console.error("[Database] Failed to list geofence zones:", error);
    return [];
  }
}

/**
 * Create a new geofence zone.
 */
export async function createGeofenceZone(data: {
  name: string;
  description?: string;
  restrictionType: "block_upload" | "block_download" | "block_both";
  color?: string;
  polygon: Array<{ lat: number; lng: number }>;
  createdBy: number;
}): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    // Calculate center from polygon
    const lats = data.polygon.map(p => p.lat);
    const lngs = data.polygon.map(p => p.lng);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

    const [result] = await db.insert(geofenceZones).values({
      name: data.name,
      description: data.description ?? null,
      restrictionType: data.restrictionType,
      color: data.color ?? "#FF0000",
      polygon: data.polygon,
      centerLat: centerLat.toFixed(7),
      centerLng: centerLng.toFixed(7),
      isActive: true,
      createdBy: data.createdBy,
    }).$returningId();
    return result.id;
  } catch (error) {
    console.error("[Database] Failed to create geofence zone:", error);
    return null;
  }
}

/**
 * Update a geofence zone.
 */
export async function updateGeofenceZone(
  zoneId: number,
  data: Partial<{
    name: string;
    description: string | null;
    restrictionType: "block_upload" | "block_download" | "block_both";
    color: string;
    polygon: Array<{ lat: number; lng: number }>;
    isActive: boolean;
  }>
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    const updateData: any = { ...data };
    // Recalculate center if polygon changed
    if (data.polygon) {
      const lats = data.polygon.map(p => p.lat);
      const lngs = data.polygon.map(p => p.lng);
      updateData.centerLat = ((Math.min(...lats) + Math.max(...lats)) / 2).toFixed(7);
      updateData.centerLng = ((Math.min(...lngs) + Math.max(...lngs)) / 2).toFixed(7);
    }
    await db.update(geofenceZones).set(updateData).where(eq(geofenceZones.id, zoneId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update geofence zone:", error);
    return false;
  }
}

/**
 * Delete a geofence zone.
 */
export async function deleteGeofenceZone(zoneId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.delete(geofenceZones).where(eq(geofenceZones.id, zoneId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete geofence zone:", error);
    return false;
  }
}

/**
 * List user overrides for geofence zones.
 */
export async function listGeofenceOverrides(userId?: number): Promise<Array<{
  id: number;
  userId: number;
  zoneId: number | null;
  overrideType: "exempt" | "enforce";
  reason: string | null;
  grantedBy: number;
  isActive: boolean;
  createdAt: Date;
}>> {
  const db = await getDb();
  if (!db) return [];
  try {
    const query = db.select().from(geofenceUserOverrides);
    if (userId) {
      return await query.where(eq(geofenceUserOverrides.userId, userId)) as any[];
    }
    return await query.orderBy(desc(geofenceUserOverrides.createdAt)) as any[];
  } catch (error) {
    console.error("[Database] Failed to list geofence overrides:", error);
    return [];
  }
}

/**
 * Create a user override for geofence zones.
 */
export async function createGeofenceOverride(data: {
  userId: number;
  zoneId?: number;
  overrideType: "exempt" | "enforce";
  reason?: string;
  grantedBy: number;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.insert(geofenceUserOverrides).values({
      userId: data.userId,
      zoneId: data.zoneId ?? null,
      overrideType: data.overrideType,
      reason: data.reason ?? null,
      grantedBy: data.grantedBy,
      isActive: true,
    });
    return true;
  } catch (error) {
    console.error("[Database] Failed to create geofence override:", error);
    return false;
  }
}

/**
 * Delete a geofence user override.
 */
export async function deleteGeofenceOverride(overrideId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.delete(geofenceUserOverrides).where(eq(geofenceUserOverrides.id, overrideId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete geofence override:", error);
    return false;
  }
}
