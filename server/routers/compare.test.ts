import { describe, expect, it, vi } from "vitest";

// Mock the LLM module before importing the router
vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content:
            "## Summary\nLog B shows a +45 HP gain over Log A with improved timing strategy.\n\n## Power & Efficiency\nPeak HP increased from 450 to 495.\n\n## Fuel System\nRail pressure is well controlled.\n\n## Turbo & Boost\nBoost increased by 3.2 PSI.\n\n## Drivetrain\nTCC slip within normal range.\n\n## Thermal\nEGTs increased by 85°F — monitor closely.\n\n## Calibrator Notes\nThe tune revision shows clear gains. Consider watching EGT on sustained pulls.",
        },
      },
    ],
    usage: { prompt_tokens: 500, completion_tokens: 200, total_tokens: 700 },
  }),
}));

import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("compare.analyze", () => {
  it("returns an AI analysis for comparison data", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.compare.analyze({
      comparisonContext: `=== DATALOG COMPARISON SUMMARY ===
Log A: "baseline.csv" (HPTuners)
Log B: "revised.csv" (HPTuners)

=== OVERALL PEAK COMPARISON ===
HP (Torque): 450 → 495 (+45)
Boost: 32.1 → 35.3 PSI (+3.2)
Rail Pressure: 26500 → 28200 PSI (+1700)
EGT: 1150 → 1235°F (+85)
Timing: 22.5 → 27.1° (+4.6)
Pulse Width: 2.10 → 2.35ms (+0.25)
MAF: 320 → 355 g/s (+35)`,
    });

    expect(result).toBeDefined();
    expect(result.analysis).toBeDefined();
    expect(typeof result.analysis).toBe("string");
    expect(result.analysis.length).toBeGreaterThan(0);
    expect(result.analysis).toContain("Summary");
  });

  it("accepts optional user context describing changes", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.compare.analyze({
      comparisonContext: `=== DATALOG COMPARISON SUMMARY ===
Log A: "stock_tune.csv" (EFILive)
Log B: "ppei_100hp.csv" (EFILive)

=== OVERALL PEAK COMPARISON ===
HP (Torque): 380 → 480 (+100)
Boost: 28.0 → 38.5 PSI (+10.5)`,
      userContext: "Went from stock tune to PPEI 100HP tune. No hardware changes.",
    });

    expect(result).toBeDefined();
    expect(result.analysis).toBeDefined();
    expect(typeof result.analysis).toBe("string");
  });

  it("returns usage statistics", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.compare.analyze({
      comparisonContext: "Basic comparison data",
    });

    expect(result.usage).toBeDefined();
    expect(result.usage.total_tokens).toBeGreaterThan(0);
  });

  it("handles LLM errors gracefully", async () => {
    const { invokeLLM } = await import("../_core/llm");
    const mockInvoke = vi.mocked(invokeLLM);
    
    // Temporarily make the mock reject
    mockInvoke.mockRejectedValueOnce(new Error("Service unavailable"));

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.compare.analyze({
        comparisonContext: "Test data",
      })
    ).rejects.toThrow("Comparison AI is temporarily unavailable");
  });

  it("validates input length constraints", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // userContext max is 2000 chars
    const longContext = "x".repeat(2001);
    
    await expect(
      caller.compare.analyze({
        comparisonContext: "Test",
        userContext: longContext,
      })
    ).rejects.toThrow();
  });
});
