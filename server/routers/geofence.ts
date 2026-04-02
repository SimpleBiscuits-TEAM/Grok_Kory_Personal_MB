/**
 * Geofence Router — Admin management of geographical restriction zones.
 * 
 * Zones define polygons where tune upload/download is blocked.
 * Super admins (GOD MODE) can create overrides for specific users.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  listGeofenceZones,
  createGeofenceZone,
  updateGeofenceZone,
  deleteGeofenceZone,
  listGeofenceOverrides,
  createGeofenceOverride,
  deleteGeofenceOverride,
} from "../db";

const adminGuard = (role: string) => {
  if (role !== "admin" && role !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
};

const superAdminGuard = (role: string) => {
  if (role !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "GOD MODE (super_admin) required" });
  }
};

const coordSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const geofenceRouter = router({
  // ── Zones ──────────────────────────────────────────────────────────────

  /** List all geofence zones (admin only) */
  listZones: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      adminGuard(ctx.user.role);
      return listGeofenceZones(input?.activeOnly ?? false);
    }),

  /** Create a new geofence zone (admin only) */
  createZone: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().max(2000).optional(),
      restrictionType: z.enum(["block_upload", "block_download", "block_both"]),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      polygon: z.array(coordSchema).min(3).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      adminGuard(ctx.user.role);
      const id = await createGeofenceZone({
        name: input.name,
        description: input.description,
        restrictionType: input.restrictionType,
        color: input.color,
        polygon: input.polygon,
        createdBy: ctx.user.id,
      });
      if (!id) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create zone" });
      }
      return { id, success: true };
    }),

  /** Update a geofence zone (admin only) */
  updateZone: protectedProcedure
    .input(z.object({
      zoneId: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().max(2000).nullable().optional(),
      restrictionType: z.enum(["block_upload", "block_download", "block_both"]).optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      polygon: z.array(coordSchema).min(3).max(100).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      adminGuard(ctx.user.role);
      const { zoneId, ...data } = input;
      const ok = await updateGeofenceZone(zoneId, data);
      if (!ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update zone" });
      }
      return { success: true };
    }),

  /** Delete a geofence zone (admin only) */
  deleteZone: protectedProcedure
    .input(z.object({ zoneId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      adminGuard(ctx.user.role);
      const ok = await deleteGeofenceZone(input.zoneId);
      if (!ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to delete zone" });
      }
      return { success: true };
    }),

  // ── User Overrides (GOD MODE — super_admin only) ──────────────────────

  /** List all user overrides (super_admin only) */
  listOverrides: protectedProcedure
    .input(z.object({ userId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      superAdminGuard(ctx.user.role);
      return listGeofenceOverrides(input?.userId);
    }),

  /** Create a user override — exempt or enforce (super_admin only) */
  createOverride: protectedProcedure
    .input(z.object({
      userId: z.number(),
      zoneId: z.number().optional(),
      overrideType: z.enum(["exempt", "enforce"]),
      reason: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      superAdminGuard(ctx.user.role);
      const ok = await createGeofenceOverride({
        userId: input.userId,
        zoneId: input.zoneId,
        overrideType: input.overrideType,
        reason: input.reason,
        grantedBy: ctx.user.id,
      });
      if (!ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create override" });
      }
      return { success: true };
    }),

  /** Delete a user override (super_admin only) */
  deleteOverride: protectedProcedure
    .input(z.object({ overrideId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      superAdminGuard(ctx.user.role);
      const ok = await deleteGeofenceOverride(input.overrideId);
      if (!ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to delete override" });
      }
      return { success: true };
    }),
});
