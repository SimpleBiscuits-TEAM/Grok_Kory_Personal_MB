/**
 * Flash Router & Container Parser Tests
 */
import { describe, expect, it, vi } from 'vitest';
import { appRouter } from '../routers';
import type { TrpcContext } from '../_core/context';
import {
  ECU_DATABASE, getEcuConfig, CONTAINER_LAYOUT, FLASH_STEP_DESCRIPTIONS, FlashStep,
} from '../../shared/ecuDatabase';
import { ECU_SECURITY_PROFILES } from '../seedKeyProfiles';
import { getSecurityProfile } from '../seedKeyService';

// ── Mock storage for upload tests ─────────────────────────────────────────

vi.mock('../storage', () => ({
  storagePut: vi.fn().mockResolvedValue({ key: 'test-key', url: 'https://cdn.test/flash-transfer.bin' }),
}));

// ── Context helpers ───────────────────────────────────────────────────────

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: 'https', headers: {} } as TrpcContext['req'],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext['res'],
  };
}

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1, openId: 'test-user', email: 'test@example.com',
      name: 'Test User', loginMethod: 'manus', role: 'user',
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: 'https', headers: {} } as TrpcContext['req'],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext['res'],
  };
}

// ── Build test containers ─────────────────────────────────────────────────

function buildPpeiContainer(): string {
  const buf = new Uint8Array(0x2000);
  // IPF magic at offset 0
  buf[0] = 0x49; // I
  buf[1] = 0x50; // P
  buf[2] = 0x46; // F
  // ECU type at offset 0x400
  const ecuStr = 'E88 GM-DELCO';
  for (let i = 0; i < ecuStr.length; i++) {
    buf[0x400 + i] = ecuStr.charCodeAt(i);
  }
  return Buffer.from(buf).toString('base64');
}

function buildDevProgContainer(ecuType = 'E88'): string {
  const header: Record<string, unknown> = {
    offset: '0x3000',
    flashernumber: 12345,
    udid: 'TEST-UDID-001',
    vin: '1GCGG25K071234567',
    seed: 'AABBCC',
    key: 'DDEEFF',
    file_id: 'test-file-001',
    create_date: Math.floor(Date.now() / 1000),
    expire_date: Math.floor(Date.now() / 1000) + 86400 * 30,
    max_flash_count: 5,
    header_length: '0x1FFC',
    block_count: 3,
    block_boot: 0,
    block_erase: 0,
    file_size: '0x100000',
    comp_enc: '0x00',
    lzss: 'false',
    xferSize: '0xFF8',
    ForceOS: 'false',
    block_struct: [
      { block_id: 1, start_adresse: '00000000', end_adresse: '0001FFFF', block_length: '20000', OS: 'true', pri_rc: 'AA', rc34: 'BB', rc36: 'CC', post_rc: 'DD' },
      { block_id: 2, start_adresse: '00020000', end_adresse: '0003FFFF', block_length: '20000', OS: 'false', pri_rc: 'EE', rc34: 'FF', rc36: '11', post_rc: '22' },
      { block_id: 3, start_adresse: '00040000', end_adresse: '0005FFFF', block_length: '20000', OS: 'false', pri_rc: '33', rc34: '44', rc36: '55', post_rc: '66' },
    ],
    ecu_type: ecuType,
    hardware_number: '12345678',
    sw_c1: 'SW001',
    sw_c2: 'SW002',
  };

  const headerJson = JSON.stringify(header);
  const headerBytes = new TextEncoder().encode(headerJson);

  // Build full container
  const totalSize = CONTAINER_LAYOUT.DATA_OFFSET + 0x60000; // header + 3 blocks of 0x20000
  const buf = new Uint8Array(totalSize);

  // CRC32 placeholder at 0x1000
  buf[CONTAINER_LAYOUT.CRC32_OFFSET] = 0xDE;
  buf[CONTAINER_LAYOUT.CRC32_OFFSET + 1] = 0xAD;
  buf[CONTAINER_LAYOUT.CRC32_OFFSET + 2] = 0xBE;
  buf[CONTAINER_LAYOUT.CRC32_OFFSET + 3] = 0xEF;

  // JSON header at 0x1004
  buf.set(headerBytes, CONTAINER_LAYOUT.HEADER_OFFSET);

  // Fill data area with pattern
  for (let i = CONTAINER_LAYOUT.DATA_OFFSET; i < totalSize; i++) {
    buf[i] = i & 0xFF;
  }

  return Buffer.from(buf).toString('base64');
}

function buildInvalidContainer(): string {
  const buf = new Uint8Array(1024);
  buf.fill(0x42); // garbage data
  return Buffer.from(buf).toString('base64');
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('flash router', () => {
  describe('flash.validate', () => {
    it('validates a PPEI container', async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.flash.validate({
        headerBase64: buildPpeiContainer(),
        fileName: 'test.bin',
        totalFileSize: 0x2000,
      });
      expect(result.valid).toBe(true);
      expect(result.format).toBe('PPEI');
    });

    it('validates a DevProg container', async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.flash.validate({
        headerBase64: buildDevProgContainer('E88'),
        fileName: 'e88_tune.bin',
        totalFileSize: 0x63000,
      });
      expect(result.valid).toBe(true);
      expect(result.format).toBe('DEVPROG');
      expect(result.ecuType).toBe('E88');
      expect(result.blockCount).toBe(3);
    });

    it('rejects invalid container', async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.flash.validate({
        headerBase64: buildInvalidContainer(),
        fileName: 'garbage.bin',
        totalFileSize: 1024,
      });
      expect(result.valid).toBe(false);
      expect(result.format).toBe('UNKNOWN');
    });

    it('returns VIN and file ID for DevProg containers', async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.flash.validate({
        headerBase64: buildDevProgContainer('E88'),
        fileName: 'e88_tune.bin',
        totalFileSize: 0x63000,
      });
      expect(result.vin).toBe('1GCGG25K071234567');
      expect(result.fileId).toBe('test-file-001');
    });

    it('returns security info for known ECU types', async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.flash.validate({
        headerBase64: buildDevProgContainer('E41'),
        fileName: 'l5p_tune.bin',
        totalFileSize: 0x63000,
      });
      expect(result.ecuType).toBe('E41');
      expect(result.requiresUnlockBox).toBe(false);
    });
  });

  describe('flash.prepareForTransfer', () => {
    it('prepares a DevProg container for WiFi transfer', async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.flash.prepareForTransfer({
        containerBase64: buildDevProgContainer('E88'),
        fileName: 'e88_tune.bin',
        flashType: 'fullflash',
        ecuType: 'E88',
      });
      expect(result.success).toBe(true);
      expect(result.containerFormat).toBe('DEVPROG');
      expect(result.transferUrl).toBeDefined();
      expect(result.totalDataBytes).toBeGreaterThan(0);
      expect(result.ecuConfig).toBeDefined();
      expect(result.ecuConfig?.protocol).toBe('GMLAN');
    });

    it('filters to calibration blocks only when flashType is calibration', async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.flash.prepareForTransfer({
        containerBase64: buildDevProgContainer('E88'),
        fileName: 'e88_cal.bin',
        flashType: 'calibration',
        ecuType: 'E88',
      });
      expect(result.success).toBe(true);
      // Block 1 is OS, blocks 2 and 3 are CAL — only 2 blocks should remain
      expect(result.blocks.length).toBe(2);
      expect(result.blocks.every(b => b.type === 'CAL')).toBe(true);
    });

    it('includes security profile for known ECU', async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.flash.prepareForTransfer({
        containerBase64: buildDevProgContainer('E41'),
        fileName: 'l5p.bin',
        flashType: 'fullflash',
        ecuType: 'E41',
      });
      expect(result.securityProfile).toBeDefined();
      expect(result.securityProfile?.requiresUnlockBox).toBe(false);
      expect(result.securityProfile?.algorithmType).toBe('GM_5B_AES');
    });

    it('rejects invalid container', async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.flash.prepareForTransfer({
        containerBase64: buildInvalidContainer(),
        fileName: 'bad.bin',
        flashType: 'fullflash',
        ecuType: 'E88',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unrecognized');
    });
  });

  describe('flash.ecuTypes', () => {
    it('returns list of supported ECU types', async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.flash.ecuTypes();
      expect(result.length).toBeGreaterThanOrEqual(30);
      const types = result.map(r => r.ecuType);
      expect(types).toContain('E88');
      expect(types).toContain('E41');
      expect(types).toContain('MG1CS015');
    });
  });

  describe('flash.ecuConfig', () => {
    it('returns config for known ECU', async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.flash.ecuConfig({ ecuType: 'E88' });
      expect(result).not.toBeNull();
      expect(result!.name).toContain('E88');
      expect(result!.protocol).toBe('GMLAN');
      expect(result!.security).toBeDefined();
    });

    it('returns null for unknown ECU', async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.flash.ecuConfig({ ecuType: 'NONEXISTENT' });
      expect(result).toBeNull();
    });
  });
});

// ── Container Format Detection Tests ──────────────────────────────────────

describe('container format detection', () => {
  it('PPEI containers start with IPF magic bytes', () => {
    const ppei = Buffer.from(buildPpeiContainer(), 'base64');
    expect(ppei[0]).toBe(0x49); // I
    expect(ppei[1]).toBe(0x50); // P
    expect(ppei[2]).toBe(0x46); // F
  });

  it('DevProg containers have JSON at offset 0x1004', () => {
    const devprog = Buffer.from(buildDevProgContainer(), 'base64');
    const headerSlice = devprog.slice(CONTAINER_LAYOUT.HEADER_OFFSET, CONTAINER_LAYOUT.HEADER_OFFSET + CONTAINER_LAYOUT.HEADER_SIZE);
    let end = 0;
    for (let i = 0; i < headerSlice.length; i++) {
      if (headerSlice[i] === 0) { end = i; break; }
    }
    if (end === 0) end = headerSlice.length;
    const headerStr = new TextDecoder('ascii').decode(headerSlice.slice(0, end));
    expect(headerStr.startsWith('{')).toBe(true);
    const parsed = JSON.parse(headerStr);
    expect(parsed.ecu_type).toBeDefined();
  });

  it('CONTAINER_LAYOUT offsets are consistent', () => {
    expect(CONTAINER_LAYOUT.CRC32_OFFSET).toBe(CONTAINER_LAYOUT.RESERVED_SIZE);
    expect(CONTAINER_LAYOUT.HEADER_OFFSET).toBe(CONTAINER_LAYOUT.CRC32_OFFSET + CONTAINER_LAYOUT.CRC32_SIZE);
    expect(CONTAINER_LAYOUT.DATA_OFFSET).toBe(CONTAINER_LAYOUT.HEADER_OFFSET + CONTAINER_LAYOUT.HEADER_SIZE);
  });
});
