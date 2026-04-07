/**
 * Tune Deploy — tRPC surface for library search, device management, and tune assignment.
 *
 * Device targeting: register V-OP or PCAN devices by serial number,
 * then assign calibrations from the library to specific devices.
 * When a device connects, query pending assignments to deploy the matching tune.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
// DEV BYPASS: use publicProcedure for all routes during development
import { publicProcedure, router } from "../_core/trpc";
import {
  tuneDeployListInputSchema,
  tuneDeployVehicleSnapshotSchema,
} from "../../shared/tuneDeploySchemas";
import {
  deleteTuneDeployCalibration,
  listTuneDeployCalibrations,
  suggestTuneDeployMatches,
  listDevices,
  insertDevice,
  updateDevice,
  deleteDevice,
  listAssignments,
  createAssignment,
  updateAssignmentStatus,
  deleteAssignment,
} from "../tuneDeployDb";

export const tuneDeployRouter = router({
  // ── Calibration Library ──────────────────────────────────────────────────
  list: publicProcedure.input(tuneDeployListInputSchema).query(async ({ input }) => {
    return listTuneDeployCalibrations(input);
  }),

  suggestMatches: publicProcedure
    .input(tuneDeployVehicleSnapshotSchema.extend({ limit: z.number().min(1).max(50).optional() }))
    .query(async ({ input }) => {
      const matches = await suggestTuneDeployMatches({
        ecuOs: input.ecuOs,
        calibrationPartNumbers: input.calibrationPartNumbers,
        limit: input.limit,
      });
      return { matches };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const ok = await deleteTuneDeployCalibration(input.id);
      if (!ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to delete calibration" });
      }
      return { ok: true as const };
    }),

  // ── Device Management ────────────────────────────────────────────────────
  listDevices: publicProcedure.query(async () => {
    return listDevices();
  }),

  addDevice: publicProcedure
    .input(
      z.object({
        deviceType: z.enum(["vop", "pcan"]),
        serialNumber: z.string().min(1).max(128).transform((s) => s.trim().toUpperCase()),
        label: z.string().max(255).optional(),
        vehicleDescription: z.string().max(512).optional(),
        vin: z.string().max(17).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = await insertDevice({
        deviceType: input.deviceType,
        serialNumber: input.serialNumber,
        label: input.label ?? null,
        vehicleDescription: input.vehicleDescription ?? null,
        vin: input.vin ?? null,
      });
      if (id == null) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to register device. Serial number may already exist.",
        });
      }
      return { ok: true as const, id };
    }),

  updateDevice: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        label: z.string().max(255).optional(),
        vehicleDescription: z.string().max(512).optional(),
        vin: z.string().max(17).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      const ok = await updateDevice(id, updates);
      if (!ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update device" });
      }
      return { ok: true as const };
    }),

  deleteDevice: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const ok = await deleteDevice(input.id);
      if (!ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to delete device" });
      }
      return { ok: true as const };
    }),

  // ── Tune Assignments (calibration → device) ──────────────────────────────
  listAssignments: publicProcedure
    .input(
      z.object({
        deviceId: z.number().int().positive().optional(),
        calibrationId: z.number().int().positive().optional(),
        status: z.enum(["pending", "deployed", "failed", "cancelled"]).optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      return listAssignments(input ?? {});
    }),

  assignTune: publicProcedure
    .input(
      z.object({
        calibrationId: z.number().int().positive(),
        deviceId: z.number().int().positive(),
        notes: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = await createAssignment({
        calibrationId: input.calibrationId,
        deviceId: input.deviceId,
        notes: input.notes,
      });
      if (id == null) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create assignment" });
      }
      return { ok: true as const, id };
    }),

  updateAssignment: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["pending", "deployed", "failed", "cancelled"]),
      })
    )
    .mutation(async ({ input }) => {
      const deployedAt = input.status === "deployed" ? new Date() : undefined;
      const ok = await updateAssignmentStatus(input.id, input.status, deployedAt);
      if (!ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update assignment" });
      }
      return { ok: true as const };
    }),

  deleteAssignment: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const ok = await deleteAssignment(input.id);
      if (!ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to delete assignment" });
      }
      return { ok: true as const };
    }),
});
