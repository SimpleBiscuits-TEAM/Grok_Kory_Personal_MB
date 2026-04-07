import { and, desc, eq, like, or, count, type SQL } from "drizzle-orm";
import {
  tuneDeployCalibrations,
  type InsertTuneDeployCalibration,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  coerceTuneDeployParsedMeta,
  type TuneDeployListInput,
  type TuneDeployParsedMetadata,
} from "../shared/tuneDeploySchemas";

export async function insertTuneDeployCalibration(
  row: InsertTuneDeployCalibration
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const [r] = await db.insert(tuneDeployCalibrations).values(row).$returningId();
    return r?.id ?? null;
  } catch (e) {
    console.error("[tuneDeployDb] insert failed:", e);
    return null;
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
