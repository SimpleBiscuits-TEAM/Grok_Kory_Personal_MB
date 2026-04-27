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
    openId: "test-weather-user",
    email: "weather@example.com",
    name: "Weather Test User",
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

describe("weather.calculateSaeCorrection", () => {
  it("returns CF near 1.0 at standard conditions (77°F, 29.235 inHg, 0% humidity)", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.weather.calculateSaeCorrection({
      temperatureF: 77,
      baroPressureInHg: 29.235,
      humidityPct: 0,
    });

    // SAE J1349 CF = (29.235/Pd) * sqrt((T+460)/545.4)
    // At 77°F, 29.235 inHg, 0% humidity: CF = 0.9923 (CF=1.0 at 85.4°F)
    expect(result.saeCorrectionFactor).toBe(0.9923);
    expect(result.densityAltitudeFt).toBeDefined();
    expect(result.airDensityLbFt3).toBeDefined();
  });

  it("returns CF>1 at higher altitude / lower pressure (favorable conditions)", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.weather.calculateSaeCorrection({
      temperatureF: 85,
      baroPressureInHg: 28.5,
      humidityPct: 50,
    });

    // Higher temp + lower pressure = CF > 1 (corrected HP > observed HP)
    expect(result.saeCorrectionFactor).toBeGreaterThan(1.0);
    expect(result.densityAltitudeFt).toBeDefined();
    expect(result.airDensityLbFt3).toBeDefined();
  });

  it("returns CF<1 at sea level on a cold day (dense air)", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.weather.calculateSaeCorrection({
      temperatureF: 40,
      baroPressureInHg: 30.5,
      humidityPct: 10,
    });

    // Cold + high pressure = CF < 1 (corrected HP < observed HP)
    expect(result.saeCorrectionFactor).toBeLessThan(1.0);
  });

  it("handles zero humidity correctly", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.weather.calculateSaeCorrection({
      temperatureF: 77,
      baroPressureInHg: 29.235,
      humidityPct: 0,
    });

    expect(result.saeCorrectionFactor).toBe(0.9923);
  });

  it("handles high humidity (increases CF slightly)", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const resultDry = await caller.weather.calculateSaeCorrection({
      temperatureF: 90,
      baroPressureInHg: 29.92,
      humidityPct: 0,
    });
    const resultHumid = await caller.weather.calculateSaeCorrection({
      temperatureF: 90,
      baroPressureInHg: 29.92,
      humidityPct: 90,
    });

    // Higher humidity reduces dry air pressure → higher CF
    expect(resultHumid.saeCorrectionFactor).toBeGreaterThan(resultDry.saeCorrectionFactor);
  });
});

describe("weather.getReports", () => {
  it("returns an array (possibly empty) without authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.weather.getReports({ limit: 10 });

    expect(Array.isArray(result)).toBe(true);
  });
});

describe("weather.getNetworkStats", () => {
  it("returns network statistics without authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.weather.getNetworkStats();

    expect(result).toHaveProperty("totalReports");
    expect(result).toHaveProperty("totalVehicles");
    expect(result).toHaveProperty("totalUsers");
    expect(typeof result.totalReports).toBe("number");
    expect(typeof result.totalVehicles).toBe("number");
    expect(typeof result.totalUsers).toBe("number");
  });
});

describe("weather.getAreaConditions", () => {
  it("returns area conditions for a given lat/lng (empty area)", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.weather.getAreaConditions({
      latitude: 30.0,
      longitude: -90.0,
      radiusMiles: 25,
    });

    expect(result).toHaveProperty("hasData");
    expect(result).toHaveProperty("reportCount");
    expect(result.hasData).toBe(false);
    expect(result.reportCount).toBe(0);
  });
});
