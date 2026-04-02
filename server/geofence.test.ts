import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(role: "user" | "admin" | "super_admin"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-geofence-user",
    email: "test@ppei.com",
    name: "Test User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("geofence.listZones", () => {
  it("allows admin to list zones", async () => {
    const caller = appRouter.createCaller(createContext("admin"));
    const zones = await caller.geofence.listZones();
    expect(Array.isArray(zones)).toBe(true);
  });

  it("allows super_admin to list zones", async () => {
    const caller = appRouter.createCaller(createContext("super_admin"));
    const zones = await caller.geofence.listZones();
    expect(Array.isArray(zones)).toBe(true);
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.geofence.listZones()).rejects.toThrow("Admin access required");
  });
});

describe("geofence.createZone", () => {
  it("allows admin to create a zone", async () => {
    const caller = appRouter.createCaller(createContext("admin"));
    const result = await caller.geofence.createZone({
      name: "Test Zone",
      restrictionType: "block_both",
      polygon: [
        { lat: 30.0, lng: -90.0 },
        { lat: 30.5, lng: -90.0 },
        { lat: 30.5, lng: -89.5 },
      ],
    });
    expect(result.success).toBe(true);
    expect(typeof result.id).toBe("number");
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(
      caller.geofence.createZone({
        name: "Unauthorized Zone",
        restrictionType: "block_upload",
        polygon: [
          { lat: 30.0, lng: -90.0 },
          { lat: 30.5, lng: -90.0 },
          { lat: 30.5, lng: -89.5 },
        ],
      })
    ).rejects.toThrow("Admin access required");
  });

  it("rejects polygon with fewer than 3 points", async () => {
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(
      caller.geofence.createZone({
        name: "Bad Polygon",
        restrictionType: "block_both",
        polygon: [
          { lat: 30.0, lng: -90.0 },
          { lat: 30.5, lng: -90.0 },
        ],
      })
    ).rejects.toThrow();
  });

  it("rejects invalid color format", async () => {
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(
      caller.geofence.createZone({
        name: "Bad Color",
        restrictionType: "block_both",
        color: "red",
        polygon: [
          { lat: 30.0, lng: -90.0 },
          { lat: 30.5, lng: -90.0 },
          { lat: 30.5, lng: -89.5 },
        ],
      })
    ).rejects.toThrow();
  });
});

describe("geofence.listOverrides", () => {
  it("allows super_admin to list overrides", async () => {
    const caller = appRouter.createCaller(createContext("super_admin"));
    const overrides = await caller.geofence.listOverrides();
    expect(Array.isArray(overrides)).toBe(true);
  });

  it("rejects admin (not super_admin)", async () => {
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.geofence.listOverrides()).rejects.toThrow("GOD MODE");
  });

  it("rejects regular users", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    await expect(caller.geofence.listOverrides()).rejects.toThrow("GOD MODE");
  });
});

describe("geofence.createOverride", () => {
  it("allows super_admin to create an override", async () => {
    const caller = appRouter.createCaller(createContext("super_admin"));
    const result = await caller.geofence.createOverride({
      userId: 999,
      overrideType: "exempt",
      reason: "Testing GOD MODE",
    });
    expect(result.success).toBe(true);
  });

  it("rejects admin (not super_admin)", async () => {
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(
      caller.geofence.createOverride({
        userId: 999,
        overrideType: "exempt",
      })
    ).rejects.toThrow("GOD MODE");
  });
});
