/**
 * Offset Profiles Router
 * 
 * tRPC procedures for managing binary offset correction profiles
 * Stores offset corrections per ECU/vehicle type for future use
 */

import { router, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';
import { getDb } from '../db';
import { offsetProfiles, offsetCorrectionHistory } from '../../drizzle/schema_offsets';
import { eq, and } from 'drizzle-orm';

// Schema for offset profile validation
const offsetProfileSchema = z.object({
  ecuId: z.string().min(1, 'ECU ID required'),
  vehicleType: z.string().min(1, 'Vehicle type required'),
  offsetDelta: z.number().int('Offset must be integer'),
  tableSignaturesMatched: z.array(z.string()),
  confidence: z.number().min(0).max(100),
  notes: z.string().optional(),
});

export const offsetProfilesRouter = router({
  /**
   * Create or update an offset profile
   */
  createProfile: protectedProcedure
    .input(offsetProfileSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const id = `offset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = Date.now();

        await db.insert(offsetProfiles).values({
          id,
          userId: ctx.user.id,
          ecuId: input.ecuId,
          vehicleType: input.vehicleType,
          offsetDelta: input.offsetDelta,
          confidence: Math.round(input.confidence),
          tableSignaturesMatched: JSON.stringify(input.tableSignaturesMatched),
          notes: input.notes || null,
          createdAt: now,
          updatedAt: now,
        });

        return {
          success: true,
          message: 'Offset profile created',
          profileId: id,
        };
      } catch (error) {
        console.error('Error creating offset profile:', error);
        throw new Error('Failed to create offset profile');
      }
    }),

  /**
   * Get offset profile for a specific ECU/vehicle combination
   */
  getProfile: protectedProcedure
    .input(
      z.object({
        ecuId: z.string(),
        vehicleType: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const results = await db
          .select()
          .from(offsetProfiles)
          .where(
            and(
              eq(offsetProfiles.userId, ctx.user.id),
              eq(offsetProfiles.ecuId, input.ecuId),
              eq(offsetProfiles.vehicleType, input.vehicleType)
            )
          )
          .limit(1);

        if (!results || results.length === 0) {
          return null;
        }

        const profile = results[0];
        return {
          id: profile.id,
          ecuId: profile.ecuId,
          vehicleType: profile.vehicleType,
          offsetDelta: profile.offsetDelta,
          tableSignaturesMatched: JSON.parse(profile.tableSignaturesMatched),
          confidence: profile.confidence,
          notes: profile.notes,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        };
      } catch (error) {
        console.error('Error fetching offset profile:', error);
        throw new Error('Failed to fetch offset profile');
      }
    }),

  /**
   * List all offset profiles for the current user
   */
  listProfiles: protectedProcedure.query(async ({ ctx }) => {
    try {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const profiles = await db
        .select()
        .from(offsetProfiles)
        .where(eq(offsetProfiles.userId, ctx.user.id));

      return profiles.map((profile) => ({
        id: profile.id,
        ecuId: profile.ecuId,
        vehicleType: profile.vehicleType,
        offsetDelta: profile.offsetDelta,
        tableSignaturesMatched: JSON.parse(profile.tableSignaturesMatched),
        confidence: profile.confidence,
        notes: profile.notes,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      }));
    } catch (error) {
      console.error('Error listing offset profiles:', error);
      throw new Error('Failed to list offset profiles');
    }
  }),

  /**
   * Delete an offset profile
   */
  deleteProfile: protectedProcedure
    .input(z.object({ profileId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        // Verify ownership
        const results = await db
          .select()
          .from(offsetProfiles)
          .where(
            and(
              eq(offsetProfiles.id, input.profileId),
              eq(offsetProfiles.userId, ctx.user.id)
            )
          )
          .limit(1);

        if (!results || results.length === 0) {
          throw new Error('Profile not found or unauthorized');
        }

        await db.delete(offsetProfiles).where(eq(offsetProfiles.id, input.profileId));

        return {
          success: true,
          message: 'Offset profile deleted',
        };
      } catch (error) {
        console.error('Error deleting offset profile:', error);
        throw new Error('Failed to delete offset profile');
      }
    }),

  /**
   * Get offset correction history for audit trail
   */
  getHistory: protectedProcedure
    .input(
      z.object({
        ecuId: z.string(),
        limit: z.number().default(10),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const history = await db
          .select()
          .from(offsetCorrectionHistory)
          .where(
            and(
              eq(offsetCorrectionHistory.userId, ctx.user.id),
              eq(offsetCorrectionHistory.ecuId, input.ecuId)
            )
          )
          .limit(input.limit);

        return history.map((h) => ({
          id: h.id,
          ecuId: h.ecuId,
          vehicleType: h.vehicleType,
          offsetDelta: h.offsetDelta,
          confidence: h.confidence,
          appliedAt: h.appliedAt,
          status: h.status,
          notes: h.notes,
        }));
      } catch (error) {
        console.error('Error fetching offset history:', error);
        throw new Error('Failed to fetch offset history');
      }
    }),

  /**
   * Record offset correction application
   */
  recordCorrection: protectedProcedure
    .input(
      z.object({
        ecuId: z.string(),
        vehicleType: z.string(),
        offsetDelta: z.number(),
        confidence: z.number(),
        status: z.enum(['applied', 'failed', 'manual']),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const id = `offset_hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        await db.insert(offsetCorrectionHistory).values({
          id,
          userId: ctx.user.id,
          ecuId: input.ecuId,
          vehicleType: input.vehicleType,
          offsetDelta: input.offsetDelta,
          confidence: Math.round(input.confidence),
          status: input.status,
          notes: input.notes || null,
          appliedAt: Date.now(),
        });

        return {
          success: true,
          message: 'Offset correction recorded',
        };
      } catch (error) {
        console.error('Error recording offset correction:', error);
        throw new Error('Failed to record offset correction');
      }
    }),

  /**
   * Search for similar ECUs to find applicable offset profiles
   */
  findSimilarProfiles: protectedProcedure
    .input(
      z.object({
        ecuId: z.string(),
        vehicleType: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        // Find profiles with similar ECU ID or vehicle type
        const profiles = await db
          .select()
          .from(offsetProfiles)
          .where(eq(offsetProfiles.userId, ctx.user.id));

        return profiles
          .map((profile) => ({
            id: profile.id,
            ecuId: profile.ecuId,
            vehicleType: profile.vehicleType,
            offsetDelta: profile.offsetDelta,
            confidence: profile.confidence,
            similarity: calculateSimilarity(input.ecuId, profile.ecuId),
          }))
          .filter((p) => p.similarity > 50)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5);
      } catch (error) {
        console.error('Error finding similar profiles:', error);
        throw new Error('Failed to find similar profiles');
      }
    }),
});

/**
 * Calculate string similarity (Levenshtein distance)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 100;

  const editDistance = getEditDistance(longer, shorter);
  return ((longer.length - editDistance) / longer.length) * 100;
}

/**
 * Calculate Levenshtein distance
 */
function getEditDistance(s1: string, s2: string): number {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}
