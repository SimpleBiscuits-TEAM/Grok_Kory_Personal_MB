/**
 * Tasks Router — CRUD for task override persistence.
 *
 * The Tasks tab stores 316 default tasks in client-side taskData.ts.
 * This router persists user overrides (status changes, notes, section moves)
 * to the `task_overrides` DB table so they survive publishes and work across devices.
 */

import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { taskOverrides } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const tasksRouter = router({
  /**
   * Fetch all task overrides from the database.
   * Returns a flat array of { taskId, status, notes, sectionOverride, updatedAt }.
   * Client merges these on top of default task definitions.
   */
  getOverrides: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    try {
      const rows = await db.select().from(taskOverrides);
      return rows;
    } catch (err) {
      console.error("[Tasks] Failed to fetch overrides:", err);
      return [];
    }
  }),

  /**
   * Upsert a single task override.
   * Only non-null fields are written; null fields are left unchanged.
   * This is the main endpoint for status changes, notes edits, and section moves.
   */
  upsertOverride: publicProcedure
    .input(
      z.object({
        taskId: z.string().min(1).max(128),
        status: z.string().max(32).nullish(),
        notes: z.string().max(10000).nullish(),
        sectionOverride: z.string().max(64).nullish(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false, message: "Database not available" };

      try {
        // Build the values object — only include fields that were provided
        const values: Record<string, unknown> = { taskId: input.taskId };
        const updateSet: Record<string, unknown> = {};

        if (input.status !== undefined) {
          values.status = input.status ?? null;
          updateSet.status = input.status ?? null;
        }
        if (input.notes !== undefined) {
          values.notes = input.notes ?? null;
          updateSet.notes = input.notes ?? null;
        }
        if (input.sectionOverride !== undefined) {
          values.sectionOverride = input.sectionOverride ?? null;
          updateSet.sectionOverride = input.sectionOverride ?? null;
        }

        // If nothing to update, skip
        if (Object.keys(updateSet).length === 0) {
          return { success: true };
        }

        await db
          .insert(taskOverrides)
          .values(values as any)
          .onDuplicateKeyUpdate({ set: updateSet as any });

        return { success: true };
      } catch (err) {
        console.error("[Tasks] Failed to upsert override:", err);
        return { success: false, message: String(err) };
      }
    }),

  /**
   * Bulk upsert task overrides — used when migrating from localStorage to DB.
   * Accepts an array of overrides and writes them all.
   */
  bulkUpsert: publicProcedure
    .input(
      z.array(
        z.object({
          taskId: z.string().min(1).max(128),
          status: z.string().max(32).nullish(),
          notes: z.string().max(10000).nullish(),
          sectionOverride: z.string().max(64).nullish(),
        })
      )
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false, count: 0 };

      let count = 0;
      try {
        // Process in batches of 50 to avoid overwhelming the DB
        for (let i = 0; i < input.length; i += 50) {
          const batch = input.slice(i, i + 50);
          for (const item of batch) {
            const values: Record<string, unknown> = { taskId: item.taskId };
            const updateSet: Record<string, unknown> = {};

            if (item.status != null) {
              values.status = item.status;
              updateSet.status = item.status;
            }
            if (item.notes != null) {
              values.notes = item.notes;
              updateSet.notes = item.notes;
            }
            if (item.sectionOverride != null) {
              values.sectionOverride = item.sectionOverride;
              updateSet.sectionOverride = item.sectionOverride;
            }

            if (Object.keys(updateSet).length > 0) {
              await db
                .insert(taskOverrides)
                .values(values as any)
                .onDuplicateKeyUpdate({ set: updateSet as any });
              count++;
            }
          }
        }
        return { success: true, count };
      } catch (err) {
        console.error("[Tasks] Bulk upsert failed:", err);
        return { success: false, count };
      }
    }),

  /**
   * Reset all task overrides — deletes everything from the table.
   * Used when user clicks "Reset to defaults" in the Tasks tab.
   */
  resetAll: publicProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) return { success: false };
    try {
      await db.delete(taskOverrides);
      return { success: true };
    } catch (err) {
      console.error("[Tasks] Failed to reset overrides:", err);
      return { success: false };
    }
  }),
});
