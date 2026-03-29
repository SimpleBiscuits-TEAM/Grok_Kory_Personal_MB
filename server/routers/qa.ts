import { z } from 'zod';
import { adminProcedure, protectedProcedure, router } from '../_core/trpc';
import { qaChecklists, qaTestItems, qaItemComments } from '../../drizzle/schema_qa';
import { users } from '../../drizzle/schema';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

// ── Default PPEI V-OP Test Items ────────────────────────────────────────────

const DEFAULT_TEST_ITEMS: { category: string; title: string; description: string; priority: 'low' | 'medium' | 'high' | 'critical' }[] = [
  // Core Analyzer
  { category: 'Analyzer', title: 'CSV Upload — HP Tuners L5P format', description: 'Upload a standard HP Tuners L5P CSV and verify all channels parse correctly', priority: 'critical' },
  { category: 'Analyzer', title: 'CSV Upload — EFILive LML format', description: 'Upload an EFILive LML CSV and verify all channels parse correctly', priority: 'critical' },
  { category: 'Analyzer', title: 'CSV Upload — Banks Power format', description: 'Upload a Banks Power CSV and verify parsing', priority: 'high' },
  { category: 'Analyzer', title: 'Dyno HP/TQ chart renders correctly', description: 'Verify HP and torque curves display with correct axis scaling', priority: 'critical' },
  { category: 'Analyzer', title: 'Fault zone charts populate', description: 'Verify boost, rail pressure, EGT, MAF, TCC, VGT fault charts render when data is present', priority: 'high' },
  { category: 'Analyzer', title: 'Diagnostics engine runs without errors', description: 'Upload a datalog and confirm diagnostic report generates', priority: 'critical' },
  { category: 'Analyzer', title: 'Reasoning engine produces report', description: 'Verify AI reasoning panel generates analysis from uploaded data', priority: 'high' },
  { category: 'Analyzer', title: 'Health report generates and exports PDF', description: 'Generate health report and verify PDF export works', priority: 'high' },
  { category: 'Analyzer', title: 'Drag timeslip analysis', description: 'Upload a drag run datalog and verify timeslip analysis', priority: 'medium' },
  { category: 'Analyzer', title: 'VIN auto-detection from filename', description: 'Upload a file with VIN in filename and verify auto-decode', priority: 'medium' },

  // Datalogger
  { category: 'Datalogger', title: 'WebSerial connection to OBDLink EX', description: 'Connect to OBDLink EX adapter via WebSerial', priority: 'critical' },
  { category: 'Datalogger', title: 'Baud rate auto-detection', description: 'Verify automatic baud rate detection works', priority: 'high' },
  { category: 'Datalogger', title: 'Standard OBD-II PID logging', description: 'Log RPM, speed, coolant temp, and verify live values', priority: 'critical' },
  { category: 'Datalogger', title: 'GM Mode 22 extended PIDs', description: 'Log diesel-specific PIDs (rail pressure, boost, DPF soot)', priority: 'critical' },
  { category: 'Datalogger', title: 'Custom preset save/load', description: 'Create a custom PID preset, save it, reload page, verify it persists', priority: 'high' },
  { category: 'Datalogger', title: 'CSV export from datalogger', description: 'Log data and export to CSV, verify file opens correctly', priority: 'high' },
  { category: 'Datalogger', title: 'DTC read (Mode 03/07/0A)', description: 'Read stored, pending, and permanent DTCs', priority: 'critical' },
  { category: 'Datalogger', title: 'DTC clear (Mode 04)', description: 'Clear DTCs with confirmation dialog', priority: 'high' },
  { category: 'Datalogger', title: 'Open logged data in analyzer', description: 'Log data, click "Open in Analyzer", verify it loads', priority: 'medium' },

  // Protocol Support
  { category: 'Protocols', title: 'J1939 protocol detection', description: 'Connect to a heavy-duty truck and verify J1939 auto-detection', priority: 'high' },
  { category: 'Protocols', title: 'J1939 PGN logging', description: 'Log J1939 engine parameters (EEC1, ETC1, ET1)', priority: 'high' },
  { category: 'Protocols', title: 'K-Line protocol detection', description: 'Connect to a pre-2010 vehicle and verify K-Line detection', priority: 'medium' },
  { category: 'Protocols', title: 'Protocol auto-detection confidence', description: 'Verify confidence scoring displays correctly for detected protocol', priority: 'medium' },
  { category: 'Protocols', title: 'Protocol-specific presets load', description: 'Switch protocol and verify presets update accordingly', priority: 'medium' },
  { category: 'Protocols', title: 'Multi-protocol CSV export', description: 'Export J1939 and K-Line data to CSV with proper headers', priority: 'medium' },

  // AI Chat
  { category: 'AI Chat', title: 'Erika responds to diagnostic questions', description: 'Ask "What causes P0087?" and verify meaningful response', priority: 'high' },
  { category: 'AI Chat', title: 'Erika uses uploaded datalog context', description: 'Upload a datalog, then ask about it in AI chat', priority: 'high' },
  { category: 'AI Chat', title: 'Erika uses A2L context', description: 'Upload an A2L file, then ask about calibration parameters', priority: 'medium' },

  // Editor
  { category: 'Editor', title: 'Editor Lite access gate', description: 'Verify editor requires correct access code', priority: 'high' },
  { category: 'Editor', title: 'Hex editor loads binary', description: 'Upload a binary file and verify hex view renders', priority: 'high' },
  { category: 'Editor', title: 'Calibration comparison', description: 'Upload two binaries and verify comparison diff view', priority: 'medium' },

  // Binary Upload
  { category: 'Binary', title: 'Binary upload and VIN extraction', description: 'Upload a binary and verify VIN, OS, part numbers extract', priority: 'high' },
  { category: 'Binary', title: 'A2L file parsing', description: 'Upload an A2L file and verify measurements/characteristics parse', priority: 'high' },

  // Knowledge Base
  { category: 'Knowledge Base', title: 'Search returns relevant results', description: 'Search "P0087 L5P" and verify relevant results appear', priority: 'high' },
  { category: 'Knowledge Base', title: 'Vehicle platform database', description: 'Navigate to Vehicles tab and verify L5P, LML, LBZ, LLY, LB7 platforms', priority: 'medium' },
  { category: 'Knowledge Base', title: 'PID reference panel', description: 'Open PIDs tab and verify all categories display', priority: 'medium' },
  { category: 'Knowledge Base', title: 'Mode 6 reference panel', description: 'Open Mode 6 tab and verify monitor data displays', priority: 'medium' },

  // IntelliSpy / Coding / CAN-AM
  { category: 'Advanced Tools', title: 'IntelliSpy CAN bus monitor', description: 'Open IntelliSpy tab and verify UI loads', priority: 'medium' },
  { category: 'Advanced Tools', title: 'Vehicle Coding interface', description: 'Open Coding tab and verify interface loads', priority: 'medium' },
  { category: 'Advanced Tools', title: 'CAN-AM VIN Changer', description: 'Open CAN-AM VIN tab and verify interface loads', priority: 'low' },
  { category: 'Advanced Tools', title: 'Service Procedures', description: 'Open Procedures tab and verify content displays', priority: 'medium' },

  // UI / UX
  { category: 'UI/UX', title: 'Home page loads without errors', description: 'Navigate to home page and verify no console errors', priority: 'critical' },
  { category: 'UI/UX', title: 'Advanced mode access code works', description: 'Enter PPEIROCKS and verify advanced mode unlocks', priority: 'critical' },
  { category: 'UI/UX', title: 'What\'s New panel displays on login', description: 'Log in and verify What\'s New panel shows with dismiss option', priority: 'medium' },
  { category: 'UI/UX', title: 'Notification bell shows unread count', description: 'Send a notification and verify bell badge updates', priority: 'medium' },
  { category: 'UI/UX', title: 'Feedback panel submits successfully', description: 'Submit feedback via the feedback panel and verify success', priority: 'high' },
  { category: 'UI/UX', title: 'Responsive layout on mobile', description: 'Test on mobile viewport and verify usability', priority: 'medium' },
  { category: 'UI/UX', title: 'Dark theme consistency', description: 'Verify all panels use consistent dark theme colors', priority: 'low' },

  // Auth & Admin
  { category: 'Auth & Admin', title: 'OAuth login flow', description: 'Click login, complete OAuth, verify redirect back', priority: 'critical' },
  { category: 'Auth & Admin', title: 'Logout clears session', description: 'Click logout and verify session is cleared', priority: 'high' },
  { category: 'Auth & Admin', title: 'Admin notification send', description: 'As admin, create and send a notification to all users', priority: 'high' },
  { category: 'Auth & Admin', title: 'Admin role gating', description: 'Verify non-admin users cannot access admin features', priority: 'critical' },
];

export const qaRouter = router({
  // ── Admin: Create a new checklist ─────────────────────────────────────────
  createChecklist: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().max(10000).optional(),
      version: z.string().max(32).optional(),
      populateDefaults: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const id = `qa_${uuidv4()}`;
      const now = Date.now();

      await db.insert(qaChecklists).values({
        id,
        name: input.name,
        description: input.description || null,
        version: input.version || null,
        createdBy: ctx.user.id,
        createdAt: now,
        updatedAt: now,
        status: 'active',
      });

      // Populate with default test items if requested
      if (input.populateDefaults) {
        for (let i = 0; i < DEFAULT_TEST_ITEMS.length; i++) {
          const item = DEFAULT_TEST_ITEMS[i];
          await db.insert(qaTestItems).values({
            id: `qti_${uuidv4()}`,
            checklistId: id,
            category: item.category,
            title: item.title,
            description: item.description,
            sortOrder: i,
            status: 'pending',
            assignedTo: null,
            testedBy: null,
            testedAt: null,
            comment: null,
            errorDetails: null,
            priority: item.priority,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      return { id, itemCount: input.populateDefaults ? DEFAULT_TEST_ITEMS.length : 0 };
    }),

  // ── Admin: List checklists ────────────────────────────────────────────────
  listChecklists: adminProcedure
    .input(z.object({
      status: z.enum(['active', 'completed', 'archived']).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const conditions = input.status
        ? eq(qaChecklists.status, input.status)
        : undefined;

      const results = await db.select().from(qaChecklists)
        .where(conditions)
        .orderBy(desc(qaChecklists.createdAt));

      return results;
    }),

  // ── Admin: Get checklist with all items ───────────────────────────────────
  getChecklist: adminProcedure
    .input(z.object({ checklistId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const [checklist] = await db.select().from(qaChecklists)
        .where(eq(qaChecklists.id, input.checklistId))
        .limit(1);

      if (!checklist) throw new Error('Checklist not found');

      const items = await db.select().from(qaTestItems)
        .where(eq(qaTestItems.checklistId, input.checklistId))
        .orderBy(asc(qaTestItems.sortOrder));

      // Get all comments for items in this checklist
      const itemIds = items.map(i => i.id);
      let comments: (typeof qaItemComments.$inferSelect)[] = [];
      if (itemIds.length > 0) {
        comments = await db.select().from(qaItemComments)
          .where(sql`${qaItemComments.testItemId} IN (${sql.join(itemIds.map(id => sql`${id}`), sql`, `)})`)
          .orderBy(asc(qaItemComments.createdAt));
      }

      // Get user names for comments and testers
      const userIds = new Set<number>();
      items.forEach(i => { if (i.testedBy) userIds.add(i.testedBy); if (i.assignedTo) userIds.add(i.assignedTo); });
      comments.forEach(c => userIds.add(c.userId));

      let userMap: Record<number, string> = {};
      if (userIds.size > 0) {
        const userIdArr = Array.from(userIds);
        const userRows = await db.select({ id: users.id, name: users.name }).from(users)
          .where(sql`${users.id} IN (${sql.join(userIdArr.map(id => sql`${id}`), sql`, `)})`);
        for (const u of userRows) {
          userMap[u.id] = u.name || `User #${u.id}`;
        }
      }

      // Group comments by item
      const commentsByItem: Record<string, { id: string; userId: number; userName: string; message: string; createdAt: number }[]> = {};
      for (const c of comments) {
        if (!commentsByItem[c.testItemId]) commentsByItem[c.testItemId] = [];
        commentsByItem[c.testItemId].push({
          id: c.id,
          userId: c.userId,
          userName: userMap[c.userId] || `User #${c.userId}`,
          message: c.message,
          createdAt: c.createdAt,
        });
      }

      // Calculate stats
      const stats = {
        total: items.length,
        pass: items.filter(i => i.status === 'pass').length,
        fail: items.filter(i => i.status === 'fail').length,
        blocked: items.filter(i => i.status === 'blocked').length,
        skipped: items.filter(i => i.status === 'skipped').length,
        pending: items.filter(i => i.status === 'pending').length,
      };

      return {
        checklist,
        items: items.map(item => ({
          ...item,
          assignedToName: item.assignedTo ? (userMap[item.assignedTo] || null) : null,
          testedByName: item.testedBy ? (userMap[item.testedBy] || null) : null,
          comments: commentsByItem[item.id] || [],
        })),
        stats,
        userMap,
      };
    }),

  // ── Admin: Update test item status ────────────────────────────────────────
  updateItemStatus: adminProcedure
    .input(z.object({
      itemId: z.string(),
      status: z.enum(['pending', 'pass', 'fail', 'blocked', 'skipped']),
      comment: z.string().max(5000).optional(),
      errorDetails: z.string().max(10000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const now = Date.now();

      await db.update(qaTestItems)
        .set({
          status: input.status,
          testedBy: ctx.user.id,
          testedAt: now,
          comment: input.comment || null,
          errorDetails: input.errorDetails || null,
          updatedAt: now,
        })
        .where(eq(qaTestItems.id, input.itemId));

      return { success: true };
    }),

  // ── Admin: Add comment to test item ───────────────────────────────────────
  addComment: adminProcedure
    .input(z.object({
      testItemId: z.string(),
      message: z.string().min(1).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const id = `qac_${uuidv4()}`;
      const now = Date.now();

      await db.insert(qaItemComments).values({
        id,
        testItemId: input.testItemId,
        userId: ctx.user.id,
        message: input.message,
        createdAt: now,
      });

      return { id };
    }),

  // ── Admin: Add custom test item ───────────────────────────────────────────
  addItem: adminProcedure
    .input(z.object({
      checklistId: z.string(),
      category: z.string().min(1).max(100),
      title: z.string().min(1).max(500),
      description: z.string().max(10000).optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const now = Date.now();

      // Get max sort order
      const [maxOrder] = await db.select({ max: sql<number>`COALESCE(MAX(${qaTestItems.sortOrder}), -1)` })
        .from(qaTestItems)
        .where(eq(qaTestItems.checklistId, input.checklistId));

      const id = `qti_${uuidv4()}`;

      await db.insert(qaTestItems).values({
        id,
        checklistId: input.checklistId,
        category: input.category,
        title: input.title,
        description: input.description || null,
        sortOrder: (maxOrder?.max ?? -1) + 1,
        status: 'pending',
        assignedTo: null,
        testedBy: null,
        testedAt: null,
        comment: null,
        errorDetails: null,
        priority: input.priority,
        createdAt: now,
        updatedAt: now,
      });

      return { id };
    }),

  // ── Admin: Delete test item ───────────────────────────────────────────────
  deleteItem: adminProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Delete comments first
      await db.delete(qaItemComments).where(eq(qaItemComments.testItemId, input.itemId));
      await db.delete(qaTestItems).where(eq(qaTestItems.id, input.itemId));

      return { success: true };
    }),

  // ── Admin: Update checklist status ────────────────────────────────────────
  updateChecklistStatus: adminProcedure
    .input(z.object({
      checklistId: z.string(),
      status: z.enum(['active', 'completed', 'archived']),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.update(qaChecklists)
        .set({ status: input.status, updatedAt: Date.now() })
        .where(eq(qaChecklists.id, input.checklistId));

      return { success: true };
    }),

  // ── Admin: Assign item to team member ─────────────────────────────────────
  assignItem: adminProcedure
    .input(z.object({
      itemId: z.string(),
      userId: z.number().nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.update(qaTestItems)
        .set({ assignedTo: input.userId, updatedAt: Date.now() })
        .where(eq(qaTestItems.id, input.itemId));

      return { success: true };
    }),

  // ── Admin: Get team members for assignment ────────────────────────────────
  getTeamMembers: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const admins = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      }).from(users)
        .where(sql`${users.role} IN ('admin', 'super_admin')`);

      return admins;
    }),
});
