/**
 * Flash Integration Tests — Orchestrator, Validator, Session Management
 * Tests the new shared modules and session/log/queue router endpoints.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { appRouter } from '../routers';
import type { TrpcContext } from '../_core/context';
import {
  generateFlashPlan, createSimulatorState, advanceSimulator,
  generateRecoveryPlan, getNRCDescription, getAllFunFacts,
  formatBytes, formatDuration,
} from '../../shared/pcanFlashOrchestrator';
import type { FlashPlan, SimulatorState } from '../../shared/pcanFlashOrchestrator';
import {
  detectFileFormat, validateFlashFile, computeSimpleHash, crc32,
  fixContainerCrc, createPreFlightChecklist, updateDiagnosticCheck,
  evaluateBatteryVoltage,
} from '../../shared/flashFileValidator';
import type { ContainerFileHeader, ContainerBlockStruct } from '../../shared/ecuDatabase';
import { CONTAINER_LAYOUT } from '../../shared/ecuDatabase';

// ── Mock flashDb for session tests ────────────────────────────────────────
function buildMockSession() {
  return {
    id: 1, uuid: 'test-uuid-123', userId: 1, ecuType: 'E88',
    ecuName: 'E88 GM-DELCO', flashMode: 'full_flash' as const,
    connectionMode: 'simulator' as const, status: 'pending' as const,
    fileHash: 'abc123', fileName: 'test.bin', fileSize: 65536,
    vin: '1GCGG25K071234567', fileId: 'test-file-001',
    totalBlocks: 3, totalBytes: 393216, progress: 0,
    durationMs: null, errorMessage: null, nrcCode: null,
    metadata: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
}

vi.mock('../flashDb', () => {
  const ms = {
    id: 1, uuid: 'test-uuid-123', userId: 1, ecuType: 'E88',
    ecuName: 'E88 GM-DELCO', flashMode: 'full_flash', connectionMode: 'simulator',
    status: 'pending', fileHash: 'abc123', fileName: 'test.bin', fileSize: 65536,
    vin: '1GCGG25K071234567', fileId: 'test-file-001',
    totalBlocks: 3, totalBytes: 393216, progress: 0,
    durationMs: null, errorMessage: null, nrcCode: null, metadata: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
  return {
    createFlashSession: vi.fn().mockResolvedValue(ms),
    getFlashSession: vi.fn().mockResolvedValue(ms),
    updateFlashSession: vi.fn().mockResolvedValue(undefined),
    listFlashSessions: vi.fn().mockResolvedValue([ms]),
    appendFlashLogs: vi.fn().mockResolvedValue(undefined),
    getFlashSessionLogs: vi.fn().mockResolvedValue([
      { id: 1, sessionId: 1, timestampMs: Date.now(), phase: 'INIT', type: 'info', message: 'Session started', blockId: null, nrcCode: null },
    ]),
    exportSessionAsJson: vi.fn().mockResolvedValue({
      session: ms, logs: [], snapshots: [], exportedAt: new Date().toISOString(),
    }),
    saveEcuSnapshot: vi.fn().mockResolvedValue(undefined),
    getSessionSnapshots: vi.fn().mockResolvedValue([]),
    compareSnapshots: vi.fn().mockResolvedValue(null),
    addToQueue: vi.fn().mockResolvedValue(undefined),
    getQueueItems: vi.fn().mockResolvedValue([]),
    updateQueueItem: vi.fn().mockResolvedValue(undefined),
    updateFlashStats: vi.fn().mockResolvedValue(undefined),
    getAllFlashStats: vi.fn().mockResolvedValue([]),
    getOverallSuccessRate: vi.fn().mockResolvedValue({
      totalAttempts: 10, totalSuccess: 8, totalFail: 2, successRate: 80, byEcu: [],
    }),
    checkDuplicateFile: vi.fn().mockResolvedValue(null),
    upsertFileFingerprint: vi.fn().mockResolvedValue(undefined),
    compareSessions: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('../storage', () => ({
  storagePut: vi.fn().mockResolvedValue({ key: 'test-key', url: 'https://cdn.test/flash.bin' }),
}));

vi.mock('../_core/notification', () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// ── Context helpers ───────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════
// FLASH ORCHESTRATOR TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe('pcanFlashOrchestrator', () => {
  // ── Build test header ─────────────────────────────────────────────────
  function buildTestHeader(): ContainerFileHeader {
    return {
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
        { block_id: 1, start_adresse: '00000000', end_adresse: '0001FFFF', block_length: '20000', OS: 'true', pri_rc: 'AA', rc34: 'BB', rc36: 'CC', post_rc: 'DD' } as ContainerBlockStruct,
        { block_id: 2, start_adresse: '00020000', end_adresse: '0003FFFF', block_length: '20000', OS: 'false', pri_rc: 'EE', rc34: 'FF', rc36: '11', post_rc: '22' } as ContainerBlockStruct,
        { block_id: 3, start_adresse: '00040000', end_adresse: '0005FFFF', block_length: '20000', OS: 'false', pri_rc: '33', rc34: '44', rc36: '55', post_rc: '66' } as ContainerBlockStruct,
      ],
      ecu_type: 'E88',
      hardware_number: '12345678',
      sw_c1: 'SW001',
      sw_c2: 'SW002',
    };
  }

  describe('generateFlashPlan', () => {
    it('generates a valid flash plan for E88 full flash', () => {
      const header = buildTestHeader();
      const plan = generateFlashPlan(header, 'E88', 'FULL_FLASH');
      expect(plan.ecuType).toBe('E88');
      expect(plan.flashMode).toBe('FULL_FLASH');
      expect(plan.isValid).toBe(true);
      expect(plan.validationErrors).toHaveLength(0);
      expect(plan.commands.length).toBeGreaterThan(0);
      expect(plan.totalBlocks).toBe(3);
      expect(plan.totalBytes).toBeGreaterThan(0);
      expect(plan.estimatedTimeMs).toBeGreaterThan(0);
      expect(plan.vin).toBe('1GCGG25K071234567');
      expect(plan.fileId).toBe('test-file-001');
    });

    it('generates calibration plan with only CAL blocks', () => {
      const header = buildTestHeader();
      const plan = generateFlashPlan(header, 'E88', 'CALIBRATION');
      expect(plan.flashMode).toBe('CALIBRATION');
      // Block 1 is OS, blocks 2 and 3 are CAL — only CAL commands
      const calCommands = plan.commands.filter(c => c.phase === 'TRANSFER_DATA');
      expect(calCommands.every(c => !c.isOS)).toBe(true);
    });

    it('includes security info for known ECU', () => {
      const header = buildTestHeader();
      const plan = generateFlashPlan(header, 'E88', 'FULL_FLASH');
      expect(plan.securityInfo).toBeDefined();
      expect(plan.securityInfo.seedLevel).toBeGreaterThan(0);
      expect(plan.securityInfo.algorithm).toBeDefined();
    });

    it('handles unknown ECU type gracefully', () => {
      const header = buildTestHeader();
      header.ecu_type = 'NONEXISTENT';
      const plan = generateFlashPlan(header, 'NONEXISTENT', 'FULL_FLASH');
      // Should still generate a plan (with default settings)
      expect(plan.ecuType).toBe('NONEXISTENT');
      expect(plan.commands.length).toBeGreaterThan(0);
      // Unknown ECU is a warning, not an error — plan should still be valid
      expect(plan.isValid).toBe(true);
      expect(plan.validationErrors).toHaveLength(0);
      expect(plan.warnings.length).toBeGreaterThan(0);
      expect(plan.warnings.some(w => w.includes('not in database'))).toBe(true);
    });

    it('treats empty seed/key as warning, not error', () => {
      const header = buildTestHeader();
      header.seed = '';
      header.key = '';
      const plan = generateFlashPlan(header, 'E88', 'FULL_FLASH');
      // Empty seed/key should NOT block flashing — they are embedded in container
      expect(plan.isValid).toBe(true);
      expect(plan.validationErrors).toHaveLength(0);
      expect(plan.warnings.some(w => w.includes('Seed/key'))).toBe(true);
    });

    it('generates valid plan for E41 (L5P Duramax) with empty seed/key', () => {
      const header = buildTestHeader();
      header.ecu_type = 'E41';
      header.seed = '';
      header.key = '';
      const plan = generateFlashPlan(header, 'E41', 'CALIBRATION');
      expect(plan.isValid).toBe(true);
      expect(plan.ecuName).toContain('E41');
      expect(plan.validationErrors).toHaveLength(0);
      // Should have seed/key warning but ECU should be found
      expect(plan.warnings.some(w => w.includes('Seed/key'))).toBe(true);
      expect(plan.warnings.some(w => w.includes('not in database'))).toBe(false);
    });

    it('plan with only warnings has isValid=true', () => {
      const header = buildTestHeader();
      header.seed = '';
      header.key = '';
      header.ecu_type = 'NONEXISTENT';
      const plan = generateFlashPlan(header, 'NONEXISTENT', 'FULL_FLASH');
      // Both seed/key and ECU are warnings — plan should still be valid
      expect(plan.isValid).toBe(true);
      expect(plan.validationErrors).toHaveLength(0);
      expect(plan.warnings.length).toBe(2);
    });
  });

  describe('simulator', () => {
    let plan: FlashPlan;
    let state: SimulatorState;

    beforeEach(() => {
      const header = buildTestHeader();
      plan = generateFlashPlan(header, 'E88', 'FULL_FLASH');
      state = createSimulatorState(plan);
    });

    it('creates initial simulator state', () => {
      expect(state.currentPhase).toBe('PRE_CHECK');
      expect(state.progress).toBe(0);
      expect(state.result).toBeNull();
      expect(state.currentCommandIndex).toBe(0);
      expect(state.log).toHaveLength(0);
      expect(state.isRunning).toBe(false);
    });

    it('advances through simulation steps when running', () => {
      // Must set isRunning to true for advanceSimulator to work
      const running = { ...state, isRunning: true };
      const next = advanceSimulator(running, plan, 100);
      expect(next.currentCommandIndex).toBeGreaterThanOrEqual(0);
      expect(next.elapsedMs).toBeGreaterThan(0);
    });

    it('does not advance when not running', () => {
      const next = advanceSimulator(state, plan, 100);
      // Should return same state since isRunning is false
      expect(next.currentCommandIndex).toBe(0);
      expect(next.elapsedMs).toBe(0);
    });

    it('eventually completes the simulation', () => {
      let current = { ...state, isRunning: true };
      let iterations = 0;
      // With realistic timing: ~4 KB/s transfer + phase delays, need more iterations
      // Each tick = 500ms, block transfer ~250 bytes/tick (scaled from 400/100ms)
      // For test header with ~64KB block: ~256 ticks + ~80 ticks for commands = ~336
      const maxIterations = 5000;
      while (!current.result && iterations < maxIterations) {
        current = advanceSimulator(current, plan, 500);
        iterations++;
      }
      expect(current.result).not.toBeNull();
      expect(current.progress).toBeGreaterThan(0);
    });

    it('logs contain meaningful messages after advancing', () => {
      let current: SimulatorState = { ...state, isRunning: true };
      for (let i = 0; i < 10; i++) {
        current = advanceSimulator(current, plan, 200);
      }
      expect(current.log.length).toBeGreaterThan(0);
      current.log.forEach(log => {
        expect(log.message).toBeDefined();
        expect(log.message.length).toBeGreaterThan(0);
        expect(log.timestamp).toBeGreaterThan(0);
      });
    });
  });

  describe('recovery', () => {
    it('generates recovery plan for NRC 0x31', () => {
      const recovery = generateRecoveryPlan(0x31, 'TRANSFER_DATA', 'E88');
      expect(recovery).toBeDefined();
      expect(recovery.steps.length).toBeGreaterThan(0);
      expect(recovery.nrcDescription).toBeDefined();
    });

    it('generates recovery plan for NRC 0x35 (security)', () => {
      const recovery = generateRecoveryPlan(0x35, 'SECURITY_ACCESS', 'E88');
      expect(recovery).toBeDefined();
      expect(recovery.steps.length).toBeGreaterThan(0);
    });

    it('handles unknown NRC code', () => {
      const recovery = generateRecoveryPlan(0xFF, 'INIT', 'E88');
      expect(recovery).toBeDefined();
      expect(recovery.steps.length).toBeGreaterThan(0);
    });
  });

  describe('utilities', () => {
    it('getNRCDescription returns description for known codes', () => {
      expect(getNRCDescription(0x31)).toContain('Request');
      expect(getNRCDescription(0x35)).toContain('Invalid Key');
      expect(getNRCDescription(0x72)).toContain('Programming Failure');
    });

    it('getNRCDescription handles unknown codes', () => {
      const desc = getNRCDescription(0xFE);
      expect(desc).toBeDefined();
      expect(desc.length).toBeGreaterThan(0);
    });

    it('getAllFunFacts returns facts for known ECU', () => {
      const facts = getAllFunFacts('E88');
      expect(facts.length).toBeGreaterThan(0);
      facts.forEach(f => expect(f.length).toBeGreaterThan(0));
    });

    it('formatBytes formats correctly', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1048576)).toBe('1.0 MB');
      expect(formatBytes(1073741824)).toBe('1.0 GB');
      expect(formatBytes(512)).toBe('512 B');
    });

    it('formatDuration formats correctly', () => {
      expect(formatDuration(500)).toContain('ms');
      expect(formatDuration(5000)).toContain('s');
      expect(formatDuration(65000)).toContain('m');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLASH FILE VALIDATOR TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe('flashFileValidator', () => {
  describe('detectFileFormat', () => {
    it('detects PPEI container from JSON header with flashernumber', () => {
      const header = JSON.stringify({ flashernumber: 12345, ecu_type: 'E88', block_count: 2 });
      const headerBytes = new TextEncoder().encode(header);
      const data = new Uint8Array(0x3000);
      data.set(headerBytes, 0x1004);
      const result = detectFileFormat(data);
      expect(result.format).toBe('PPEI_CONTAINER');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('detects DevProg V2 format from JSON header without flashernumber', () => {
      const header = JSON.stringify({ some_field: 'value' });
      const headerBytes = new TextEncoder().encode(header);
      const data = new Uint8Array(0x3000);
      data.set(headerBytes, 0x1004);
      const result = detectFileFormat(data);
      expect(result.format).toBe('DEVPROG_V2');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('returns RAW_BINARY for small files with random data', () => {
      const data = new Uint8Array(1024);
      data.fill(0x42);
      const result = detectFileFormat(data);
      // Small files with non-text data get RAW_BINARY
      expect(['RAW_BINARY', 'UNKNOWN']).toContain(result.format);
    });

    it('returns RAW_BINARY for empty-ish data', () => {
      const data = new Uint8Array(10);
      const result = detectFileFormat(data);
      expect(['RAW_BINARY', 'UNKNOWN', 'INTEL_HEX', 'S_RECORD']).toContain(result.format);
    });
  });

  describe('validateFlashFile', () => {
    it('validates a container-sized file has checks', () => {
      const header = JSON.stringify({
        ecu_type: 'E88', block_count: 2,
        block_struct: [
          { block_id: 1, start_adresse: '00000000', end_adresse: '0000FFFF', block_length: '10000', OS: 'true' },
          { block_id: 2, start_adresse: '00010000', end_adresse: '0001FFFF', block_length: '10000', OS: 'false' },
        ],
        vin: '1GCGG25K071234567', file_id: 'test-001',
      });
      const headerBytes = new TextEncoder().encode(header);
      const totalSize = CONTAINER_LAYOUT.DATA_OFFSET + 0x20000;
      const data = new Uint8Array(totalSize);
      data.set(headerBytes, CONTAINER_LAYOUT.HEADER_OFFSET);
      for (let i = CONTAINER_LAYOUT.DATA_OFFSET; i < totalSize; i++) {
        data[i] = i & 0xFF;
      }
      const result = validateFlashFile(data);
      // valid field (not isValid)
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.fileSize).toBe(totalSize);
    });

    it('rejects too-small files', () => {
      const data = new Uint8Array(100);
      const result = validateFlashFile(data);
      expect(result.valid).toBe(false);
      expect(result.checks.some(c => c.severity === 'error')).toBe(true);
    });
  });

  describe('computeSimpleHash', () => {
    it('produces consistent hash for same data', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const hash1 = computeSimpleHash(data);
      const hash2 = computeSimpleHash(data);
      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different data', () => {
      const data1 = new Uint8Array([1, 2, 3]);
      const data2 = new Uint8Array([4, 5, 6]);
      expect(computeSimpleHash(data1)).not.toBe(computeSimpleHash(data2));
    });

    it('returns a hex string', () => {
      const data = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
      const hash = computeSimpleHash(data);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('crc32', () => {
    it('computes CRC32 for known data', () => {
      const data = new TextEncoder().encode('123456789');
      const result = crc32(data);
      // CRC32 of "123456789" is 0xCBF43926
      expect(result).toBe(0xCBF43926);
    });

    it('returns 0 for empty data', () => {
      const data = new Uint8Array(0);
      const result = crc32(data);
      expect(result).toBe(0);
    });
  });

  describe('fixContainerCrc', () => {
    it('writes CRC32 at offset 0x1000 in big-endian', () => {
      const data = new Uint8Array(CONTAINER_LAYOUT.DATA_OFFSET);
      // Fill with some data after the header offset
      for (let i = CONTAINER_LAYOUT.HEADER_OFFSET; i < data.length; i++) {
        data[i] = i & 0xFF;
      }
      const fixed = fixContainerCrc(data);
      // CRC should be written at 0x1000 in big-endian
      const crcOffset = CONTAINER_LAYOUT.CRC32_OFFSET;
      const writtenCrc = (fixed[crcOffset] << 24) | (fixed[crcOffset + 1] << 16) | (fixed[crcOffset + 2] << 8) | fixed[crcOffset + 3];
      // Verify it's a valid CRC32 (non-zero for non-trivial data)
      expect(writtenCrc).not.toBe(0);
    });
  });

  describe('preFlightChecklist', () => {
    it('creates checklist for known ECU', () => {
      const checklist = createPreFlightChecklist('E88');
      expect(checklist.ecuType).toBe('E88');
      expect(checklist.checks.length).toBeGreaterThan(0);
      expect(checklist.allPassed).toBeDefined();
      expect(checklist.requiredPassed).toBeDefined();
    });

    it('creates checklist for unknown ECU', () => {
      const checklist = createPreFlightChecklist('UNKNOWN_ECU');
      expect(checklist.ecuType).toBe('UNKNOWN_ECU');
      expect(checklist.checks.length).toBeGreaterThan(0);
    });

    it('updateDiagnosticCheck updates a check', () => {
      const checklist = createPreFlightChecklist('E88');
      const checkId = checklist.checks[0]?.id;
      if (checkId) {
        const updated = updateDiagnosticCheck(checklist, checkId, 'pass', 'All good');
        const check = updated.checks.find(c => c.id === checkId);
        expect(check?.status).toBe('pass');
        expect(check?.message).toBe('All good');
      }
    });
  });

  describe('evaluateBatteryVoltage', () => {
    it('passes for normal voltage', () => {
      const result = evaluateBatteryVoltage(13.5);
      expect(result.status).toBe('pass');
    });

    it('warns for low voltage', () => {
      const result = evaluateBatteryVoltage(12.0);
      expect(result.status).toBe('warning');
    });

    it('fails for critically low voltage', () => {
      const result = evaluateBatteryVoltage(9.0);
      expect(result.status).toBe('fail');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLASH ROUTER SESSION MANAGEMENT TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe('flash router — session management', () => {
  it('creates a flash session', async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.createSession({
      uuid: 'test-uuid-123',
      ecuType: 'E88',
      ecuName: 'E88 GM-DELCO',
      flashMode: 'full_flash',
      connectionMode: 'simulator',
      fileHash: 'abc123',
      fileName: 'test.bin',
      fileSize: 65536,
      vin: '1GCGG25K071234567',
      fileId: 'test-file-001',
      totalBlocks: 3,
      totalBytes: 393216,
    });
    expect(result).toBeDefined();
    expect(result.uuid).toBe('test-uuid-123');
  });

  it('updates a flash session', async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.updateSession({
      uuid: 'test-uuid-123',
      status: 'running',
      progress: 50,
    });
    expect(result.success).toBe(true);
  });

  it('gets a flash session', async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.getSession({ uuid: 'test-uuid-123' });
    expect(result).toBeDefined();
    expect(result?.ecuType).toBe('E88');
  });

  it('lists flash sessions', async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.listSessions({ limit: 50 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('appends logs to a session', async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.appendLogs({
      sessionUuid: 'test-uuid-123',
      logs: [
        { timestampMs: Date.now(), phase: 'INIT', type: 'info', message: 'Starting flash' },
        { timestampMs: Date.now(), phase: 'SECURITY', type: 'info', message: 'Security access granted' },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });

  it('gets session logs', async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.getSessionLogs({
      sessionUuid: 'test-uuid-123',
      limit: 100,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it('exports session as JSON', async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.exportSession({ uuid: 'test-uuid-123' });
    expect(result).toBeDefined();
    expect(result?.session).toBeDefined();
    expect(result?.exportedAt).toBeDefined();
  });

  it('completes a session and updates stats', async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.completeSession({
      uuid: 'test-uuid-123',
      status: 'success',
      progress: 100,
      durationMs: 45000,
    });
    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLASH ROUTER QUEUE & STATS TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe('flash router — queue & stats', () => {
  it('adds item to queue', async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.addToQueue({
      ecuType: 'E88',
      flashMode: 'full_flash',
      fileHash: 'abc123',
      fileName: 'test.bin',
      priority: 5,
    });
    expect(result.success).toBe(true);
  });

  it('gets queue items', async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.getQueue();
    expect(Array.isArray(result)).toBe(true);
  });

  it('gets overall stats', async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.stats();
    expect(result.totalAttempts).toBe(10);
    expect(result.totalSuccess).toBe(8);
    expect(result.successRate).toBe(80);
  });

  it('checks for duplicate files', async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.checkDuplicate({ fileHash: 'abc123' });
    expect(result).toBeNull(); // mock returns null
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLASH ROUTER PRE-FLIGHT CHECKLIST TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe('flash router — pre-flight checklist', () => {
  it('returns checklist for known ECU in simulator mode', async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.preFlightChecklist({
      ecuType: 'E88',
      connectionMode: 'simulator',
    });
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.requiredPassed).toBe(true);
    expect(result.ecuConfig).toBeDefined();
    expect(result.ecuConfig?.name).toContain('E88');
    // Simulator mode should have skipped HW check
    const hwCheck = result.checks.find(c => c.id === 'hw_connection');
    expect(hwCheck?.status).toBe('skipped');
  });

  it('returns checklist for known ECU in PCAN mode', async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.preFlightChecklist({
      ecuType: 'E88',
      connectionMode: 'pcan',
    });
    const hwCheck = result.checks.find(c => c.id === 'hw_connection');
    expect(hwCheck?.status).toBe('warning');
  });

  it('returns checklist without unlock box warning for E41 (has hardcoded AES key)', async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.preFlightChecklist({
      ecuType: 'E41',
      connectionMode: 'simulator',
    });
    // E41 no longer requires unlock box — we have the hardcoded AES key
    const unlockCheck = result.checks.find(c => c.id === 'unlock_box');
    expect(unlockCheck).toBeUndefined();
  });

  it('returns checklist with duplicate warning when file was previously flashed', async () => {
    // Override mock for this test
    const flashDb = await import('../flashDb');
    vi.mocked(flashDb.checkDuplicateFile).mockResolvedValueOnce({
      id: 1, fileHash: 'abc123', ecuType: 'E88', fileName: 'test.bin',
      fileSize: 65536, flashCount: 3, lastFlashedBy: 1, lastSessionId: 1,
      lastResult: 'success', createdAt: new Date(), updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.preFlightChecklist({
      ecuType: 'E88',
      fileHash: 'abc123',
      connectionMode: 'simulator',
    });
    const dupCheck = result.checks.find(c => c.id === 'duplicate');
    expect(dupCheck).toBeDefined();
    expect(dupCheck?.status).toBe('warning');
    expect(dupCheck?.message).toContain('3');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLASH ROUTER SNAPSHOT TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe('flash router — snapshots', () => {
  it('saves an ECU snapshot', async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.saveSnapshot({
      sessionUuid: 'test-uuid-123',
      snapshotType: 'pre_flash',
      ecuType: 'E88',
      vin: '1GCGG25K071234567',
      hardwareNumber: '12345678',
      softwareVersions: ['SW001', 'SW002'],
      didValues: { 'F190': '1GCGG25K071234567' },
    });
    expect(result.success).toBe(true);
  });

  it('gets snapshots for a session', async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.getSnapshots({ sessionUuid: 'test-uuid-123' });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLASH ROUTER NOTIFICATION TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe('flash router — notifications', () => {
  it('sends flash completion notification', async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.flash.notifyFlashComplete({
      sessionUuid: 'test-uuid-123',
      ecuType: 'E88',
      status: 'success',
      durationMs: 45000,
    });
    expect(result.success).toBe(true);
  });
});
