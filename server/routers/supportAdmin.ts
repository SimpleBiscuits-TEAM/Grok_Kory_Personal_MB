/**
 * Support Admin Router
 * Super-admin only endpoints for managing feedback, support sessions, and customer interactions.
 * This powers the PPEI Support Admin Panel.
 */

import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { getDb } from '../db';
import { feedback, adminConversations, adminMessages, users } from '../../drizzle/schema';
import { supportSessions, supportMetrics } from '../../drizzle/schema_projects';
import { eq, desc, and, like, sql, count } from 'drizzle-orm';

// Super admin guard
const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user?.role !== 'super_admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the owner can access the Support Admin Panel',
    });
  }
  return next({ ctx });
});

export const supportAdminRouter = router({
  // ── Dashboard Stats ──────────────────────────────────────────────────────
  getDashboardStats: superAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

    const [feedbackCount] = await db.select({ count: count() }).from(feedback);
    const [sessionCount] = await db.select({ count: count() }).from(supportSessions);
    const [activeSessionCount] = await db
      .select({ count: count() })
      .from(supportSessions)
      .where(eq(supportSessions.status, 'active'));
    const [conversationCount] = await db.select({ count: count() }).from(adminConversations);
    const [unreadCount] = await db
      .select({ count: count() })
      .from(adminConversations)
      .where(eq(adminConversations.isRead, false));
    const [userCount] = await db.select({ count: count() }).from(users);

    return {
      totalFeedback: feedbackCount?.count ?? 0,
      totalSessions: sessionCount?.count ?? 0,
      activeSessions: activeSessionCount?.count ?? 0,
      totalConversations: conversationCount?.count ?? 0,
      unreadConversations: unreadCount?.count ?? 0,
      totalUsers: userCount?.count ?? 0,
    };
  }),

  // ── Feedback Management ──────────────────────────────────────────────────
  listFeedback: superAdminProcedure
    .input(
      z.object({
        type: z.enum(['feedback', 'error']).optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      let conditions: any[] = [];
      if (input.type) conditions.push(eq(feedback.type, input.type));
      if (input.search?.trim()) {
        const term = `%${input.search.trim()}%`;
        conditions.push(like(feedback.message, term));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const items = await db
        .select()
        .from(feedback)
        .where(where)
        .orderBy(desc(feedback.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [total] = await db.select({ count: count() }).from(feedback).where(where);

      return {
        items,
        total: total?.count ?? 0,
      };
    }),

  // ── Support Session Management ───────────────────────────────────────────
  listSessions: superAdminProcedure
    .input(
      z.object({
        status: z.enum(['active', 'ended', 'expired']).optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      let conditions: any[] = [];
      if (input.status) conditions.push(eq(supportSessions.status, input.status));
      if (input.search?.trim()) {
        const term = `%${input.search.trim()}%`;
        conditions.push(like(supportSessions.customerName, term));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const items = await db
        .select()
        .from(supportSessions)
        .where(where)
        .orderBy(desc(supportSessions.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [total] = await db.select({ count: count() }).from(supportSessions).where(where);

      return {
        items,
        total: total?.count ?? 0,
      };
    }),

  // ── Conversations & Chat ─────────────────────────────────────────────────
  listConversations: superAdminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      let conditions: any[] = [];
      if (input.search?.trim()) {
        const term = `%${input.search.trim()}%`;
        conditions.push(like(adminConversations.subject, term));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const conversations = await db
        .select({
          id: adminConversations.id,
          userId: adminConversations.userId,
          adminId: adminConversations.adminId,
          subject: adminConversations.subject,
          isActive: adminConversations.isActive,
          isRead: adminConversations.isRead,
          lastMessageAt: adminConversations.lastMessageAt,
          createdAt: adminConversations.createdAt,
        })
        .from(adminConversations)
        .where(where)
        .orderBy(desc(adminConversations.lastMessageAt))
        .limit(input.limit)
        .offset(input.offset);

      const [total] = await db.select({ count: count() }).from(adminConversations).where(where);

      return {
        conversations,
        total: total?.count ?? 0,
      };
    }),

  getConversationMessages: superAdminProcedure
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        limit: z.number().min(1).max(200).default(100),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      const messages = await db
        .select()
        .from(adminMessages)
        .where(eq(adminMessages.conversationId, input.conversationId))
        .orderBy(adminMessages.createdAt)
        .limit(input.limit);

      return { messages };
    }),

  sendMessage: superAdminProcedure
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        content: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      await db.insert(adminMessages).values({
        conversationId: input.conversationId,
        senderId: ctx.user!.id!,
        senderType: 'admin',
        content: input.content,
      });

      await db
        .update(adminConversations)
        .set({ lastMessageAt: new Date(), isRead: true })
        .where(eq(adminConversations.id, input.conversationId));

      return { success: true };
    }),

  startConversation: superAdminProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        subject: z.string().min(1).max(255),
        initialMessage: z.string().min(1).max(5000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      const result = await db.insert(adminConversations).values({
        userId: input.userId,
        adminId: ctx.user!.id!,
        subject: input.subject,
        isActive: true,
        isRead: true,
      });

      const conversationId = result[0].insertId;

      if (input.initialMessage) {
        await db.insert(adminMessages).values({
          conversationId,
          senderId: ctx.user!.id!,
          senderType: 'admin',
          content: input.initialMessage,
        });
      }

      return { success: true, conversationId };
    }),

  // ── User List (for starting new conversations) ───────────────────────────
  listUsers: superAdminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      let conditions: any[] = [];
      if (input.search?.trim()) {
        const term = `%${input.search.trim()}%`;
        conditions.push(like(users.name, term));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const userList = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(input.limit);

      return { users: userList };
    }),
});
