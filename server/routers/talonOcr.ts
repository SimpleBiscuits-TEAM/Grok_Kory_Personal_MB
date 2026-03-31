/**
 * Honda Talon OCR Router — Screenshot-to-Fuel-Table extraction
 *
 * Accepts a base64-encoded screenshot of a C3 Tuning Software fuel table,
 * uploads it to S3 for a public URL, sends it to the LLM vision model
 * with a structured JSON schema, and returns the parsed fuel table data
 * (cell values, TPS axis, RPM axis) ready for the fuel map editor.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

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

      // 2. Call LLM vision with structured JSON output
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an expert OCR engine specialized in extracting fuel table data from tuning software screenshots (C3 Tuning Software, HP Tuners, EFI Live).

Your task is to extract ALL values from the fuel table screenshot with perfect accuracy.

Rules:
- Extract the COMPLETE column axis (TPS Degrees or MAP values) from the top header row
- Extract the COMPLETE row axis (RPM values) from the left column
- Extract EVERY cell value in the table grid, reading left-to-right, top-to-bottom
- Each row of data must have exactly as many values as there are column axis entries
- Values are typically decimal numbers (e.g., 0.910, 1.086, 2.992)
- The table title usually contains the table name and units (e.g., "Desired Injector Pw, Alpha-N, Cyl 1 (ms)")
- Be extremely precise — even small errors in fuel tables can cause engine damage
- If you cannot read a value clearly, use your best estimate based on surrounding values
- RPM values are in the leftmost column and increase downward (e.g., 0.800 means 800 RPM × 1000, or just 800, 1000, 1100, etc.)
- Column axis values are in the top row (e.g., 0.000, 0.135, 0.390, ... for TPS degrees, or actual degree values)`,
          },
          {
            role: "user",
            content: [
              {
                type: "text" as const,
                text: `Extract the complete fuel table from this screenshot. Read every single cell value precisely. The table name is: ${input.tableName || "Unknown — detect from screenshot"}.

Return the data as structured JSON with:
- tableName: the full table name from the screenshot header
- unit: the measurement unit (ms, %, etc.)
- colAxisLabel: what the column axis represents (e.g., "TPS (Throttle Degrees)")
- rowAxisLabel: what the row axis represents (e.g., "RPM (rpmx1000)")
- colAxis: array of column axis values (numbers)
- rowAxis: array of row axis values (numbers)
- data: 2D array of cell values, where data[row][col] matches rowAxis[row] and colAxis[col]

Be thorough — extract ALL rows and ALL columns visible in the screenshot.`,
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
        response_format: {
          type: "json_schema",
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
                  description: "Column axis label (e.g., TPS (Throttle Degrees))",
                },
                rowAxisLabel: {
                  type: "string",
                  description: "Row axis label (e.g., RPM (rpmx1000))",
                },
                colAxis: {
                  type: "array",
                  items: { type: "number" },
                  description: "Column axis values",
                },
                rowAxis: {
                  type: "array",
                  items: { type: "number" },
                  description: "Row axis values",
                },
                data: {
                  type: "array",
                  items: {
                    type: "array",
                    items: { type: "number" },
                  },
                  description: "2D array of cell values [row][col]",
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
        },
      });

      // 3. Parse the structured response
      const rawContent = response.choices?.[0]?.message?.content;
      const contentStr =
        typeof rawContent === "string"
          ? rawContent
          : Array.isArray(rawContent)
          ? rawContent
              .filter((p): p is { type: "text"; text: string } => p.type === "text")
              .map((p) => p.text)
              .join("")
          : "";

      if (!contentStr) {
        throw new Error("LLM returned empty response for fuel table extraction");
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

      // 4. Validate dimensions
      if (parsed.rowAxis.length !== parsed.data.length) {
        throw new Error(
          `Row count mismatch: ${parsed.rowAxis.length} axis values but ${parsed.data.length} data rows`
        );
      }
      for (let i = 0; i < parsed.data.length; i++) {
        if (parsed.data[i].length !== parsed.colAxis.length) {
          // Pad or trim to match
          while (parsed.data[i].length < parsed.colAxis.length) {
            parsed.data[i].push(0);
          }
          if (parsed.data[i].length > parsed.colAxis.length) {
            parsed.data[i] = parsed.data[i].slice(0, parsed.colAxis.length);
          }
        }
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
      };
    }),
});
