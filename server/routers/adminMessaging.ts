/**
 * Admin Messaging Router
 * tRPC endpoints for managing conversations with customers and testers
 */

import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { getDb } from '../db';
import { adminConversations, adminMessages } from '../../drizzle/schema';
import { eq, and, desc, like, or } from 'drizzle-orm';

export const adminMessagingRouter = router({
  /**
   * Get all conversations for the admin (with search/filter)
   */
  getConversations: protectedProcedure
    .input(
      z.object({
        search: z.string().optional().describe('Search by user name or subject'),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only admins can access messaging',
        });
      }

      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Database connection failed',
          });
        }

        let whereConditions: any = eq(adminConversations.adminId, ctx.user.id!);

        // Add search filter if provided
        if (input.search && input.search.trim()) {
          const searchTerm = `%${input.search.trim()}%`;
          whereConditions = and(
            whereConditions,
            like(adminConversations.subject, searchTerm)
          );
        }

        const conversations = await db
          .select({
            id: adminConversations.id,
            userId: adminConversations.userId,
            subject: adminConversations.subject,
            isActive: adminConversations.isActive,
            isRead: adminConversations.isRead,
            lastMessageAt: adminConversations.lastMessageAt,
            createdAt: adminConversations.createdAt,
          })
          .from(adminConversations)
          .where(whereConditions)
          .orderBy(desc(adminConversations.lastMessageAt))
          .limit(input.limit)
          .offset(input.offset);

        return {
          success: true,
          conversations,
          count: conversations.length,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch conversations: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  /**
   * Get full message history for a conversation
   */
  getMessages: protectedProcedure
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only admins can access messaging',
        });
      }

      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Database connection failed',
          });
        }

        // Verify admin owns this conversation
        const conversation = await db
          .select()
          .from(adminConversations)
          .where(
            and(
              eq(adminConversations.id, input.conversationId),
              eq(adminConversations.adminId, ctx.user.id!)
            )
          )
          .limit(1);

        if (conversation.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Conversation not found',
          });
        }

        // Get messages
        const messages = await db
          .select()
          .from(adminMessages)
          .where(eq(adminMessages.conversationId, input.conversationId))
          .orderBy(desc(adminMessages.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        return {
          success: true,
          conversationId: input.conversationId,
          messages: messages.reverse(), // Return in chronological order
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch messages: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  /**
   * Send a message from admin to user
   */
  sendMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        content: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only admins can send messages',
        });
      }

      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Database connection failed',
          });
        }

        // Verify admin owns this conversation
        const conversation = await db
          .select()
          .from(adminConversations)
          .where(
            and(
              eq(adminConversations.id, input.conversationId),
              eq(adminConversations.adminId, ctx.user.id!)
            )
          )
          .limit(1);

        if (conversation.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Conversation not found',
          });
        }

        // Insert message
        const result = await db.insert(adminMessages).values({
          conversationId: input.conversationId,
          senderId: ctx.user.id!,
          senderType: 'admin',
          content: input.content,
        });

        // Update conversation lastMessageAt
        await db
          .update(adminConversations)
          .set({ lastMessageAt: new Date() })
          .where(eq(adminConversations.id, input.conversationId));

        return {
          success: true,
          messageId: result[0],
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  /**
   * Mark conversation as read
   */
  markAsRead: protectedProcedure
    .input(
      z.object({
        conversationId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only admins can mark conversations as read',
        });
      }

      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Database connection failed',
          });
        }

        // Update conversation
        await db
          .update(adminConversations)
          .set({ isRead: true })
          .where(
            and(
              eq(adminConversations.id, input.conversationId),
              eq(adminConversations.adminId, ctx.user.id!)
            )
          );

        // Mark all messages as read
        await db
          .update(adminMessages)
          .set({ isRead: true, readAt: new Date() })
          .where(eq(adminMessages.conversationId, input.conversationId));

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to mark as read: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  /**
   * Start a new conversation with a user
   */
  startConversation: protectedProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        subject: z.string().min(1).max(255),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only admins can start conversations',
        });
      }

      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Database connection failed',
          });
        }

        // Check if conversation already exists
        const existing = await db
          .select()
          .from(adminConversations)
          .where(
            and(
              eq(adminConversations.userId, input.userId),
              eq(adminConversations.adminId, ctx.user.id!)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          return {
            success: true,
            conversationId: existing[0].id,
            isNew: false,
          };
        }

        // Create new conversation
        const result = await db.insert(adminConversations).values({
          userId: input.userId,
          adminId: ctx.user.id!,
          subject: input.subject,
          isActive: true,
          isRead: true,
        });

        return {
          success: true,
          conversationId: result[0],
          isNew: true,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to start conversation: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  /**
   * Search conversations by user name or message content
   */
  searchConversations: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(100),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'super_admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only admins can search conversations',
        });
      }

      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Database connection failed',
          });
        }

        const searchTerm = `%${input.query.trim()}%`;

        // Search in conversation subjects
        const conversationResults = await db
          .select()
          .from(adminConversations)
          .where(
            and(
              eq(adminConversations.adminId, ctx.user.id!),
              like(adminConversations.subject, searchTerm)
            )
          )
          .limit(input.limit);

        // Search in message content
        const messageResults = await db
          .select({
            id: adminConversations.id,
            userId: adminConversations.userId,
            subject: adminConversations.subject,
            isActive: adminConversations.isActive,
            isRead: adminConversations.isRead,
            lastMessageAt: adminConversations.lastMessageAt,
            createdAt: adminConversations.createdAt,
          })
          .from(adminConversations)
          .innerJoin(
            adminMessages,
            eq(adminConversations.id, adminMessages.conversationId)
          )
          .where(
            and(
              eq(adminConversations.adminId, ctx.user.id!),
              like(adminMessages.content, searchTerm)
            )
          )
          .limit(input.limit);

        // Merge and deduplicate
        const allResults = [...conversationResults, ...messageResults];
        const uniqueResults = Array.from(
          new Map(allResults.map((item) => [item.id, item])).values()
        ).slice(0, input.limit);

        return {
          success: true,
          results: uniqueResults,
          count: uniqueResults.length,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),
});
