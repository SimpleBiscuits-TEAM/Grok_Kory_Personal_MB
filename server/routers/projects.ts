import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { projects, projectFiles, projectVersions, projectMetadata, projectComparisons } from '../../drizzle/schema_projects';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

export const projectsRouter = router({
  // List all user projects
  list: protectedProcedure
    .input(z.object({
      includeArchived: z.boolean().default(false),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      
      const query = db.select().from(projects)
        .where(
          and(
            eq(projects.userId, ctx.user.id),
            input.includeArchived ? undefined : eq(projects.isArchived, false)
          )
        )
        .orderBy(desc(projects.updatedAt))
        .limit(input.limit)
        .offset(input.offset);

      const results = await query;
      return results;
    }),

  // Get single project with all related data
  get: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      
      // Verify ownership
      const project = await db.select().from(projects)
        .where(and(
          eq(projects.id, input.projectId),
          eq(projects.userId, ctx.user.id)
        ))
        .limit(1);

      if (!project.length) {
        throw new Error('Project not found');
      }

      // Get files
      const files = await db.select().from(projectFiles)
        .where(eq(projectFiles.projectId, input.projectId));

      // Get metadata
      const metadata = await db.select().from(projectMetadata)
        .where(eq(projectMetadata.projectId, input.projectId))
        .limit(1);

      // Get versions
      const versions = await db.select().from(projectVersions)
        .where(eq(projectVersions.projectId, input.projectId))
        .orderBy(desc(projectVersions.versionNumber));

      return {
        project: project[0],
        files,
        metadata: metadata[0],
        versions,
      };
    }),

  // Create new project
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      vehicleMake: z.string().optional(),
      vehicleModel: z.string().optional(),
      vehicleYear: z.number().optional(),
      ecuFamily: z.string().optional(),
      ecuId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const projectId = uuidv4();
      const metadataId = uuidv4();

      // Create project
      await db.insert(projects).values({
        id: projectId,
        userId: ctx.user.id,
        name: input.name,
        description: input.description,
        vehicleMake: input.vehicleMake,
        vehicleModel: input.vehicleModel,
        vehicleYear: input.vehicleYear,
        ecuFamily: input.ecuFamily,
        ecuId: input.ecuId,
      });

      // Create metadata
      await db.insert(projectMetadata).values({
        id: metadataId,
        projectId,
        currentVersion: 0,
        checksumStatus: 'unchecked',
      });

      return { projectId };
    }),

  // Update project
  update: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Verify ownership
      const project = await db.select().from(projects)
        .where(and(
          eq(projects.id, input.projectId),
          eq(projects.userId, ctx.user.id)
        ))
        .limit(1);

      if (!project.length) {
        throw new Error('Project not found');
      }

      // Update project
      if (input.name || input.description) {
        await db.update(projects)
          .set({
            name: input.name || project[0].name,
            description: input.description || project[0].description,
          })
          .where(eq(projects.id, input.projectId));
      }

      // Update metadata
      if (input.tags !== undefined || input.notes !== undefined) {
        const metadata = await db.select().from(projectMetadata)
          .where(eq(projectMetadata.projectId, input.projectId))
          .limit(1);

        if (metadata.length) {
          await db.update(projectMetadata)
            .set({
              tags: input.tags ? JSON.stringify(input.tags) : metadata[0].tags,
              notes: input.notes || metadata[0].notes,
            })
            .where(eq(projectMetadata.projectId, input.projectId));
        }
      }

      return { success: true };
    }),

  // Archive project
  archive: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      isArchived: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Verify ownership
      const project = await db.select().from(projects)
        .where(and(
          eq(projects.id, input.projectId),
          eq(projects.userId, ctx.user.id)
        ))
        .limit(1);

      if (!project.length) {
        throw new Error('Project not found');
      }

      await db.update(projects)
        .set({ isArchived: input.isArchived })
        .where(eq(projects.id, input.projectId));

      return { success: true };
    }),

  // Delete project
  delete: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Verify ownership
      const project = await db.select().from(projects)
        .where(and(
          eq(projects.id, input.projectId),
          eq(projects.userId, ctx.user.id)
        ))
        .limit(1);

      if (!project.length) {
        throw new Error('Project not found');
      }

      // Delete project (cascades to files, versions, metadata)
      await db.delete(projects)
        .where(eq(projects.id, input.projectId));

      return { success: true };
    }),

  // Upload file to project
  uploadFile: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      fileType: z.enum(['binary', 'a2l', 'csv', 'reference', 'comparison']),
      fileName: z.string(),
      fileSize: z.number(),
      fileHash: z.string(),
      s3Key: z.string(),
      s3Url: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Verify ownership
      const project = await db.select().from(projects)
        .where(and(
          eq(projects.id, input.projectId),
          eq(projects.userId, ctx.user.id)
        ))
        .limit(1);

      if (!project.length) {
        throw new Error('Project not found');
      }

      const fileId = uuidv4();
      await db.insert(projectFiles).values({
        id: fileId,
        projectId: input.projectId,
        fileType: input.fileType,
        fileName: input.fileName,
        fileSize: input.fileSize,
        fileHash: input.fileHash,
        s3Key: input.s3Key,
        s3Url: input.s3Url,
      });

      return { fileId };
    }),

  // Delete file
  deleteFile: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      fileId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Verify ownership
      const project = await db.select().from(projects)
        .where(and(
          eq(projects.id, input.projectId),
          eq(projects.userId, ctx.user.id)
        ))
        .limit(1);

      if (!project.length) {
        throw new Error('Project not found');
      }

      await db.delete(projectFiles)
        .where(eq(projectFiles.id, input.fileId));

      return { success: true };
    }),

  // Create version (save checkpoint)
  createVersion: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      binaryHash: z.string(),
      changesSummary: z.string(),
      mapsModified: z.array(z.string()),
      checksumsApplied: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Verify ownership
      const project = await db.select().from(projects)
        .where(and(
          eq(projects.id, input.projectId),
          eq(projects.userId, ctx.user.id)
        ))
        .limit(1);

      if (!project.length) {
        throw new Error('Project not found');
      }

      // Get current version number
      const lastVersion = await db.select().from(projectVersions)
        .where(eq(projectVersions.projectId, input.projectId))
        .orderBy(desc(projectVersions.versionNumber))
        .limit(1);

      const nextVersionNumber = (lastVersion[0]?.versionNumber || 0) + 1;
      const versionId = uuidv4();

      // Create version
      await db.insert(projectVersions).values({
        id: versionId,
        projectId: input.projectId,
        versionNumber: nextVersionNumber,
        binaryHash: input.binaryHash,
        changesSummary: input.changesSummary,
        mapsModified: JSON.stringify(input.mapsModified),
        checksumsApplied: input.checksumsApplied,
        createdBy: ctx.user.email || 'unknown',
      });

      // Update metadata
      await db.update(projectMetadata)
        .set({
          currentBinaryHash: input.binaryHash,
          currentVersion: nextVersionNumber,
          lastEditedBy: ctx.user.email,
          lastEditedAt: new Date(),
        })
        .where(eq(projectMetadata.projectId, input.projectId));

      return { versionId, versionNumber: nextVersionNumber };
    }),

  // Restore to previous version
  restoreVersion: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      versionId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Verify ownership
      const project = await db.select().from(projects)
        .where(and(
          eq(projects.id, input.projectId),
          eq(projects.userId, ctx.user.id)
        ))
        .limit(1);

      if (!project.length) {
        throw new Error('Project not found');
      }

      // Get version
      const version = await db.select().from(projectVersions)
        .where(eq(projectVersions.id, input.versionId))
        .limit(1);

      if (!version.length) {
        throw new Error('Version not found');
      }

      // Update metadata to point to this version
      await db.update(projectMetadata)
        .set({
          currentBinaryHash: version[0].binaryHash,
          currentVersion: version[0].versionNumber,
          lastEditedBy: ctx.user.email,
          lastEditedAt: new Date(),
        })
        .where(eq(projectMetadata.projectId, input.projectId));

      return { success: true };
    }),

  // Get version history
  getVersions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Verify ownership
      const project = await db.select().from(projects)
        .where(and(
          eq(projects.id, input.projectId),
          eq(projects.userId, ctx.user.id)
        ))
        .limit(1);

      if (!project.length) {
        throw new Error('Project not found');
      }

      const versions = await db.select().from(projectVersions)
        .where(eq(projectVersions.projectId, input.projectId))
        .orderBy(desc(projectVersions.versionNumber));

      return versions;
    }),
});
