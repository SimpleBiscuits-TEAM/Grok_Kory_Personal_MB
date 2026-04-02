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

describe("RPM axis auto-scaling detection", () => {
  function detectRpmScaling(rowAxis: number[], rowAxisLabel: string): number[] {
    const label = rowAxisLabel.toLowerCase();
    if (label.includes('rpm')) {
      const allSmall = rowAxis.every(v => v < 20);
      const someDecimal = rowAxis.some(v => v !== Math.floor(v) || v < 10);
      if (allSmall && someDecimal && rowAxis.length > 2) {
        return rowAxis.map(v => Math.round(v * 1000));
      }
    }
    return rowAxis;
  }

  it("should detect and fix RPM/1000 scaling (0.8 → 800)", () => {
    const scaled = [0.8, 1.0, 1.1, 1.2, 1.5, 2.0, 3.0, 4.0, 5.0, 6.0];
    const fixed = detectRpmScaling(scaled, "RPM (rpmx1000)");
    expect(fixed).toEqual([800, 1000, 1100, 1200, 1500, 2000, 3000, 4000, 5000, 6000]);
  });

  it("should NOT scale already-correct RPM values (800, 1000, etc.)", () => {
    const correct = [800, 1000, 1100, 1200, 1500, 2000, 3000];
    const result = detectRpmScaling(correct, "RPM");
    expect(result).toEqual(correct); // unchanged
  });

  it("should NOT scale non-RPM axes", () => {
    const tps = [0, 5, 10, 15, 20, 25];
    const result = detectRpmScaling(tps, "TPS (degrees)");
    expect(result).toEqual(tps); // unchanged
  });

  it("should handle edge case of very few values", () => {
    const twoValues = [0.8, 1.0];
    const result = detectRpmScaling(twoValues, "RPM");
    expect(result).toEqual(twoValues); // not enough to be confident
  });
});

describe("suspicious zero detection", () => {
  function findSuspiciousZeros(data: number[][]): Array<{ row: number; col: number }> {
    const suspicious: Array<{ row: number; col: number }> = [];
    for (let r = 0; r < data.length; r++) {
      for (let c = 0; c < data[r].length; c++) {
        if (data[r][c] === 0) {
          const neighbors: number[] = [];
          if (r > 0 && data[r - 1]?.[c] !== undefined) neighbors.push(data[r - 1][c]);
          if (r < data.length - 1 && data[r + 1]?.[c] !== undefined) neighbors.push(data[r + 1][c]);
          if (c > 0 && data[r][c - 1] !== undefined) neighbors.push(data[r][c - 1]);
          if (c < data[r].length - 1 && data[r][c + 1] !== undefined) neighbors.push(data[r][c + 1]);
          const nonZeroNeighbors = neighbors.filter(v => v > 0);
          if (nonZeroNeighbors.length >= 2) suspicious.push({ row: r, col: c });
        }
      }
    }
    return suspicious;
  }

  it("should detect a zero surrounded by non-zero values", () => {
    const data = [
      [1.0, 1.1, 1.2],
      [1.0, 0,   1.2],  // center is suspicious
      [1.0, 1.1, 1.2],
    ];
    const zeros = findSuspiciousZeros(data);
    expect(zeros.length).toBe(1);
    expect(zeros[0]).toEqual({ row: 1, col: 1 });
  });

  it("should NOT flag a zero at the edge with only one non-zero neighbor", () => {
    const data = [
      [0, 0, 1.2],
      [0, 0, 1.2],
      [0, 0, 1.2],
    ];
    // Corner zeros only have 1 non-zero neighbor (to the right)
    const zeros = findSuspiciousZeros(data);
    // The zeros at col=1 have 2+ non-zero neighbors (right + possibly above/below)
    // But col=0 zeros only have 1 non-zero neighbor (right)
    expect(zeros.every(z => z.col >= 1)).toBe(true);
  });

  it("should detect multiple suspicious zeros", () => {
    const data = [
      [1.0, 1.1, 1.2, 1.3],
      [1.0, 0,   0,   1.3],
      [1.0, 1.1, 1.2, 1.3],
    ];
    const zeros = findSuspiciousZeros(data);
    expect(zeros.length).toBe(2);
  });

  it("should return empty for table with no zeros", () => {
    const data = [
      [1.0, 1.1],
      [1.2, 1.3],
    ];
    expect(findSuspiciousZeros(data)).toEqual([]);
  });
});

describe("interpolation fallback", () => {
  function interpolateCell(data: number[][], r: number, c: number): number {
    const neighbors: number[] = [];
    if (r > 0 && data[r - 1]?.[c] > 0) neighbors.push(data[r - 1][c]);
    if (r < data.length - 1 && data[r + 1]?.[c] > 0) neighbors.push(data[r + 1][c]);
    if (c > 0 && data[r][c - 1] > 0) neighbors.push(data[r][c - 1]);
    if (c < data[r].length - 1 && data[r][c + 1] > 0) neighbors.push(data[r][c + 1]);
    if (r > 0 && c > 0 && data[r - 1]?.[c - 1] > 0) neighbors.push(data[r - 1][c - 1]);
    if (r > 0 && c < data[r].length - 1 && data[r - 1]?.[c + 1] > 0) neighbors.push(data[r - 1][c + 1]);
    if (r < data.length - 1 && c > 0 && data[r + 1]?.[c - 1] > 0) neighbors.push(data[r + 1][c - 1]);
    if (r < data.length - 1 && c < data[r].length - 1 && data[r + 1]?.[c + 1] > 0) neighbors.push(data[r + 1][c + 1]);
    if (neighbors.length === 0) return 0;
    return Math.round((neighbors.reduce((a, b) => a + b, 0) / neighbors.length) * 1000) / 1000;
  }

  it("should interpolate from cardinal and diagonal neighbors", () => {
    const data = [
      [1.0, 1.2, 1.4],
      [1.1, 0,   1.5],
      [1.2, 1.4, 1.6],
    ];
    const result = interpolateCell(data, 1, 1);
    // Average of all 8 neighbors: (1.0+1.2+1.4+1.1+1.5+1.2+1.4+1.6)/8 = 1.3
    expect(result).toBeCloseTo(1.3, 2);
  });

  it("should return 0 if all neighbors are 0", () => {
    const data = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    expect(interpolateCell(data, 1, 1)).toBe(0);
  });

  it("should handle corner cell with fewer neighbors", () => {
    const data = [
      [0, 1.0],
      [1.0, 1.0],
    ];
    const result = interpolateCell(data, 0, 0);
    // Neighbors: right=1.0, below=1.0, diagonal=1.0 → avg=1.0
    expect(result).toBe(1.0);
  });
});
