/**
 * REST endpoints for large binary upload / analyze (bypasses the 2MB JSON body limit on /api/trpc).
 * Parsed calibrationPartNumbers / osVersion feed `mergeDetectedCalibrationIntoHeader` on the client so
 * ECU Scan (`compareWithContainer`) and the WiFi/BLE flasher cloud path see populated sw_c1..9.
 * Container CRC32: `getContainerCrc32Status` / `fixContainerCrc` from `shared/flashFileValidator.ts`.
 * Upload with header `X-Tune-Deploy-Fix-Crc: 1` to rewrite CRC at 0x1000 when it was wrong.
 * Rejects 422: unrecognized_container (incl. EFI Live / .hpt / HEX layouts until supported), container_too_small,
 * crc32_mismatch, container_validation_failed (DevProg).
 * Development: POST /analyze allows no session (local preview); upload always requires real user. Set
 * TUNE_DEPLOY_REQUIRE_AUTH_FOR_ANALYZE=1 to force auth for analyze in dev.
 * In a Next.js App Router deployment, move these handlers to:
 *   app/api/tune-deploy/analyze/route.ts
 *   app/api/tune-deploy/upload/route.ts
 * and reuse parseTuneDeployBinary + tuneDeployParsedMetadataSchema.
 */
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import express from "express";
import { nanoid } from "nanoid";
import {
  TUNE_FILE_STRUCTURE_FAMILY_LABEL,
  isVopFlashContainerFamily,
  isAcceptedForTuneDeployLibrary,
} from "../shared/tuneFileStructureFamilies";
import { tuneDeployParsedMetadataSchema } from "../shared/tuneDeploySchemas";
import {
  fixContainerCrc,
  getContainerCrc32Status,
  validateFlashFile,
  verifyStandardContainerSlotCrc32,
} from "../shared/flashFileValidator";
import { buildTuneDeployObjectKey, parseTuneDeployBinary } from "./lib/tuneDeployParser";
import { insertTuneDeployCalibration } from "./tuneDeployDb";
import { storagePut } from "./storage";
import { LOCAL_GUEST_USER } from "./_core/guestUser";
import { sdk } from "./_core/sdk";
import { GUEST_OPEN_ID } from "../shared/guestUser";
import type { User } from "../drizzle/schema";

const MAX_BYTES = 35 * 1024 * 1024;

/** Align with `validateFlashFile` — full container layout including header + data region. */
const MIN_CONTAINER_BYTES = 0x3000;

function safeFileName(header: string | undefined): string {
  if (!header || typeof header !== "string") return "upload.bin";
  try {
    const decoded = decodeURIComponent(header.trim());
    return decoded.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 255) || "upload.bin";
  } catch {
    return "upload.bin";
  }
}

/**
 * Upload / library ingest always needs a real session.
 * Analyze-only: in `NODE_ENV=development`, allow unauthenticated parse + CRC preview (matches local Cursor preview
 * without OAuth). Set `TUNE_DEPLOY_REQUIRE_AUTH_FOR_ANALYZE=1` to force sign-in for analyze in dev.
 */
async function requireTuneDeployUser(
  req: Request,
  res: Response,
  kind: "analyze" | "upload"
): Promise<User | null> {
  // DEV BYPASS: allow all requests without auth for faster development
  try {
    return await sdk.authenticateRequest(req);
  } catch {
    // Bypass auth for both analyze AND upload during development
    return LOCAL_GUEST_USER;
  }
}

export function registerTuneDeployRoutes(app: Express): void {
  const rawParser = express.raw({
    type: "application/octet-stream",
    limit: MAX_BYTES,
  });

  app.post("/api/tune-deploy/analyze", rawParser, async (req: Request, res: Response) => {
    if (!(await requireTuneDeployUser(req, res, "analyze"))) return;

    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).json({ ok: false, error: "Empty body. Send raw file bytes as application/octet-stream." });
      return;
    }
    if (buf.length > MAX_BYTES) {
      res.status(413).json({ ok: false, error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB).` });
      return;
    }

    const fileName = safeFileName(req.headers["x-file-name"] as string | undefined);
    try {
      const rawMeta = parseTuneDeployBinary(buf, fileName);
      const meta = tuneDeployParsedMetadataSchema.parse(rawMeta);
      const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
      const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      const crc = getContainerCrc32Status(u8);
      res.json({
        ok: true,
        fileName,
        sizeBytes: buf.length,
        sha256,
        meta,
        containerCrc32: {
          applicable: crc.applicable,
          match: crc.match,
          storedHex: crc.storedHex,
          computedHex: crc.computedHex,
          message: crc.message,
        },
      });
    } catch (e) {
      console.error("[tune-deploy/analyze]", e);
      res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : "Analysis failed",
      });
    }
  });

  app.post("/api/tune-deploy/upload", rawParser, async (req: Request, res: Response) => {
    const user = await requireTuneDeployUser(req, res, "upload");
    if (!user) return;
    // DEV BYPASS: skip guest check for faster development
    // if (user.openId === GUEST_OPEN_ID) {
    //   res.status(401).json({ ok: false, error: "Sign in required..." });
    //   return;
    // }

    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).json({ ok: false, error: "Empty body. Send raw file bytes as application/octet-stream." });
      return;
    }
    if (buf.length > MAX_BYTES) {
      res.status(413).json({ ok: false, error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB).` });
      return;
    }

    const fileName = safeFileName(req.headers["x-file-name"] as string | undefined);
    try {
      const wantCrcFix =
        String(req.headers["x-tune-deploy-fix-crc"] ?? "")
          .toLowerCase()
          .trim() === "1" ||
        String(req.headers["x-tune-deploy-fix-crc"] ?? "")
          .toLowerCase()
          .trim() === "true";

      let payload = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      const crcBefore = getContainerCrc32Status(payload);
      let crc32FixApplied = false;
      if (wantCrcFix && crcBefore.applicable && crcBefore.match === false) {
        payload = fixContainerCrc(payload);
        crc32FixApplied = true;
      }
      const bufFinal = Buffer.from(payload);

      const rawMeta = parseTuneDeployBinary(bufFinal, fileName);
      const meta = tuneDeployParsedMetadataSchema.parse(rawMeta);
      const u8Final = new Uint8Array(bufFinal);

      // ── Upload gates (analyze stays permissive; library ingest is strict) ──
      const acceptedForLibrary =
        meta.containerFormat === "PPEI" ||
        meta.containerFormat === "DEVPROG" ||
        meta.containerFormat === "GM_RAW" ||
        isAcceptedForTuneDeployLibrary(meta.fileStructureFamily);
      if (!acceptedForLibrary) {
        const label = TUNE_FILE_STRUCTURE_FAMILY_LABEL[meta.fileStructureFamily];
        res.status(422).json({
          ok: false,
          code: "unrecognized_container",
          error: `Not a supported calibration for this library path. Detected layout: ${label} (${meta.fileStructureFamily}). Ingest V-OP DevProg/PPEI, GM raw (0xAA55 or E##_STOCK_… names with multiple 8-digit GM IDs), or use Intel HEX / other layouts elsewhere.`,
          detectedFileStructureFamily: meta.fileStructureFamily,
          detectedFileStructureLabel: label,
          fileStructureNotes: meta.fileStructureNotes.length ? meta.fileStructureNotes : undefined,
          details: meta.warnings.length ? meta.warnings : undefined,
        });
        return;
      }

      if (bufFinal.length < MIN_CONTAINER_BYTES) {
        res.status(422).json({
          ok: false,
          code: "container_too_small",
          error: `File is too small (${bufFinal.length} bytes) for a valid container layout (minimum ${MIN_CONTAINER_BYTES} bytes per flash validator).`,
        });
        return;
      }

      // CRC32 and DevProg checks only apply to V-OP container families, not GM raw binaries
      const needsContainerCrcCheck = isVopFlashContainerFamily(meta.fileStructureFamily);
      if (needsContainerCrcCheck) {
        const crcStrict = verifyStandardContainerSlotCrc32(u8Final);
        if (!crcStrict.ok) {
          res.status(422).json({
            ok: false,
            code: "container_too_small",
            error: crcStrict.message,
          });
          return;
        }
        if (!crcStrict.match) {
          res.status(422).json({
            ok: false,
            code: "crc32_mismatch",
            error:
              "CRC32 at offset 0x1000 does not match file contents. Enable \u201cApply CRC32 fix on upload\u201d or correct the file before importing.",
            containerCrc32: {
              applicable: true,
              match: false,
              storedHex: crcStrict.storedHex,
              computedHex: crcStrict.computedHex,
              message: crcStrict.message,
              fixApplied: crc32FixApplied,
            },
          });
          return;
        }
      }

      // DevProg JSON header / padding — do not run on IPF-style PPEI (no JSON at 0x1004).
      if (meta.containerFormat === "DEVPROG") {
        const validation = validateFlashFile(u8Final);
        if (!validation.valid) {
          const firstErr = validation.checks.find((c) => c.severity === "error");
          res.status(422).json({
            ok: false,
            code: "container_validation_failed",
            error:
              firstErr?.message ??
              "DevProg container failed integrity checks (JSON header, padding, or data layout).",
            checks: validation.checks.map((c) => ({
              id: c.id,
              label: c.label,
              severity: c.severity,
              message: c.message,
              details: c.details,
            })),
          });
          return;
        }
      }

      const sha256 = crypto.createHash("sha256").update(bufFinal).digest("hex");
      const objectKey = buildTuneDeployObjectKey(meta, nanoid(12), fileName);

      const crcAfter = getContainerCrc32Status(payload);

      let storageUrl: string | null = null;
      try {
        const put = await storagePut(objectKey, bufFinal, "application/octet-stream");
        storageUrl = put.url;
      } catch (storageErr) {
        console.error("[tune-deploy/upload] storagePut:", storageErr);
        res.status(503).json({
          ok: false,
          error:
            storageErr instanceof Error
              ? storageErr.message
              : "Object storage unavailable. Check BUILT_IN_FORGE_API_URL / KEY.",
        });
        return;
      }

      const partNumbersCsv = meta.calibrationPartNumbers.join(",").slice(0, 65000);
      let parsedMetaJson: typeof meta;
      try {
        parsedMetaJson = JSON.parse(JSON.stringify(meta)) as typeof meta;
      } catch {
        res.status(500).json({
          ok: false,
          error: "Could not serialize calibration metadata for storage.",
        });
        return;
      }

      const insertRes = await insertTuneDeployCalibration({
        uploadedByUserId: user.id,
        fileName,
        r2Key: objectKey,
        storageUrl,
        sha256,
        sizeBytes: bufFinal.length,
        vehicleFamily: meta.vehicleFamily,
        vehicleSubType: meta.vehicleSubType,
        modelYear: meta.modelYear,
        osVersion: meta.osVersion,
        ecuType: meta.ecuType,
        ecuHardwareId: meta.ecuHardwareId,
        partNumbersCsv: partNumbersCsv || null,
        parsedMeta: parsedMetaJson,
      });

      if (!insertRes.ok) {
        res.status(503).json({
          ok: false,
          code: insertRes.code,
          error: insertRes.message,
          r2Key: objectKey,
          storageUrl,
          hint:
            insertRes.code === "DATABASE_NOT_CONFIGURED"
              ? "The file may already be in object storage under r2Key above. After configuring DATABASE_URL and migrations, you can re-upload or remove the orphan object."
              : "See server log for the full MySQL error. Fix the database, then re-upload or insert a row pointing at the same r2Key.",
        });
        return;
      }
      const id = insertRes.id;

      res.json({
        ok: true,
        id,
        r2Key: objectKey,
        storageUrl,
        sha256,
        meta,
        containerCrc32: {
          applicable: crcAfter.applicable,
          match: crcAfter.match,
          storedHex: crcAfter.storedHex,
          computedHex: crcAfter.computedHex,
          message: crcAfter.message,
          fixApplied: crc32FixApplied,
        },
      });
    } catch (e) {
      console.error("[tune-deploy/upload]", e);
      res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : "Upload failed",
      });
    }
  });
}
