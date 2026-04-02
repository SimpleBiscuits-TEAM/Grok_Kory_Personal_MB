/**
 * Flash Router — Server-side flash container management, validation,
 * and upload-to-flasher pipeline for VOP 3.0 hardware.
 */
import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../_core/trpc';
import { storagePut } from '../storage';
import { ECU_DATABASE, getEcuConfig, CONTAINER_LAYOUT, type EcuConfig } from '../../shared/ecuDatabase';
import { getSecurityProfile, type EcuSecurityProfile } from '../../shared/seedKeyAlgorithms';

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
  // Check PPEI magic ("IPF" at offset 0)
  if (data.length >= 3 && data[0] === 0x49 && data[1] === 0x50 && data[2] === 0x46) {
    return 'PPEI';
  }
  // Check DevProg format (valid JSON at offset 0x1004)
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

// ── Router ─────────────────────────────────────────────────────────────────

export const flashRouter = router({
  /**
   * Validate a flash container (binary data sent as base64)
   * Returns detailed analysis without storing the file
   */
  validate: publicProcedure
    .input(z.object({
      /** Base64-encoded container file (first 64KB for quick validation) */
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
          valid: false,
          format: 'UNKNOWN',
          ecuType: null,
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
          valid: true,
          format: 'DEVPROG',
          ecuType,
          ecuName: ecuConfig?.name || ecuType,
          blockCount: blocks.length,
          blocks,
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

      // PPEI format
      const magic = new TextDecoder('ascii').decode(data.slice(0, 3));
      const ecuTypeField = new TextDecoder('ascii').decode(data.slice(0x400, 0x440)).replace(/\0/g, '').trim();

      return {
        valid: magic === 'IPF',
        format: 'PPEI',
        ecuType: ecuTypeField || 'UNKNOWN',
        blockCount: 0,
        blocks: [],
        protocol: 'GMLAN',
      };
    }),

  /**
   * Prepare a flash container for transfer to VOP 3.0 hardware.
   * Strips headers, extracts data blocks, computes checksums,
   * and uploads the transfer-ready payload to S3 for WiFi download.
   */
  prepareForTransfer: protectedProcedure
    .input(z.object({
      /** Base64-encoded full container file */
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
      let totalDataBytes = 0;

      if (format === 'DEVPROG') {
        // Parse DevProg header
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

        // Filter blocks based on flash type
        if (input.flashType === 'calibration') {
          blocks = blocks.filter(b => b.type === 'CAL');
        }

        totalDataBytes = data.length - dataStartOffset;
      } else {
        // PPEI format — data starts after header
        dataStartOffset = 0x1000; // typical PPEI data offset
        totalDataBytes = data.length - dataStartOffset;
      }

      // Extract the transfer payload (data blocks only, no header)
      const transferPayload = data.slice(dataStartOffset);

      // Compute CRC32 checksum of the payload
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < transferPayload.length; i++) {
        crc ^= transferPayload[i];
        for (let j = 0; j < 8; j++) {
          crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        }
      }
      crc = (crc ^ 0xFFFFFFFF) >>> 0;

      // Upload transfer-ready payload to S3 for WiFi download by VOP 3.0
      const timestamp = Date.now();
      const suffix = Math.random().toString(36).slice(2, 8);
      const fileKey = `flash-transfers/${ctx.user.id}/${input.ecuType}-${timestamp}-${suffix}.bin`;

      try {
        const { url } = await storagePut(fileKey, Buffer.from(transferPayload), 'application/octet-stream');

        return {
          success: true,
          ecuType: input.ecuType,
          containerFormat: format,
          blockCount: blocks.length,
          totalDataBytes: transferPayload.length,
          transferUrl: url,
          blocks,
          ecuConfig: ecuConfig ? {
            name: ecuConfig.name,
            protocol: ecuConfig.protocol,
            canSpeed: ecuConfig.canSpeed,
            txAddr: `0x${ecuConfig.txAddr.toString(16).toUpperCase()}`,
            rxAddr: `0x${ecuConfig.rxAddr.toString(16).toUpperCase()}`,
            seedLevel: ecuConfig.seedLevel,
            xferSize: ecuConfig.xferSize,
          } : undefined,
          securityProfile: secProfile ? {
            algorithmType: secProfile.algorithmType,
            seedLength: secProfile.seedLength,
            keyLength: secProfile.keyLength,
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

  /**
   * List supported ECU types with their flash configuration
   */
  ecuTypes: publicProcedure.query(() => {
    return Object.entries(ECU_DATABASE).map(([key, ecu]) => ({
      ecuType: key,
      name: ecu.name,
      oem: ecu.oem,
      protocol: ecu.protocol,
      canSpeed: ecu.canSpeed,
      seedLevel: ecu.seedLevel,
      patchRequired: ecu.patchNecessary,
    }));
  }),

  /**
   * Get detailed ECU configuration for a specific type
   */
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
          seedLength: security.seedLength,
          keyLength: security.keyLength,
          securityLevel: security.securityLevel,
          requiresUnlockBox: security.requiresUnlockBox,
          description: security.description,
        } : null,
      };
    }),
});
