/**
 * Access Management Router
 * 
 * Handles user access control for the Advanced panel:
 * - Users can request access
 * - Users can check their own access status
 * - Admins can list all users with access info
 * - Admins can approve/revoke advanced access
 * - Super admins can change user roles (promote to admin, demote to user)
 */

import { z } from 'zod';
import { eq, desc, like, or, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure, superAdminProcedure } from '../_core/trpc';
import { getDb } from '../db';
import { users } from '../../drizzle/schema';
import { notifyOwner } from '../_core/notification';

export const accessManagementRouter = router({
  // ── Public: Check own access status ──────────────────────────────────────
  myAccess: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

    const [user] = await db.select({
      role: users.role,
      advancedAccess: users.advancedAccess,
      accessLevel: users.accessLevel,
    }).from(users).where(eq(users.id, ctx.user.id)).limit(1);

    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

    return {
      role: user.role,
      advancedAccess: user.advancedAccess,
      accessLevel: user.accessLevel,
      canAccessAdvanced: user.role === 'super_admin' || user.role === 'admin' || user.advancedAccess === 'approved',
    };
  }),

  // ── Public: Request access to Advanced ───────────────────────────────────
  requestAccess: protectedProcedure
    .input(z.object({
      reason: z.string().min(10, 'Please provide at least a brief reason').max(2000).optional(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

    // Check current status
    const [user] = await db.select({
      advancedAccess: users.advancedAccess,
      role: users.role,
    }).from(users).where(eq(users.id, ctx.user.id)).limit(1);

    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

    // Already has access
    if (user.role === 'super_admin' || user.role === 'admin' || user.advancedAccess === 'approved') {
      return { status: 'already_approved' as const };
    }

    // Already pending
    if (user.advancedAccess === 'pending') {
      return { status: 'already_pending' as const };
    }

    // Set to pending with reason
    await db.update(users)
      .set({
        advancedAccess: 'pending',
        accessRequestReason: input?.reason || null,
      })
      .where(eq(users.id, ctx.user.id));

    // Notify owner about new access request
    try {
      const reasonText = input?.reason ? `\n\nReason: ${input.reason}` : '';
      await notifyOwner({
        title: `Access Request: ${ctx.user.name || ctx.user.email}`,
        content: `${ctx.user.name || 'Unknown'} (${ctx.user.email || 'no email'}) has requested access to V-OP Pro.${reasonText}\n\nReview in the User Management panel.`,
      });
    } catch {
      console.warn('[Access] Owner notification failed, but request was saved');
    }

    return { status: 'requested' as const };
  }),

  // ── Admin: List all users with access info ───────────────────────────────
  listUsers: adminProcedure
    .input(z.object({
      search: z.string().optional(),
      filter: z.enum(['all', 'pending', 'approved', 'revoked', 'admin', 'none']).default('all'),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      const conditions = [];

      // Search filter
      if (input.search && input.search.trim()) {
        const term = `%${input.search.trim()}%`;
        conditions.push(or(
          like(users.name, term),
          like(users.email, term),
        ));
      }

      // Status filter
      if (input.filter === 'pending') {
        conditions.push(eq(users.advancedAccess, 'pending'));
      } else if (input.filter === 'approved') {
        conditions.push(eq(users.advancedAccess, 'approved'));
      } else if (input.filter === 'revoked') {
        conditions.push(eq(users.advancedAccess, 'revoked'));
      } else if (input.filter === 'admin') {
        conditions.push(or(eq(users.role, 'admin'), eq(users.role, 'super_admin')));
      } else if (input.filter === 'none') {
        conditions.push(eq(users.advancedAccess, 'none'));
      }

      const whereClause = conditions.length > 0
        ? sql`${conditions.reduce((acc, cond, i) => i === 0 ? cond! : sql`${acc} AND ${cond}`)}`
        : undefined;

      const result = await db.select({
        id: users.id,
        openId: users.openId,
        name: users.name,
        email: users.email,
        role: users.role,
        advancedAccess: users.advancedAccess,
        accessLevel: users.accessLevel,
        accessApprovedBy: users.accessApprovedBy,
        accessApprovedAt: users.accessApprovedAt,
        accessRequestReason: users.accessRequestReason,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn,
      })
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.lastSignedIn))
        .limit(input.limit)
        .offset(input.offset);

      // Get total count
      const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(users)
        .where(whereClause);

      // Get pending count for badge
      const [pendingResult] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(users)
        .where(eq(users.advancedAccess, 'pending'));

      return {
        users: result,
        total: Number(countResult?.count ?? 0),
        pendingCount: Number(pendingResult?.count ?? 0),
      };
    }),

  // ── Admin: Approve advanced access ───────────────────────────────────────
  approveAccess: adminProcedure
    .input(z.object({
      userId: z.number(),
      accessLevel: z.number().min(1).max(3).default(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      // Can't modify super_admin
      const [target] = await db.select({ role: users.role, name: users.name })
        .from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      if (target.role === 'super_admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot modify super admin' });

      await db.update(users).set({
        advancedAccess: 'approved',
        accessLevel: input.accessLevel,
        accessApprovedBy: ctx.user.id,
        accessApprovedAt: new Date(),
      }).where(eq(users.id, input.userId));

      return { success: true, userName: target.name };
    }),

  // ── Admin: Revoke advanced access ────────────────────────────────────────
  revokeAccess: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      const [target] = await db.select({ role: users.role, name: users.name })
        .from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      if (target.role === 'super_admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot modify super admin' });

      await db.update(users).set({
        advancedAccess: 'revoked',
        accessLevel: 0,
        accessApprovedBy: ctx.user.id,
        accessApprovedAt: new Date(),
      }).where(eq(users.id, input.userId));

      return { success: true, userName: target.name };
    }),

  // ── Admin: Update access level ───────────────────────────────────────────
  setAccessLevel: adminProcedure
    .input(z.object({
      userId: z.number(),
      accessLevel: z.number().min(0).max(3),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      const [target] = await db.select({ role: users.role })
        .from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      if (target.role === 'super_admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot modify super admin' });

      await db.update(users).set({
        accessLevel: input.accessLevel,
        accessApprovedBy: ctx.user.id,
        accessApprovedAt: new Date(),
      }).where(eq(users.id, input.userId));

      return { success: true };
    }),

  // ── Super Admin: Set user role ───────────────────────────────────────────
  setRole: superAdminProcedure
    .input(z.object({
      userId: z.number(),
      role: z.enum(['user', 'admin']),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      // Can't change own role or other super_admins
      const [target] = await db.select({ role: users.role, name: users.name })
        .from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      if (target.role === 'super_admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot modify super admin role' });

      const updateData: Record<string, unknown> = { role: input.role };

      // If promoting to admin, also approve advanced access
      if (input.role === 'admin') {
        updateData.advancedAccess = 'approved';
        updateData.accessLevel = 3;
        updateData.accessApprovedBy = ctx.user.id;
        updateData.accessApprovedAt = new Date();
      }

      await db.update(users).set(updateData).where(eq(users.id, input.userId));

      return { success: true, userName: target.name, newRole: input.role };
    }),

  // ── Admin: Get access stats ──────────────────────────────────────────────
  stats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

    const [total] = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
    const [pending] = await db.select({ count: sql<number>`COUNT(*)` }).from(users).where(eq(users.advancedAccess, 'pending'));
    const [approved] = await db.select({ count: sql<number>`COUNT(*)` }).from(users).where(eq(users.advancedAccess, 'approved'));
    const [admins] = await db.select({ count: sql<number>`COUNT(*)` }).from(users).where(or(eq(users.role, 'admin'), eq(users.role, 'super_admin')));

    return {
      totalUsers: Number(total?.count ?? 0),
      pendingRequests: Number(pending?.count ?? 0),
      approvedUsers: Number(approved?.count ?? 0),
      adminCount: Number(admins?.count ?? 0),
    };
  }),
});
