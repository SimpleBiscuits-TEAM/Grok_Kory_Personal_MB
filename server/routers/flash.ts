/**
 * Flash Router — Server-side flash container management, validation,
 * session recording, queue, stats, and upload-to-flasher pipeline.
 */
import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../_core/trpc';
import { storagePut } from '../storage';
import { ECU_DATABASE, getEcuConfig, CONTAINER_LAYOUT, type EcuConfig } from '../../shared/ecuDatabase';
import type { EcuSecurityProfile } from '../../shared/seedKeyAlgorithms';
import { computeFord3B, computeGM5B, hexToBytes, bytesToHex } from '../../shared/seedKeyAlgorithms';
import { getSecurityProfile } from '../seedKeyService';
import * as flashDb from '../flashDb';
import { notifyOwner } from '../_core/notification';
import crypto from 'crypto';

// ── Types ──────────────────────────────────────────────────────────────────

interface FlashPrepResult {
  success: boolean;
  ecuType: string;
  containerFormat: 'PPEI' | 'DEVPROG' | 'UNKNOWN';
  blockCount: number;
  totalDataBytes: number;
  transferUrl?: string;
  error?: string;
  blocks: Array<{
    blockId: number;
    type: 'OS' | 'CAL' | 'PATCH';
    startAddr: string;
    endAddr: string;
    length: number;
    compressed: boolean;
  }>;
  ecuConfig?: {
    name: string;
    protocol: string;
    canSpeed: number;
    txAddr: string;
    rxAddr: string;
    seedLevel: number;
    xferSize: number | null;
  };
  securityProfile?: {
    algorithmType: string;
    seedLength: number;
    keyLength: number;
    requiresUnlockBox: boolean;
    securityLevel: string;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseDevProgHeader(headerBytes: Uint8Array): Record<string, unknown> | null {
  try {
    let end = headerBytes.indexOf(0);
    if (end === -1) end = headerBytes.length;
    const jsonStr = new TextDecoder('ascii').decode(headerBytes.slice(0, end));
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function detectContainerFormat(data: Uint8Array): 'PPEI' | 'DEVPROG' | 'UNKNOWN' {
  if (data.length >= 3 && data[0] === 0x49 && data[1] === 0x50 && data[2] === 0x46) {
    return 'PPEI';
  }
  if (data.length >= CONTAINER_LAYOUT.HEADER_OFFSET + 100) {
    const headerSlice = data.slice(CONTAINER_LAYOUT.HEADER_OFFSET, CONTAINER_LAYOUT.HEADER_OFFSET + CONTAINER_LAYOUT.HEADER_SIZE);
    const parsed = parseDevProgHeader(headerSlice);
    if (parsed && typeof parsed === 'object' && ('ecu_type' in parsed || 'block_count' in parsed)) {
      return 'DEVPROG';
    }
  }
  return 'UNKNOWN';
}

function extractBlocks(header: Record<string, unknown>): FlashPrepResult['blocks'] {
  const blockStruct = header.block_struct as Array<Record<string, unknown>> | undefined;
  if (!blockStruct || !Array.isArray(blockStruct)) return [];
  return blockStruct.map((block) => {
    const os = String(block.OS || 'false');
    const isOS = os === 'true';
    const isPatch = os === 'patch' || os === 'forcepatch';
    const blockLength = block.block_length ? parseInt(String(block.block_length), 16) : 0;
    const lzssLen = block.LzssLen ? parseInt(String(block.LzssLen), 16) : 0;
    return {
      blockId: Number(block.block_id || 0),
      type: (isPatch ? 'PATCH' : isOS ? 'OS' : 'CAL') as 'OS' | 'CAL' | 'PATCH',
      startAddr: String(block.start_adresse || '0'),
      endAddr: String(block.end_adresse || '0'),
      length: blockLength || lzssLen,
      compressed: lzssLen > 0,
    };
  });
}

function computeSHA256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ── Router ─────────────────────────────────────────────────────────────────

export const flashRouter = router({
  // ═══════════════════════════════════════════════════════════════════════
  // CONTAINER VALIDATION & TRANSFER (existing)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Compute security key from ECU seed using server-held key material.
   * Browser flash flow calls this so AES secrets are not shipped in the client bundle.
   */
  computeSecurityKey: publicProcedure
    .input(z.object({
      ecuType: z.string().max(32),
      seedHex: z.string().max(512),
    }))
    .mutation(async ({ input }) => {
      let seedBytes: Uint8Array;
      try {
        seedBytes = hexToBytes(input.seedHex.replace(/\s+/g, ''));
      } catch {
        return { ok: false as const, error: 'Invalid seed hex' };
      }
      const profile = getSecurityProfile(input.ecuType);
      if (!profile) return { ok: false as const, error: 'Unknown ECU type' };

      if (
        seedBytes.length === 5 &&
        (profile.algorithmType === 'GM_5B_AES' || profile.algorithmType === 'GM_DUAL') &&
        profile.aesKeyHex
      ) {
        const key = await computeGM5B(seedBytes, hexToBytes(profile.aesKeyHex));
        return { ok: true as const, keyHex: bytesToHex(key, '').replace(/\s/g, '').toLowerCase() };
      }
      if (seedBytes.length === 3 && profile.algorithmType === 'FORD_3B' && profile.aesKeyHex) {
        const key = computeFord3B(seedBytes, hexToBytes(profile.aesKeyHex));
        return { ok: true as const, keyHex: bytesToHex(key, '').replace(/\s/g, '').toLowerCase() };
      }
      return { ok: false as const, error: 'No key material for this ECU/seed combination' };
    }),

  validate: publicProcedure
    .input(z.object({
      headerBase64: z.string().max(2_000_000),
      fileName: z.string().max(255),
      totalFileSize: z.number().min(1),
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.headerBase64, 'base64');
      const data = new Uint8Array(buffer);
      const format = detectContainerFormat(data);

      if (format === 'UNKNOWN') {
        return {
          valid: false, format: 'UNKNOWN', ecuType: null,
          error: 'Unrecognized container format. Expected PPEI (IPF header) or DevProg (JSON at 0x1004).',
        };
      }

      if (format === 'DEVPROG') {
        const headerSlice = data.slice(CONTAINER_LAYOUT.HEADER_OFFSET, CONTAINER_LAYOUT.HEADER_OFFSET + CONTAINER_LAYOUT.HEADER_SIZE);
        const header = parseDevProgHeader(headerSlice);
        if (!header) {
          return { valid: false, format: 'DEVPROG', ecuType: null, error: 'Failed to parse DevProg JSON header.' };
        }
        const ecuType = String(header.ecu_type || 'UNKNOWN');
        const ecuConfig = getEcuConfig(ecuType);
        const secProfile = getSecurityProfile(ecuType);
        const blocks = extractBlocks(header);
        return {
          valid: true, format: 'DEVPROG', ecuType,
          ecuName: ecuConfig?.name || ecuType,
          blockCount: blocks.length, blocks,
          vin: String(header.vin || ''),
          fileId: String(header.file_id || ''),
          lzss: header.lzss === 'true',
          forceOS: header.ForceOS === 'true',
          expireDate: Number(header.expire_date || 0),
          maxFlashCount: Number(header.max_flash_count || 0),
          protocol: ecuConfig?.protocol || 'UNKNOWN',
          canSpeed: ecuConfig?.canSpeed || 500,
          seedLevel: ecuConfig?.seedLevel || 0,
          requiresUnlockBox: secProfile?.requiresUnlockBox || false,
        };
      }

      const magic = new TextDecoder('ascii').decode(data.slice(0, 3));
      const ecuTypeField = new TextDecoder('ascii').decode(data.slice(0x400, 0x440)).replace(/\0/g, '').trim();
      return {
        valid: magic === 'IPF', format: 'PPEI',
        ecuType: ecuTypeField || 'UNKNOWN', blockCount: 0, blocks: [], protocol: 'GMLAN',
      };
    }),

  prepareForTransfer: protectedProcedure
    .input(z.object({
      containerBase64: z.string(),
      fileName: z.string().max(255),
      flashType: z.enum(['calibration', 'fullflash']),
      ecuType: z.string().max(32),
    }))
    .mutation(async ({ input, ctx }): Promise<FlashPrepResult> => {
      const buffer = Buffer.from(input.containerBase64, 'base64');
      const data = new Uint8Array(buffer);
      const format = detectContainerFormat(data);

      if (format === 'UNKNOWN') {
        return {
          success: false, ecuType: input.ecuType, containerFormat: 'UNKNOWN',
          blockCount: 0, totalDataBytes: 0, blocks: [],
          error: 'Unrecognized container format',
        };
      }

      const ecuConfig = getEcuConfig(input.ecuType);
      const secProfile = getSecurityProfile(input.ecuType);
      let blocks: FlashPrepResult['blocks'] = [];
      let dataStartOffset = 0;

      if (format === 'DEVPROG') {
        const headerSlice = data.slice(CONTAINER_LAYOUT.HEADER_OFFSET, CONTAINER_LAYOUT.HEADER_OFFSET + CONTAINER_LAYOUT.HEADER_SIZE);
        const header = parseDevProgHeader(headerSlice);
        if (!header) {
          return {
            success: false, ecuType: input.ecuType, containerFormat: 'DEVPROG',
            blockCount: 0, totalDataBytes: 0, blocks: [],
            error: 'Failed to parse DevProg JSON header',
          };
        }
        blocks = extractBlocks(header);
        dataStartOffset = CONTAINER_LAYOUT.DATA_OFFSET;
        if (input.flashType === 'calibration') {
          blocks = blocks.filter(b => b.type === 'CAL');
        }
      } else {
        dataStartOffset = 0x1000;
      }

      const transferPayload = data.slice(dataStartOffset);
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < transferPayload.length; i++) {
        crc ^= transferPayload[i];
        for (let j = 0; j < 8; j++) {
          crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        }
      }
      crc = (crc ^ 0xFFFFFFFF) >>> 0;

      const timestamp = Date.now();
      const suffix = Math.random().toString(36).slice(2, 8);
      const fileKey = `flash-transfers/${ctx.user.id}/${input.ecuType}-${timestamp}-${suffix}.bin`;

      try {
        const { url } = await storagePut(fileKey, Buffer.from(transferPayload), 'application/octet-stream');
        return {
          success: true, ecuType: input.ecuType, containerFormat: format,
          blockCount: blocks.length, totalDataBytes: transferPayload.length,
          transferUrl: url, blocks,
          ecuConfig: ecuConfig ? {
            name: ecuConfig.name, protocol: ecuConfig.protocol,
            canSpeed: ecuConfig.canSpeed,
            txAddr: `0x${ecuConfig.txAddr.toString(16).toUpperCase()}`,
            rxAddr: `0x${ecuConfig.rxAddr.toString(16).toUpperCase()}`,
            seedLevel: ecuConfig.seedLevel, xferSize: ecuConfig.xferSize,
          } : undefined,
          securityProfile: secProfile ? {
            algorithmType: secProfile.algorithmType,
            seedLength: secProfile.seedLength, keyLength: secProfile.keyLength,
            requiresUnlockBox: secProfile.requiresUnlockBox,
            securityLevel: secProfile.securityLevel,
          } : undefined,
        };
      } catch (err) {
        return {
          success: false, ecuType: input.ecuType, containerFormat: format,
          blockCount: blocks.length, totalDataBytes: transferPayload.length, blocks: [],
          error: `Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        };
      }
    }),

  ecuTypes: publicProcedure.query(() => {
    return Object.entries(ECU_DATABASE).map(([key, ecu]) => ({
      ecuType: key, name: ecu.name, oem: ecu.oem,
      protocol: ecu.protocol, canSpeed: ecu.canSpeed,
      seedLevel: ecu.seedLevel, patchRequired: ecu.patchNecessary,
    }));
  }),

  ecuConfig: publicProcedure
    .input(z.object({ ecuType: z.string().max(32) }))
    .query(({ input }) => {
      const config = getEcuConfig(input.ecuType);
      const security = getSecurityProfile(input.ecuType);
      if (!config) return null;
      return {
        ...config,
        security: security ? {
          algorithmType: security.algorithmType,
          seedLength: security.seedLength, keyLength: security.keyLength,
          securityLevel: security.securityLevel,
          requiresUnlockBox: security.requiresUnlockBox,
          description: security.description,
        } : null,
      };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  createSession: protectedProcedure
    .input(z.object({
      uuid: z.string().max(64),
      ecuType: z.string().max(32),
      ecuName: z.string().max(128).optional(),
      flashMode: z.enum(['full_flash', 'calibration', 'patch_only']),
      connectionMode: z.enum(['simulator', 'pcan']),
      fileHash: z.string().max(64).optional(),
      fileName: z.string().max(256).optional(),
      fileSize: z.number().optional(),
      vin: z.string().max(32).optional(),
      fileId: z.string().max(128).optional(),
      totalBlocks: z.number().optional(),
      totalBytes: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return flashDb.createFlashSession({
        ...input,
        userId: ctx.user.id,
        status: 'pending',
      });
    }),

  updateSession: protectedProcedure
    .input(z.object({
      uuid: z.string().max(64),
      status: z.enum(['pending', 'running', 'success', 'failed', 'aborted']).optional(),
      progress: z.number().min(0).max(100).optional(),
      durationMs: z.number().optional(),
      errorMessage: z.string().optional(),
      nrcCode: z.number().optional(),
      metadata: z.any().optional(),
    }))
    .mutation(async ({ input }) => {
      const { uuid, ...updates } = input;
      await flashDb.updateFlashSession(uuid, updates);
      return { success: true };
    }),

  getSession: protectedProcedure
    .input(z.object({ uuid: z.string().max(64) }))
    .query(async ({ input }) => {
      return flashDb.getFlashSession(input.uuid);
    }),

  listSessions: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      return flashDb.listFlashSessions(ctx.user.id, input.limit);
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // SESSION LOGS
  // ═══════════════════════════════════════════════════════════════════════

  appendLogs: protectedProcedure
    .input(z.object({
      sessionUuid: z.string().max(64),
      logs: z.array(z.object({
        timestampMs: z.number(),
        phase: z.string().max(32),
        type: z.string().max(16),
        message: z.string(),
        blockId: z.number().optional(),
        nrcCode: z.number().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const session = await flashDb.getFlashSession(input.sessionUuid);
      if (!session) throw new Error('Session not found');
      await flashDb.appendFlashLogs(
        input.logs.map(log => ({ ...log, sessionId: session.id }))
      );
      return { success: true, count: input.logs.length };
    }),

  getSessionLogs: protectedProcedure
    .input(z.object({
      sessionUuid: z.string().max(64),
      limit: z.number().min(1).max(2000).default(500),
    }))
    .query(async ({ input }) => {
      const session = await flashDb.getFlashSession(input.sessionUuid);
      if (!session) return [];
      return flashDb.getFlashSessionLogs(session.id, input.limit);
    }),

  exportSession: protectedProcedure
    .input(z.object({ uuid: z.string().max(64) }))
    .query(async ({ input }) => {
      return flashDb.exportSessionAsJson(input.uuid);
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // SNAPSHOTS
  // ═══════════════════════════════════════════════════════════════════════

  saveSnapshot: protectedProcedure
    .input(z.object({
      sessionUuid: z.string().max(64),
      snapshotType: z.enum(['pre_flash', 'post_flash']),
      ecuType: z.string().max(32),
      vin: z.string().max(32).optional(),
      softwareVersions: z.array(z.string()).optional(),
      hardwareNumber: z.string().max(64).optional(),
      dtcSnapshot: z.array(z.string()).optional(),
      didResponses: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const session = await flashDb.getFlashSession(input.sessionUuid);
      if (!session) throw new Error('Session not found');
      const { sessionUuid, ...rest } = input;
      await flashDb.saveEcuSnapshot({ ...rest, sessionId: session.id });
      return { success: true };
    }),

  getSnapshots: protectedProcedure
    .input(z.object({ sessionUuid: z.string().max(64) }))
    .query(async ({ input }) => {
      const session = await flashDb.getFlashSession(input.sessionUuid);
      if (!session) return [];
      return flashDb.getSessionSnapshots(session.id);
    }),

  compareSnapshots: protectedProcedure
    .input(z.object({ sessionUuid: z.string().max(64) }))
    .query(async ({ input }) => {
      const session = await flashDb.getFlashSession(input.sessionUuid);
      if (!session) return null;
      return flashDb.compareSnapshots(session.id);
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // QUEUE
  // ═══════════════════════════════════════════════════════════════════════

  addToQueue: protectedProcedure
    .input(z.object({
      ecuType: z.string().max(32),
      flashMode: z.enum(['full_flash', 'calibration', 'patch_only']),
      fileHash: z.string().max(64).optional(),
      fileUrl: z.string().max(512).optional(),
      fileName: z.string().max(256).optional(),
      priority: z.number().min(1).max(100).default(10),
      metadata: z.any().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await flashDb.addToQueue({ ...input, userId: ctx.user.id });
      return { success: true };
    }),

  getQueue: protectedProcedure.query(async ({ ctx }) => {
    return flashDb.getQueueItems(ctx.user.id);
  }),

  updateQueueItem: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(['queued', 'processing', 'completed', 'failed', 'cancelled']).optional(),
    }))
    .mutation(async ({ input }) => {
      await flashDb.updateQueueItem(input.id, { status: input.status });
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════════════════

  stats: protectedProcedure.query(async () => {
    return flashDb.getOverallSuccessRate();
  }),

  allStats: protectedProcedure.query(async () => {
    return flashDb.getAllFlashStats();
  }),

  // ═══════════════════════════════════════════════════════════════════════
  // SESSION COMPARISON
  // ═══════════════════════════════════════════════════════════════════════

  compareSessions: protectedProcedure
    .input(z.object({
      sessionIdA: z.number(),
      sessionIdB: z.number(),
    }))
    .query(async ({ input }) => {
      return flashDb.compareSessions(input.sessionIdA, input.sessionIdB);
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // FILE FINGERPRINTS
  // ═══════════════════════════════════════════════════════════════════════

  checkDuplicate: protectedProcedure
    .input(z.object({ fileHash: z.string().max(64) }))
    .query(async ({ input }) => {
      return flashDb.checkDuplicateFile(input.fileHash);
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // PRE-FLIGHT CHECKLIST (server-side validation)
  // ═══════════════════════════════════════════════════════════════════════

  preFlightChecklist: protectedProcedure
    .input(z.object({
      ecuType: z.string().max(32),
      fileHash: z.string().max(64).optional(),
      connectionMode: z.enum(['simulator', 'pcan']),
    }))
    .query(async ({ input }) => {
      const ecuConfig = getEcuConfig(input.ecuType);
      const secProfile = getSecurityProfile(input.ecuType);
      const checks: Array<{ id: string; label: string; status: 'pass' | 'warning' | 'fail' | 'skipped'; message: string; required: boolean }> = [];

      // ECU recognized
      checks.push({
        id: 'ecu_known', label: 'ECU Type Recognized',
        status: ecuConfig ? 'pass' : 'fail',
        message: ecuConfig ? `${ecuConfig.name} (${ecuConfig.protocol})` : `Unknown ECU type: ${input.ecuType}`,
        required: true,
      });

      // Security profile
      checks.push({
        id: 'security', label: 'Security Profile',
        status: secProfile ? 'pass' : 'warning',
        message: secProfile ? `${secProfile.algorithmType} — Level ${secProfile.securityLevel}` : 'No security profile found',
        required: false,
      });

      // Unlock box
      if (secProfile?.requiresUnlockBox) {
        checks.push({
          id: 'unlock_box', label: 'Unlock Box Required',
          status: 'warning',
          message: 'This ECU requires an unlock box for security access',
          required: false,
        });
      }

      // Hardware connection
      if (input.connectionMode === 'pcan') {
        checks.push({
          id: 'hw_connection', label: 'PCAN Connection',
          status: 'warning',
          message: 'PCAN hardware check requires physical connection — verify before proceeding',
          required: false,
        });
      } else {
        checks.push({
          id: 'hw_connection', label: 'PCAN Connection',
          status: 'skipped',
          message: 'Simulator mode — no hardware required',
          required: false,
        });
      }

      // Duplicate check
      if (input.fileHash) {
        const dup = await flashDb.checkDuplicateFile(input.fileHash);
        checks.push({
          id: 'duplicate', label: 'Duplicate Check',
          status: dup ? 'warning' : 'pass',
          message: dup
            ? `File previously flashed ${dup.flashCount} time(s) — last result: ${dup.lastResult}`
            : 'No previous flash record for this file',
          required: false,
        });
      }

      const requiredPassed = checks.filter(c => c.required).every(c => c.status === 'pass' || c.status === 'warning');
      return { checks, requiredPassed, ecuConfig: ecuConfig ? { name: ecuConfig.name, protocol: ecuConfig.protocol } : null };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════════════

  notifyFlashComplete: protectedProcedure
    .input(z.object({
      sessionUuid: z.string().max(64),
      ecuType: z.string().max(32),
      status: z.enum(['success', 'failed', 'aborted']),
      durationMs: z.number().optional(),
      errorMessage: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const statusEmoji = input.status === 'success' ? '✅' : input.status === 'failed' ? '❌' : '⚠️';
      const duration = input.durationMs ? `${(input.durationMs / 1000).toFixed(1)}s` : 'N/A';
      const title = `${statusEmoji} Flash ${input.status.toUpperCase()}: ${input.ecuType}`;
      const content = [
        `User: ${ctx.user.name || ctx.user.openId}`,
        `ECU: ${input.ecuType}`,
        `Duration: ${duration}`,
        input.errorMessage ? `Error: ${input.errorMessage}` : null,
        `Session: ${input.sessionUuid}`,
      ].filter(Boolean).join('\n');

      await notifyOwner({ title, content });

      // Update stats
      if (input.durationMs) {
        await flashDb.updateFlashStats(input.ecuType, input.status === 'success', input.durationMs);
      }

      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // COMPLETE SESSION (finalize + update fingerprint + stats)
  // ═══════════════════════════════════════════════════════════════════════

  completeSession: protectedProcedure
    .input(z.object({
      uuid: z.string().max(64),
      status: z.enum(['success', 'failed', 'aborted']),
      progress: z.number().min(0).max(100),
      durationMs: z.number(),
      errorMessage: z.string().optional(),
      nrcCode: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await flashDb.getFlashSession(input.uuid);
      if (!session) throw new Error('Session not found');

      // Update session
      await flashDb.updateFlashSession(input.uuid, {
        status: input.status,
        progress: input.progress,
        durationMs: input.durationMs,
        errorMessage: input.errorMessage,
        nrcCode: input.nrcCode,
      });

      // Update stats
      await flashDb.updateFlashStats(session.ecuType, input.status === 'success', input.durationMs);

      // Update file fingerprint
      if (session.fileHash) {
        await flashDb.upsertFileFingerprint(
          session.fileHash, session.ecuType,
          session.fileName || 'unknown', session.fileSize || 0,
          ctx.user.id, session.id,
          input.status === 'success' ? 'success' : 'failed',
        );
      }

      return { success: true };
    }),
});
