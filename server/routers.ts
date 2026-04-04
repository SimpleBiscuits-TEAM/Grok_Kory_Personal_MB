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
import { datalogNamingRouter } from "./routers/datalogNaming";
import { accessManagementRouter } from "./routers/accessManagement";
import { fleetRouter } from "./routers/fleet";
import { dragRouter } from "./routers/drag";
import { communityRouter } from "./routers/community";
import { pitchRouter } from "./routers/pitch";
import { talonOcrRouter } from "./routers/talonOcr";
import { calibrationsRouter } from "./routers/calibrations";
import { intellispyRouter } from "./routers/intellispy";
import { diagnosticAgentRouter } from "./routers/diagnosticAgent";
import { geofenceRouter } from "./routers/geofence";
import { flashRouter } from "./routers/flash";
import { weatherRouter } from "./routers/weather";
import { dynoRouter } from "./routers/dyno";
import { cloudRouter } from "./routers/cloud";
import { streamingRouter } from "./routers/streaming";
import { lauraRouter } from "./routers/laura";
import { notifyOwner } from "./_core/notification";
import { insertFeedback, verifyAccessCode, createShareToken, validateShareToken, submitNda, checkNdaStatus, getPendingNdas, verifyNda, getShareTokenId } from "./db";
import { z } from "zod";

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
    verifyAccessCode: publicProcedure
      .input(z.object({ code: z.string().min(1).max(64) }))
      .mutation(async ({ input, ctx }) => {
        const result = await verifyAccessCode(input.code);
        if (!result) {
          return { success: false, message: "Invalid or expired access code" } as const;
        }
        // Set a session cookie to mark the user as having access-code entry
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie("vop_access", "granted", {
          ...cookieOptions,
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });
        return { success: true, label: result.label } as const;
      }),
    checkAccess: publicProcedure.query(({ ctx }) => {
      // Parse cookies from raw header (no cookie-parser middleware)
      const cookieHeader = ctx.req.headers.cookie || "";
      const hasAccessCode = cookieHeader.split(";").some(c => c.trim() === "vop_access=granted");
      const hasOAuth = Boolean(ctx.user);
      return { authenticated: hasAccessCode, method: hasAccessCode ? "access_code" : "none", hasOAuth } as const;
    }),

    // ── Share Token (single-session, single-page guest links) ──
    generateShareLink: publicProcedure
      .input(z.object({
        path: z.string().min(1).max(512),
        label: z.string().max(255).optional(),
        expiresInHours: z.number().min(1).max(720).optional(), // max 30 days
      }))
      .mutation(async ({ input, ctx }) => {
        // Only owner/admin can generate share links
        const user = ctx.user;
        if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
          return { success: false, message: 'Only admins can generate share links' } as const;
        }
        const result = await createShareToken(
          input.path,
          user.id,
          input.label,
          input.expiresInHours ?? 24
        );
        if (!result) {
          return { success: false, message: 'Failed to create share token' } as const;
        }
        return {
          success: true,
          token: result.token,
          allowedPath: result.allowedPath,
          expiresAt: result.expiresAt,
        } as const;
      }),

    validateShareToken: publicProcedure
      .input(z.object({ token: z.string().min(1).max(64) }))
      .mutation(async ({ input }) => {
        const result = await validateShareToken(input.token);
        if (!result) {
          return { success: false, message: 'Invalid or expired share link' } as const;
        }
        return { success: true, tokenId: result.id, allowedPath: result.allowedPath } as const;
      }),

    // ── NDA (tied to signer email, valid 180 days) ──
    submitNda: publicProcedure
      .input(z.object({
        tokenId: z.number(),
        signerName: z.string().min(1).max(255),
        signerEmail: z.string().email().max(320),
        signatureImageUrl: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const result = await submitNda(input);
        if (!result) {
          return { success: false, message: 'Failed to submit NDA' } as const;
        }
        return { success: true, ndaId: result.id } as const;
      }),

    checkNdaStatus: publicProcedure
      .input(z.object({ email: z.string().email().max(320) }))
      .query(async ({ input }) => {
        const nda = await checkNdaStatus(input.email);
        if (!nda) {
          return { hasNda: false, status: null } as const;
        }
        // NDA valid for 180 days from creation
        const ndaAgeMs = Date.now() - new Date(nda.createdAt).getTime();
        const NDA_VALIDITY_MS = 180 * 24 * 60 * 60 * 1000;
        if (ndaAgeMs > NDA_VALIDITY_MS) {
          return { hasNda: false, status: 'expired' as const } as const;
        }
        return {
          hasNda: true,
          status: nda.status,
          signerName: nda.signerName,
          rejectionReason: nda.rejectionReason,
          createdAt: nda.createdAt,
        } as const;
      }),

    // Admin: list all NDA submissions
    listNdas: publicProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin')) {
          return [];
        }
        return getPendingNdas();
      }),

    // Admin: verify or reject an NDA
    verifyNda: publicProcedure
      .input(z.object({
        ndaId: z.number(),
        action: z.enum(['verified', 'rejected']),
        rejectionReason: z.string().max(1000).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin')) {
          return { success: false, message: 'Only admins can verify NDAs' } as const;
        }
        const ok = await verifyNda(input.ndaId, ctx.user.id, input.action, input.rejectionReason);
        return { success: ok } as const;
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
  datalogNaming: datalogNamingRouter,

  // Access Management (user approval, role management)
  access: accessManagementRouter,

  // V-OP Fleet Management (Goose AI)
  fleet: fleetRouter,

  // V-OP Drag Racing (Regional Callouts, Leagues, BTC)
  drag: dragRouter,

  // V-OP Community Forum
  community: communityRouter,

  // V-OP AI Business Chat (Theo "Pitch")
  pitch: pitchRouter,

  // Honda Talon Screenshot-to-Fuel-Table OCR
  talonOcr: talonOcrRouter,

  // FCA/Stellantis Calibration Supersession Database
  calibrations: calibrationsRouter,

  // IntelliSpy Knox-powered CAN bus analysis
  intellispy: intellispyRouter,

  // Knox Diagnostic Agent (complaint-to-PID mapping + analysis)
  diagnosticAgent: diagnosticAgentRouter,

  // Geofence Zone Management
  geofence: geofenceRouter,

  // Flash Container Management & VOP 3.0 Upload Pipeline
  flash: flashRouter,

  // Vehicle-Reported Weather Network
  weather: weatherRouter,

  // Dyno Competition System (SAE-corrected)
  dyno: dynoRouter,

  // Vehicle Cloud Network (crowd-sourced analytics)
  cloud: cloudRouter,

  // Live Weather Streams & Storm Chaser Telemetry
  streaming: streamingRouter,

  // Laura — Weather AI Agent
  laura: lauraRouter,

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
  }),
});

export type AppRouter = typeof appRouter;
