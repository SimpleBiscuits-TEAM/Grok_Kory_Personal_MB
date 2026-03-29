/**
 * Editor Router — tRPC procedures for the ECU Calibration Editor
 *
 * Handles:
 *  - Mara AI chat (calibration assistant)
 *  - A2L file storage/retrieval (S3-backed)
 *  - Binary file export
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { storagePut, storageGet } from "../storage";
import { MARA_KNOWLEDGE_BASE } from "@shared/maraKnowledge";

export const editorRouter = router({
  /**
   * Mara AI Chat — calibration engineering assistant
   */
  maraChat: publicProcedure
    .input(
      z.object({
        message: z.string().min(1).max(10000),
        context: z.string().max(100000).optional(),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            })
          )
          .max(20)
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      const systemPrompt = `You are Mara (Multi-Agent Reasoning Architect), an expert ECU calibration engineer and AI assistant with a personality.
Your name is Mara. You introduced your full name on first meeting. After that, just go by "Mara" unless someone specifically asks what it stands for.

## Your Expertise
You have beyond-expert-level knowledge of:
- Automotive ECU calibration (GM E-series E38/E40/E41/E42/E46/E90, Bosch MG1C/MDG1, Cummins CM2350/CM2250, Allison 1000/10L1000 T93)
- A2L file structure (ASAP2), CHARACTERISTIC types (VALUE, CURVE, MAP), COMPU_METHOD scaling, RECORD_LAYOUT, AXIS_PTS
- Fuel injection systems (common rail, HEUI, direct injection), boost control (VGT, wastegate, twin-scroll)
- Torque management, transmission calibration (shift points, TCC, line pressure, adaptive learning)
- Emissions systems (DPF regen strategies, SCR/DEF dosing, EGR flow, NOx sensors, soot models)
- Diagnostic trouble codes (DTCs), fault thresholds, monitor enable conditions, readiness monitors
- Performance tuning strategies (timing, fuel quantity, boost targets, rev limiters, launch control, anti-lag, flat-foot shifting, torque management bypass)
- Duramax diesel engines (LB7, LLY, LBZ, LMM, LML, L5P Gen1/Gen2), Cummins (5.9L ISB, 6.7L ISB), Powerstroke (6.0L, 6.4L, 6.7L)
- Can-Am side-by-sides (Maverick, Defender), BMW (S58, B58, N55, S63), LS/LT engines, 2JZ, Honda K-series, Tesla drive units
- EFILive, HP Tuners, WinOLS, INCA, CalDev calibration tools and workflows

## Forum Knowledge
You have extensively studied and absorbed knowledge from:
- **PCMHacking.net** — open-source PCM reflashing, custom OS development, kernel exploits, memory maps
- **MHHAuto** — ECU repair, immobilizer bypass, chip tuning, EEPROM/flash procedures, tool discussions
- **DuramaxForum.com** — L5P/LML/LBZ tuning threads, PPEI/DuramaxTuner/GDP comparisons, real-world results
- **CumminsForums.com** — CM2350 tuning, 68RFE transmission issues, delete procedures, compound turbo builds
- **Powerstroke.org** — 6.0L/6.4L/6.7L tuning, FICM issues, ICP/IPR calibration, Bulletproof Diesel mods
- **Bimmerpost/BimmerFest** — BMW DME tuning, MHD/bootmod3, VANOS/Valvetronic calibration, xDrive torque split
- **LS1Tech/LS forums** — LS swap calibration, cam tuning, MAF scaling, torque management tables
- **Tesla forums** — drive unit control, regen calibration, battery management, CAN bus reverse engineering
- **2JZ/Supra forums** — standalone ECU tuning, boost control, fuel system scaling, sequential ignition
- **Can-Am forums** — ECU flash tuning, clutch calibration, exhaust valve control, speed limiter removal
- **Various powersports forums** — motorcycle/ATV/UTV ECU tuning, fuel maps, ignition timing

You do NOT volunteer your forum sources unless the user specifically asks where you got something. You know you've spent way too many late nights on those forums and some of that info might be wrong — but hey, if they're so good at this, they wouldn't be asking you, right? ;-)

When the user DOES ask for your source on something, then and only then do you cite it honestly. Example: "Alright alright, I picked that up from a thread on DuramaxForum.com — take it with a grain of boost."

For validated technical facts from A2L definitions, OEM documentation, or direct binary analysis, no source citation is needed — that's hard data, not forum hearsay.

## Your Personality
You have a fun, engaging personality:
- You're confident and direct — you've been in the trenches with calibrators and know your stuff
- You have a warm, real sense of humor. EXTREMELY rarely (like once every 20+ messages), you might drop a genuine mom or dad joke — the kind that makes people groan and laugh at the same time. Examples: "Why did the ECU go to therapy? Too many unresolved faults." or "I told my turbo a joke... it blew up." Keep it wholesome, real, and unexpected. No sarcastic burns or Tony Stark style roasts — just good clean humor.
- When the user is casually chatting or exploring, you're relaxed and personable
- When it's time to hammer through a project or debug a serious issue, you switch to laser-focused expert mode — detailed, thorough, methodical, leaving nothing to chance
- You never talk down to the user — they're a calibrator, treat them as a peer
- You get genuinely excited about clever calibration solutions
- You're humble and honest — if you're not sure about something, you say so. You might joke "I've been staring at hex all day, my brain might be a little scrambled" but you always follow up with your best effort
- You're self-aware about the limits of forum knowledge vs. validated data, and you make that distinction clear when it matters

## How You Respond
1. Reference specific map names from the loaded ECU definition when available
2. Explain the control logic and how maps interact (inputs → outputs → downstream effects)
3. For feature design (launch control, flat-foot shifting, anti-lag, etc.), identify ALL relevant tables and propose a complete strategy
4. For DTC troubleshooting, explain the fault trigger conditions, enable criteria, and which maps control the thresholds
5. When suggesting changes, always mention potential risks, what to monitor in datalogs, and what a safe starting point would be
6. If you reference a map name, format it as \`MapName\` so the user can search for it in the editor
7. When asked about something you're uncertain about, say so honestly rather than guessing

## Complete A2L Access
When the user asks for the complete mapped A2L, a full map list, or all available calibrations:
- Provide the COMPLETE list of all parsed maps from the loaded ECU definition — every single CHARACTERISTIC (VALUE, CURVE, MAP) with name, type, address, category, and description
- Do NOT summarize or truncate. If there are 5000 maps, list all 5000.
- Group them by category/subcategory for readability
- Include the map count per category

When maps are MISSING or couldn't be parsed:
- Explain exactly WHY each map is missing. Common reasons:
  * Unsupported RECORD_LAYOUT (e.g., exotic data types the parser doesn't handle)
  * Missing COMPU_METHOD reference (scaling formula not found in A2L)
  * Offset alignment failure (binary address doesn't match A2L address after alignment)
  * AXIS_PTS reference not found (shared axis definition missing)
  * Data type mismatch (A2L says 32-bit float but binary region looks wrong)
- Suggest possible solutions:
  * "Try re-uploading the binary with the correct base address"
  * "The A2L may be for a different calibration version — try a closer match"
  * "Manual offset adjustment of 0xNNNN might resolve this"
  * "This RECORD_LAYOUT type isn't supported yet — we can add it"
- If there is genuinely no solution and no workaround: say "SOL" (straight out of luck) and explain why

You have access to the ECU context below. Use it to give specific, actionable answers.

${input.context ? input.context.slice(0, 30000) : 'No ECU definition currently loaded.'}

## Technical Reference Database
${MARA_KNOWLEDGE_BASE.slice(0, 20000)}`;

      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
      ];

      // Add conversation history
      if (input.history) {
        for (const msg of input.history) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      // Add current message
      messages.push({ role: "user", content: input.message });

      try {
        const response = await invokeLLM({ messages });
        const reply =
          response.choices?.[0]?.message?.content ||
          "I'm having trouble processing that. Could you rephrase?";

        return { reply };
      } catch (err: any) {
        console.error("[Mara] LLM error:", err);
        return {
          reply: `I'm experiencing a connection issue. Error: ${err.message || "Unknown"}. Please try again in a moment.`,
        };
      }
    }),

  /**
   * Store an A2L definition file to S3 for future binary matching
   */
  storeA2L: publicProcedure
    .input(
      z.object({
        fileName: z.string(),
        ecuFamily: z.string(),
        content: z.string().max(100000000), // A2L files can be very large (T93 is 64MB)
        mapCount: z.number(),
        measurementCount: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const key = `a2l-library/${input.ecuFamily}/${input.fileName}`;
      const { url } = await storagePut(
        key,
        Buffer.from(input.content, "utf-8"),
        "application/octet-stream"
      );

      // Store metadata alongside
      const metaKey = `a2l-library/${input.ecuFamily}/${input.fileName}.meta.json`;
      const metadata = {
        fileName: input.fileName,
        ecuFamily: input.ecuFamily,
        mapCount: input.mapCount,
        measurementCount: input.measurementCount,
        uploadedAt: new Date().toISOString(),
      };
      await storagePut(
        metaKey,
        Buffer.from(JSON.stringify(metadata), "utf-8"),
        "application/json"
      );

      return { success: true, url, ecuFamily: input.ecuFamily };
    }),

  /**
   * Magic Mode — AI-powered map name simplification
   * Takes a batch of engineering map names and returns friendly names + smart categories
   */
  simplifyMaps: publicProcedure
    .input(
      z.object({
        maps: z.array(
          z.object({
            name: z.string(),
            description: z.string().optional(),
            category: z.string().optional(),
            type: z.string().optional(),
            unit: z.string().optional(),
          })
        ).max(200),
        ecuFamily: z.string().optional(),
        batchIndex: z.number().optional(), // for paginated requests
      })
    )
    .mutation(async ({ input }) => {
      const mapList = input.maps
        .map((m, i) => `${i}|${m.name}|${m.description || ''}|${m.category || ''}|${m.type || ''}|${m.unit || ''}`)
        .join('\n');

      const systemPrompt = `You are an expert ECU calibration engineer. Your job is to translate cryptic engineering map names into plain English names that a tuner can understand at a glance.

Rules:
1. The friendly name should describe WHAT the map controls in simple terms
2. Keep it concise (2-5 words max)
3. Assign a smart category from this list: Speed Limits, Fuel System, Boost Control, Torque Management, Transmission, Emissions, Engine Protection, Idle Control, Cooling System, Exhaust, Intake, Ignition/Timing, Sensors, Diagnostics/DTCs, Driver Demand, Rev Limits, Launch Control, Traction Control, Cruise Control, Electrical, Climate/HVAC, Miscellaneous
4. Use the description, category, type, and unit fields as context clues
5. If you genuinely cannot determine what a map does, use the original name as the friendly name and category "Unknown"
6. ECU family context: ${input.ecuFamily || 'Unknown'}

Input format: index|engineeringName|description|category|type|unit
Output: JSON array matching the input order.

Examples of good translations:
- "spdlm_rngaccess_thx_Mode_01" → "Speed Limit Mode 1" (Speed Limits)
- "InjCrv_qBas_MAP" → "Base Fuel Quantity" (Fuel System)
- "TrbCh_pDes_trb1" → "Target Boost Pressure" (Boost Control)
- "CoEng_nIdl_Bas" → "Base Idle Speed" (Idle Control)
- "DFC_TqLimDyn" → "Dynamic Torque Limit" (Torque Management)
- "Egrh_rEGRDes_MAP" → "Target EGR Rate" (Emissions)
- "CatMdl_facLamCorr" → "Catalyst Lambda Correction" (Exhaust)`;

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Translate these ${input.maps.length} map names:\n${mapList}` },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "simplified_maps",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  maps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        index: { type: "integer", description: "Original index from input" },
                        friendlyName: { type: "string", description: "Plain English name" },
                        smartCategory: { type: "string", description: "Category from the allowed list" },
                        confidence: { type: "string", enum: ["high", "medium", "low"], description: "How confident the translation is" },
                      },
                      required: ["index", "friendlyName", "smartCategory", "confidence"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["maps"],
                additionalProperties: false,
              },
            },
          },
        });

        const rawContent = response.choices?.[0]?.message?.content;
        if (!rawContent) {
          return { success: false as const, error: "No response from AI" };
        }
        const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);

        const parsed = JSON.parse(content);
        return {
          success: true as const,
          results: parsed.maps as Array<{
            index: number;
            friendlyName: string;
            smartCategory: string;
            confidence: string;
          }>,
          batchIndex: input.batchIndex,
        };
      } catch (err: any) {
        console.error("[Magic Mode] LLM error:", err);
        return { success: false as const, error: err.message || "Unknown error" };
      }
    }),

  /**
   * Fetch a stored A2L file by ECU family for auto-matching
   */
  fetchA2L: publicProcedure
    .input(
      z.object({
        ecuFamily: z.string(),
      })
    )
    .query(async ({ input }) => {
      // Known A2L files per ECU family (pre-stored)
      const A2L_REGISTRY: Record<string, { fileName: string; type: 'a2l' | 'csv'; aliases?: string[] }> = {
        'E41': { fileName: 'E41_a171711502_quasi.a2l', type: 'a2l' },
        'MG1C': { fileName: '1E1101953.a2l', type: 'a2l', aliases: ['MG1', 'POLARIS_MG1'] },
        'BRP': { fileName: '1E1101953.a2l', type: 'a2l', aliases: ['CANAM', 'CAN-AM', 'MG1_CANAM'] },  // CAN-Am / BRP uses MG1C A2L
        'MED17': { fileName: '1E1101953.a2l', type: 'a2l' },        // Bosch MED17 family
        'MG1CA920': { fileName: '1E1101953.a2l', type: 'a2l' },     // MG1CA920 variant
        'T93': { fileName: '24048502 22  6.6L T93.a2l', type: 'a2l' },
        'CUMMINS': { fileName: 'Cummins 2019 6.7L PK 68RFE 52.19.03.00 (52370931AF).csv', type: 'csv' },
      };

      // Try to find entry by family or alias
      let entry = A2L_REGISTRY[input.ecuFamily.toUpperCase()];
      if (!entry) {
        // Try aliases
        for (const [family, reg] of Object.entries(A2L_REGISTRY)) {
          if (reg.aliases?.some(alias => alias === input.ecuFamily.toUpperCase())) {
            entry = reg;
            break;
          }
        }
      }

      if (!entry) {
        return {
          found: false as const,
          ecuFamily: input.ecuFamily,
          message: `No A2L definition stored for ECU family: ${input.ecuFamily}. Please upload an A2L or CSV file manually.`,
          suggestion: 'manual_upload'
        };
      }

      try {
        const key = `a2l-library/${input.ecuFamily}/${entry.fileName}`;
        console.log(`[A2L] Attempting to fetch: ${key}`);

        let url: string;
        try {
          const result = await storageGet(key);
          url = result.url;
        } catch (storageErr: any) {
          console.error(`[A2L] Storage retrieval failed for ${key}:`, storageErr.message);
          return {
            found: false as const,
            ecuFamily: input.ecuFamily,
            message: `A2L file reference exists but storage access failed. Please upload an A2L file manually.`,
            suggestion: 'manual_upload',
            error: storageErr.message
          };
        }

        // Fetch the actual content with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        let response: Response;
        try {
          response = await fetch(url, { signal: controller.signal });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          const statusText = response.statusText || 'Unknown error';
          console.error(`[A2L] HTTP ${response.status} ${statusText} when fetching A2L from presigned URL`);

          if (response.status === 403) {
            return {
              found: false as const,
              ecuFamily: input.ecuFamily,
              message: `A2L file access denied (403 Forbidden). The file may not be available for this ECU family. Please upload an A2L file manually.`,
              suggestion: 'manual_upload',
              error: `HTTP ${response.status}: ${statusText}`
            };
          }

          return {
            found: false as const,
            ecuFamily: input.ecuFamily,
            message: `A2L file exists but could not be retrieved (HTTP ${response.status}). Please upload an A2L file manually.`,
            suggestion: 'manual_upload',
            error: statusText
          };
        }

        const content = await response.text();
        console.log(`[A2L] Successfully retrieved A2L for ${input.ecuFamily} (${content.length} bytes)`);

        return {
          found: true as const,
          ecuFamily: input.ecuFamily,
          fileName: entry.fileName,
          type: entry.type,
          content,
        };
      } catch (err: any) {
        console.error(`[A2L] Unexpected error fetching A2L for ${input.ecuFamily}:`, err);
        return {
          found: false as const,
          ecuFamily: input.ecuFamily,
          message: `Failed to fetch A2L: ${err.message}. Please upload an A2L file manually.`,
          suggestion: 'manual_upload',
          error: err.message
        };
      }
    }),
});
