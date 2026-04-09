import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: "user" | "admin" | "super_admin" = "user"): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("strat.chat — $0502 now handled by LLM with rich KB", () => {
  it("returns LLM-generated response for $0502 (no longer hardcoded)", { timeout: 30000 }, async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.strat.chat({
      message: "i have an lb7 and cant install my tune because my autocal is giving me $0502 error code",
    });

    // LLM should return a response (not empty/error)
    expect(result.reply).toBeTruthy();
    expect(typeof result.reply).toBe("string");
    expect(result.reply.length).toBeGreaterThan(20);
  });

  it("returns LLM response for other error codes too", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.strat.chat({
      message: "getting error $0503 on my autocal",
    });

    expect(result.reply).toBeTruthy();
    expect(typeof result.reply).toBe("string");
    expect(result.reply.length).toBeGreaterThan(20);
  });
});

describe("strat.chat — BBX file requests (still hardcoded for download links)", () => {
  it("returns Duramax BBX download when Duramax user asks for BBX", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.strat.chat({
      message: "I need the bbx file for my duramax",
    });

    expect(result.reply).toContain("Download Duramax BBX File");
    expect(result.reply).toContain("DURAMAX_AllDieselBBX2.12.22");
    expect(result.reply).toContain("F2: Scan");
    expect(result.reply).toContain("F3: Tune");
    expect(result.reply).toContain("Format CONFIG file system");
    expect(result.reply).toContain("Duramax ECM Controller Reference");
  });

  it("returns Duramax BBX when vehicle is mentioned in history", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.strat.chat({
      message: "can you send me the bbx file",
      history: [
        { role: "user", content: "I have a 2006 LBZ silverado" },
        { role: "assistant", content: "Great truck! How can I help?" },
      ],
    });

    expect(result.reply).toContain("Download Duramax BBX File");
  });

  it("returns Cummins BBX download when Cummins user asks for BBX", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.strat.chat({
      message: "i need the bbx file for my cummins",
    });

    expect(result.reply).toContain("Download Cummins BBX File");
    expect(result.reply).toContain("AllDieselBBX1.13.23");
    expect(result.reply).toContain("Cummins ECM Controller Reference");
  });

  it("returns Cummins BBX when dodge/ram is mentioned", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.strat.chat({
      message: "where do i get the bbx file for my dodge ram",
    });

    expect(result.reply).toContain("Download Cummins BBX File");
  });

  it("asks which vehicle when BBX requested but no vehicle identified", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.strat.chat({
      message: "i need the bbx file",
    });

    expect(result.reply).toContain("Duramax");
    expect(result.reply).toContain("Cummins");
    expect(result.reply).toContain("What vehicle");
  });
});

describe("strat.submitFeedback — chat log support", () => {
  it("accepts feedback with chat log and session duration", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.strat.submitFeedback({
      rating: 4,
      comment: "Very helpful!",
      resolved: true,
      messageCount: 6,
      conversationSummary: "AutoCal $0502 error fix",
      chatLog: [
        { role: "user", content: "i have an lb7 and cant install my tune because my autocal is giving me $0502 error code" },
        { role: "assistant", content: "This should be an easy fix..." },
        { role: "user", content: "that worked! thanks" },
        { role: "assistant", content: "Glad to hear it!" },
      ],
      sessionDuration: 180,
    });

    expect(result.success).toBe(true);
  });

  it("accepts feedback without chat log (backward compatible)", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.strat.submitFeedback({
      rating: 3,
      resolved: false,
      messageCount: 2,
    });

    expect(result.success).toBe(true);
  });
});
