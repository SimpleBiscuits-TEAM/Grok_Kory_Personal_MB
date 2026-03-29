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
import { notifyOwner } from "./_core/notification";
import { insertFeedback } from "./db";
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
