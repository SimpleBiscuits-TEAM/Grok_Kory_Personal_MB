/**
 * Honda Talon OCR Router — Screenshot-to-Fuel-Table extraction
 *
 * Accepts a base64-encoded screenshot of a C3 Tuning Software fuel table,
 * uploads it to S3 for a public URL, sends it to the LLM vision model
 * with a structured JSON schema, and returns the parsed fuel table data
 * (cell values, TPS axis, RPM axis) ready for the fuel map editor.
 *
 * Uses a multi-pass approach for large tables:
 *   Pass 1: Extract axes and full table (best effort)
 *   Pass 2: If zeros detected, re-extract suspicious regions with focused prompts
 *   Pass 3: Interpolation fallback for any remaining zeros surrounded by valid data
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Detect suspicious zeros: a zero surrounded by non-zero neighbors */
function findSuspiciousZeros(
  data: number[][],
  rowAxis: number[],
  colAxis: number[]
): Array<{ row: number; col: number }> {
  const suspicious: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < data[r].length; c++) {
      if (data[r][c] === 0) {
        // Check if neighbors are non-zero
        const neighbors: number[] = [];
        if (r > 0 && data[r - 1]?.[c] !== undefined)
          neighbors.push(data[r - 1][c]);
        if (r < data.length - 1 && data[r + 1]?.[c] !== undefined)
          neighbors.push(data[r + 1][c]);
        if (c > 0 && data[r][c - 1] !== undefined)
          neighbors.push(data[r][c - 1]);
        if (c < data[r].length - 1 && data[r][c + 1] !== undefined)
          neighbors.push(data[r][c + 1]);

        const nonZeroNeighbors = neighbors.filter((v) => v > 0);
        // If most neighbors are non-zero, this zero is suspicious
        if (nonZeroNeighbors.length >= 2) {
          suspicious.push({ row: r, col: c });
        }
      }
    }
  }
  return suspicious;
}

/** Interpolate a zero cell from its non-zero neighbors */
function interpolateCell(data: number[][], r: number, c: number): number {
  const neighbors: number[] = [];
  // Cardinal neighbors
  if (r > 0 && data[r - 1]?.[c] > 0) neighbors.push(data[r - 1][c]);
  if (r < data.length - 1 && data[r + 1]?.[c] > 0)
    neighbors.push(data[r + 1][c]);
  if (c > 0 && data[r][c - 1] > 0) neighbors.push(data[r][c - 1]);
  if (c < data[r].length - 1 && data[r][c + 1] > 0)
    neighbors.push(data[r][c + 1]);
  // Diagonal neighbors
  if (r > 0 && c > 0 && data[r - 1]?.[c - 1] > 0)
    neighbors.push(data[r - 1][c - 1]);
  if (r > 0 && c < data[r].length - 1 && data[r - 1]?.[c + 1] > 0)
    neighbors.push(data[r - 1][c + 1]);
  if (r < data.length - 1 && c > 0 && data[r + 1]?.[c - 1] > 0)
    neighbors.push(data[r + 1][c - 1]);
  if (
    r < data.length - 1 &&
    c < data[r].length - 1 &&
    data[r + 1]?.[c + 1] > 0
  )
    neighbors.push(data[r + 1][c + 1]);

  if (neighbors.length === 0) return 0;
  const avg = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
  return Math.round(avg * 1000) / 1000;
}

/** Group suspicious zeros into rectangular regions for batch re-extraction */
function groupZerosIntoRegions(
  zeros: Array<{ row: number; col: number }>,
  maxRows: number,
  maxCols: number
): Array<{
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}> {
  if (zeros.length === 0) return [];

  // Simple approach: find bounding box of all zeros, split into chunks if too large
  const rows = zeros.map((z) => z.row);
  const cols = zeros.map((z) => z.col);
  const minRow = Math.max(0, Math.min(...rows) - 1);
  const maxRow = Math.min(maxRows - 1, Math.max(...rows) + 1);
  const minCol = Math.max(0, Math.min(...cols) - 1);
  const maxCol = Math.min(maxCols - 1, Math.max(...cols) + 1);

  // If the region is small enough, return as single region
  const regionRows = maxRow - minRow + 1;
  const regionCols = maxCol - minCol + 1;

  if (regionRows * regionCols <= 200) {
    return [
      { rowStart: minRow, rowEnd: maxRow, colStart: minCol, colEnd: maxCol },
    ];
  }

  // Split into quadrants
  const midRow = Math.floor((minRow + maxRow) / 2);
  const midCol = Math.floor((minCol + maxCol) / 2);
  return [
    { rowStart: minRow, rowEnd: midRow, colStart: minCol, colEnd: midCol },
    {
      rowStart: minRow,
      rowEnd: midRow,
      colStart: midCol + 1,
      colEnd: maxCol,
    },
    {
      rowStart: midRow + 1,
      rowEnd: maxRow,
      colStart: minCol,
      colEnd: midCol,
    },
    {
      rowStart: midRow + 1,
      rowEnd: maxRow,
      colStart: midCol + 1,
      colEnd: maxCol,
    },
  ].filter(
    (r) =>
      zeros.some(
        (z) =>
          z.row >= r.rowStart &&
          z.row <= r.rowEnd &&
          z.col >= r.colStart &&
          z.col <= r.colEnd
      )
  );
}

const SYSTEM_PROMPT = `You are an expert OCR engine specialized in extracting fuel table data from tuning software screenshots (Dynojet Power Vision, C3 Tuning Software, HP Tuners, EFI Live).

Your task is to extract ALL values from the fuel table screenshot with perfect accuracy.

CRITICAL RULES:
- Extract the COMPLETE column axis values from the top header row — these are typically TPS degrees or MAP (kPa) values
- Extract the COMPLETE row axis values from the left column — these are typically RPM values
- Extract EVERY SINGLE cell value in the table grid, reading left-to-right, top-to-bottom
- Each row of data MUST have exactly as many values as there are column axis entries
- Values are typically decimal numbers (e.g., 0.910, 1.086, 2.992, 8.273)
- The table title usually contains the table name and units (e.g., "Desired Injector Pw, Speed Density, Cyl 2 (ms)")
- Be extremely precise — even small errors in fuel tables can cause engine damage
- If you cannot read a value clearly, use your best estimate based on surrounding cell values — NEVER return 0 unless the cell actually shows 0
- NEVER return 0 for a cell that has a visible non-zero value — this is the most critical rule
- RPM values may be displayed as multiplied by 1000 (e.g., "0.800" means 800 RPM, "9.500" means 9500 RPM)
- Pay careful attention to cells with colored backgrounds — green, yellow, orange, and red backgrounds all contain valid numeric values
- Some cells may have small superscript markers (like "+" or "*") — ignore these and extract only the numeric value
- Column headers may contain decimal values like 25.17, 28.83, 32.67 etc. — extract these precisely`;

const EXTRACTION_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "fuel_table_extraction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        tableName: {
          type: "string",
          description: "Full table name from screenshot header",
        },
        unit: {
          type: "string",
          description: "Measurement unit (ms, %, kPa, etc.)",
        },
        colAxisLabel: {
          type: "string",
          description: "Column axis label (e.g., MAP (kPa), TPS (Throttle Degrees))",
        },
        rowAxisLabel: {
          type: "string",
          description: "Row axis label (e.g., RPM (rpmx1000))",
        },
        colAxis: {
          type: "array",
          items: { type: "number" },
          description: "Column axis values (all of them, in order)",
        },
        rowAxis: {
          type: "array",
          items: { type: "number" },
          description: "Row axis values (all of them, in order)",
        },
        data: {
          type: "array",
          items: {
            type: "array",
            items: { type: "number" },
          },
          description:
            "2D array of cell values [row][col]. MUST have exactly rowAxis.length rows, each with exactly colAxis.length values. NEVER use 0 unless the cell actually shows 0.",
        },
      },
      required: [
        "tableName",
        "unit",
        "colAxisLabel",
        "rowAxisLabel",
        "colAxis",
        "rowAxis",
        "data",
      ],
      additionalProperties: false,
    },
  },
};

/** Schema for re-extraction of a specific region */
const REGION_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "fuel_table_region",
    strict: true,
    schema: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: {
            type: "array",
            items: { type: "number" },
          },
          description:
            "2D array of cell values for the specified region. NEVER use 0 unless the cell actually shows 0.",
        },
      },
      required: ["data"],
      additionalProperties: false,
    },
  },
};

export const talonOcrRouter = router({
  /**
   * Extract fuel table from a screenshot image
   * Input: base64 image data + mime type
   * Output: parsed fuel table with axes and cell values
   */
  extractFuelTable: protectedProcedure
    .input(
      z.object({
        imageBase64: z.string().min(100),
        mimeType: z.string().default("image/png"),
        tableName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // 1. Upload screenshot to S3 for a public URL
      const buf = Buffer.from(input.imageBase64, "base64");
      const ext = input.mimeType.includes("png") ? "png" : "jpg";
      const fileKey = `talon-ocr/${ctx.user.id}-${randomSuffix()}.${ext}`;
      const { url: imageUrl } = await storagePut(fileKey, buf, input.mimeType);

      // 2. PASS 1: Full table extraction
      const response = await invokeLLM({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text" as const,
                text: `Extract the complete fuel table from this screenshot. Read every single cell value precisely. The table name hint is: ${input.tableName || "Unknown — detect from screenshot"}.

IMPORTANT: This table may be large (up to 35 rows × 25 columns = 875 cells). You MUST extract ALL of them.
- Read each row completely from left to right before moving to the next row
- Double-check that no values are skipped or defaulted to 0
- If a cell is hard to read due to background color, estimate from surrounding values — do NOT use 0

Return the data as structured JSON with:
- tableName: the full table name from the screenshot header
- unit: the measurement unit (ms, %, etc.)
- colAxisLabel: what the column axis represents
- rowAxisLabel: what the row axis represents
- colAxis: array of ALL column axis values (numbers)
- rowAxis: array of ALL row axis values (numbers)
- data: 2D array of ALL cell values, where data[row][col] matches rowAxis[row] and colAxis[col]`,
              },
              {
                type: "image_url" as const,
                image_url: {
                  url: imageUrl,
                  detail: "high" as const,
                },
              },
            ],
          },
        ],
        response_format: EXTRACTION_SCHEMA,
      });

      // 3. Parse the structured response
      const rawContent = response.choices?.[0]?.message?.content;
      const contentStr =
        typeof rawContent === "string"
          ? rawContent
          : Array.isArray(rawContent)
          ? rawContent
              .filter(
                (p): p is { type: "text"; text: string } => p.type === "text"
              )
              .map((p) => p.text)
              .join("")
          : "";

      if (!contentStr) {
        throw new Error(
          "LLM returned empty response for fuel table extraction"
        );
      }

      const parsed = JSON.parse(contentStr) as {
        tableName: string;
        unit: string;
        colAxisLabel: string;
        rowAxisLabel: string;
        colAxis: number[];
        rowAxis: number[];
        data: number[][];
      };

      // 4. Validate and fix dimensions (pad missing rows/cols but DON'T pad with 0)
      if (parsed.rowAxis.length !== parsed.data.length) {
        // If we have fewer data rows than axis entries, pad with interpolated rows
        while (parsed.data.length < parsed.rowAxis.length) {
          const lastRow = parsed.data[parsed.data.length - 1] || [];
          parsed.data.push([...lastRow]); // Copy last row as placeholder
        }
        // Trim excess
        if (parsed.data.length > parsed.rowAxis.length) {
          parsed.data = parsed.data.slice(0, parsed.rowAxis.length);
        }
      }

      for (let i = 0; i < parsed.data.length; i++) {
        if (parsed.data[i].length < parsed.colAxis.length) {
          // Pad with interpolated values, not zeros
          while (parsed.data[i].length < parsed.colAxis.length) {
            const lastVal =
              parsed.data[i][parsed.data[i].length - 1] || 0;
            parsed.data[i].push(lastVal); // Use last known value
          }
        }
        if (parsed.data[i].length > parsed.colAxis.length) {
          parsed.data[i] = parsed.data[i].slice(0, parsed.colAxis.length);
        }
      }

      // 5. PASS 2: Detect and fix suspicious zeros
      const suspiciousZeros = findSuspiciousZeros(
        parsed.data,
        parsed.rowAxis,
        parsed.colAxis
      );

      if (suspiciousZeros.length > 0) {
        console.log(
          `[TalonOCR] Found ${suspiciousZeros.length} suspicious zeros, attempting re-extraction...`
        );

        const regions = groupZerosIntoRegions(
          suspiciousZeros,
          parsed.data.length,
          parsed.data[0]?.length || 0
        );

        // Re-extract each region
        for (const region of regions) {
          try {
            const regionRowLabels = parsed.rowAxis.slice(
              region.rowStart,
              region.rowEnd + 1
            );
            const regionColLabels = parsed.colAxis.slice(
              region.colStart,
              region.colEnd + 1
            );

            const regionResponse = await invokeLLM({
              messages: [
                {
                  role: "system",
                  content: `You are an expert OCR engine. You need to re-read a specific region of a fuel table screenshot with extreme precision.
                  
CRITICAL: NEVER return 0 for a cell that has a visible non-zero value. Every cell in a fuel table contains a meaningful value — zeros are extremely rare in injector pulse width tables.`,
                },
                {
                  role: "user",
                  content: [
                    {
                      type: "text" as const,
                      text: `Look at this fuel table screenshot again. I need you to carefully re-read a specific region of cells.

The region is:
- Rows: ${regionRowLabels.join(", ")} (row indices ${region.rowStart} to ${region.rowEnd})
- Columns: ${regionColLabels.join(", ")} (column indices ${region.colStart} to ${region.colEnd})

That's ${regionRowLabels.length} rows × ${regionColLabels.length} columns = ${regionRowLabels.length * regionColLabels.length} cells.

Read EACH cell value precisely. These are injector pulse width values in milliseconds — they should all be positive decimal numbers (typically 0.9 to 12.0). A value of 0 would mean no fuel injection, which is almost never correct.

Return ONLY the data for this region as a 2D array.`,
                    },
                    {
                      type: "image_url" as const,
                      image_url: {
                        url: imageUrl,
                        detail: "high" as const,
                      },
                    },
                  ],
                },
              ],
              response_format: REGION_SCHEMA,
            });

            const regionRaw = regionResponse.choices?.[0]?.message?.content;
            const regionStr =
              typeof regionRaw === "string"
                ? regionRaw
                : Array.isArray(regionRaw)
                ? regionRaw
                    .filter(
                      (p): p is { type: "text"; text: string } =>
                        p.type === "text"
                    )
                    .map((p) => p.text)
                    .join("")
                : "";

            if (regionStr) {
              const regionParsed = JSON.parse(regionStr) as {
                data: number[][];
              };

              // Merge region data back into main table
              for (
                let r = 0;
                r < regionParsed.data.length &&
                r + region.rowStart < parsed.data.length;
                r++
              ) {
                for (
                  let c = 0;
                  c < regionParsed.data[r].length &&
                  c + region.colStart < parsed.data[r + region.rowStart].length;
                  c++
                ) {
                  const mainR = r + region.rowStart;
                  const mainC = c + region.colStart;
                  // Only overwrite if the main table has a suspicious zero here
                  if (
                    parsed.data[mainR][mainC] === 0 &&
                    regionParsed.data[r][c] > 0
                  ) {
                    parsed.data[mainR][mainC] = regionParsed.data[r][c];
                  }
                }
              }
            }
          } catch (err) {
            console.error(
              `[TalonOCR] Region re-extraction failed for rows ${region.rowStart}-${region.rowEnd}:`,
              err
            );
          }
        }
      }

      // 6. PASS 3: Interpolation fallback for any remaining suspicious zeros
      const remainingZeros = findSuspiciousZeros(
        parsed.data,
        parsed.rowAxis,
        parsed.colAxis
      );
      let interpolatedCount = 0;
      for (const z of remainingZeros) {
        const interpolated = interpolateCell(parsed.data, z.row, z.col);
        if (interpolated > 0) {
          parsed.data[z.row][z.col] = interpolated;
          interpolatedCount++;
        }
      }

      if (interpolatedCount > 0) {
        console.log(
          `[TalonOCR] Interpolated ${interpolatedCount} remaining suspicious zeros`
        );
      }

      return {
        success: true,
        tableName: parsed.tableName,
        unit: parsed.unit,
        colAxisLabel: parsed.colAxisLabel,
        rowAxisLabel: parsed.rowAxisLabel,
        colAxis: parsed.colAxis,
        rowAxis: parsed.rowAxis,
        data: parsed.data,
        imageUrl,
        usage: response.usage,
        fixedZeros: suspiciousZeros.length,
        interpolatedZeros: interpolatedCount,
      };
    }),
});
