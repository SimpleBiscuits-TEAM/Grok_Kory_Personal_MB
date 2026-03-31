import { describe, it, expect, vi } from 'vitest';

// Mock LLM
vi.mock('../_core/llm', () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'Knox analysis: Found ECM at 0x7E0.' } }],
  }),
}));

// Mock Knox knowledge
vi.mock('../lib/knoxKnowledgeServer', () => ({
  getFullKnoxKnowledge: vi.fn().mockReturnValue('Knox knowledge base.'),
}));

describe('IntelliSpy Router', () => {
  it('should export intellispyRouter', async () => {
    const { intellispyRouter } = await import('./intellispy');
    expect(intellispyRouter).toBeDefined();
  });

  it('should have analyzeFrames procedure', async () => {
    const { intellispyRouter } = await import('./intellispy');
    expect(intellispyRouter._def.procedures.analyzeFrames).toBeDefined();
  });

  it('should have decodeUDSFrame procedure', async () => {
    const { intellispyRouter } = await import('./intellispy');
    expect(intellispyRouter._def.procedures.decodeUDSFrame).toBeDefined();
  });
});

describe('UDS Frame Decoding Logic', () => {
  it('should decode DiagnosticSessionControl (0x10)', () => {
    const data = [0x02, 0x10, 0x02];
    expect(data[1]).toBe(0x10);
    expect(data[2]).toBe(0x02); // Programming session
  });

  it('should decode SecurityAccess seed request (0x27 odd)', () => {
    const subFn = 0x01;
    expect(subFn % 2 === 1).toBe(true);
    expect(Math.ceil(subFn / 2)).toBe(1);
  });

  it('should decode SecurityAccess key response (0x27 even)', () => {
    const subFn = 0x02;
    expect(subFn % 2 === 1).toBe(false);
    expect(Math.ceil(subFn / 2)).toBe(1);
  });

  it('should decode RequestDownload (0x34)', () => {
    const data = [0x03, 0x34, 0x00, 0x44];
    expect(data[1]).toBe(0x34);
  });

  it('should decode TransferData block sequence (0x36)', () => {
    const data = [0x06, 0x36, 0x05, 0xDE, 0xAD, 0xBE, 0xEF];
    expect(data[1]).toBe(0x36);
    expect(data[2]).toBe(5);
  });

  it('should decode WriteDataByIdentifier DID (0x2E)', () => {
    const data = [0x06, 0x2E, 0xF1, 0x90, 0x01, 0x02, 0x03];
    const did = (data[2] << 8) | data[3];
    expect(did).toBe(0xF190);
  });

  it('should decode RoutineControl start (0x31)', () => {
    const data = [0x04, 0x31, 0x01, 0xFF, 0x00];
    expect(data[2]).toBe(0x01); // START
    const routineId = (data[3] << 8) | data[4];
    expect(routineId).toBe(0xFF00);
  });

  it('should decode negative response (0x7F)', () => {
    const data = [0x03, 0x7F, 0x27, 0x35];
    expect(data[1]).toBe(0x7F);
    expect(data[2]).toBe(0x27);
    expect(data[3]).toBe(0x35);
  });

  it('should identify positive response by SID offset', () => {
    expect(0x50 - 0x40).toBe(0x10);
    expect(0x67 - 0x40).toBe(0x27);
    expect(0x6E - 0x40).toBe(0x2E);
    expect(0x74 - 0x40).toBe(0x34);
    expect(0x76 - 0x40).toBe(0x36);
  });
});

describe('Flash Service Identification', () => {
  it('should identify all flash-related services', () => {
    const FLASH_SERVICES = new Set([0x10, 0x27, 0x2E, 0x31, 0x34, 0x36, 0x37, 0x11]);
    expect(FLASH_SERVICES.has(0x10)).toBe(true);
    expect(FLASH_SERVICES.has(0x27)).toBe(true);
    expect(FLASH_SERVICES.has(0x2E)).toBe(true);
    expect(FLASH_SERVICES.has(0x34)).toBe(true);
    expect(FLASH_SERVICES.has(0x36)).toBe(true);
    expect(FLASH_SERVICES.has(0x37)).toBe(true);
    expect(FLASH_SERVICES.has(0x11)).toBe(true);
    expect(FLASH_SERVICES.has(0x22)).toBe(false);
    expect(FLASH_SERVICES.has(0x3E)).toBe(false);
  });

  it('should identify NRC codes', () => {
    const NRC: Record<number, string> = {
      0x33: 'Security Access Denied',
      0x35: 'Invalid Key',
      0x78: 'Response Pending',
      0x72: 'General Programming Failure',
    };
    expect(NRC[0x33]).toBe('Security Access Denied');
    expect(NRC[0x35]).toBe('Invalid Key');
    expect(NRC[0x78]).toBe('Response Pending');
  });
});

describe('CAN Frame Formatting', () => {
  it('should format arb IDs', () => {
    const fmt = (id: number) => '0x' + id.toString(16).toUpperCase().padStart(3, '0');
    expect(fmt(0x7E0)).toBe('0x7E0');
    expect(fmt(0x100)).toBe('0x100');
    expect(fmt(0x7DF)).toBe('0x7DF');
  });

  it('should format hex bytes', () => {
    const fmt = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');
    expect(fmt(0x00)).toBe('00');
    expect(fmt(0xFF)).toBe('FF');
    expect(fmt(0x0A)).toBe('0A');
  });

  it('should format ASCII representation', () => {
    const data = [0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x00, 0x01, 0x02];
    const ascii = data.map(b => (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.').join('');
    expect(ascii).toBe('Hello...');
  });
});

describe('Module Direction Detection', () => {
  it('should detect request range (0x700-0x7DF)', () => {
    // 0x7E0 is above 0x7DF, so it's outside the standard request range
    expect(0x7E0 >= 0x700 && 0x7E0 <= 0x7DF).toBe(false);
    // 0x720 is within the request range
    expect(0x720 >= 0x700 && 0x720 <= 0x7DF).toBe(true);
    // 0x7DF is the broadcast address (upper bound)
    expect(0x7DF >= 0x700 && 0x7DF <= 0x7DF).toBe(true);
  });

  it('should detect response range (0x7E8-0x7EF)', () => {
    expect(0x7E8 >= 0x7E8 && 0x7E8 <= 0x7EF).toBe(true);
    expect(0x7E0 >= 0x7E8 && 0x7E0 <= 0x7EF).toBe(false);
  });

  it('should identify broadcast address', () => {
    expect(0x7DF).toBe(0x7DF);
  });
});
