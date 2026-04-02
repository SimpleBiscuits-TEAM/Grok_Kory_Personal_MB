import { z } from 'zod';
import { adminProcedure, protectedProcedure, router } from '../_core/trpc';
import { adminNotifications, notificationDeliveries } from '../../drizzle/schema_notifications';
import { users } from '../../drizzle/schema';
import { eq, and, desc, sql, ne } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

export const notificationsRouter = router({
  // ── Admin: Create notification ──────────────────────────────────────────
  create: adminProcedure
    .input(z.object({
      title: z.string().min(1).max(255),
      message: z.string().min(1).max(5000),
      description: z.string().max(10000).optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
      targetAudience: z.enum(['all', 'admins', 'users']).default('all'),
      actionLabel: z.string().max(255).optional(),
      actionUrl: z.string().max(512).optional(),
      expiresAt: z.number().optional(),
      scheduledFor: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const id = `notif_${uuidv4()}`;
      const now = Date.now();
      const status = input.scheduledFor ? 'scheduled' as const : 'draft' as const;

      await db.insert(adminNotifications).values({
        id,
        title: input.title,
        message: input.message,
        description: input.description || null,
        priority: input.priority,
        status,
        createdBy: ctx.user.id,
        createdAt: now,
        scheduledFor: input.scheduledFor || null,
        sentAt: null,
        expiresAt: input.expiresAt || null,
        actionLabel: input.actionLabel || null,
        actionUrl: input.actionUrl || null,
        targetAudience: input.targetAudience,
      });

      return { id, status };
    }),

  // ── Admin: Send notification to all users ───────────────────────────────
  send: adminProcedure
    .input(z.object({
      notificationId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Get the notification
      const notifRows = await db.select().from(adminNotifications)
        .where(eq(adminNotifications.id, input.notificationId))
        .limit(1);

      if (!notifRows.length) throw new Error('Notification not found');
      const notif = notifRows[0];

      if (notif.status === 'sent') throw new Error('Notification already sent');

      // Get target users based on audience
      let targetUsers;
      if (notif.targetAudience === 'admins') {
        targetUsers = await db.select({ id: users.id }).from(users)
          .where(eq(users.role, 'admin'));
      } else if (notif.targetAudience === 'users') {
        targetUsers = await db.select({ id: users.id }).from(users)
          .where(eq(users.role, 'user'));
      } else {
        // all
        targetUsers = await db.select({ id: users.id }).from(users);
      }

      const now = Date.now();

      // Create delivery records for each user
      let sent = 0;
      let failed = 0;

      for (const user of targetUsers) {
        try {
          const deliveryId = `del_${uuidv4()}`;
          await db.insert(notificationDeliveries).values({
            id: deliveryId,
            notificationId: input.notificationId,
            userId: user.id,
            status: 'delivered',
            deliveredAt: now,
            readAt: null,
            dismissedAt: null,
            actionClickedAt: null,
          });
          sent++;
        } catch (err) {
          console.error(`[Notifications] Failed to deliver to user ${user.id}:`, err);
          failed++;
        }
      }

      // Update notification status
      await db.update(adminNotifications)
        .set({ status: 'sent', sentAt: now })
        .where(eq(adminNotifications.id, input.notificationId));

      return { sent, failed, total: targetUsers.length };
    }),

  // ── Admin: Create and send in one step ──────────────────────────────────
  createAndSend: adminProcedure
    .input(z.object({
      title: z.string().min(1).max(255),
      message: z.string().min(1).max(5000),
      description: z.string().max(10000).optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
      targetAudience: z.enum(['all', 'admins', 'users']).default('all'),
      actionLabel: z.string().max(255).optional(),
      actionUrl: z.string().max(512).optional(),
      expiresAt: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const id = `notif_${uuidv4()}`;
      const now = Date.now();

      // Create notification
      await db.insert(adminNotifications).values({
        id,
        title: input.title,
        message: input.message,
        description: input.description || null,
        priority: input.priority,
        status: 'sent',
        createdBy: ctx.user.id,
        createdAt: now,
        scheduledFor: null,
        sentAt: now,
        expiresAt: input.expiresAt || null,
        actionLabel: input.actionLabel || null,
        actionUrl: input.actionUrl || null,
        targetAudience: input.targetAudience,
      });

      // Get target users
      let targetUsers;
      if (input.targetAudience === 'admins') {
        targetUsers = await db.select({ id: users.id }).from(users)
          .where(eq(users.role, 'admin'));
      } else if (input.targetAudience === 'users') {
        targetUsers = await db.select({ id: users.id }).from(users)
          .where(eq(users.role, 'user'));
      } else {
        targetUsers = await db.select({ id: users.id }).from(users);
      }

      // Create delivery records
      let sent = 0;
      for (const user of targetUsers) {
        try {
          await db.insert(notificationDeliveries).values({
            id: `del_${uuidv4()}`,
            notificationId: id,
            userId: user.id,
            status: 'delivered',
            deliveredAt: now,
            readAt: null,
            dismissedAt: null,
            actionClickedAt: null,
          });
          sent++;
        } catch (err) {
          console.error(`[Notifications] Failed to deliver to user ${user.id}:`, err);
        }
      }

      return { id, sent, total: targetUsers.length };
    }),

  // ── Admin: List all notifications ───────────────────────────────────────
  list: adminProcedure
    .input(z.object({
      status: z.enum(['draft', 'scheduled', 'sent', 'archived']).optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const conditions = input.status
        ? eq(adminNotifications.status, input.status)
        : undefined;

      const results = await db.select().from(adminNotifications)
        .where(conditions)
        .orderBy(desc(adminNotifications.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return results;
    }),

  // ── Admin: Get notification analytics ───────────────────────────────────
  analytics: adminProcedure
    .input(z.object({
      notificationId: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const deliveries = await db.select().from(notificationDeliveries)
        .where(eq(notificationDeliveries.notificationId, input.notificationId));

      const totalSent = deliveries.length;
      const totalDelivered = deliveries.filter(d => d.status !== 'pending').length;
      const totalRead = deliveries.filter(d => d.readAt !== null).length;
      const totalDismissed = deliveries.filter(d => d.dismissedAt !== null).length;
      const totalActionClicked = deliveries.filter(d => d.actionClickedAt !== null).length;

      return {
        totalSent,
        totalDelivered,
        totalRead,
        totalDismissed,
        totalActionClicked,
        deliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
        readRate: totalDelivered > 0 ? Math.round((totalRead / totalDelivered) * 100) : 0,
        engagementRate: totalDelivered > 0
          ? Math.round(((totalRead + totalActionClicked) / totalDelivered) * 100)
          : 0,
      };
    }),

  // ── Admin: Archive notification ─────────────────────────────────────────
  archive: adminProcedure
    .input(z.object({ notificationId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.update(adminNotifications)
        .set({ status: 'archived' })
        .where(eq(adminNotifications.id, input.notificationId));

      return { success: true };
    }),

  // ── Admin: Delete notification ──────────────────────────────────────────
  delete: adminProcedure
    .input(z.object({ notificationId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Delete deliveries first
      await db.delete(notificationDeliveries)
        .where(eq(notificationDeliveries.notificationId, input.notificationId));

      // Delete notification
      await db.delete(adminNotifications)
        .where(eq(adminNotifications.id, input.notificationId));

      return { success: true };
    }),

  // ── User: Get my notifications ──────────────────────────────────────────
  myNotifications: protectedProcedure
    .input(z.object({
      limit: z.number().default(20),
      includeRead: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Get deliveries for this user
      const conditions = input.includeRead
        ? eq(notificationDeliveries.userId, ctx.user.id)
        : and(
            eq(notificationDeliveries.userId, ctx.user.id),
            ne(notificationDeliveries.status, 'dismissed')
          );

      const deliveries = await db.select().from(notificationDeliveries)
        .where(conditions)
        .orderBy(desc(notificationDeliveries.deliveredAt))
        .limit(input.limit);

      if (!deliveries.length) return [];

      // Get the actual notification content
      const notifIds = Array.from(new Set(deliveries.map(d => d.notificationId)));
      const notifications = [];

      for (const nId of notifIds) {
        const rows = await db.select().from(adminNotifications)
          .where(eq(adminNotifications.id, nId))
          .limit(1);
        if (rows.length) {
          const delivery = deliveries.find(d => d.notificationId === nId);
          notifications.push({
            ...rows[0],
            delivery: delivery || null,
          });
        }
      }

      // Filter expired
      const now = Date.now();
      return notifications.filter(n => !n.expiresAt || n.expiresAt > now);
    }),

  // ── User: Get unread count ──────────────────────────────────────────────
  unreadCount: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { count: 0 };

      const deliveries = await db.select().from(notificationDeliveries)
        .where(and(
          eq(notificationDeliveries.userId, ctx.user.id),
          eq(notificationDeliveries.status, 'delivered')
        ));

      return { count: deliveries.length };
    }),

  // ── User: Mark as read ──────────────────────────────────────────────────
  markAsRead: protectedProcedure
    .input(z.object({ deliveryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.update(notificationDeliveries)
        .set({ status: 'read', readAt: Date.now() })
        .where(and(
          eq(notificationDeliveries.id, input.deliveryId),
          eq(notificationDeliveries.userId, ctx.user.id)
        ));

      return { success: true };
    }),

  // ── User: Mark all as read ──────────────────────────────────────────────
  markAllAsRead: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.update(notificationDeliveries)
        .set({ status: 'read', readAt: Date.now() })
        .where(and(
          eq(notificationDeliveries.userId, ctx.user.id),
          eq(notificationDeliveries.status, 'delivered')
        ));

      return { success: true };
    }),

  // ── User: Dismiss notification ──────────────────────────────────────────
  dismiss: protectedProcedure
    .input(z.object({ deliveryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.update(notificationDeliveries)
        .set({ status: 'dismissed', dismissedAt: Date.now() })
        .where(and(
          eq(notificationDeliveries.id, input.deliveryId),
          eq(notificationDeliveries.userId, ctx.user.id)
        ));

      return { success: true };
    }),

  // ── User: Track action click ────────────────────────────────────────────
  trackAction: protectedProcedure
    .input(z.object({ deliveryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.update(notificationDeliveries)
        .set({ actionClickedAt: Date.now() })
        .where(and(
          eq(notificationDeliveries.id, input.deliveryId),
          eq(notificationDeliveries.userId, ctx.user.id)
        ));

      return { success: true };
    }),
});
