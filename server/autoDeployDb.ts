/**
 * Auto-Deploy DB helpers — folder hierarchy, auto-deploy metadata, combos, matching, and audit log.
 */
import { and, desc, eq, isNull, like, or, sql, type SQL } from "drizzle-orm";
import {
  calibrationFolders,
  calibrationAutoDeployMeta,
  calibrationCombos,
  autoDeployLog,
  tuneDeployCalibrations,
  users,
  type CalibrationFolder,
  type InsertCalibrationFolder,
  type CalibrationAutoDeployMeta,
  type InsertCalibrationAutoDeployMeta,
  type CalibrationCombo,
  type InsertCalibrationCombo,
  type InsertAutoDeployLog,
} from "../drizzle/schema";
import { getDb } from "./db";
import { coerceTuneDeployParsedMeta, type TuneDeployParsedMetadata } from "../shared/tuneDeploySchemas";

// ═══════════════════════════════════════════════════════════════════════════
// Folder Hierarchy CRUD
// ═══════════════════════════════════════════════════════════════════════════

export async function listFolders(parentId?: number | null): Promise<CalibrationFolder[]> {
  const db = await getDb();
  if (!db) return [];
  const where = parentId === undefined
    ? undefined
    : parentId === null
      ? isNull(calibrationFolders.parentId)
      : eq(calibrationFolders.parentId, parentId);
  return db.select().from(calibrationFolders).where(where).orderBy(calibrationFolders.sortOrder, calibrationFolders.name);
}

export async function listAllFolders(): Promise<CalibrationFolder[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(calibrationFolders).orderBy(calibrationFolders.sortOrder, calibrationFolders.name);
}

export async function createFolder(data: Omit<InsertCalibrationFolder, "id" | "createdAt" | "updatedAt">): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const [r] = await db.insert(calibrationFolders).values(data).$returningId();
    return r?.id ?? null;
  } catch (e) {
    console.error("[autoDeployDb] createFolder failed:", e);
    return null;
  }
}

export async function updateFolder(id: number, updates: Partial<Pick<CalibrationFolder, "name" | "parentId" | "folderType" | "fullPath" | "sortOrder">>): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.update(calibrationFolders).set(updates).where(eq(calibrationFolders.id, id));
    return true;
  } catch (e) {
    console.error("[autoDeployDb] updateFolder failed:", e);
    return false;
  }
}

export async function deleteFolder(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    // Remove folder references from calibrations in this folder
    await db.update(calibrationAutoDeployMeta).set({ folderId: null }).where(eq(calibrationAutoDeployMeta.folderId, id));
    // Delete child folders recursively (simple: just delete children)
    await db.delete(calibrationFolders).where(eq(calibrationFolders.parentId, id));
    await db.delete(calibrationFolders).where(eq(calibrationFolders.id, id));
    return true;
  } catch (e) {
    console.error("[autoDeployDb] deleteFolder failed:", e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Auto-Deploy Metadata CRUD
// ═══════════════════════════════════════════════════════════════════════════

export async function getAutoDeployMeta(calibrationId: number): Promise<CalibrationAutoDeployMeta | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(calibrationAutoDeployMeta).where(eq(calibrationAutoDeployMeta.calibrationId, calibrationId)).limit(1);
  return row ?? null;
}

export async function listAutoDeployMeta(): Promise<CalibrationAutoDeployMeta[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(calibrationAutoDeployMeta).orderBy(desc(calibrationAutoDeployMeta.updatedAt));
}

export async function upsertAutoDeployMeta(data: {
  calibrationId: number;
  folderId?: number | null;
  moduleType?: "ecm" | "tcm";
  autoDeploy?: boolean;
  autoDeployAccessLevel?: number;
  notes?: string | null;
  updatedBy?: number;
}): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    // Check if exists
    const existing = await getAutoDeployMeta(data.calibrationId);
    if (existing) {
      const updates: Record<string, unknown> = {};
      if (data.folderId !== undefined) updates.folderId = data.folderId;
      if (data.moduleType !== undefined) updates.moduleType = data.moduleType;
      if (data.autoDeploy !== undefined) updates.autoDeploy = data.autoDeploy;
      if (data.autoDeployAccessLevel !== undefined) updates.autoDeployAccessLevel = data.autoDeployAccessLevel;
      if (data.notes !== undefined) updates.notes = data.notes;
      if (data.updatedBy !== undefined) updates.updatedBy = data.updatedBy;
      await db.update(calibrationAutoDeployMeta).set(updates).where(eq(calibrationAutoDeployMeta.id, existing.id));
      return existing.id;
    } else {
      const [r] = await db.insert(calibrationAutoDeployMeta).values({
        calibrationId: data.calibrationId,
        folderId: data.folderId ?? null,
        moduleType: data.moduleType ?? "ecm",
        autoDeploy: data.autoDeploy ?? false,
        autoDeployAccessLevel: data.autoDeployAccessLevel ?? 1,
        notes: data.notes ?? null,
        updatedBy: data.updatedBy ?? null,
      }).$returningId();
      return r?.id ?? null;
    }
  } catch (e) {
    console.error("[autoDeployDb] upsertAutoDeployMeta failed:", e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Combo Pairings CRUD
// ═══════════════════════════════════════════════════════════════════════════

export async function listCombos(): Promise<Array<CalibrationCombo & {
  ecmFileName?: string;
  tcmFileName?: string;
}>> {
  const db = await getDb();
  if (!db) return [];

  // Alias for the second join
  const ecmCal = tuneDeployCalibrations;

  const rows = await db
    .select({
      id: calibrationCombos.id,
      ecmCalibrationId: calibrationCombos.ecmCalibrationId,
      tcmCalibrationId: calibrationCombos.tcmCalibrationId,
      label: calibrationCombos.label,
      isActive: calibrationCombos.isActive,
      createdBy: calibrationCombos.createdBy,
      createdAt: calibrationCombos.createdAt,
      updatedAt: calibrationCombos.updatedAt,
    })
    .from(calibrationCombos)
    .orderBy(desc(calibrationCombos.createdAt));

  // Enrich with file names
  const calIds = [...new Set(rows.flatMap(r => [r.ecmCalibrationId, r.tcmCalibrationId]))];
  if (calIds.length === 0) return rows as any;

  const cals = await db
    .select({ id: tuneDeployCalibrations.id, fileName: tuneDeployCalibrations.fileName })
    .from(tuneDeployCalibrations)
    .where(sql`${tuneDeployCalibrations.id} IN (${sql.join(calIds.map(id => sql`${id}`), sql`, `)})`);

  const calMap = new Map(cals.map(c => [c.id, c.fileName]));

  return rows.map(r => ({
    ...r,
    ecmFileName: calMap.get(r.ecmCalibrationId) ?? undefined,
    tcmFileName: calMap.get(r.tcmCalibrationId) ?? undefined,
  }));
}

export async function createCombo(data: {
  ecmCalibrationId: number;
  tcmCalibrationId: number;
  label?: string;
  createdBy?: number;
}): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const [r] = await db.insert(calibrationCombos).values({
      ecmCalibrationId: data.ecmCalibrationId,
      tcmCalibrationId: data.tcmCalibrationId,
      label: data.label ?? null,
      createdBy: data.createdBy ?? null,
    }).$returningId();
    return r?.id ?? null;
  } catch (e) {
    console.error("[autoDeployDb] createCombo failed:", e);
    return null;
  }
}

export async function updateCombo(id: number, updates: Partial<Pick<CalibrationCombo, "label" | "isActive" | "ecmCalibrationId" | "tcmCalibrationId">>): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.update(calibrationCombos).set(updates).where(eq(calibrationCombos.id, id));
    return true;
  } catch (e) {
    console.error("[autoDeployDb] updateCombo failed:", e);
    return false;
  }
}

export async function deleteCombo(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.delete(calibrationCombos).where(eq(calibrationCombos.id, id));
    return true;
  } catch (e) {
    console.error("[autoDeployDb] deleteCombo failed:", e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Auto-Deploy Matching Engine
// ═══════════════════════════════════════════════════════════════════════════

export type AutoDeployMatchResult = {
  deployType: "combo" | "ecm_only" | "tcm_only";
  comboId?: number;
  ecmCalibration?: {
    id: number;
    fileName: string;
    storageUrl: string | null;
    r2Key: string;
    meta: TuneDeployParsedMetadata;
  };
  tcmCalibration?: {
    id: number;
    fileName: string;
    storageUrl: string | null;
    r2Key: string;
    meta: TuneDeployParsedMetadata;
  };
};

/**
 * Core auto-deploy matching logic.
 * 
 * 1. Receives ECM and/or TCM module snapshots (OS + part numbers) from the V-OP tool
 * 2. Searches calibrations flagged as autoDeploy=true
 * 3. Filters by user's access level
 * 4. Matches by OS version and part numbers
 * 5. If a combo exists pairing the matched ECM + TCM, returns both
 * 6. Otherwise returns individual matches
 */
export async function findAutoDeployMatch(params: {
  ecmOs?: string;
  ecmPartNumbers?: string[];
  tcmOs?: string;
  tcmPartNumbers?: string[];
  userAccessLevel: number;
}): Promise<AutoDeployMatchResult | null> {
  const db = await getDb();
  if (!db) return null;

  // Get all auto-deploy enabled calibrations with their metadata
  const autoDeployRows = await db
    .select({
      calId: tuneDeployCalibrations.id,
      fileName: tuneDeployCalibrations.fileName,
      storageUrl: tuneDeployCalibrations.storageUrl,
      r2Key: tuneDeployCalibrations.r2Key,
      osVersion: tuneDeployCalibrations.osVersion,
      partNumbersCsv: tuneDeployCalibrations.partNumbersCsv,
      parsedMeta: tuneDeployCalibrations.parsedMeta,
      moduleType: calibrationAutoDeployMeta.moduleType,
      autoDeployAccessLevel: calibrationAutoDeployMeta.autoDeployAccessLevel,
    })
    .from(calibrationAutoDeployMeta)
    .innerJoin(tuneDeployCalibrations, eq(calibrationAutoDeployMeta.calibrationId, tuneDeployCalibrations.id))
    .where(eq(calibrationAutoDeployMeta.autoDeploy, true));

  // Filter by access level
  const eligible = autoDeployRows.filter(r => params.userAccessLevel >= r.autoDeployAccessLevel);

  // Separate ECM and TCM calibrations
  const ecmCals = eligible.filter(r => r.moduleType === "ecm");
  const tcmCals = eligible.filter(r => r.moduleType === "tcm");

  // Match ECM
  let matchedEcm: (typeof eligible)[0] | null = null;
  if (params.ecmOs || (params.ecmPartNumbers && params.ecmPartNumbers.length > 0)) {
    matchedEcm = findBestMatch(ecmCals, params.ecmOs, params.ecmPartNumbers);
  }

  // Match TCM
  let matchedTcm: (typeof eligible)[0] | null = null;
  if (params.tcmOs || (params.tcmPartNumbers && params.tcmPartNumbers.length > 0)) {
    matchedTcm = findBestMatch(tcmCals, params.tcmOs, params.tcmPartNumbers);
  }

  if (!matchedEcm && !matchedTcm) return null;

  // Check for combo pairing
  if (matchedEcm && matchedTcm) {
    const combos = await db
      .select()
      .from(calibrationCombos)
      .where(
        and(
          eq(calibrationCombos.ecmCalibrationId, matchedEcm.calId),
          eq(calibrationCombos.tcmCalibrationId, matchedTcm.calId),
          eq(calibrationCombos.isActive, true),
        )
      )
      .limit(1);

    const combo = combos[0];
    return {
      deployType: "combo",
      comboId: combo?.id,
      ecmCalibration: toCalResult(matchedEcm),
      tcmCalibration: toCalResult(matchedTcm),
    };
  }

  if (matchedEcm) {
    // Check if there's a combo that includes this ECM — if so, also return the paired TCM
    const combos = await db
      .select()
      .from(calibrationCombos)
      .where(
        and(
          eq(calibrationCombos.ecmCalibrationId, matchedEcm.calId),
          eq(calibrationCombos.isActive, true),
        )
      )
      .limit(1);

    if (combos[0]) {
      // Find the TCM calibration from the combo
      const [tcmRow] = await db
        .select({
          calId: tuneDeployCalibrations.id,
          fileName: tuneDeployCalibrations.fileName,
          storageUrl: tuneDeployCalibrations.storageUrl,
          r2Key: tuneDeployCalibrations.r2Key,
          osVersion: tuneDeployCalibrations.osVersion,
          partNumbersCsv: tuneDeployCalibrations.partNumbersCsv,
          parsedMeta: tuneDeployCalibrations.parsedMeta,
          moduleType: calibrationAutoDeployMeta.moduleType,
          autoDeployAccessLevel: calibrationAutoDeployMeta.autoDeployAccessLevel,
        })
        .from(tuneDeployCalibrations)
        .innerJoin(calibrationAutoDeployMeta, eq(calibrationAutoDeployMeta.calibrationId, tuneDeployCalibrations.id))
        .where(eq(tuneDeployCalibrations.id, combos[0].tcmCalibrationId))
        .limit(1);

      if (tcmRow && params.userAccessLevel >= tcmRow.autoDeployAccessLevel) {
        return {
          deployType: "combo",
          comboId: combos[0].id,
          ecmCalibration: toCalResult(matchedEcm),
          tcmCalibration: toCalResult(tcmRow),
        };
      }
    }

    return {
      deployType: "ecm_only",
      ecmCalibration: toCalResult(matchedEcm),
    };
  }

  if (matchedTcm) {
    // Check if there's a combo that includes this TCM
    const combos = await db
      .select()
      .from(calibrationCombos)
      .where(
        and(
          eq(calibrationCombos.tcmCalibrationId, matchedTcm.calId),
          eq(calibrationCombos.isActive, true),
        )
      )
      .limit(1);

    if (combos[0]) {
      const [ecmRow] = await db
        .select({
          calId: tuneDeployCalibrations.id,
          fileName: tuneDeployCalibrations.fileName,
          storageUrl: tuneDeployCalibrations.storageUrl,
          r2Key: tuneDeployCalibrations.r2Key,
          osVersion: tuneDeployCalibrations.osVersion,
          partNumbersCsv: tuneDeployCalibrations.partNumbersCsv,
          parsedMeta: tuneDeployCalibrations.parsedMeta,
          moduleType: calibrationAutoDeployMeta.moduleType,
          autoDeployAccessLevel: calibrationAutoDeployMeta.autoDeployAccessLevel,
        })
        .from(tuneDeployCalibrations)
        .innerJoin(calibrationAutoDeployMeta, eq(calibrationAutoDeployMeta.calibrationId, tuneDeployCalibrations.id))
        .where(eq(tuneDeployCalibrations.id, combos[0].ecmCalibrationId))
        .limit(1);

      if (ecmRow && params.userAccessLevel >= ecmRow.autoDeployAccessLevel) {
        return {
          deployType: "combo",
          comboId: combos[0].id,
          ecmCalibration: toCalResult(ecmRow),
          tcmCalibration: toCalResult(matchedTcm),
        };
      }
    }

    return {
      deployType: "tcm_only",
      tcmCalibration: toCalResult(matchedTcm),
    };
  }

  return null;
}

/** Score and pick the best matching calibration by OS + part numbers. */
function findBestMatch<T extends {
    calId: number;
    fileName: string;
    storageUrl: string | null;
    r2Key: string;
    osVersion: string | null;
    partNumbersCsv: string | null;
    parsedMeta: unknown;
    moduleType: string;
    autoDeployAccessLevel: number;
  }>(
  cals: T[],
  os?: string,
  partNumbers?: string[]
): T | null {
  if (cals.length === 0) return null;

  const pns = (partNumbers ?? []).map(p => p.trim().toUpperCase()).filter(Boolean);
  const osNorm = os?.trim().toUpperCase();

  let best: T | null = null;
  let bestScore = 0;

  for (const cal of cals) {
    let score = 0;
    const csv = (cal.partNumbersCsv ?? "").toUpperCase();
    const calOs = (cal.osVersion ?? "").toUpperCase();

    // Part number matches (highest weight)
    for (const pn of pns) {
      if (csv.includes(pn)) score += 100;
    }

    // OS match
    if (osNorm && calOs && calOs.includes(osNorm)) {
      score += 50;
    }

    if (score > bestScore) {
      bestScore = score;
      best = cal;
    }
  }

  // Require at least some match
  return bestScore > 0 ? best : null;
}

function toCalResult(row: {
  calId: number;
  fileName: string;
  storageUrl: string | null;
  r2Key: string;
  parsedMeta: unknown;
}) {
  return {
    id: row.calId,
    fileName: row.fileName,
    storageUrl: row.storageUrl,
    r2Key: row.r2Key,
    meta: coerceTuneDeployParsedMeta(row.parsedMeta),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Audit Log
// ═══════════════════════════════════════════════════════════════════════════

export async function insertAutoDeployLog(data: Omit<InsertAutoDeployLog, "id" | "createdAt">): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const [r] = await db.insert(autoDeployLog).values(data).$returningId();
    return r?.id ?? null;
  } catch (e) {
    console.error("[autoDeployDb] insertAutoDeployLog failed:", e);
    return null;
  }
}

export async function listAutoDeployLogs(opts?: {
  userId?: number;
  limit?: number;
}): Promise<Array<typeof autoDeployLog.$inferSelect>> {
  const db = await getDb();
  if (!db) return [];
  const conditions: SQL[] = [];
  if (opts?.userId) conditions.push(eq(autoDeployLog.userId, opts.userId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return db
    .select()
    .from(autoDeployLog)
    .where(where)
    .orderBy(desc(autoDeployLog.createdAt))
    .limit(opts?.limit ?? 50);
}

/** Enriched calibration list with auto-deploy metadata joined. */
export async function listCalibrationsWithAutoDeployMeta(opts?: {
  folderId?: number | null;
  moduleType?: "ecm" | "tcm";
  autoDeployOnly?: boolean;
}): Promise<Array<{
  id: number;
  fileName: string;
  osVersion: string | null;
  partNumbersCsv: string | null;
  vehicleFamily: string;
  vehicleSubType: string;
  meta: TuneDeployParsedMetadata;
  autoDeploy: boolean;
  autoDeployAccessLevel: number;
  moduleType: "ecm" | "tcm";
  folderId: number | null;
  notes: string | null;
}>> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: tuneDeployCalibrations.id,
      fileName: tuneDeployCalibrations.fileName,
      osVersion: tuneDeployCalibrations.osVersion,
      partNumbersCsv: tuneDeployCalibrations.partNumbersCsv,
      vehicleFamily: tuneDeployCalibrations.vehicleFamily,
      vehicleSubType: tuneDeployCalibrations.vehicleSubType,
      parsedMeta: tuneDeployCalibrations.parsedMeta,
      autoDeploy: calibrationAutoDeployMeta.autoDeploy,
      autoDeployAccessLevel: calibrationAutoDeployMeta.autoDeployAccessLevel,
      moduleType: calibrationAutoDeployMeta.moduleType,
      folderId: calibrationAutoDeployMeta.folderId,
      notes: calibrationAutoDeployMeta.notes,
    })
    .from(tuneDeployCalibrations)
    .leftJoin(calibrationAutoDeployMeta, eq(calibrationAutoDeployMeta.calibrationId, tuneDeployCalibrations.id))
    .orderBy(desc(tuneDeployCalibrations.createdAt));

  let filtered = rows;

  if (opts?.folderId !== undefined) {
    filtered = filtered.filter(r =>
      opts.folderId === null ? r.folderId === null : r.folderId === opts.folderId
    );
  }
  if (opts?.moduleType) {
    filtered = filtered.filter(r => r.moduleType === opts.moduleType);
  }
  if (opts?.autoDeployOnly) {
    filtered = filtered.filter(r => r.autoDeploy === true);
  }

  return filtered.map(r => ({
    id: r.id,
    fileName: r.fileName,
    osVersion: r.osVersion,
    partNumbersCsv: r.partNumbersCsv,
    vehicleFamily: r.vehicleFamily,
    vehicleSubType: r.vehicleSubType,
    meta: coerceTuneDeployParsedMeta(r.parsedMeta),
    autoDeploy: r.autoDeploy ?? false,
    autoDeployAccessLevel: r.autoDeployAccessLevel ?? 1,
    moduleType: (r.moduleType ?? "ecm") as "ecm" | "tcm",
    folderId: r.folderId ?? null,
    notes: r.notes ?? null,
  }));
}
