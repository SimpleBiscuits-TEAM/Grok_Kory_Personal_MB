import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

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

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-dyno-user",
    email: "dyno@example.com",
    name: "Dyno Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("dyno.getLeaderboard", () => {
  it("returns an array (possibly empty) without authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.dyno.getLeaderboard({ limit: 10 });

    expect(Array.isArray(result)).toBe(true);
  });

  it("respects the limit parameter", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.dyno.getLeaderboard({ limit: 5 });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(5);
  });
});

describe("dyno.getCompetitions", () => {
  it("returns an array (possibly empty) without authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.dyno.getCompetitions({ limit: 10 });

    expect(Array.isArray(result)).toBe(true);
  });
});

describe("dyno.submitRun", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    await expect(
      caller.dyno.submitRun({
        peakHpObserved: 500,
        peakTqObserved: 900,
        temperatureF: 85,
        baroPressureInHg: 29.92,
        dynoType: "chassis",
      })
    ).rejects.toThrow();
  });

  it("submits a run and calculates SAE correction factor", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    const result = await caller.dyno.submitRun({
      peakHpObserved: 500,
      peakTqObserved: 900,
      temperatureF: 85,
      baroPressureInHg: 29.92,
      humidityPct: 45,
      dynoType: "chassis",
      vehicleName: "Test L5P",
      vehicleYear: 2024,
      vehicleMake: "Chevrolet",
      vehicleModel: "Silverado 2500HD",
    });

    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("saeCorrectionFactor");
    expect(result).toHaveProperty("peakHpCorrected");
    expect(result).toHaveProperty("peakTqCorrected");

    // SAE CF should be a reasonable number (0.8 - 1.3)
    const cf = parseFloat(result.saeCorrectionFactor);
    expect(cf).toBeGreaterThan(0.8);
    expect(cf).toBeLessThan(1.3);

    // Corrected HP = Observed HP × CF
    const correctedHp = parseFloat(result.peakHpCorrected);
    expect(correctedHp).toBeCloseTo(500 * cf, 0);
  });

  it("calculates CF near 1.0 at standard conditions", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    const result = await caller.dyno.submitRun({
      peakHpObserved: 400,
      peakTqObserved: 700,
      temperatureF: 77,
      baroPressureInHg: 29.235,
      humidityPct: 0,
      dynoType: "chassis",
    });

    const cf = parseFloat(result.saeCorrectionFactor);
    // SAE J1349: CF=0.9923 at 77°F, 29.235 inHg (CF=1.0 at 85.4°F)
    expect(cf).toBe(0.9923);

    const correctedHp = parseFloat(result.peakHpCorrected);
    expect(correctedHp).toBeCloseTo(400 * 0.9923, 0);
  });
});

describe("dyno.getMyRuns", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.dyno.getMyRuns({ limit: 10 })).rejects.toThrow();
  });

  it("returns runs for authenticated user", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.dyno.getMyRuns({ limit: 10 });

    expect(Array.isArray(result)).toBe(true);
  });
});
