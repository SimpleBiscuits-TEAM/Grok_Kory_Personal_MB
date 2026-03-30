import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { diagnosticRouter } from "./routers/diagnostic";
import { compareRouter } from "./routers/compare";
import { editorRouter } from "./routers/editor";
import { projectsRouter } from "./routers/projects";
import { tunesRouter } from "./routers/tunes";
import { supportRouter } from "./routers/support";
import { notificationsRouter } from "./routers/notifications";
import { qaRouter } from "./routers/qa";
import { notificationPrefsRouter } from "./routers/notificationPrefs";
import { offsetProfilesRouter } from "./routers/offsetProfiles";
import { voiceRouter } from "./routers/voice";
import { debugRouter } from "./routers/debug";
import { binaryAnalysisRouter } from "./routers/binaryAnalysis";
import { adminMessagingRouter } from "./routers/adminMessaging";
import { supportAdminRouter } from "./routers/supportAdmin";
import { datalogCacheRouter } from "./routers/datalogCache";
import { accessManagementRouter } from "./routers/accessManagement";
import { monicaRouter } from "./routers/monica";
import { notifyOwner } from "./_core/notification";
import { insertFeedback, insertWaitlistEmail } from "./db";
import { z } from "zod";
import { storagePut } from "./storage";
import { protectedProcedure } from "./_core/trpc";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Diagnostic AI
  diagnostic: diagnosticRouter,

  // Datalog Comparison
  compare: compareRouter,

  // ECU Calibration Editor
  editor: editorRouter,

  // User Projects & Tune Management
  projects: projectsRouter,

  // Tune Folders & Saved Tunes
  tunes: tunesRouter,

  // Support Sessions for PPEI employees
  support: supportRouter,

  // Admin Push Notifications
  notifications: notificationsRouter,

  // QA Test Checklists
  qa: qaRouter,

  // User Notification Preferences
  notificationPrefs: notificationPrefsRouter,

  // Binary Offset Profiles
  offsetProfiles: offsetProfilesRouter,
  // Voice Commands
  voice: voiceRouter,

  // Self-Healing Debug System
  debug: debugRouter,

  // Binary Reverse Engineering
  binaryAnalysis: binaryAnalysisRouter,

  // Admin Messaging (staff-customer chat)
  adminMessaging: adminMessagingRouter,

  // PPEI Support Admin Panel (super_admin only)
  supportAdmin: supportAdminRouter,

  // Datalog caching for dev/debug (8hr TTL)
  datalogCache: datalogCacheRouter,

  // Access Management (user approval, role management)
  access: accessManagementRouter,

  // AI Monica — Customer-facing debug assistant
  monica: monicaRouter,

  // Email Waitlist (public, no auth required)
  waitlist: router({
    submit: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          name: z.string().max(255).optional(),
          message: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const saved = await insertWaitlistEmail({
          email: input.email,
          name: input.name || null,
          message: input.message || null,
        });

        // Notify owner
        try {
          await notifyOwner({
            title: `New V-OP Waitlist: ${input.email}`,
            content: `Email: ${input.email}\nName: ${input.name || 'Not provided'}\nMessage: ${input.message || 'None'}`,
          });
        } catch {
          console.warn("[Waitlist] Owner notification failed, but email was saved");
        }

        return { success: saved };
      }),
  }),

  // Feedback / Error Reports
  feedback: router({
    submit: publicProcedure
      .input(
        z.object({
          type: z.enum(["feedback", "error"]),
          name: z.string().optional(),
          email: z.string().email().optional().or(z.literal("")),
          rating: z.number().min(1).max(5).optional(),
          message: z.string().min(1).max(5000),
          errorType: z.string().optional(),
          stepsToReproduce: z.string().optional(),
          context: z.string().optional(),
          attachments: z.array(z.string()).optional(), // Array of uploaded file URLs
        })
      )
      .mutation(async ({ input }) => {
        // Save to database
        const saved = await insertFeedback({
          type: input.type,
          name: input.name || null,
          email: input.email || null,
          rating: input.rating ?? null,
          message: input.message,
          errorType: input.errorType || null,
          stepsToReproduce: input.stepsToReproduce || null,
          context: input.context || null,
          attachments: input.attachments ? JSON.stringify(input.attachments) : null,
        });

        // Also notify owner
        const title = input.type === "feedback"
          ? `New Feedback from ${input.name || "Anonymous"}${input.rating ? ` (${input.rating}/5)` : ""}`
          : `Error Report: ${input.errorType || "General"} from ${input.name || "Anonymous"}`;

        const content = input.type === "feedback"
          ? `Rating: ${input.rating ? `${input.rating}/5` : "N/A"}\nMessage: ${input.message}\nContext: ${input.context || "None"}`
          : `Type: ${input.errorType}\nDescription: ${input.message}\nSteps: ${input.stepsToReproduce || "N/A"}\nContext: ${input.context || "None"}`;

        try {
          await notifyOwner({ title, content });
        } catch {
          // Non-critical — feedback is already saved to DB
          console.warn("[Feedback] Owner notification failed, but feedback was saved");
        }

        return { success: saved };
      }),

    /** Upload a feedback attachment (video, screen recording, image) to S3 */
    uploadAttachment: publicProcedure
      .input(z.object({
        filename: z.string(),
        mimeType: z.string(),
        /** Base64-encoded file data */
        data: z.string(),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.data, 'base64');
        const maxSize = 50 * 1024 * 1024; // 50MB limit
        if (buffer.length > maxSize) {
          throw new Error('File too large. Maximum size is 50MB.');
        }
        const suffix = Math.random().toString(36).slice(2, 10);
        const key = `feedback-attachments/${Date.now()}-${suffix}-${input.filename}`;
        const { url } = await storagePut(key, buffer, input.mimeType);
        return { url, filename: input.filename, mimeType: input.mimeType, size: buffer.length };
      }),
  }),
});

export type AppRouter = typeof appRouter;
