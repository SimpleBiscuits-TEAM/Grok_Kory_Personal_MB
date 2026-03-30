import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  forumCategories, forumChannels, forumThreads, forumPosts,
  forumLikes, forumMemberships,
} from "../../drizzle/schema";

export const communityRouter = router({
  // ── Categories ──────────────────────────────────────────────────────────
  getCategories: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(forumCategories).orderBy(forumCategories.sortOrder);
  }),

  // ── Channels ────────────────────────────────────────────────────────────
  getChannels: publicProcedure
    .input(z.object({ categoryId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(forumChannels)
        .where(eq(forumChannels.categoryId, input.categoryId))
        .orderBy(desc(forumChannels.lastActivityAt));
    }),

  createChannel: protectedProcedure
    .input(z.object({
      categoryId: z.number(),
      name: z.string().min(1).max(128),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const result = await db.insert(forumChannels).values({
        categoryId: input.categoryId,
        name: input.name,
        slug,
        description: input.description,
        createdBy: ctx.user.id,
      });
      return { id: result[0].insertId };
    }),

  // ── Threads ─────────────────────────────────────────────────────────────
  getThreads: publicProcedure
    .input(z.object({ channelId: z.number(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(forumThreads)
        .where(eq(forumThreads.channelId, input.channelId))
        .orderBy(desc(forumThreads.createdAt))
        .limit(input.limit);
    }),

  createThread: protectedProcedure
    .input(z.object({
      channelId: z.number(),
      title: z.string().min(1).max(255),
      content: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // Create thread
      const threadResult = await db.insert(forumThreads).values({
        channelId: input.channelId,
        authorId: ctx.user.id,
        title: input.title,
      });
      const threadId = threadResult[0].insertId;
      // Create first post (the thread body)
      await db.insert(forumPosts).values({
        threadId,
        authorId: ctx.user.id,
        content: input.content,
      });
      // Update channel post count
      await db.update(forumChannels)
        .set({
          postCount: sql`${forumChannels.postCount} + 1`,
          lastActivityAt: new Date(),
        })
        .where(eq(forumChannels.id, input.channelId));
      return { id: threadId };
    }),

  // ── Posts ───────────────────────────────────────────────────────────────
  getPosts: publicProcedure
    .input(z.object({ threadId: z.number(), limit: z.number().default(100) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(forumPosts)
        .where(eq(forumPosts.threadId, input.threadId))
        .orderBy(forumPosts.createdAt)
        .limit(input.limit);
    }),

  createPost: protectedProcedure
    .input(z.object({
      threadId: z.number(),
      content: z.string().min(1),
      replyToId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(forumPosts).values({
        threadId: input.threadId,
        authorId: ctx.user.id,
        content: input.content,
        replyToId: input.replyToId,
      });
      // Update thread reply count
      await db.update(forumThreads)
        .set({
          replyCount: sql`${forumThreads.replyCount} + 1`,
          lastReplyAt: new Date(),
          lastReplyBy: ctx.user.id,
        })
        .where(eq(forumThreads.id, input.threadId));
      return { id: result[0].insertId };
    }),

  // ── Likes ───────────────────────────────────────────────────────────────
  toggleLike: protectedProcedure
    .input(z.object({
      postId: z.number().optional(),
      threadId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // Check if already liked
      const existing = await db.select().from(forumLikes)
        .where(and(
          eq(forumLikes.userId, ctx.user.id),
          input.postId ? eq(forumLikes.postId, input.postId) : eq(forumLikes.threadId, input.threadId!),
        ));
      if (existing.length > 0) {
        // Unlike
        await db.delete(forumLikes).where(eq(forumLikes.id, existing[0].id));
        if (input.postId) {
          await db.update(forumPosts)
            .set({ likeCount: sql`${forumPosts.likeCount} - 1` })
            .where(eq(forumPosts.id, input.postId));
        }
        return { liked: false };
      } else {
        // Like
        await db.insert(forumLikes).values({
          userId: ctx.user.id,
          postId: input.postId,
          threadId: input.threadId,
        });
        if (input.postId) {
          await db.update(forumPosts)
            .set({ likeCount: sql`${forumPosts.likeCount} + 1` })
            .where(eq(forumPosts.id, input.postId));
        }
        return { liked: true };
      }
    }),

  // ── Memberships ─────────────────────────────────────────────────────────
  joinChannel: protectedProcedure
    .input(z.object({ channelId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.insert(forumMemberships).values({
        userId: ctx.user.id,
        channelId: input.channelId,
      });
      await db.update(forumChannels)
        .set({ memberCount: sql`${forumChannels.memberCount} + 1` })
        .where(eq(forumChannels.id, input.channelId));
      return { success: true };
    }),

  getMyMemberships: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(forumMemberships)
      .where(eq(forumMemberships.userId, ctx.user.id));
  }),

  // ── Stats ───────────────────────────────────────────────────────────────
  getStats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { categories: 0, channels: 0, threads: 0, posts: 0 };
    const [cats] = await db.select({ count: sql<number>`count(*)` }).from(forumCategories);
    const [chans] = await db.select({ count: sql<number>`count(*)` }).from(forumChannels);
    const [threads] = await db.select({ count: sql<number>`count(*)` }).from(forumThreads);
    const [posts] = await db.select({ count: sql<number>`count(*)` }).from(forumPosts);
    return {
      categories: cats?.count || 0,
      channels: chans?.count || 0,
      threads: threads?.count || 0,
      posts: posts?.count || 0,
    };
  }),
});
