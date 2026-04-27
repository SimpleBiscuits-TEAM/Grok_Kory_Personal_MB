/**
 * IntelliSpy tRPC Router — Knox-powered CAN bus frame analysis
 * =============================================================
 * Provides AI analysis of captured CAN frames, module identification,
 * flash operation decoding, and protocol-aware diagnostics.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { getFullKnoxKnowledge } from "../lib/knoxKnowledgeServer";
import { queryKnox, type AccessLevel } from "../lib/knoxReconciler";

const frameSchema = z.object({
  arbId: z.number(),
  arbIdHex: z.string(),
  data: z.array(z.number()),
  dataHex: z.string(),
  dlc: z.number(),
  isExtended: z.boolean().optional(),
  moduleName: z.string().optional(),
  moduleAcronym: z.string().optional(),
  direction: z.string().optional(),
  count: z.number().optional(),
  rateHz: z.number().optional(),
});

export const intellispyRouter = router({
  /**
   * Analyze captured CAN frames with Knox AI.
   * Identifies modules, decodes data patterns, explains flash operations,
   * and provides protocol-specific insights.
   */
  analyzeFrames: protectedProcedure
    .input(z.object({
      frames: z.array(frameSchema).max(200),
      protocol: z.enum(['obd2', 'j1939', 'uds', 'canfd', 'kline', 'raw']).default('obd2'),
      question: z.string().optional(),
      context: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { frames, protocol, question, context } = input;

      // Build frame summary for Knox
      const frameSummary = frames.map(f => {
        const parts = [
          `ID: ${f.arbIdHex}`,
          `Data: [${f.dataHex}]`,
          `DLC: ${f.dlc}`,
        ];
        if (f.moduleName) parts.push(`Module: ${f.moduleName} (${f.moduleAcronym})`);
        if (f.direction) parts.push(`Dir: ${f.direction}`);
        if (f.count) parts.push(`Count: ${f.count}`);
        if (f.rateHz) parts.push(`Rate: ${f.rateHz.toFixed(1)} Hz`);
        if (f.isExtended) parts.push('Extended');
        return parts.join(' | ');
      }).join('\n');

      // Get unique arb IDs for module identification
      const uniqueIds = Array.from(new Set(frames.map(f => f.arbIdHex)));

      const knoxKnowledge = getFullKnoxKnowledge().slice(0, 15000);

      const systemPrompt = `You are Knox, PPEI's AI-powered CAN bus analysis engine integrated into IntelliSpy.
You are an expert in automotive CAN bus protocols, ECU communication, and vehicle diagnostics.

PROTOCOL CONTEXT: Currently monitoring in ${protocol.toUpperCase()} mode.

YOUR CAPABILITIES:
1. MODULE IDENTIFICATION: Identify ECU modules by their CAN arbitration IDs
2. FRAME DECODING: Decode raw CAN data bytes into meaningful parameters
3. FLASH MONITORING: Recognize and explain UDS flash operations (0x34 RequestDownload, 0x36 TransferData, 0x2E WriteDID, 0x31 RoutineControl, 0x27 SecurityAccess)
4. J1939 DECODING: Decode J1939 PGNs (EEC1, EEC2, ET1, etc.) with parameter extraction
5. PATTERN ANALYSIS: Identify communication patterns, bus load, and anomalies
6. PROTOCOL EXPERTISE: OBD-II, J1939, UDS (ISO 14229), CAN FD, ISO-TP

KNOWN MODULE ADDRESSES:
- 0x7E0/0x7E8: ECM/PCM (Engine Control Module)
- 0x7E1/0x7E9: TCM (Transmission Control Module)
- 0x7E2/0x7EA: ABS/ESC Module
- 0x7E3/0x7EB: IPC (Instrument Panel Cluster)
- 0x7DF: OBD-II Broadcast Request
- 0x18FEF100-0x18FEFF00: J1939 Engine Parameters (29-bit)

UDS SERVICE IDENTIFICATION:
- 0x10: DiagnosticSessionControl (0x01=Default, 0x02=Programming, 0x03=Extended)
- 0x22: ReadDataByIdentifier
- 0x27: SecurityAccess (odd=seed request, even=key response)
- 0x2E: WriteDataByIdentifier (FLASH: writing calibration parameters)
- 0x31: RoutineControl (FLASH: erase/verify routines)
- 0x34: RequestDownload (FLASH: initiating firmware download)
- 0x36: TransferData (FLASH: sending firmware blocks)
- 0x37: RequestTransferExit (FLASH: completing download)
- 0x3E: TesterPresent (keepalive)
- 0x7F: Negative Response (NRC in byte 3)

FLASH OPERATION SEQUENCE:
1. DiagnosticSessionControl → Programming (0x10 0x02)
2. SecurityAccess → Seed Request (0x27 0x01)
3. SecurityAccess → Key Response (0x27 0x02)
4. RoutineControl → Erase Memory (0x31 0x01)
5. RequestDownload (0x34)
6. TransferData (0x36) × N blocks
7. RequestTransferExit (0x37)
8. RoutineControl → Verify (0x31 0x01)
9. ECUReset (0x11 0x01)

PPEI KNOWLEDGE BASE:
${knoxKnowledge}

RESPONSE FORMAT:
- Be concise but thorough
- Use technical CAN bus terminology
- Highlight any flash/calibration operations in **bold**
- Flag any anomalies or errors
- If you see a flash sequence, describe what stage it's at
- For unknown IDs, suggest what they might be based on the address range and data patterns`;

      const userMessage = question
        ? `${question}\n\nCaptured CAN frames (${protocol.toUpperCase()} protocol):\n${frameSummary}${context ? `\n\nAdditional context: ${context}` : ''}`
        : `Analyze these captured CAN bus frames. Identify all modules, decode the data, and explain what's happening on the bus. If any flash/calibration operations are in progress, describe them in detail.\n\nUnique Arbitration IDs: ${uniqueIds.join(', ')}\n\nCaptured frames (${protocol.toUpperCase()} protocol):\n${frameSummary}${context ? `\n\nAdditional context: ${context}` : ''}`;

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        });

        const analysis = typeof response.choices?.[0]?.message?.content === 'string'
          ? response.choices[0].message.content
          : 'Analysis unavailable.';

        return { analysis, framesAnalyzed: frames.length, protocol };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { analysis: `Knox analysis error: ${msg}`, framesAnalyzed: 0, protocol };
      }
    }),

  /**
   * Decode a single UDS frame for live flash monitoring.
   * Returns structured decode info without calling LLM (fast path).
   */
  decodeUDSFrame: protectedProcedure
    .input(z.object({
      arbId: z.number(),
      data: z.array(z.number()),
      isExtended: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { arbId, data } = input;
      if (data.length < 2) return null;

      const serviceId = data[1];

      // UDS positive response
      if (serviceId >= 0x50) {
        const requestService = serviceId - 0x40;
        return decodeUDSService(requestService, data, arbId, true);
      }

      // UDS request
      if (serviceId <= 0x3F) {
        return decodeUDSService(serviceId, data, arbId, false);
      }

      // Negative response
      if (data[1] === 0x7F && data.length >= 4) {
        const rejectedService = data[2];
        const nrc = data[3];
        return {
          type: 'negative_response' as const,
          service: rejectedService,
          serviceName: UDS_SERVICE_NAMES[rejectedService] || `0x${rejectedService.toString(16)}`,
          nrc,
          nrcName: NRC_NAMES[nrc] || `0x${nrc.toString(16)}`,
          isFlash: FLASH_SERVICES.has(rejectedService),
          description: `REJECTED: ${UDS_SERVICE_NAMES[rejectedService] || 'Unknown'} — ${NRC_NAMES[nrc] || 'Unknown NRC'}`,
        };
      }

      return null;
    }),

  /**
   * Knox chat for IntelliSpy — conversational AI with live CAN bus context.
   * Users can ask questions about what they're seeing on the bus in real-time.
   */
  knoxChat: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1).max(5000),
        liveFrames: z.array(frameSchema).max(100).optional(),
        protocol: z.enum(['obd2', 'j1939', 'uds', 'canfd', 'kline', 'raw']).default('obd2'),
        busContext: z.string().optional(), // Summary of current bus state
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
    .mutation(async ({ input, ctx }) => {
      const userAccessLevel = (ctx.user?.accessLevel || 0) as AccessLevel;
      const effectiveLevel: AccessLevel = userAccessLevel >= 3 ? 3 : userAccessLevel >= 2 ? 2 : 1;

      // Build live frame context for the agents
      let frameContext = '';
      if (input.liveFrames && input.liveFrames.length > 0) {
        frameContext = input.liveFrames.map(f => {
          const parts = [`ID: ${f.arbIdHex}`, `Data: [${f.dataHex}]`, `DLC: ${f.dlc}`];
          if (f.moduleName) parts.push(`Module: ${f.moduleName} (${f.moduleAcronym})`);
          if (f.direction) parts.push(`Dir: ${f.direction}`);
          if (f.count) parts.push(`Count: ${f.count}`);
          if (f.rateHz) parts.push(`Rate: ${f.rateHz.toFixed(1)} Hz`);
          return parts.join(' | ');
        }).join('\n');
      }

      const fullContext = [
        `Protocol: ${input.protocol.toUpperCase()}`,
        input.busContext ? `Bus State: ${input.busContext}` : '',
        frameContext ? `Live CAN Frames:\n${frameContext}` : '',
      ].filter(Boolean).join('\n\n');

      try {
        const knoxResult = await queryKnox({
          question: input.message,
          accessLevel: effectiveLevel,
          domain: 'intellispy',
          moduleContext: fullContext.slice(0, 15000),
          history: input.history,
        });

        return {
          reply: knoxResult.answer,
          pipeline: knoxResult.pipeline,
          confidence: knoxResult.confidence,
          agreement: knoxResult.agreement,
          agentDetails: knoxResult.agentDetails,
          durationMs: knoxResult.durationMs,
        };
      } catch (err: any) {
        // Fallback to direct LLM
        const knoxKnowledge = getFullKnoxKnowledge().slice(0, 15000);
        try {
          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You are Knox, PPEI's AI-powered CAN bus analysis engine integrated into IntelliSpy.
You are having a conversation with the user about what they're seeing on the CAN bus.

PROTOCOL: ${input.protocol.toUpperCase()}
${fullContext ? `\nCURRENT BUS STATE:\n${fullContext}` : ''}

PPEI KNOWLEDGE BASE:\n${knoxKnowledge}

Be concise, technical, and helpful. Reference specific CAN IDs and data bytes when relevant.`,
              },
              ...(input.history || []).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
              { role: "user" as const, content: input.message },
            ],
          });
          return {
            reply: typeof response.choices?.[0]?.message?.content === 'string'
              ? response.choices[0].message.content
              : 'Analysis unavailable.',
            pipeline: 'fallback' as const,
          };
        } catch (fallbackErr: any) {
          return {
            reply: `Knox is temporarily unavailable. Error: ${fallbackErr.message || 'Unknown'}`,
            pipeline: 'error' as const,
          };
        }
      }
    }),
});

// ─── UDS Decode Helpers ──────────────────────────────────────────────────────

const FLASH_SERVICES = new Set([0x10, 0x27, 0x2E, 0x31, 0x34, 0x36, 0x37, 0x11]);

const UDS_SERVICE_NAMES: Record<number, string> = {
  0x10: 'DiagnosticSessionControl',
  0x11: 'ECUReset',
  0x14: 'ClearDTC',
  0x19: 'ReadDTC',
  0x22: 'ReadDataByIdentifier',
  0x23: 'ReadMemoryByAddress',
  0x27: 'SecurityAccess',
  0x28: 'CommunicationControl',
  0x2E: 'WriteDataByIdentifier',
  0x2F: 'InputOutputControl',
  0x31: 'RoutineControl',
  0x34: 'RequestDownload',
  0x35: 'RequestUpload',
  0x36: 'TransferData',
  0x37: 'RequestTransferExit',
  0x3E: 'TesterPresent',
};

const NRC_NAMES: Record<number, string> = {
  0x10: 'General Reject',
  0x11: 'Service Not Supported',
  0x12: 'Sub-Function Not Supported',
  0x13: 'Incorrect Message Length',
  0x14: 'Response Too Long',
  0x21: 'Busy — Repeat Request',
  0x22: 'Conditions Not Correct',
  0x24: 'Request Sequence Error',
  0x31: 'Request Out Of Range',
  0x33: 'Security Access Denied',
  0x35: 'Invalid Key',
  0x36: 'Exceeded Number Of Attempts',
  0x37: 'Required Time Delay Not Expired',
  0x70: 'Upload/Download Not Accepted',
  0x71: 'Transfer Data Suspended',
  0x72: 'General Programming Failure',
  0x73: 'Wrong Block Sequence Counter',
  0x78: 'Response Pending',
  0x7E: 'Sub-Function Not Supported In Active Session',
  0x7F: 'Service Not Supported In Active Session',
};

function decodeUDSService(
  service: number,
  data: number[],
  arbId: number,
  isResponse: boolean
) {
  const serviceName = UDS_SERVICE_NAMES[service] || `Service 0x${service.toString(16)}`;
  const isFlash = FLASH_SERVICES.has(service);
  const module = `ECU 0x${(isResponse ? arbId - 8 : arbId).toString(16).toUpperCase()}`;

  let description = `${isResponse ? '✓' : '→'} ${serviceName}`;
  const parameters: Record<string, string | number> = {};

  switch (service) {
    case 0x10: { // DiagnosticSessionControl
      const sessions: Record<number, string> = { 1: 'Default', 2: 'Programming', 3: 'Extended' };
      const session = data[2];
      parameters.session = sessions[session] || `Custom (0x${session?.toString(16)})`;
      description += ` → ${parameters.session} Session`;
      break;
    }
    case 0x22: { // ReadDataByIdentifier
      if (data.length >= 4) {
        const did = (data[2] << 8) | data[3];
        parameters.did = `0x${did.toString(16).toUpperCase()}`;
        description += ` DID ${parameters.did}`;
      }
      break;
    }
    case 0x27: { // SecurityAccess
      const subFn = data[2];
      const isSeedRequest = subFn % 2 === 1;
      parameters.accessLevel = Math.ceil(subFn / 2);
      parameters.operation = isSeedRequest ? 'SEED REQUEST' : 'KEY RESPONSE';
      description += ` → ${parameters.operation} (Level ${parameters.accessLevel})`;
      break;
    }
    case 0x2E: { // WriteDataByIdentifier
      if (data.length >= 4) {
        const did = (data[2] << 8) | data[3];
        parameters.did = `0x${did.toString(16).toUpperCase()}`;
        parameters.payloadSize = data.length - 4;
        description += ` → WRITING DID ${parameters.did} (${parameters.payloadSize} bytes)`;
      }
      break;
    }
    case 0x31: { // RoutineControl
      if (data.length >= 4) {
        const subFn = data[2];
        const routineId = (data[3] << 8) | (data[4] || 0);
        parameters.routineId = `0x${routineId.toString(16).toUpperCase()}`;
        parameters.subFunction = subFn === 0x01 ? 'START' : subFn === 0x02 ? 'STOP' : 'RESULTS';
        description += ` → ${parameters.subFunction} Routine ${parameters.routineId}`;
      }
      break;
    }
    case 0x34: { // RequestDownload
      if (data.length >= 3) {
        parameters.dataFormat = data[2];
        description += ' → FLASH DOWNLOAD INITIATED';
      }
      break;
    }
    case 0x36: { // TransferData
      parameters.blockSequence = data[2];
      parameters.payloadSize = data.length - 3;
      description += ` → BLOCK #${data[2]} (${parameters.payloadSize} bytes)`;
      break;
    }
    case 0x37: { // RequestTransferExit
      description += ' → FLASH TRANSFER COMPLETE';
      break;
    }
    case 0x11: { // ECUReset
      const resetTypes: Record<number, string> = { 1: 'Hard Reset', 2: 'Key Off/On', 3: 'Soft Reset' };
      parameters.resetType = resetTypes[data[2]] || `Type ${data[2]}`;
      description += ` → ${parameters.resetType}`;
      break;
    }
    case 0x3E: { // TesterPresent
      description += ' (keepalive)';
      break;
    }
  }

  return {
    type: isResponse ? 'positive_response' as const : 'request' as const,
    service,
    serviceName,
    isFlash,
    module,
    description,
    parameters,
  };
}
