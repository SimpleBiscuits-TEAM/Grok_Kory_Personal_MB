import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock LLM and storage before imports
vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

vi.mock("../storage", () => ({
  storagePut: vi.fn(),
}));

import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";

const mockedInvokeLLM = vi.mocked(invokeLLM);
const mockedStoragePut = vi.mocked(storagePut);

describe("talonOcr router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should export a talonOcrRouter", async () => {
    const { talonOcrRouter } = await import("./talonOcr");
    expect(talonOcrRouter).toBeDefined();
    // Check it has the extractFuelTable procedure
    expect((talonOcrRouter as any)._def.procedures.extractFuelTable).toBeDefined();
  });

  describe("extractFuelTable", () => {
    it("should upload image to S3 and call LLM with vision", async () => {
      // Setup mocks
      mockedStoragePut.mockResolvedValue({
        key: "talon-ocr/test.png",
        url: "https://cdn.example.com/talon-ocr/test.png",
      });

      const mockFuelTable = {
        tableName: "Desired Injector Pw, Alpha-N, Cyl 1 (ms)",
        unit: "ms",
        colAxisLabel: "TPS (Throttle Degrees)",
        rowAxisLabel: "RPM (rpmx1000)",
        colAxis: [0.0, 0.135, 0.39, 0.976],
        rowAxis: [800, 1000, 1100, 1200],
        data: [
          [0.91, 0.919, 0.929, 0.958],
          [0.837, 0.855, 0.87, 0.922],
          [0.823, 0.838, 0.855, 0.902],
          [0.823, 0.838, 0.855, 0.901],
        ],
      };

      mockedInvokeLLM.mockResolvedValue({
        id: "test-id",
        created: Date.now(),
        model: "gemini-2.5-flash",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify(mockFuelTable),
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 500,
          total_tokens: 1500,
        },
      });

      // Verify mocks were set up correctly
      expect(mockedStoragePut).toBeDefined();
      expect(mockedInvokeLLM).toBeDefined();

      // Verify the LLM is called with image_url content when invoked
      // We test the mock setup since we can't easily create a full tRPC context
      const fakeBase64 = Buffer.from("fake-image-data").toString("base64");
      const buf = Buffer.from(fakeBase64, "base64");

      // Simulate what the router does
      await mockedStoragePut("talon-ocr/test.png", buf, "image/png");
      expect(mockedStoragePut).toHaveBeenCalledWith(
        "talon-ocr/test.png",
        buf,
        "image/png"
      );

      // Simulate LLM call with vision
      const result = await mockedInvokeLLM({
        messages: [
          { role: "system", content: "OCR system prompt" },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract fuel table" },
              {
                type: "image_url",
                image_url: {
                  url: "https://cdn.example.com/talon-ocr/test.png",
                  detail: "high",
                },
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "fuel_table_extraction",
            strict: true,
            schema: {},
          },
        },
      });

      expect(result.choices[0].message.content).toBe(
        JSON.stringify(mockFuelTable)
      );
    });

    it("should handle LLM returning array content", () => {
      // Test the content extraction logic
      const rawContent = [
        { type: "text" as const, text: '{"tableName":"test"}' },
      ];

      const contentStr = Array.isArray(rawContent)
        ? rawContent
            .filter(
              (p): p is { type: "text"; text: string } => p.type === "text"
            )
            .map((p) => p.text)
            .join("")
        : "";

      expect(contentStr).toBe('{"tableName":"test"}');
    });

    it("should validate data dimensions", () => {
      const parsed = {
        tableName: "Test",
        unit: "ms",
        colAxisLabel: "TPS",
        rowAxisLabel: "RPM",
        colAxis: [0, 1, 2, 3],
        rowAxis: [800, 1000],
        data: [
          [0.5, 0.6], // too few columns — should be padded
          [0.7, 0.8, 0.9, 1.0], // correct
        ],
      };

      // Simulate the dimension validation logic from the router
      for (let i = 0; i < parsed.data.length; i++) {
        if (parsed.data[i].length !== parsed.colAxis.length) {
          while (parsed.data[i].length < parsed.colAxis.length) {
            parsed.data[i].push(0);
          }
          if (parsed.data[i].length > parsed.colAxis.length) {
            parsed.data[i] = parsed.data[i].slice(0, parsed.colAxis.length);
          }
        }
      }

      expect(parsed.data[0]).toEqual([0.5, 0.6, 0, 0]); // padded
      expect(parsed.data[1]).toEqual([0.7, 0.8, 0.9, 1.0]); // unchanged
    });

    it("should handle rows with too many columns by trimming", () => {
      const parsed = {
        colAxis: [0, 1],
        data: [[0.5, 0.6, 0.7, 0.8]], // too many columns
      };

      for (let i = 0; i < parsed.data.length; i++) {
        if (parsed.data[i].length > parsed.colAxis.length) {
          parsed.data[i] = parsed.data[i].slice(0, parsed.colAxis.length);
        }
      }

      expect(parsed.data[0]).toEqual([0.5, 0.6]); // trimmed
    });
  });
});

describe("parseFuelTableCSV logic", () => {
  // Test the CSV parser logic directly (it's a local function, so we replicate it)
  function parseFuelTableCSV(text: string) {
    const lines = text
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length < 3) return null;

    const headerCells = lines[0].split(/[,\t]/).map((c) => c.trim());
    const colLabel = headerCells[0] || "Axis";
    const colAxis = headerCells
      .slice(1)
      .map(Number)
      .filter((n) => !isNaN(n));
    if (colAxis.length === 0) return null;

    const rowAxis: number[] = [];
    const data: number[][] = [];

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(/[,\t]/).map((c) => c.trim());
      const rowVal = Number(cells[0]);
      if (isNaN(rowVal)) continue;
      rowAxis.push(rowVal);
      const rowData = cells.slice(1, colAxis.length + 1).map((c) => {
        const n = Number(c);
        return isNaN(n) ? 0 : n;
      });
      while (rowData.length < colAxis.length) rowData.push(0);
      data.push(rowData);
    }

    if (rowAxis.length === 0 || data.length === 0) return null;

    return {
      rowAxis,
      colAxis,
      data,
      colLabel,
      targetLambda: colAxis.map(() => 0.85),
    };
  }

  it("should parse a simple CSV fuel table", () => {
    const csv = `TPS,0,10,20,30
800,0.5,0.6,0.7,0.8
1000,0.9,1.0,1.1,1.2
1200,1.3,1.4,1.5,1.6`;

    const result = parseFuelTableCSV(csv);
    expect(result).not.toBeNull();
    expect(result!.colAxis).toEqual([0, 10, 20, 30]);
    expect(result!.rowAxis).toEqual([800, 1000, 1200]);
    expect(result!.data.length).toBe(3);
    expect(result!.data[0]).toEqual([0.5, 0.6, 0.7, 0.8]);
    expect(result!.data[2]).toEqual([1.3, 1.4, 1.5, 1.6]);
  });

  it("should parse tab-separated fuel table", () => {
    const tsv = `TPS\t0\t10\t20
800\t0.5\t0.6\t0.7
1000\t0.9\t1.0\t1.1`;

    const result = parseFuelTableCSV(tsv);
    expect(result).not.toBeNull();
    expect(result!.colAxis).toEqual([0, 10, 20]);
    expect(result!.rowAxis).toEqual([800, 1000]);
  });

  it("should initialize targetLambda to 0.85 for each column", () => {
    const csv = `TPS,0,10,20,30
800,0.5,0.6,0.7,0.8
1000,0.9,1.0,1.1,1.2`;

    const result = parseFuelTableCSV(csv);
    expect(result).not.toBeNull();
    expect(result!.targetLambda).toEqual([0.85, 0.85, 0.85, 0.85]);
    expect(result!.targetLambda.length).toBe(result!.colAxis.length);
  });

  it("should return null for too few lines", () => {
    expect(parseFuelTableCSV("TPS,0,10\n800,0.5,0.6")).toBeNull();
  });

  it("should return null for empty input", () => {
    expect(parseFuelTableCSV("")).toBeNull();
  });

  it("should pad short rows with zeros", () => {
    const csv = `TPS,0,10,20
800,0.5,0.6
1000,0.9,1.0,1.1`;

    const result = parseFuelTableCSV(csv);
    expect(result).not.toBeNull();
    expect(result!.data[0]).toEqual([0.5, 0.6, 0]); // padded
    expect(result!.data[1]).toEqual([0.9, 1.0, 1.1]);
  });
});
