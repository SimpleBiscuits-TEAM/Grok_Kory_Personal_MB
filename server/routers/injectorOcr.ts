/**
 * Injector Flow OCR Router — Extract test point data from aftermarket injector flow sheets
 *
 * Accepts a base64-encoded photo/scan of an injector flow sheet (e.g., S&S Diesel, Exergy, etc.),
 * uploads it to S3, sends it to LLM vision with a structured JSON schema, and returns
 * the parsed test point data ready for the duration table correction engine.
 *
 * Image is compressed client-side to stay under the 2MB JSON body limit.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

const SYSTEM_PROMPT = `You are an expert OCR engine specialized in reading diesel injector flow test sheets from aftermarket fuel system companies (S&S Diesel Motorsport, Exergy Performance, Industrial Injection, etc.).

Your task is to extract ALL test point data from the flow sheet image with perfect accuracy.

CRITICAL RULES:
- Extract the injector details: date, base engine, type (new/reman), size/model name
- Extract the brand/company name from the logo or header
- Extract ALL test points. Each test point has:
  - Test point number (1, 2, 3, 4, etc.)
  - Pressure in MPa
  - Duration in µSec (microseconds)
  - Injected quantity for EACH injector in mm³/stroke
- Extract the average injected quantity across all injectors for each test point
- Extract return flow data if present (set to null if not present)
- Extract test conditions if present (set empty strings for missing fields)
- Extract serial numbers and date codes for each injector
- Read numbers EXACTLY as printed — do not round or estimate
- If variance percentages are shown, extract those too
- The flow sheet typically has 4 test points but may have more or fewer
- If return flow data is not present on the sheet, set returnFlow to null
- If test conditions are not visible, use empty strings`;

const EXTRACTION_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "injector_flow_sheet_extraction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        brand: {
          type: "string",
          description:
            "Company/brand name (e.g., 'S&S Diesel Motorsport', 'Exergy Performance')",
        },
        injectorModel: {
          type: "string",
          description:
            "Injector model/size name (e.g., 'SAC00', '60% Over', 'LBZ 200%')",
        },
        baseEngine: {
          type: "string",
          description:
            "Base engine the injectors are for (e.g., 'Duramax LB7', 'Cummins 5.9', 'Powerstroke 6.0')",
        },
        injectorType: {
          type: "string",
          description: "New, remanufactured, or rebuilt",
        },
        date: {
          type: "string",
          description: "Date on the flow sheet (e.g., '26-Feb-2026')",
        },
        injectorCount: {
          type: "number",
          description: "Number of injectors tested (typically 6 or 8)",
        },
        testPoints: {
          type: "array",
          items: {
            type: "object",
            properties: {
              testPointNumber: {
                type: "number",
                description: "Test point number (1, 2, 3, 4, etc.)",
              },
              pressureMPa: {
                type: "number",
                description: "Rail pressure in MPa",
              },
              durationMicroseconds: {
                type: "number",
                description: "Injector pulse duration in µSec",
              },
              averageQuantityMm3: {
                type: "number",
                description:
                  "Average injected quantity across all injectors in mm³/stroke",
              },
              variancePercent: {
                type: "number",
                description:
                  "Variance percentage if shown, otherwise 0",
              },
              perInjectorQuantities: {
                type: "array",
                items: { type: "number" },
                description:
                  "Individual injected quantity for each injector in mm³/stroke, in order",
              },
            },
            required: [
              "testPointNumber",
              "pressureMPa",
              "durationMicroseconds",
              "averageQuantityMm3",
              "variancePercent",
              "perInjectorQuantities",
            ],
            additionalProperties: false,
          },
          description: "All test points from the flow sheet",
        },
        returnFlow: {
          anyOf: [
            {
              type: "object",
              properties: {
                pressureMPa: { type: "number" },
                durationMicroseconds: { type: "number" },
                perInjectorQuantities: {
                  type: "array",
                  items: { type: "number" },
                },
              },
              required: [
                "pressureMPa",
                "durationMicroseconds",
                "perInjectorQuantities",
              ],
              additionalProperties: false,
            },
            { type: "null" },
          ],
          description:
            "Return flow test data if present, null if not on the sheet",
        },
        testConditions: {
          type: "object",
          properties: {
            fluid: { type: "string" },
            temperature: { type: "string" },
            speed: { type: "string" },
            bench: { type: "string" },
          },
          required: ["fluid", "temperature", "speed", "bench"],
          additionalProperties: false,
          description:
            "Test conditions from the flow sheet (use empty strings for missing fields)",
        },
      },
      required: [
        "brand",
        "injectorModel",
        "baseEngine",
        "injectorType",
        "date",
        "injectorCount",
        "testPoints",
        "returnFlow",
        "testConditions",
      ],
      additionalProperties: false,
    },
  },
};

export const injectorOcrRouter = router({
  /**
   * Extract injector flow data from a flow sheet image
   * Input: base64 image data + mime type (image should be compressed client-side)
   * Output: parsed test point data with per-injector quantities
   */
  extractFlowSheet: protectedProcedure
    .input(
      z.object({
        imageBase64: z.string().min(100),
        mimeType: z.string().default("image/jpeg"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      let imageUrl: string;

      // 1. Upload image to S3 for a public URL
      try {
        const buf = Buffer.from(input.imageBase64, "base64");
        const ext = input.mimeType.includes("png") ? "png" : "jpg";
        const fileKey = `injector-ocr/${ctx.user.id}-${randomSuffix()}.${ext}`;
        const result = await storagePut(fileKey, buf, input.mimeType);
        imageUrl = result.url;
      } catch (err) {
        console.error("[InjectorOCR] S3 upload failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Failed to upload flow sheet image. Please try again or use a smaller image.",
        });
      }

      // 2. Extract flow sheet data via LLM vision
      let response;
      try {
        response = await invokeLLM({
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                {
                  type: "text" as const,
                  text: `Extract ALL test point data from this diesel injector flow sheet image.

Read every test point row carefully:
- The test point number, pressure (MPa), duration (µSec)
- The injected quantity for EACH individual injector (mm³/stroke)
- Calculate the average quantity across all injectors for each test point
- Extract variance if shown

Also extract:
- Brand/company name and logo text
- Injector model/size
- Base engine
- New vs remanufactured
- Date
- Number of injectors
- Return flow data if present (null if not on the sheet)
- Test conditions (fluid, temp, speed, bench — empty strings if not visible)

Return as structured JSON.`,
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
      } catch (err) {
        console.error("[InjectorOCR] LLM extraction failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "AI extraction failed. The image may be unclear or in an unsupported format. Try a clearer photo or use Manual Entry instead.",
        });
      }

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
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "AI returned empty response. Try a clearer image or use Manual Entry.",
        });
      }

      let parsed;
      try {
        parsed = JSON.parse(contentStr);
      } catch {
        console.error(
          "[InjectorOCR] Failed to parse LLM JSON:",
          contentStr.slice(0, 500)
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "AI response was not valid JSON. Try again or use Manual Entry.",
        });
      }

      // Validate we got at least one test point
      if (
        !parsed.testPoints ||
        !Array.isArray(parsed.testPoints) ||
        parsed.testPoints.length === 0
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "No test points found in the flow sheet. Make sure the image clearly shows the test data table.",
        });
      }

      return {
        success: true,
        data: parsed,
        imageUrl,
      };
    }),
});
