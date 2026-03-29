/**
 * Voice Command Router
 * 
 * Handles speech-to-text transcription, natural language PID query intent recognition,
 * and text-to-speech response generation for real-time vehicle data queries.
 * 
 * Flow:
 * 1. Frontend captures audio via MediaRecorder → uploads to S3 → sends URL
 * 2. Server transcribes audio via Whisper API
 * 3. LLM analyzes transcript to identify PID query intent
 * 4. Returns structured response with matched PIDs and natural language answer
 * 5. Frontend reads response aloud via Web Speech API (browser TTS)
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { transcribeAudio } from "../_core/voiceTranscription";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";

// ── PID Knowledge Base ──────────────────────────────────────────────────────
// Maps natural language terms to PID categories and specific parameters
const PID_KNOWLEDGE = {
  fuel: {
    keywords: ["fuel", "gas", "tank", "fuel level", "fuel tank", "how much fuel", "gasoline", "diesel fuel"],
    pids: [
      { pid: 0x2F, service: 0x01, name: "Fuel Tank Level", shortName: "FUEL_LVL", unit: "%" },
      { pid: 0x0A, service: 0x01, name: "Fuel Pressure", shortName: "FP", unit: "kPa" },
      { pid: 0x23, service: 0x01, name: "Fuel Rail Pressure", shortName: "FRP", unit: "kPa" },
      { pid: 0x22, service: 0x01, name: "Fuel Rail Pressure (relative)", shortName: "FRP_R", unit: "kPa" },
    ],
  },
  engine: {
    keywords: ["engine", "rpm", "speed", "how fast", "revs", "revving", "idle", "engine speed"],
    pids: [
      { pid: 0x0C, service: 0x01, name: "Engine RPM", shortName: "RPM", unit: "RPM" },
      { pid: 0x04, service: 0x01, name: "Calculated Engine Load", shortName: "LOAD", unit: "%" },
      { pid: 0x1F, service: 0x01, name: "Run Time Since Engine Start", shortName: "RUN_TIME", unit: "sec" },
    ],
  },
  temperature: {
    keywords: ["temperature", "temp", "hot", "cold", "coolant", "water temp", "engine temp", "how hot", "overheating"],
    pids: [
      { pid: 0x05, service: 0x01, name: "Engine Coolant Temperature", shortName: "ECT", unit: "°F" },
      { pid: 0x0F, service: 0x01, name: "Intake Air Temperature", shortName: "IAT", unit: "°F" },
      { pid: 0x46, service: 0x01, name: "Ambient Air Temperature", shortName: "AAT", unit: "°F" },
    ],
  },
  speed: {
    keywords: ["speed", "mph", "how fast", "velocity", "going", "driving speed", "vehicle speed"],
    pids: [
      { pid: 0x0D, service: 0x01, name: "Vehicle Speed", shortName: "VSS", unit: "mph" },
    ],
  },
  boost: {
    keywords: ["boost", "turbo", "pressure", "manifold", "map", "boost pressure", "turbo pressure", "psi"],
    pids: [
      { pid: 0x0B, service: 0x01, name: "Intake Manifold Pressure", shortName: "MAP", unit: "kPa" },
    ],
  },
  throttle: {
    keywords: ["throttle", "pedal", "accelerator", "gas pedal", "throttle position"],
    pids: [
      { pid: 0x11, service: 0x01, name: "Throttle Position", shortName: "TPS", unit: "%" },
      { pid: 0x49, service: 0x01, name: "Accelerator Pedal Position", shortName: "APP", unit: "%" },
    ],
  },
  airflow: {
    keywords: ["air flow", "maf", "mass air", "air intake", "airflow"],
    pids: [
      { pid: 0x10, service: 0x01, name: "Mass Air Flow Rate", shortName: "MAF", unit: "g/s" },
    ],
  },
  timing: {
    keywords: ["timing", "advance", "ignition timing", "spark timing"],
    pids: [
      { pid: 0x0E, service: 0x01, name: "Timing Advance", shortName: "TIMING", unit: "°" },
    ],
  },
  oxygen: {
    keywords: ["oxygen", "o2", "lambda", "air fuel", "afr", "wideband"],
    pids: [
      { pid: 0x14, service: 0x01, name: "O2 Sensor Voltage (Bank 1 Sensor 1)", shortName: "O2_B1S1", unit: "V" },
      { pid: 0x24, service: 0x01, name: "O2 Sensor (Wide Range, B1S1)", shortName: "O2WR_B1S1", unit: "ratio" },
    ],
  },
  battery: {
    keywords: ["battery", "voltage", "charging", "alternator", "electrical", "battery voltage"],
    pids: [
      { pid: 0x42, service: 0x01, name: "Control Module Voltage", shortName: "VPWR", unit: "V" },
    ],
  },
  exhaust: {
    keywords: ["exhaust", "egt", "exhaust gas", "exhaust temp", "exhaust temperature", "pyro"],
    pids: [
      { pid: 0x78, service: 0x01, name: "Exhaust Gas Temperature (Bank 1)", shortName: "EGT_B1", unit: "°F" },
    ],
  },
  transmission: {
    keywords: ["transmission", "trans", "gear", "shift", "trans temp", "transmission temperature", "tcc"],
    pids: [
      { pid: 0x5C, service: 0x01, name: "Engine Oil Temperature", shortName: "EOT", unit: "°F" },
    ],
  },
  faults: {
    keywords: ["fault", "code", "dtc", "check engine", "mil", "error", "problem", "diagnostic", "trouble code", "warning"],
    pids: [
      { pid: 0x01, service: 0x01, name: "Monitor Status (DTC Count)", shortName: "DTC_CNT", unit: "count" },
    ],
  },
  distance: {
    keywords: ["distance", "miles", "odometer", "mileage", "how far"],
    pids: [
      { pid: 0x31, service: 0x01, name: "Distance Since Codes Cleared", shortName: "DIST_CLR", unit: "km" },
      { pid: 0x21, service: 0x01, name: "Distance with MIL On", shortName: "MIL_DIST", unit: "km" },
    ],
  },
};

// Flatten all PID knowledge into a searchable list
function getAllKnownPids() {
  const allPids: Array<{ category: string; keywords: string[]; pid: number; service: number; name: string; shortName: string; unit: string }> = [];
  for (const [category, data] of Object.entries(PID_KNOWLEDGE)) {
    for (const pid of data.pids) {
      allPids.push({ category, keywords: data.keywords, ...pid });
    }
  }
  return allPids;
}

// ── Intent Recognition ──────────────────────────────────────────────────────

interface VoiceIntent {
  type: "pid_query" | "command" | "general_question" | "unknown";
  matchedPids: Array<{ pid: number; service: number; name: string; shortName: string; unit: string; confidence: number }>;
  naturalResponse: string;
  requiresLiveData: boolean;
}

/**
 * Use LLM to analyze voice command and match to PIDs
 */
async function analyzeVoiceIntent(transcript: string, availablePids: string[]): Promise<VoiceIntent> {
  const pidList = getAllKnownPids();
  const pidSummary = pidList.map(p => `${p.shortName}: ${p.name} (${p.unit}) [category: ${p.category}]`).join("\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a vehicle diagnostic assistant embedded in an ECU analyzer tool. 
Your job is to understand voice commands about vehicle data and match them to the correct PIDs (Parameter IDs).

Available PIDs:
${pidSummary}

${availablePids.length > 0 ? `Currently active/connected PIDs: ${availablePids.join(", ")}` : "No PIDs currently connected."}

Respond in JSON format with:
- type: "pid_query" (asking for vehicle data), "command" (action request), "general_question" (general automotive question), or "unknown"
- matchedPids: array of matched PID shortNames with confidence (0-1)
- naturalResponse: A brief, friendly response to say back to the user. If requesting live data, phrase it as "Let me check your [parameter]..." If no connection, say "I'd need a vehicle connection to check that."
- requiresLiveData: true if the query needs real-time vehicle data

Examples:
- "How much fuel is in the tank?" → type: "pid_query", matchedPids: [{shortName: "FUEL_LVL", confidence: 0.95}]
- "What's the engine temperature?" → type: "pid_query", matchedPids: [{shortName: "ECT", confidence: 0.95}]
- "How fast am I going?" → type: "pid_query", matchedPids: [{shortName: "VSS", confidence: 0.95}]
- "Are there any fault codes?" → type: "pid_query", matchedPids: [{shortName: "DTC_CNT", confidence: 0.90}]
- "What does P0300 mean?" → type: "general_question", matchedPids: []`
      },
      {
        role: "user",
        content: transcript,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "voice_intent",
        strict: true,
        schema: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["pid_query", "command", "general_question", "unknown"] },
            matchedPids: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  shortName: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["shortName", "confidence"],
                additionalProperties: false,
              },
            },
            naturalResponse: { type: "string" },
            requiresLiveData: { type: "boolean" },
          },
          required: ["type", "matchedPids", "naturalResponse", "requiresLiveData"],
          additionalProperties: false,
        },
      },
    },
  });

  const parsed = JSON.parse(response.choices[0].message.content as string);

  // Resolve shortNames to full PID info
  const pidList2 = getAllKnownPids();
  const resolvedPids = parsed.matchedPids.map((mp: { shortName: string; confidence: number }) => {
    const found = pidList2.find(p => p.shortName === mp.shortName);
    if (found) {
      return { pid: found.pid, service: found.service, name: found.name, shortName: found.shortName, unit: found.unit, confidence: mp.confidence };
    }
    return null;
  }).filter(Boolean);

  return {
    type: parsed.type,
    matchedPids: resolvedPids,
    naturalResponse: parsed.naturalResponse,
    requiresLiveData: parsed.requiresLiveData,
  };
}

/**
 * Generate a natural language response with live PID values
 */
async function generateDataResponse(
  transcript: string,
  pidValues: Array<{ name: string; shortName: string; value: number; unit: string }>
): Promise<string> {
  const valuesSummary = pidValues.map(v => `${v.name}: ${v.value} ${v.unit}`).join(", ");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a friendly vehicle diagnostic assistant. The user asked a question about their vehicle, and you now have the live data. 
Respond naturally and conversationally, as if you're talking to the driver. Keep it brief (1-2 sentences).
Be specific with the values. Use imperial units where appropriate (°F, mph, psi).
If values seem abnormal, briefly mention it.`
      },
      {
        role: "user",
        content: `User asked: "${transcript}"\n\nLive vehicle data: ${valuesSummary}`,
      },
    ],
  });

  return response.choices[0].message.content as string;
}

// ── Router ──────────────────────────────────────────────────────────────────

export const voiceRouter = router({
  /**
   * Transcribe audio to text
   */
  transcribe: protectedProcedure
    .input(z.object({
      audioUrl: z.string(),
      language: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await transcribeAudio({
        audioUrl: input.audioUrl,
        language: input.language || "en",
        prompt: "Transcribe this vehicle diagnostic voice command",
      });

      if ("error" in result) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error,
        });
      }

      return { text: result.text, language: result.language };
    }),

  /**
   * Process a voice command (text) and return intent + matched PIDs
   */
  processCommand: protectedProcedure
    .input(z.object({
      transcript: z.string().min(1),
      activePids: z.array(z.string()).optional(), // Currently connected PID shortNames
    }))
    .mutation(async ({ input }) => {
      const intent = await analyzeVoiceIntent(input.transcript, input.activePids || []);
      return intent;
    }),

  /**
   * Generate natural language response with live PID values
   */
  generateResponse: protectedProcedure
    .input(z.object({
      transcript: z.string(),
      pidValues: z.array(z.object({
        name: z.string(),
        shortName: z.string(),
        value: z.number(),
        unit: z.string(),
      })),
    }))
    .mutation(async ({ input }) => {
      const response = await generateDataResponse(input.transcript, input.pidValues);
      return { response };
    }),

  /**
   * Full voice command pipeline: transcribe → analyze → respond
   * Used when audio is uploaded directly
   */
  fullPipeline: protectedProcedure
    .input(z.object({
      audioUrl: z.string(),
      activePids: z.array(z.string()).optional(),
      language: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Step 1: Transcribe
      const transcription = await transcribeAudio({
        audioUrl: input.audioUrl,
        language: input.language || "en",
        prompt: "Transcribe this vehicle diagnostic voice command",
      });

      if ("error" in transcription) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: transcription.error,
        });
      }

      // Step 2: Analyze intent
      const intent = await analyzeVoiceIntent(transcription.text, input.activePids || []);

      return {
        transcript: transcription.text,
        intent,
      };
    }),

  /**
   * Upload audio blob for transcription
   * Frontend sends raw audio data, server stores in S3 then transcribes
   */
  uploadAndTranscribe: protectedProcedure
    .input(z.object({
      audioBase64: z.string(), // Base64-encoded audio data
      mimeType: z.string().default("audio/webm"),
      activePids: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Decode base64 to buffer
      const audioBuffer = Buffer.from(input.audioBase64, "base64");

      // Upload to S3
      const ext = input.mimeType.split("/")[1] || "webm";
      const key = `voice-commands/${ctx.user.id}/${Date.now()}.${ext}`;
      const { url: audioUrl } = await storagePut(key, audioBuffer, input.mimeType);

      // Transcribe
      const transcription = await transcribeAudio({
        audioUrl,
        language: "en",
        prompt: "Transcribe this vehicle diagnostic voice command",
      });

      if ("error" in transcription) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: transcription.error,
        });
      }

      // Analyze intent
      const intent = await analyzeVoiceIntent(transcription.text, input.activePids || []);

      return {
        transcript: transcription.text,
        intent,
      };
    }),

  /**
   * Simple transcription endpoint for chat speech-to-text.
   * Records audio, uploads to S3, transcribes, returns text only.
   * No intent analysis — just speech-to-text for any chat input.
   */
  transcribeOnly: protectedProcedure
    .input(z.object({
      audioBase64: z.string().min(1),
      mimeType: z.string().default("audio/webm"),
    }))
    .mutation(async ({ input, ctx }) => {
      const audioBuffer = Buffer.from(input.audioBase64, "base64");

      // Upload to S3
      const ext = input.mimeType.split("/")[1]?.replace(/;.*/, "") || "webm";
      const key = `chat-audio/${ctx.user.id}/${Date.now()}.${ext}`;
      const { url: audioUrl } = await storagePut(key, audioBuffer, input.mimeType);

      // Transcribe
      const transcription = await transcribeAudio({
        audioUrl,
        language: "en",
        prompt: "Transcribe this message",
      });

      if ("error" in transcription) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: transcription.error,
        });
      }

      return { text: transcription.text };
    }),
});
