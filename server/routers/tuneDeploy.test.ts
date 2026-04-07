import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the tuneDeployDb module
vi.mock("../tuneDeployDb", () => ({
  listTuneDeployCalibrations: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  suggestTuneDeployMatches: vi.fn().mockResolvedValue([]),
  deleteTuneDeployCalibration: vi.fn().mockResolvedValue(true),
  listDevices: vi.fn().mockResolvedValue([
    {
      id: 1,
      deviceType: "vop",
      serialNumber: "VOP-2024-00142",
      label: "Shop VOP #1",
      vehicleDescription: "2021 Silverado L5P",
      vin: null,
      lastSeenAt: null,
      isActive: true,
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  insertDevice: vi.fn().mockResolvedValue(1),
  updateDevice: vi.fn().mockResolvedValue(true),
  deleteDevice: vi.fn().mockResolvedValue(true),
  listAssignments: vi.fn().mockResolvedValue([
    {
      id: 1,
      calibrationId: 10,
      deviceId: 1,
      status: "pending",
      notes: "Stage 2 tune",
      deployedAt: null,
      assignedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deviceSerial: "VOP-2024-00142",
      deviceLabel: "Shop VOP #1",
      calibrationFileName: "E41_STOCK.BIN",
    },
  ]),
  createAssignment: vi.fn().mockResolvedValue(1),
  updateAssignmentStatus: vi.fn().mockResolvedValue(true),
  deleteAssignment: vi.fn().mockResolvedValue(true),
}));

import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import {
  listDevices,
  insertDevice,
  updateDevice,
  deleteDevice,
  listAssignments,
  createAssignment,
  updateAssignmentStatus,
  deleteAssignment,
} from "../tuneDeployDb";

function createCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("tuneDeploy router — device management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listDevices returns registered devices", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tuneDeploy.listDevices();
    expect(result).toHaveLength(1);
    expect(result[0].serialNumber).toBe("VOP-2024-00142");
    expect(result[0].deviceType).toBe("vop");
    expect(listDevices).toHaveBeenCalledOnce();
  });

  it("addDevice registers a new device", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tuneDeploy.addDevice({
      deviceType: "pcan",
      serialNumber: "PCAN-001",
      label: "Test PCAN",
    });
    expect(result.ok).toBe(true);
    expect(result.id).toBe(1);
    expect(insertDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceType: "pcan",
        serialNumber: "PCAN-001",
        label: "Test PCAN",
      })
    );
  });

  it("addDevice trims and uppercases serial number", async () => {
    const caller = appRouter.createCaller(createCtx());
    await caller.tuneDeploy.addDevice({
      deviceType: "vop",
      serialNumber: "  vop-test-123  ",
    });
    expect(insertDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        serialNumber: "VOP-TEST-123",
      })
    );
  });

  it("updateDevice updates device fields", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tuneDeploy.updateDevice({
      id: 1,
      label: "Updated Label",
      isActive: false,
    });
    expect(result.ok).toBe(true);
    expect(updateDevice).toHaveBeenCalledWith(1, {
      label: "Updated Label",
      isActive: false,
    });
  });

  it("deleteDevice removes a device", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tuneDeploy.deleteDevice({ id: 1 });
    expect(result.ok).toBe(true);
    expect(deleteDevice).toHaveBeenCalledWith(1);
  });
});

describe("tuneDeploy router — tune assignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listAssignments returns assignments with joined data", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tuneDeploy.listAssignments({});
    expect(result).toHaveLength(1);
    expect(result[0].deviceSerial).toBe("VOP-2024-00142");
    expect(result[0].calibrationFileName).toBe("E41_STOCK.BIN");
    expect(result[0].status).toBe("pending");
  });

  it("assignTune creates a new assignment", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tuneDeploy.assignTune({
      calibrationId: 10,
      deviceId: 1,
      notes: "Stage 2 tune for dyno day",
    });
    expect(result.ok).toBe(true);
    expect(result.id).toBe(1);
    expect(createAssignment).toHaveBeenCalledWith({
      calibrationId: 10,
      deviceId: 1,
      notes: "Stage 2 tune for dyno day",
    });
  });

  it("updateAssignment changes status to deployed", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tuneDeploy.updateAssignment({
      id: 1,
      status: "deployed",
    });
    expect(result.ok).toBe(true);
    expect(updateAssignmentStatus).toHaveBeenCalledWith(
      1,
      "deployed",
      expect.any(Date)
    );
  });

  it("updateAssignment to cancelled does not set deployedAt", async () => {
    const caller = appRouter.createCaller(createCtx());
    await caller.tuneDeploy.updateAssignment({ id: 1, status: "cancelled" });
    expect(updateAssignmentStatus).toHaveBeenCalledWith(1, "cancelled", undefined);
  });

  it("deleteAssignment removes an assignment", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tuneDeploy.deleteAssignment({ id: 1 });
    expect(result.ok).toBe(true);
    expect(deleteAssignment).toHaveBeenCalledWith(1);
  });
});
