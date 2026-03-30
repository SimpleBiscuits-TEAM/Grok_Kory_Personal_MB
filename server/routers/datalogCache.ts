import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { storagePut, storageGet } from "../storage";
import { getDb } from "../db";
import { datalogCache } from "../../drizzle/schema";
import { desc, eq, gt } from "drizzle-orm";

const TTL_HOURS = 8;

function randomSuffix(): string {
  return Math.random().toString(36).substring(2, 10);
}

export const datalogCacheRouter = router({
  /**
   * Cache a datalog upload to S3 and record metadata.
   * SECURED — requires authentication to prevent anonymous abuse.
   */
  cacheDatalog: protectedProcedure
    .input(
      z.object({
        fileName: z.string(),
        fileBase64: z.string(), // base64-encoded CSV content
        sourcePage: z.string().default("analyzer"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const buf = Buffer.from(input.fileBase64, "base64");
      const fileSize = buf.length;

      // Max 50MB
      if (fileSize > 50 * 1024 * 1024) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: "File too large to cache (max 50MB)",
        });
      }

      const timestamp = Date.now();
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const s3Key = `datalog-cache/${timestamp}-${randomSuffix()}-${safeName}`;

      const { url } = await storagePut(s3Key, buf, "text/csv");

      const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      const [inserted] = await db.insert(datalogCache).values({
        fileName: input.fileName,
        s3Key,
        s3Url: url,
        fileSize,
        sourcePage: input.sourcePage,
        uploadedBy: ctx.user?.openId || null,
        uploaderName: ctx.user?.name || "anonymous",
        expiresAt,
      });

      console.log(
        `[DatalogCache] Cached "${input.fileName}" (${(fileSize / 1024).toFixed(1)}KB) → ${s3Key} | expires ${expiresAt.toISOString()}`
      );

      return {
        id: inserted.insertId,
        s3Key,
        // s3Url intentionally omitted — use getDownloadUrl to get a short-lived presigned URL
        expiresAt: expiresAt.toISOString(),
      };
    }),

  /**
   * List recent cached datalogs (admin/owner only).
   * Returns entries from the last 8 hours.
   */
  listRecent: protectedProcedure.query(async ({ ctx }) => {
    // Only admin or super_admin can view cached datalogs
    if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only admins can view cached datalogs",
      });
    }

    const cutoff = new Date(Date.now() - TTL_HOURS * 60 * 60 * 1000);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
    const entries = await db
      .select()
      .from(datalogCache)
      .where(gt(datalogCache.expiresAt, new Date()))
      .orderBy(desc(datalogCache.createdAt))
      .limit(100);

    return entries.map((e: typeof datalogCache.$inferSelect) => ({
      id: e.id,
      fileName: e.fileName,
      fileSize: e.fileSize,
      sourcePage: e.sourcePage,
      uploadedBy: e.uploadedBy,
      uploaderName: e.uploaderName,
      createdAt: e.createdAt,
      expiresAt: e.expiresAt,
      isExpired: new Date() > e.expiresAt,
    }));
  }),

  /**
   * Get a download URL for a cached datalog (admin/owner only).
   */
  getDownloadUrl: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can download cached datalogs",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      const entries = await db
        .select()
        .from(datalogCache)
        .where(eq(datalogCache.id, input.id))
        .limit(1);
      const entry = entries[0];

      if (!entry) {  
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Cached datalog not found",
        });
      }

      // Get a fresh presigned URL — NEVER fall back to stored URL
      try {
        const { url } = await storageGet(entry.s3Key);
        return {
          fileName: entry.fileName,
          url,
          fileSize: entry.fileSize,
          isExpired: new Date() > entry.expiresAt,
        };
      } catch (err: any) {
        console.error(`[DatalogCache] Failed to generate presigned URL for ${entry.s3Key}:`, err.message);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unable to generate download URL. The cached file may have expired.',
        });
      }
    }),
});
