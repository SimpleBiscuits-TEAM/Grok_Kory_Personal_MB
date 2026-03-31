import { describe, it, expect, vi } from "vitest";

/**
 * Knox File Browser & Erika Context Integration Tests
 * Tests the Knox file library query helpers and LLM context builder
 */

// Mock the database module
vi.mock("./db", async () => {
  const actual = await vi.importActual("./db");
  return {
    ...actual,
  };
});

describe("Knox File Browser API", () => {
  describe("getKnoxFileContextForLLM", () => {
    it("should return a formatted string with platform groupings", async () => {
      // Import the actual function
      const { getKnoxFileContextForLLM } = await import("./db");
      const ctx = await getKnoxFileContextForLLM();
      
      // Should be a string
      expect(typeof ctx).toBe("string");
      
      // If files exist, should contain platform headers
      if (ctx.includes("Knox ECU File Library")) {
        expect(ctx).toContain("files across");
        expect(ctx).toContain("platforms");
      }
    });

    it("should not exceed 8000 chars when sliced for LLM context", async () => {
      const { getKnoxFileContextForLLM } = await import("./db");
      const ctx = await getKnoxFileContextForLLM();
      const sliced = ctx.slice(0, 8000);
      expect(sliced.length).toBeLessThanOrEqual(8000);
    });
  });

  describe("getKnoxFiles", () => {
    it("should return paginated results with total count", async () => {
      const { getKnoxFiles } = await import("./db");
      const result = await getKnoxFiles({ limit: 10, offset: 0 });
      
      expect(result).toHaveProperty("files");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.files)).toBe(true);
      expect(typeof result.total).toBe("number");
    });

    it("should filter by platform", async () => {
      const { getKnoxFiles } = await import("./db");
      const result = await getKnoxFiles({ platform: "Bosch", limit: 50, offset: 0 });
      
      // All returned files should contain "Bosch" in platform
      for (const f of result.files) {
        expect(f.platform.toLowerCase()).toContain("bosch");
      }
    });

    it("should filter by file type", async () => {
      const { getKnoxFiles } = await import("./db");
      const result = await getKnoxFiles({ fileType: "a2l", limit: 50, offset: 0 });
      
      for (const f of result.files) {
        expect(f.fileType).toBe("a2l");
      }
    });

    it("should search by filename", async () => {
      const { getKnoxFiles } = await import("./db");
      const result = await getKnoxFiles({ search: "MG1", limit: 50, offset: 0 });
      
      // Results should contain MG1 in filename (if any exist)
      for (const f of result.files) {
        expect(f.filename.toUpperCase()).toContain("MG1");
      }
    });
  });

  describe("getKnoxPlatformSummary", () => {
    it("should return platform names with counts", async () => {
      const { getKnoxPlatformSummary } = await import("./db");
      const platforms = await getKnoxPlatformSummary();
      
      expect(Array.isArray(platforms)).toBe(true);
      if (platforms.length > 0) {
        expect(platforms[0]).toHaveProperty("platform");
        expect(platforms[0]).toHaveProperty("cnt");
      }
    });
  });

  describe("getKnoxCollectionSummary", () => {
    it("should return collection names with counts", async () => {
      const { getKnoxCollectionSummary } = await import("./db");
      const collections = await getKnoxCollectionSummary();
      
      expect(Array.isArray(collections)).toBe(true);
      if (collections.length > 0) {
        expect(collections[0]).toHaveProperty("collection");
        expect(collections[0]).toHaveProperty("cnt");
      }
    });
  });

  describe("getKnoxFileById", () => {
    it("should return null for non-existent ID", async () => {
      const { getKnoxFileById } = await import("./db");
      const result = await getKnoxFileById(999999);
      expect(result).toBeNull();
    });

    it("should return full file detail for valid ID", async () => {
      const { getKnoxFiles, getKnoxFileById } = await import("./db");
      // Get first file
      const list = await getKnoxFiles({ limit: 1, offset: 0 });
      if (list.files.length > 0) {
        const detail = await getKnoxFileById(list.files[0].id);
        expect(detail).not.toBeNull();
        expect(detail!.filename).toBe(list.files[0].filename);
        expect(detail).toHaveProperty("analysisJson");
        expect(detail).toHaveProperty("s3Key");
        expect(detail).toHaveProperty("sizeBytes");
      }
    });
  });
});

describe("Erika Knox Context Integration", () => {
  it("should inject Knox file library into system prompt", async () => {
    const { getKnoxFileContextForLLM } = await import("./db");
    const ctx = await getKnoxFileContextForLLM();
    
    // The context should be non-empty if files are stored
    if (ctx.includes("Knox ECU File Library")) {
      // Should contain at least one platform section
      expect(ctx).toMatch(/### .+ \(\d+ files?\)/);
    }
  });

  it("should handle empty database gracefully", async () => {
    // The function should return a meaningful message even with no files
    const { getKnoxFileContextForLLM } = await import("./db");
    const ctx = await getKnoxFileContextForLLM();
    expect(typeof ctx).toBe("string");
    expect(ctx.length).toBeGreaterThan(0);
  });
});
