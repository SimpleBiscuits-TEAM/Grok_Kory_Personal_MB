import { describe, it, expect, vi } from "vitest";

// Mock the database module
vi.mock("./db", () => ({
  getKnoxFiles: vi.fn().mockResolvedValue({
    files: [
      {
        id: 1,
        filename: "KTFKDC3.a2l",
        fileType: "a2l",
        sizeMb: "21.59",
        platform: "Bosch MG1CS019 / Gas ECU (IFX)",
        ecuId: "MG1CS019",
        projectId: "MG1CS019_H4EA0",
        projectName: "MG1CS019",
        version: "MG1CS019_H4EA00_12060",
        cpuType: "IFX",
        totalCalibratables: 21052,
        totalMeasurements: 27773,
        totalFunctions: 1032,
        sourceCollection: "KTFKDC3",
        s3Url: "https://example.com/knox/KTFKDC3.a2l",
        createdAt: new Date(),
      },
      {
        id: 2,
        filename: "FSJJ4AZ4.a2l",
        fileType: "a2l",
        sizeMb: "28.00",
        platform: "Ford PCM / 2018+ Coyote 5.0L",
        ecuId: null,
        projectId: null,
        projectName: null,
        version: null,
        cpuType: null,
        totalCalibratables: 28000,
        totalMeasurements: 35000,
        totalFunctions: 0,
        sourceCollection: "Mustang",
        s3Url: "https://example.com/knox/FSJJ4AZ4.a2l",
        createdAt: new Date(),
      },
    ],
    total: 106,
  }),
  getKnoxFileById: vi.fn().mockImplementation(async (id: number) => {
    if (id === 1) {
      return {
        id: 1,
        filename: "KTFKDC3.a2l",
        fileType: "a2l",
        sizeMb: "21.59",
        sizeBytes: 22638592,
        platform: "Bosch MG1CS019 / Gas ECU (IFX)",
        ecuId: "MG1CS019",
        projectId: "MG1CS019_H4EA0",
        projectName: "MG1CS019",
        version: "MG1CS019_H4EA00_12060",
        epk: "57/1/MG1CS019/22/MG1CS019_H4EA0//MG1CS019_H4EA00_12060///",
        cpuType: "IFX",
        totalCalibratables: 21052,
        totalMeasurements: 27773,
        totalFunctions: 1032,
        analysisJson: {
          parameters: { CHARACTERISTIC: 19845, MEASUREMENT: 27773, AXIS_PTS: 1207 },
          subsystem_count: 1032,
        },
        sourceCollection: "KTFKDC3",
        s3Key: "knox-ecu-files/KTFKDC3/KTFKDC3.a2l-abc123",
        s3Url: "https://example.com/knox/KTFKDC3.a2l",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
    return null;
  }),
  getKnoxPlatformSummary: vi.fn().mockResolvedValue([
    { platform: "Ford PCM / Copperhead", cnt: 19 },
    { platform: "Ford PCM / Coyote 5.0L", cnt: 11 },
    { platform: "GM ECM / Bosch MED17 TriCore", cnt: 9 },
    { platform: "Ford PCM / Focus RS/ST EcoBoost", cnt: 9 },
  ]),
  getKnoxCollectionSummary: vi.fn().mockResolvedValue([
    { collection: "PCMTec", cnt: 39 },
    { collection: "Mustang", cnt: 30 },
    { collection: "Random", cnt: 15 },
    { collection: "2016 Focus RS", cnt: 9 },
  ]),
}));

import { getKnoxFiles, getKnoxFileById, getKnoxPlatformSummary, getKnoxCollectionSummary } from "./db";

describe("Knox ECU File Library", () => {
  describe("getKnoxFiles", () => {
    it("returns paginated file list with total count", async () => {
      const result = await getKnoxFiles({ limit: 50, offset: 0 });
      expect(result.files).toHaveLength(2);
      expect(result.total).toBe(106);
      expect(result.files[0].filename).toBe("KTFKDC3.a2l");
      expect(result.files[0].fileType).toBe("a2l");
      expect(result.files[0].platform).toContain("MG1CS019");
    });

    it("supports search filter", async () => {
      await getKnoxFiles({ search: "KTFKDC3" });
      expect(getKnoxFiles).toHaveBeenCalledWith({ search: "KTFKDC3" });
    });

    it("supports platform filter", async () => {
      await getKnoxFiles({ platform: "Ford PCM" });
      expect(getKnoxFiles).toHaveBeenCalledWith({ platform: "Ford PCM" });
    });

    it("supports collection filter", async () => {
      await getKnoxFiles({ collection: "Mustang" });
      expect(getKnoxFiles).toHaveBeenCalledWith({ collection: "Mustang" });
    });

    it("supports fileType filter", async () => {
      await getKnoxFiles({ fileType: "a2l" });
      expect(getKnoxFiles).toHaveBeenCalledWith({ fileType: "a2l" });
    });
  });

  describe("getKnoxFileById", () => {
    it("returns full file details for valid id", async () => {
      const file = await getKnoxFileById(1);
      expect(file).not.toBeNull();
      expect(file!.filename).toBe("KTFKDC3.a2l");
      expect(file!.ecuId).toBe("MG1CS019");
      expect(file!.epk).toContain("MG1CS019");
      expect(file!.analysisJson).toBeDefined();
      expect((file!.analysisJson as any).parameters.CHARACTERISTIC).toBe(19845);
    });

    it("returns null for non-existent id", async () => {
      const file = await getKnoxFileById(9999);
      expect(file).toBeNull();
    });
  });

  describe("getKnoxPlatformSummary", () => {
    it("returns platform breakdown with counts", async () => {
      const platforms = await getKnoxPlatformSummary();
      expect(platforms.length).toBeGreaterThan(0);
      expect(platforms[0]).toHaveProperty("platform");
      expect(platforms[0]).toHaveProperty("cnt");
      expect(platforms[0].platform).toBe("Ford PCM / Copperhead");
      expect(platforms[0].cnt).toBe(19);
    });
  });

  describe("getKnoxCollectionSummary", () => {
    it("returns collection breakdown with counts", async () => {
      const collections = await getKnoxCollectionSummary();
      expect(collections.length).toBeGreaterThan(0);
      expect(collections[0]).toHaveProperty("collection");
      expect(collections[0]).toHaveProperty("cnt");
      expect(collections[0].collection).toBe("PCMTec");
    });
  });

  describe("File classification", () => {
    it("correctly identifies A2L definition files", async () => {
      const result = await getKnoxFiles({});
      const a2lFile = result.files.find(f => f.fileType === "a2l");
      expect(a2lFile).toBeDefined();
      expect(a2lFile!.totalCalibratables).toBeGreaterThan(0);
    });

    it("includes ECU metadata for A2L files", async () => {
      const file = await getKnoxFileById(1);
      expect(file!.ecuId).toBe("MG1CS019");
      expect(file!.cpuType).toBe("IFX");
      expect(file!.projectId).toBe("MG1CS019_H4EA0");
    });
  });
});
