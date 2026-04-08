import { and, desc, eq, like, or, count, ne, inArray, sql, type SQL } from "drizzle-orm";
import {
  tuneDeployCalibrations,
  tuneDeployDevices,
  tuneDeployAssignments,
  cloudEnrollments,
  type InsertTuneDeployCalibration,
  type InsertTuneDeployDevice,
  type TuneDeployDevice,
  type TuneDeployAssignment,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  coerceTuneDeployParsedMeta,
  type TuneDeployListInput,
  type TuneDeployParsedMetadata,
} from "../shared/tuneDeploySchemas";
import { normalizeHardwareSerialKey, normalizeVinKey } from "../shared/cloudVehicleLinkKeys";

export type InsertTuneDeployCalibrationResult =
  | { ok: true; id: number }
  | { ok: false; code: "DATABASE_NOT_CONFIGURED"; message: string }
  | { ok: false; code: "INSERT_FAILED"; message: string };

function humanizeTuneDeployInsertError(raw: string): string {
  if (/doesn't exist|no such table|ER_NO_SUCH_TABLE|1146/i.test(raw)) {
    return (
      "MySQL table tune_deploy_calibrations (or related tune_deploy_*) is missing. " +
      "Apply migrations so journal reaches 0006_mysterious_titanium_man (e.g. pnpm run db:push or drizzle-kit migrate)."
    );
  }
  if (/ER_ACCESS_DENIED|access denied|1045/i.test(raw)) {
    return "MySQL rejected credentials — check DATABASE_URL user, password, and host.";
  }
  if (/ECONNREFUSED|ENOTFOUND/i.test(raw)) {
    return "Cannot reach MySQL — check DATABASE_URL host/port and that the server is running.";
  }
  return raw;
}

export async function insertTuneDeployCalibration(
  row: InsertTuneDeployCalibration
): Promise<InsertTuneDeployCalibrationResult> {
  const db = await getDb();
  if (!db) {
    return {
      ok: false,
      code: "DATABASE_NOT_CONFIGURED",
      message:
        "DATABASE_URL is not set or the database client failed to initialize. Set DATABASE_URL in .env (see .env.example) and restart the server.",
    };
  }
  try {
    const [r] = await db.insert(tuneDeployCalibrations).values(row).$returningId();
    const id = r?.id != null ? Number(r.id) : NaN;
    if (!Number.isFinite(id) || id <= 0) {
      console.error("[tuneDeployDb] insert returned no usable id:", r);
      return {
        ok: false,
        code: "INSERT_FAILED",
        message:
          "Insert ran but no row id was returned. Check MySQL logs, user permissions, and that tune_deploy_calibrations has an AUTO_INCREMENT primary key.",
      };
    }
    return { ok: true, id };
  } catch (e) {
    console.error("[tuneDeployDb] insert failed:", e);
    const raw = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      code: "INSERT_FAILED",
      message: humanizeTuneDeployInsertError(raw),
    };
  }
}

export async function listTuneDeployCalibrations(opts: TuneDeployListInput): Promise<{
  rows: Array<{
    id: number;
    fileName: string;
    r2Key: string;
    storageUrl: string | null;
    sha256: string;
    sizeBytes: number;
    uploadedByUserId: number;
    createdAt: Date;
    meta: TuneDeployParsedMetadata;
  }>;
  total: number;
}> {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };

  const conditions: SQL[] = [];

  if (opts.vehicleFamily) {
    conditions.push(eq(tuneDeployCalibrations.vehicleFamily, opts.vehicleFamily));
  }
  if (opts.modelYear != null) {
    conditions.push(eq(tuneDeployCalibrations.modelYear, opts.modelYear));
  }
  if (opts.osVersion) {
    conditions.push(like(tuneDeployCalibrations.osVersion, `%${opts.osVersion}%`));
  }
  if (opts.partNumber) {
    conditions.push(like(tuneDeployCalibrations.partNumbersCsv, `%${opts.partNumber}%`));
  }

  const search = opts.search?.trim();
  if (search) {
    const q = `%${search}%`;
    conditions.push(
      or(
        like(tuneDeployCalibrations.fileName, q),
        like(tuneDeployCalibrations.vehicleFamily, q),
        like(tuneDeployCalibrations.vehicleSubType, q),
        like(tuneDeployCalibrations.osVersion, q),
        like(tuneDeployCalibrations.ecuType, q),
        like(tuneDeployCalibrations.partNumbersCsv, q)
      )!
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: tuneDeployCalibrations.id,
        fileName: tuneDeployCalibrations.fileName,
        r2Key: tuneDeployCalibrations.r2Key,
        storageUrl: tuneDeployCalibrations.storageUrl,
        sha256: tuneDeployCalibrations.sha256,
        sizeBytes: tuneDeployCalibrations.sizeBytes,
        uploadedByUserId: tuneDeployCalibrations.uploadedByUserId,
        createdAt: tuneDeployCalibrations.createdAt,
        parsedMeta: tuneDeployCalibrations.parsedMeta,
      })
      .from(tuneDeployCalibrations)
      .where(where)
      .orderBy(desc(tuneDeployCalibrations.createdAt))
      .limit(opts.limit)
      .offset(opts.offset),
    db.select({ c: count() }).from(tuneDeployCalibrations).where(where),
  ]);

  const total = Number(totalRow[0]?.c ?? 0);

  return {
    rows: rows.map((r) => ({
      ...r,
      meta: coerceTuneDeployParsedMeta(r.parsedMeta),
    })),
    total,
  };
}

/**
 * Future: vehicle session → ranked calibration suggestions.
 * Score: exact cal PN match > OS match > VIN-decoded year overlap.
 */
export async function suggestTuneDeployMatches(params: {
  ecuOs?: string;
  calibrationPartNumbers?: string[];
  limit?: number;
}): Promise<
  Array<{
    id: number;
    fileName: string;
    score: number;
    reason: string;
    meta: TuneDeployParsedMetadata;
  }>
> {
  const db = await getDb();
  if (!db) return [];
  const limit = Math.min(params.limit ?? 20, 50);
  const pns = (params.calibrationPartNumbers ?? []).map((p) => p.trim().toUpperCase()).filter(Boolean);

  const conditions = [];
  if (params.ecuOs?.trim()) {
    conditions.push(like(tuneDeployCalibrations.osVersion, `%${params.ecuOs.trim()}%`));
  }
  for (const pn of pns.slice(0, 5)) {
    conditions.push(like(tuneDeployCalibrations.partNumbersCsv, `%${pn}%`));
  }
  if (conditions.length === 0) return [];

  const where = or(...conditions)!;

  const rows = await db
    .select({
      id: tuneDeployCalibrations.id,
      fileName: tuneDeployCalibrations.fileName,
      parsedMeta: tuneDeployCalibrations.parsedMeta,
      osVersion: tuneDeployCalibrations.osVersion,
      partNumbersCsv: tuneDeployCalibrations.partNumbersCsv,
    })
    .from(tuneDeployCalibrations)
    .where(where)
    .orderBy(desc(tuneDeployCalibrations.createdAt))
    .limit(limit);

  return rows.map((r) => {
    const meta = coerceTuneDeployParsedMeta(r.parsedMeta);
    let score = 0;
    const reasons: string[] = [];
    const csv = (r.partNumbersCsv ?? "").toUpperCase();
    for (const pn of pns) {
      if (csv.includes(pn)) {
        score += 100;
        reasons.push(`part ${pn}`);
      }
    }
    if (params.ecuOs && r.osVersion?.includes(params.ecuOs.trim())) {
      score += 40;
      reasons.push("OS similarity");
    }
    return {
      id: r.id,
      fileName: r.fileName,
      score,
      reason: reasons.join(", ") || "loose match",
      meta,
    };
  }).sort((a, b) => b.score - a.score);
}

export async function deleteTuneDeployCalibration(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.delete(tuneDeployCalibrations).where(eq(tuneDeployCalibrations.id, id));
    return true;
  } catch (e) {
    console.error("[tuneDeployDb] delete failed:", e);
    return false;
  }
}

// ── Device Management ─────────────────────────────────────────────────────

export async function listDevices(): Promise<TuneDeployDevice[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(tuneDeployDevices)
    .orderBy(desc(tuneDeployDevices.createdAt));
}

export async function insertDevice(
  row: Omit<InsertTuneDeployDevice, "id" | "createdAt" | "updatedAt">
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const [r] = await db.insert(tuneDeployDevices).values(row).$returningId();
    return r?.id ?? null;
  } catch (e) {
    console.error("[tuneDeployDb] insertDevice failed:", e);
    return null;
  }
}

export async function updateDevice(
  id: number,
  updates: Partial<Pick<TuneDeployDevice, "label" | "vehicleDescription" | "vin" | "ecuSerial" | "isActive">>
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.update(tuneDeployDevices).set(updates).where(eq(tuneDeployDevices.id, id));
    return true;
  } catch (e) {
    console.error("[tuneDeployDb] updateDevice failed:", e);
    return false;
  }
}

export async function deleteDevice(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    // Also cancel any pending assignments for this device
    await db.update(tuneDeployAssignments)
      .set({ status: "cancelled" })
      .where(and(eq(tuneDeployAssignments.deviceId, id), eq(tuneDeployAssignments.status, "pending")));
    await db.delete(tuneDeployDevices).where(eq(tuneDeployDevices.id, id));
    return true;
  } catch (e) {
    console.error("[tuneDeployDb] deleteDevice failed:", e);
    return false;
  }
}

/** Normalize VIN for comparison (Tune Deploy device vs cloud enrollment). */
export function normalizeTuneDeployVin(vin: string | null | undefined): string | null {
  const t = normalizeVinKey(vin);
  return t.length >= 11 ? t : null;
}

export type TuneDeploymentForCloudRow = {
  assignmentId: number;
  status: string;
  deviceId: number;
  deviceSerial: string | null;
  deviceEcuSerial: string | null;
  deviceLabel: string | null;
  deviceVin: string | null;
  calibrationId: number;
  calibrationFileName: string | null;
  vehicleFamily: string | null;
  vehicleSubType: string | null;
  osVersion: string | null;
  deployedAt: Date | null;
  createdAt: Date;
};

/**
 * Assignments for Tune Deploy devices linked to this user:
 * - device.createdBy === userId, or
 * - device VIN / programmer serial / ECU serial matches any active cloud enrollment row for this user.
 * Future: customer sign-in / intake forms can set the same enrollment fields so calibrations appear without manual Cloud enroll.
 * Excludes cancelled assignments.
 */
export async function listTuneDeploymentsForUser(userId: number): Promise<TuneDeploymentForCloudRow[]> {
  const db = await getDb();
  if (!db) return [];

  const enrollRows = await db
    .select({
      vin: cloudEnrollments.vin,
      programmerSerial: cloudEnrollments.programmerSerial,
      ecuSerial: cloudEnrollments.ecuSerial,
    })
    .from(cloudEnrollments)
    .where(and(eq(cloudEnrollments.userId, userId), eq(cloudEnrollments.isActive, true)));

  const vinList = [
    ...new Set(
      enrollRows
        .map((r) => normalizeTuneDeployVin(r.vin))
        .filter((v): v is string => v != null),
    ),
  ];
  const programmerList = [
    ...new Set(
      enrollRows
        .map((r) => normalizeHardwareSerialKey(r.programmerSerial))
        .filter((v): v is string => v != null),
    ),
  ];
  const ecuList = [
    ...new Set(
      enrollRows
        .map((r) => normalizeHardwareSerialKey(r.ecuSerial))
        .filter((v): v is string => v != null),
    ),
  ];

  const owned = await db
    .select({ id: tuneDeployDevices.id })
    .from(tuneDeployDevices)
    .where(eq(tuneDeployDevices.createdBy, userId));

  let vinDeviceRows: { id: number }[] = [];
  if (vinList.length > 0) {
    const vinOr = or(
      ...vinList.map((v) => sql`UPPER(TRIM(${tuneDeployDevices.vin})) = ${v}`),
    )!;
    vinDeviceRows = await db.select({ id: tuneDeployDevices.id }).from(tuneDeployDevices).where(vinOr);
  }

  let programmerDeviceRows: { id: number }[] = [];
  if (programmerList.length > 0) {
    const progOr = or(
      ...programmerList.map(
        (p) => sql`UPPER(REPLACE(TRIM(${tuneDeployDevices.serialNumber}), ' ', '')) = ${p}`,
      ),
    )!;
    programmerDeviceRows = await db.select({ id: tuneDeployDevices.id }).from(tuneDeployDevices).where(progOr);
  }

  let ecuDeviceRows: { id: number }[] = [];
  if (ecuList.length > 0) {
    const ecuOr = or(
      ...ecuList.map(
        (p) => sql`UPPER(REPLACE(TRIM(${tuneDeployDevices.ecuSerial}), ' ', '')) = ${p}`,
      ),
    )!;
    ecuDeviceRows = await db
      .select({ id: tuneDeployDevices.id })
      .from(tuneDeployDevices)
      .where(and(sql`${tuneDeployDevices.ecuSerial} IS NOT NULL`, ecuOr));
  }

  const deviceIds = [
    ...new Set([
      ...owned.map((o) => o.id),
      ...vinDeviceRows.map((v) => v.id),
      ...programmerDeviceRows.map((v) => v.id),
      ...ecuDeviceRows.map((v) => v.id),
    ]),
  ];
  if (deviceIds.length === 0) return [];

  const rows = await db
    .select({
      assignmentId: tuneDeployAssignments.id,
      status: tuneDeployAssignments.status,
      deviceId: tuneDeployDevices.id,
      deviceSerial: tuneDeployDevices.serialNumber,
      deviceEcuSerial: tuneDeployDevices.ecuSerial,
      deviceLabel: tuneDeployDevices.label,
      deviceVin: tuneDeployDevices.vin,
      calibrationId: tuneDeployCalibrations.id,
      calibrationFileName: tuneDeployCalibrations.fileName,
      vehicleFamily: tuneDeployCalibrations.vehicleFamily,
      vehicleSubType: tuneDeployCalibrations.vehicleSubType,
      osVersion: tuneDeployCalibrations.osVersion,
      deployedAt: tuneDeployAssignments.deployedAt,
      createdAt: tuneDeployAssignments.createdAt,
    })
    .from(tuneDeployAssignments)
    .innerJoin(tuneDeployDevices, eq(tuneDeployAssignments.deviceId, tuneDeployDevices.id))
    .innerJoin(tuneDeployCalibrations, eq(tuneDeployAssignments.calibrationId, tuneDeployCalibrations.id))
    .where(
      and(inArray(tuneDeployAssignments.deviceId, deviceIds), ne(tuneDeployAssignments.status, "cancelled")),
    )
    .orderBy(desc(tuneDeployAssignments.createdAt));

  return rows as TuneDeploymentForCloudRow[];
}

// ── Assignment Management ─────────────────────────────────────────────────

export async function listAssignments(opts?: {
  deviceId?: number;
  calibrationId?: number;
  status?: string;
}): Promise<Array<TuneDeployAssignment & { deviceSerial?: string; deviceLabel?: string; calibrationFileName?: string }>> {
  const db = await getDb();
  if (!db) return [];

  const conditions: SQL[] = [];
  if (opts?.deviceId) conditions.push(eq(tuneDeployAssignments.deviceId, opts.deviceId));
  if (opts?.calibrationId) conditions.push(eq(tuneDeployAssignments.calibrationId, opts.calibrationId));
  if (opts?.status) conditions.push(eq(tuneDeployAssignments.status, opts.status as any));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: tuneDeployAssignments.id,
      calibrationId: tuneDeployAssignments.calibrationId,
      deviceId: tuneDeployAssignments.deviceId,
      status: tuneDeployAssignments.status,
      notes: tuneDeployAssignments.notes,
      deployedAt: tuneDeployAssignments.deployedAt,
      assignedBy: tuneDeployAssignments.assignedBy,
      createdAt: tuneDeployAssignments.createdAt,
      updatedAt: tuneDeployAssignments.updatedAt,
      deviceSerial: tuneDeployDevices.serialNumber,
      deviceLabel: tuneDeployDevices.label,
      calibrationFileName: tuneDeployCalibrations.fileName,
    })
    .from(tuneDeployAssignments)
    .leftJoin(tuneDeployDevices, eq(tuneDeployAssignments.deviceId, tuneDeployDevices.id))
    .leftJoin(tuneDeployCalibrations, eq(tuneDeployAssignments.calibrationId, tuneDeployCalibrations.id))
    .where(where)
    .orderBy(desc(tuneDeployAssignments.createdAt));

  return rows as any;
}

export async function createAssignment(opts: {
  calibrationId: number;
  deviceId: number;
  notes?: string;
  assignedBy?: number;
}): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const [r] = await db.insert(tuneDeployAssignments).values({
      calibrationId: opts.calibrationId,
      deviceId: opts.deviceId,
      notes: opts.notes ?? null,
      assignedBy: opts.assignedBy ?? null,
    }).$returningId();
    return r?.id ?? null;
  } catch (e) {
    console.error("[tuneDeployDb] createAssignment failed:", e);
    return null;
  }
}

export async function updateAssignmentStatus(
  id: number,
  status: "pending" | "deployed" | "failed" | "cancelled",
  deployedAt?: Date
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    const updates: any = { status };
    if (deployedAt) updates.deployedAt = deployedAt;
    await db.update(tuneDeployAssignments).set(updates).where(eq(tuneDeployAssignments.id, id));
    return true;
  } catch (e) {
    console.error("[tuneDeployDb] updateAssignmentStatus failed:", e);
    return false;
  }
}

export async function deleteAssignment(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.delete(tuneDeployAssignments).where(eq(tuneDeployAssignments.id, id));
    return true;
  } catch (e) {
    console.error("[tuneDeployDb] deleteAssignment failed:", e);
    return false;
  }
}
