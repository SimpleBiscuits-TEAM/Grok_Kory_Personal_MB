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

describe("strat.chat — $0502 hardcoded response", () => {
  it("returns hardcoded response when message contains $0502", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.strat.chat({
      message: "i have an lb7 and cant install my tune because my autocal is giving me $0502 error code",
    });

    // Should contain the exact hardcoded language, not LLM-generated
    expect(result.reply).toContain("This should be an easy fix");
    expect(result.reply).toContain("$0502 indicates that the AutoCal/FlashScan");
    expect(result.reply).toContain("https://www.efilive.com/download-efilive");
    expect(result.reply).toContain("Check Firmware");
    expect(result.reply).toContain("BBX file");
    expect(result.reply).toContain("F2: Scan");
    expect(result.reply).toContain("F3: Tune");
    expect(result.reply).toContain("Format CONFIG file system");
    expect(result.reply).toContain("Program Selections and Configuration Files");
  });

  it("returns hardcoded response for 0502 without dollar sign", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.strat.chat({
      message: "getting error 0502 on my autocal",
    });

    expect(result.reply).toContain("This should be an easy fix");
    expect(result.reply).toContain("$0502 indicates");
  });

  it("returns hardcoded response even with conversation history", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.strat.chat({
      message: "now im getting $0502",
      history: [
        { role: "user", content: "hey i need help with my autocal" },
        { role: "assistant", content: "Hey! What's going on with your AutoCal?" },
      ],
    });

    expect(result.reply).toContain("This should be an easy fix");
  });

  it("does NOT return hardcoded response for other error codes", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.strat.chat({
      message: "getting error $0503 on my autocal",
    });

    // $0503 should go through LLM, not the hardcoded path
    expect(result.reply).not.toContain("This should be an easy fix");
    expect(result.reply).not.toContain("$0502 indicates");
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
