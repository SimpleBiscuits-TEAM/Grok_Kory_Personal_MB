/**
 * Auto-Deploy — tRPC surface for folder hierarchy, auto-deploy metadata,
 * combo pairings, V-OP tool matching, and audit log.
 *
 * Admin routes use publicProcedure (DEV BYPASS) — gate to adminProcedure in production.
 * The V-OP tool matching endpoint is public but requires valid device + user context.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import {
  listFolders,
  listAllFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  getAutoDeployMeta,
  listAutoDeployMeta,
  upsertAutoDeployMeta,
  listCombos,
  createCombo,
  updateCombo,
  deleteCombo,
  findAutoDeployMatch,
  insertAutoDeployLog,
  listAutoDeployLogs,
  listCalibrationsWithAutoDeployMeta,
} from "../autoDeployDb";

export const autoDeployRouter = router({
  // ═══════════════════════════════════════════════════════════════════════
  // Folder Hierarchy (Admin)
  // ═══════════════════════════════════════════════════════════════════════

  listFolders: publicProcedure
    .input(z.object({ parentId: z.number().int().nullable().optional() }).optional())
    .query(async ({ input }) => {
      return listFolders(input?.parentId);
    }),

  listAllFolders: publicProcedure.query(async () => {
    return listAllFolders();
  }),

  createFolder: publicProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      parentId: z.number().int().positive().nullable().optional(),
      folderType: z.enum(["vehicle_type", "os", "part_number", "custom"]).optional(),
      fullPath: z.string().max(1024).optional(),
      sortOrder: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await createFolder({
        name: input.name,
        parentId: input.parentId ?? null,
        folderType: input.folderType ?? "custom",
        fullPath: input.fullPath ?? null,
        sortOrder: input.sortOrder ?? 0,
        createdBy: ctx.user?.id ?? null,
      });
      if (id == null) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create folder" });
      }
      return { ok: true as const, id };
    }),

  updateFolder: publicProcedure
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().min(1).max(255).optional(),
      parentId: z.number().int().positive().nullable().optional(),
      folderType: z.enum(["vehicle_type", "os", "part_number", "custom"]).optional(),
      fullPath: z.string().max(1024).optional(),
      sortOrder: z.number().int().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      const cleanUpdates: Record<string, unknown> = {};
      if (updates.name !== undefined) cleanUpdates.name = updates.name;
      if (updates.parentId !== undefined) cleanUpdates.parentId = updates.parentId;
      if (updates.folderType !== undefined) cleanUpdates.folderType = updates.folderType;
      if (updates.fullPath !== undefined) cleanUpdates.fullPath = updates.fullPath;
      if (updates.sortOrder !== undefined) cleanUpdates.sortOrder = updates.sortOrder;
      const ok = await updateFolder(id, cleanUpdates as any);
      if (!ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update folder" });
      }
      return { ok: true as const };
    }),

  deleteFolder: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const ok = await deleteFolder(input.id);
      if (!ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to delete folder" });
      }
      return { ok: true as const };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // Auto-Deploy Metadata (Admin)
  // ═══════════════════════════════════════════════════════════════════════

  getCalibrationMeta: publicProcedure
    .input(z.object({ calibrationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return getAutoDeployMeta(input.calibrationId);
    }),

  listCalibrationMeta: publicProcedure.query(async () => {
    return listAutoDeployMeta();
  }),

  upsertCalibrationMeta: publicProcedure
    .input(z.object({
      calibrationId: z.number().int().positive(),
      folderId: z.number().int().positive().nullable().optional(),
      moduleType: z.enum(["ecm", "tcm"]).optional(),
      autoDeploy: z.boolean().optional(),
      autoDeployAccessLevel: z.number().int().min(0).max(3).optional(),
      notes: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await upsertAutoDeployMeta({
        ...input,
        updatedBy: ctx.user?.id,
      });
      if (id == null) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update auto-deploy metadata" });
      }
      return { ok: true as const, id };
    }),

  /** List calibrations enriched with auto-deploy metadata. */
  listCalibrationsEnriched: publicProcedure
    .input(z.object({
      folderId: z.number().int().positive().nullable().optional(),
      moduleType: z.enum(["ecm", "tcm"]).optional(),
      autoDeployOnly: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => {
      return listCalibrationsWithAutoDeployMeta(input ?? undefined);
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // Combo Pairings (Admin)
  // ═══════════════════════════════════════════════════════════════════════

  listCombos: publicProcedure.query(async () => {
    return listCombos();
  }),

  createCombo: publicProcedure
    .input(z.object({
      ecmCalibrationId: z.number().int().positive(),
      tcmCalibrationId: z.number().int().positive(),
      label: z.string().max(512).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await createCombo({
        ...input,
        createdBy: ctx.user?.id,
      });
      if (id == null) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create combo" });
      }
      return { ok: true as const, id };
    }),

  updateCombo: publicProcedure
    .input(z.object({
      id: z.number().int().positive(),
      label: z.string().max(512).optional(),
      isActive: z.boolean().optional(),
      ecmCalibrationId: z.number().int().positive().optional(),
      tcmCalibrationId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      const ok = await updateCombo(id, updates);
      if (!ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update combo" });
      }
      return { ok: true as const };
    }),

  deleteCombo: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const ok = await deleteCombo(input.id);
      if (!ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to delete combo" });
      }
      return { ok: true as const };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // V-OP Tool Auto-Deploy Matching Endpoint
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Called by the V-OP tool when it connects to a vehicle.
   * Sends ECM/TCM OS + part numbers, receives matching calibration(s).
   *
   * Flow:
   * 1. Tool reads vehicle modules → gets OS + part numbers for ECM and/or TCM
   * 2. Tool calls this endpoint with the snapshot
   * 3. Backend matches against auto-deploy enabled calibrations
   * 4. Returns calibration file(s) — combo (ECM+TCM) or individual
   * 5. Tool flashes using Tobi's flash engine
   */
  matchVehicle: publicProcedure
    .input(z.object({
      // ECM module snapshot
      ecmOs: z.string().max(256).optional(),
      ecmPartNumbers: z.array(z.string().max(64)).max(20).optional(),
      // TCM module snapshot
      tcmOs: z.string().max(256).optional(),
      tcmPartNumbers: z.array(z.string().max(64)).max(20).optional(),
      // Device info
      deviceSerial: z.string().max(128).optional(),
      deviceType: z.enum(["vop", "pcan", "elm327"]).optional(),
      // User access level (from auth context or passed by tool)
      userAccessLevel: z.number().int().min(0).max(3).optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Determine access level: from auth context or input
      const accessLevel = input.userAccessLevel ?? 0;

      // Must have at least some module data
      if (!input.ecmOs && !input.ecmPartNumbers?.length && !input.tcmOs && !input.tcmPartNumbers?.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "At least one module snapshot (ECM or TCM with OS or part numbers) is required.",
        });
      }

      const match = await findAutoDeployMatch({
        ecmOs: input.ecmOs,
        ecmPartNumbers: input.ecmPartNumbers,
        tcmOs: input.tcmOs,
        tcmPartNumbers: input.tcmPartNumbers,
        userAccessLevel: accessLevel,
      });

      // Log the attempt
      await insertAutoDeployLog({
        userId: ctx.user?.id ?? null,
        deviceId: null, // Could resolve from deviceSerial if needed
        deployType: match?.deployType ?? "ecm_only",
        comboId: match?.comboId ?? null,
        ecmCalibrationId: match?.ecmCalibration?.id ?? null,
        tcmCalibrationId: match?.tcmCalibration?.id ?? null,
        vehicleEcmOs: input.ecmOs ?? null,
        vehicleTcmOs: input.tcmOs ?? null,
        vehiclePartNumbers: JSON.stringify({
          ecm: input.ecmPartNumbers ?? [],
          tcm: input.tcmPartNumbers ?? [],
        }),
        userAccessLevel: accessLevel,
        result: match ? "success" : "no_match",
        resultMessage: match
          ? `Matched ${match.deployType}: ${[match.ecmCalibration?.fileName, match.tcmCalibration?.fileName].filter(Boolean).join(" + ")}`
          : "No matching auto-deploy calibration found for the given vehicle snapshot.",
      });

      if (!match) {
        return {
          found: false as const,
          message: "No matching auto-deploy calibration found. Check that calibrations are flagged for auto-deploy and the user has sufficient access level.",
        };
      }

      return {
        found: true as const,
        deployType: match.deployType,
        comboId: match.comboId,
        ecmCalibration: match.ecmCalibration,
        tcmCalibration: match.tcmCalibration,
      };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // Audit Log
  // ═══════════════════════════════════════════════════════════════════════

  listLogs: publicProcedure
    .input(z.object({
      userId: z.number().int().positive().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }).optional())
    .query(async ({ input }) => {
      return listAutoDeployLogs(input ?? undefined);
    }),
});
