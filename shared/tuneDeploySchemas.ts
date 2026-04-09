/**
 * Tune Deploy — shared Zod schemas & types for calibration library metadata.
 * Portable to a future Next.js App Router: import these in Route Handlers and Server Actions.
 *
 * **ECU/format readiness:** `vehicleFamily` / `ecuType` / `calibrationPartNumbers` are filled by
 * `server/lib/tuneDeployParser.ts` + `shared/gmTuneBinaryHeuristics.ts`. **E90** (gas ECM) and **T93** (TCM) share
 * that pipeline with E41; field SPS layout and CAN reference data are documented in
 * `client/src/lib/gmE90SilveradoSniffReference.ts`. When **A2L** is available for a stock, RAM addresses and
 * measurement definitions can augment sniff/OBD channels for live editing and PID documentation.
 */
import { z } from "zod";
import {
  TUNE_FILE_STRUCTURE_FAMILIES,
  type TuneFileStructureFamily,
} from "./tuneFileStructureFamilies";

export const tuneDeployContainerFormatSchema = z.enum(["PPEI", "DEVPROG", "GM_RAW", "RAW", "UNKNOWN"]);

export const tuneFileStructureFamilySchema = z.enum(
  TUNE_FILE_STRUCTURE_FAMILIES as unknown as [TuneFileStructureFamily, ...TuneFileStructureFamily[]]
);

export const tuneDeployParsedMetadataSchema = z.object({
  containerFormat: tuneDeployContainerFormatSchema,
  /** Toolchain / on-disk layout (EFI Live, HP Tuners, V-OP, HEX, etc.) — orthogonal to vehicle family. */
  fileStructureFamily: tuneFileStructureFamilySchema.default("UNKNOWN"),
  /** Short notes on how the family was inferred (filename, magic, or shared detector). */
  fileStructureNotes: z.array(z.string()).default([]),
  /** Best-effort OS / software identifier extracted from container or binary heuristics */
  osVersion: z.string().nullable(),
  /** Calibration / flash part numbers found in the image */
  calibrationPartNumbers: z.array(z.string()),
  /** ECU type string from DevProg / PPEI header when available */
  ecuType: z.string().nullable(),
  /** Hardware / BOM id when present */
  ecuHardwareId: z.string().nullable(),
  /** High-level family for R2 path + UI grouping, e.g. Duramax, Can-Am */
  vehicleFamily: z.string(),
  /** Sub-type, e.g. L5P, MG1CA920 */
  vehicleSubType: z.string(),
  /** Single model year when known, else null (use yearRange) */
  modelYear: z.number().int().nullable(),
  modelYearStart: z.number().int().nullable(),
  modelYearEnd: z.number().int().nullable(),
  /** Human-readable compatibility line for tables/cards */
  vehicleCompatibilityLabel: z.string(),
  /** VIN from container header when present */
  vin: z.string().nullable(),
  /** Non-fatal parser notes */
  warnings: z.array(z.string()),
});

export type TuneDeployParsedMetadata = z.infer<typeof tuneDeployParsedMetadataSchema>;

/** Coerce DB JSON or older rows to current shape (fills `fileStructure*` defaults). */
export function coerceTuneDeployParsedMeta(raw: unknown): TuneDeployParsedMetadata {
  const r = tuneDeployParsedMetadataSchema.safeParse(raw);
  if (r.success) return r.data;
  return tuneDeployParsedMetadataSchema.parse({
    containerFormat: "RAW",
    fileStructureFamily: "UNKNOWN",
    fileStructureNotes: ["Stored metadata failed validation — re-analyze or re-upload."],
    osVersion: null,
    calibrationPartNumbers: [],
    ecuType: null,
    ecuHardwareId: null,
    vehicleFamily: "Unknown",
    vehicleSubType: "unknown",
    modelYear: null,
    modelYearStart: null,
    modelYearEnd: null,
    vehicleCompatibilityLabel: "Unknown",
    vin: null,
    warnings: ["Stored calibration metadata could not be parsed."],
  });
}

/** DevProg/PPEI CRC32 at 0x1000 — from `shared/flashFileValidator.getContainerCrc32Status` */
export const tuneDeployContainerCrc32Schema = z.object({
  applicable: z.boolean(),
  match: z.boolean().nullable(),
  storedHex: z.string().optional(),
  computedHex: z.string().optional(),
  message: z.string(),
});

export type TuneDeployContainerCrc32 = z.infer<typeof tuneDeployContainerCrc32Schema>;

export const tuneDeployLibraryRowSchema = z.object({
  id: z.number(),
  fileName: z.string(),
  r2Key: z.string(),
  storageUrl: z.string().nullable(),
  sha256: z.string(),
  sizeBytes: z.number(),
  uploadedByUserId: z.number(),
  createdAt: z.date(),
  meta: tuneDeployParsedMetadataSchema,
});

export type TuneDeployLibraryRow = z.infer<typeof tuneDeployLibraryRowSchema>;

export const tuneDeployListInputSchema = z.object({
  search: z.string().max(256).optional(),
  vehicleFamily: z.string().max(128).optional(),
  modelYear: z.number().int().min(1980).max(2035).optional(),
  partNumber: z.string().max(64).optional(),
  osVersion: z.string().max(128).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export type TuneDeployListInput = z.infer<typeof tuneDeployListInputSchema>;

/** Input for future vehicle-connected auto-match (implement server-side query against this metadata). */
export const tuneDeployVehicleSnapshotSchema = z.object({
  /** OS string read from ECU via UDS / dealer tool */
  ecuOs: z.string().max(128).optional(),
  /** Calibration part numbers reported by ECU */
  calibrationPartNumbers: z.array(z.string().max(64)).max(32).optional(),
  /** Optional VIN for year/make/model decode */
  vin: z.string().max(32).optional(),
});

export type TuneDeployVehicleSnapshot = z.infer<typeof tuneDeployVehicleSnapshotSchema>;
