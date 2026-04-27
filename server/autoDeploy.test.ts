import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * Auto-Deploy system tests — covers folder CRUD, metadata upsert,
 * combo management, vehicle matching, and audit log.
 */

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@ppei.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
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
      cookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

function createGuestContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

describe("autoDeploy", () => {
  const adminCtx = createAdminContext();
  const guestCtx = createGuestContext();
  let adminCaller: ReturnType<typeof appRouter.createCaller>;
  let guestCaller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(() => {
    adminCaller = appRouter.createCaller(adminCtx);
    guestCaller = appRouter.createCaller(guestCtx);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Folder CRUD
  // ═══════════════════════════════════════════════════════════════════════

  describe("folders", () => {
    it("creates a root folder", async () => {
      const result = await adminCaller.autoDeploy.createFolder({
        name: "L5P",
        folderType: "vehicle_type",
        fullPath: "L5P",
      });
      expect(result.ok).toBe(true);
      expect(result.id).toBeGreaterThan(0);
    });

    it("creates a child folder under root", async () => {
      // First get the root folder
      const folders = await adminCaller.autoDeploy.listAllFolders();
      const root = folders.find((f) => f.name === "L5P");
      expect(root).toBeDefined();

      const result = await adminCaller.autoDeploy.createFolder({
        name: "E41",
        parentId: root!.id,
        folderType: "os",
        fullPath: "L5P/E41",
      });
      expect(result.ok).toBe(true);
    });

    it("creates a part number folder under OS", async () => {
      const folders = await adminCaller.autoDeploy.listAllFolders();
      const osFolder = folders.find((f) => f.name === "E41");
      expect(osFolder).toBeDefined();

      const result = await adminCaller.autoDeploy.createFolder({
        name: "12709844",
        parentId: osFolder!.id,
        folderType: "part_number",
        fullPath: "L5P/E41/12709844",
      });
      expect(result.ok).toBe(true);
    });

    it("lists all folders", async () => {
      const folders = await adminCaller.autoDeploy.listAllFolders();
      expect(folders.length).toBeGreaterThanOrEqual(3);
      const names = folders.map((f) => f.name);
      expect(names).toContain("L5P");
      expect(names).toContain("E41");
      expect(names).toContain("12709844");
    });

    it("lists root-level folders only", async () => {
      const folders = await adminCaller.autoDeploy.listFolders({ parentId: null });
      const names = folders.map((f) => f.name);
      expect(names).toContain("L5P");
      expect(names).not.toContain("E41");
    });

    it("updates a folder name", async () => {
      const folders = await adminCaller.autoDeploy.listAllFolders();
      const pnFolder = folders.find((f) => f.name === "12709844");
      expect(pnFolder).toBeDefined();

      const result = await adminCaller.autoDeploy.updateFolder({
        id: pnFolder!.id,
        name: "12709844-updated",
      });
      expect(result.ok).toBe(true);

      // Verify
      const updated = await adminCaller.autoDeploy.listAllFolders();
      expect(updated.find((f) => f.id === pnFolder!.id)?.name).toBe("12709844-updated");

      // Restore name
      await adminCaller.autoDeploy.updateFolder({
        id: pnFolder!.id,
        name: "12709844",
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Calibration Metadata
  // ═══════════════════════════════════════════════════════════════════════

  describe("calibration metadata", () => {
    it("lists enriched calibrations (may be empty)", async () => {
      const cals = await adminCaller.autoDeploy.listCalibrationsEnriched();
      expect(Array.isArray(cals)).toBe(true);
    });

    it("lists calibration metadata", async () => {
      const meta = await adminCaller.autoDeploy.listCalibrationMeta();
      expect(Array.isArray(meta)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Vehicle Matching
  // ═══════════════════════════════════════════════════════════════════════

  describe("vehicle matching", () => {
    it("rejects empty module snapshot", async () => {
      await expect(
        guestCaller.autoDeploy.matchVehicle({})
      ).rejects.toThrow(/at least one module snapshot/i);
    });

    it("returns no_match when no calibrations are auto-deployed", async () => {
      const result = await guestCaller.autoDeploy.matchVehicle({
        ecmOs: "E41",
        ecmPartNumbers: ["12709844"],
        userAccessLevel: 1,
      });
      expect(result.found).toBe(false);
    });

    it("logs the matching attempt in audit log", async () => {
      // The previous matchVehicle call should have created a log entry
      const logs = await adminCaller.autoDeploy.listLogs({ limit: 5 });
      expect(logs.length).toBeGreaterThan(0);
      const latest = logs[0];
      expect(latest.result).toBe("no_match");
      expect(latest.vehicleEcmOs).toBe("E41");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Combo Management
  // ═══════════════════════════════════════════════════════════════════════

  describe("combos", () => {
    it("lists combos (may be empty)", async () => {
      const combos = await adminCaller.autoDeploy.listCombos();
      expect(Array.isArray(combos)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Audit Log
  // ═══════════════════════════════════════════════════════════════════════

  describe("audit log", () => {
    it("lists logs with limit", async () => {
      const logs = await adminCaller.autoDeploy.listLogs({ limit: 10 });
      expect(Array.isArray(logs)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Cleanup — delete test folders
  // ═══════════════════════════════════════════════════════════════════════

  describe("cleanup", () => {
    it("deletes test folders in reverse order", async () => {
      const folders = await adminCaller.autoDeploy.listAllFolders();
      // Delete leaf first (part_number), then os, then vehicle_type
      const pn = folders.find((f) => f.name === "12709844");
      if (pn) await adminCaller.autoDeploy.deleteFolder({ id: pn.id });

      const os = folders.find((f) => f.name === "E41");
      if (os) await adminCaller.autoDeploy.deleteFolder({ id: os.id });

      const vt = folders.find((f) => f.name === "L5P");
      if (vt) await adminCaller.autoDeploy.deleteFolder({ id: vt.id });

      const remaining = await adminCaller.autoDeploy.listAllFolders();
      expect(remaining.find((f) => f.name === "L5P")).toBeUndefined();
    });
  });
});
