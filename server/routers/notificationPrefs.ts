import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { userNotificationPrefs } from '../../drizzle/schema_qa';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';

export const notificationPrefsRouter = router({
  // ── Get current user's preferences ────────────────────────────────────────
  get: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const [prefs] = await db.select().from(userNotificationPrefs)
        .where(eq(userNotificationPrefs.userId, ctx.user.id))
        .limit(1);

      // Return defaults if no prefs saved yet
      if (!prefs) {
        return {
          enablePush: true,
          enableWhatsNew: true,
          minPriority: 'low' as const,
          mutedUntil: null,
        };
      }

      return {
        enablePush: prefs.enablePush,
        enableWhatsNew: prefs.enableWhatsNew,
        minPriority: prefs.minPriority,
        mutedUntil: prefs.mutedUntil,
      };
    }),

  // ── Update preferences ────────────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({
      enablePush: z.boolean().optional(),
      enableWhatsNew: z.boolean().optional(),
      minPriority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      mutedUntil: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const now = Date.now();

      // Check if prefs exist
      const [existing] = await db.select({ id: userNotificationPrefs.id })
        .from(userNotificationPrefs)
        .where(eq(userNotificationPrefs.userId, ctx.user.id))
        .limit(1);

      if (existing) {
        const updateSet: Record<string, unknown> = { updatedAt: now };
        if (input.enablePush !== undefined) updateSet.enablePush = input.enablePush;
        if (input.enableWhatsNew !== undefined) updateSet.enableWhatsNew = input.enableWhatsNew;
        if (input.minPriority !== undefined) updateSet.minPriority = input.minPriority;
        if (input.mutedUntil !== undefined) updateSet.mutedUntil = input.mutedUntil;

        await db.update(userNotificationPrefs)
          .set(updateSet)
          .where(eq(userNotificationPrefs.userId, ctx.user.id));
      } else {
        await db.insert(userNotificationPrefs).values({
          userId: ctx.user.id,
          enablePush: input.enablePush ?? true,
          enableWhatsNew: input.enableWhatsNew ?? true,
          minPriority: input.minPriority ?? 'low',
          mutedUntil: input.mutedUntil ?? null,
          updatedAt: now,
        });
      }

      return { success: true };
    }),

  // ── Mute notifications temporarily ────────────────────────────────────────
  mute: protectedProcedure
    .input(z.object({
      duration: z.enum(['1h', '8h', '24h', '7d', 'forever']),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const now = Date.now();
      const durations: Record<string, number | null> = {
        '1h': now + 3600000,
        '8h': now + 28800000,
        '24h': now + 86400000,
        '7d': now + 604800000,
        'forever': null, // null means muted forever — use enablePush = false
      };

      const mutedUntil = durations[input.duration];

      // Check if prefs exist
      const [existing] = await db.select({ id: userNotificationPrefs.id })
        .from(userNotificationPrefs)
        .where(eq(userNotificationPrefs.userId, ctx.user.id))
        .limit(1);

      if (input.duration === 'forever') {
        if (existing) {
          await db.update(userNotificationPrefs)
            .set({ enablePush: false, mutedUntil: null, updatedAt: now })
            .where(eq(userNotificationPrefs.userId, ctx.user.id));
        } else {
          await db.insert(userNotificationPrefs).values({
            userId: ctx.user.id,
            enablePush: false,
            enableWhatsNew: true,
            minPriority: 'low',
            mutedUntil: null,
            updatedAt: now,
          });
        }
      } else {
        if (existing) {
          await db.update(userNotificationPrefs)
            .set({ mutedUntil, updatedAt: now })
            .where(eq(userNotificationPrefs.userId, ctx.user.id));
        } else {
          await db.insert(userNotificationPrefs).values({
            userId: ctx.user.id,
            enablePush: true,
            enableWhatsNew: true,
            minPriority: 'low',
            mutedUntil,
            updatedAt: now,
          });
        }
      }

      return { success: true, mutedUntil };
    }),

  // ── Unmute ────────────────────────────────────────────────────────────────
  unmute: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.update(userNotificationPrefs)
        .set({ enablePush: true, mutedUntil: null, updatedAt: Date.now() })
        .where(eq(userNotificationPrefs.userId, ctx.user.id));

      return { success: true };
    }),
});
