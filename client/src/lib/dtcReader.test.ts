/**
 * Tests for DTC Reader module — parseDTCBytes, parseModeDTCResponse, parseMILStatus, lookupDTC
 */
import { describe, it, expect } from 'vitest';
import {
  parseDTCBytes,
  parseModeDTCResponse,
  parseMILStatus,
  lookupDTC,
  DTC_SYSTEM_LABELS,
  DTC_SEVERITY_LABELS,
} from './dtcReader';

// ─── parseDTCBytes ─────────────────────────────────────────────────────────

describe('parseDTCBytes', () => {
  it('decodes P0300 correctly', () => {
    // P0300: category P (00), digit2=0, digit3=3, digit4=0, digit5=0
    // byte1 = 0b00_00_0011 = 0x03, byte2 = 0b0000_0000 = 0x00
    expect(parseDTCBytes(0x03, 0x00)).toBe('P0300');
  });

  it('decodes P0171 correctly', () => {
    // P0171: P, 0, 1, 7, 1
    // byte1 = 0b00_00_0001 = 0x01, byte2 = 0b0111_0001 = 0x71
    expect(parseDTCBytes(0x01, 0x71)).toBe('P0171');
  });

  it('decodes C-codes (chassis)', () => {
    // C0035: category C (01), digit2=0, digit3=0, digit4=3, digit5=5
    // byte1 = 0b01_00_0000 = 0x40, byte2 = 0b0011_0101 = 0x35
    expect(parseDTCBytes(0x40, 0x35)).toBe('C0035');
  });

  it('decodes B-codes (body)', () => {
    // B0100: category B (10), digit2=0, digit3=1, digit4=0, digit5=0
    // byte1 = 0b10_00_0001 = 0x81, byte2 = 0x00
    expect(parseDTCBytes(0x81, 0x00)).toBe('B0100');
  });

  it('decodes U-codes (network)', () => {
    // U0100: category U (11), digit2=0, digit3=1, digit4=0, digit5=0
    // byte1 = 0b11_00_0001 = 0xC1, byte2 = 0x00
    expect(parseDTCBytes(0xC1, 0x00)).toBe('U0100');
  });

  it('decodes manufacturer-specific P1xxx codes', () => {
    // P1234: P, 1, 2, 3, 4
    // byte1 = 0b00_01_0010 = 0x12, byte2 = 0b0011_0100 = 0x34
    expect(parseDTCBytes(0x12, 0x34)).toBe('P1234');
  });

  it('handles zero bytes as P0000', () => {
    expect(parseDTCBytes(0x00, 0x00)).toBe('P0000');
  });

  it('handles max value bytes', () => {
    // 0xFF, 0xFF = U3FFF
    expect(parseDTCBytes(0xFF, 0xFF)).toBe('U3FFF');
  });
});

// ─── parseModeDTCResponse ──────────────────────────────────────────────────

describe('parseModeDTCResponse', () => {
  it('parses Mode 03 response with single DTC', () => {
    // Mode 03 response: "43 01 71 00 00 00 00" = P0171
    const result = parseModeDTCResponse('43017100000000', 'stored');
    expect(result.length).toBe(1);
    expect(result[0].code).toBe('P0171');
    expect(result[0].type).toBe('stored');
  });

  it('parses Mode 03 response with multiple DTCs', () => {
    // "43 01 71 03 00 00 00" = P0171 + P0300
    const result = parseModeDTCResponse('43017103000000', 'stored');
    expect(result.length).toBe(2);
    expect(result[0].code).toBe('P0171');
    expect(result[1].code).toBe('P0300');
  });

  it('parses Mode 07 (pending) response', () => {
    const result = parseModeDTCResponse('47017100000000', 'pending');
    expect(result.length).toBe(1);
    expect(result[0].code).toBe('P0171');
    expect(result[0].type).toBe('pending');
  });

  it('parses Mode 0A (permanent) response', () => {
    const result = parseModeDTCResponse('4A017100000000', 'permanent');
    expect(result.length).toBe(1);
    expect(result[0].code).toBe('P0171');
    expect(result[0].type).toBe('permanent');
  });

  it('returns empty array for NO DATA response', () => {
    expect(parseModeDTCResponse('NODATA', 'stored')).toEqual([]);
  });

  it('returns empty array for ERROR response', () => {
    expect(parseModeDTCResponse('ERROR', 'stored')).toEqual([]);
  });

  it('returns empty array for empty response', () => {
    expect(parseModeDTCResponse('', 'stored')).toEqual([]);
  });

  it('skips 0000 padding bytes', () => {
    // Only padding
    const result = parseModeDTCResponse('43000000000000', 'stored');
    expect(result.length).toBe(0);
  });

  it('handles multi-line ECU responses', () => {
    const response = '43 01 71 00 00 00 00\n43 03 00 00 00 00 00';
    const result = parseModeDTCResponse(response, 'stored');
    expect(result.length).toBe(2);
    const codes = result.map(r => r.code);
    expect(codes).toContain('P0171');
    expect(codes).toContain('P0300');
  });

  it('deduplicates codes across multiple ECU responses', () => {
    const response = '43 01 71 00 00 00 00\n43 01 71 00 00 00 00';
    const result = parseModeDTCResponse(response, 'stored');
    expect(result.length).toBe(1);
  });

  it('handles response with spaces', () => {
    const result = parseModeDTCResponse('43 01 71 03 00', 'stored');
    expect(result.length).toBe(2);
  });

  it('populates description and severity from database', () => {
    const result = parseModeDTCResponse('43017100000000', 'stored');
    expect(result[0].description).toBeTruthy();
    expect(result[0].severity).toBeTruthy();
    expect(result[0].system).toBeTruthy();
  });
});

// ─── parseMILStatus ────────────────────────────────────────────────────────

describe('parseMILStatus', () => {
  it('detects MIL ON with DTC count', () => {
    // 4101 83 07 65 04 = MIL on (bit 7 of 0x83), 3 DTCs (0x83 & 0x7F = 3)
    // The function needs at least 8 hex chars: 4101 + XX (+ more)
    const result = parseMILStatus('41018307E504');
    expect(result.milOn).toBe(true);
    expect(result.dtcCount).toBe(3);
  });

  it('detects MIL OFF with zero DTCs', () => {
    const result = parseMILStatus('410100');
    expect(result.milOn).toBe(false);
    expect(result.dtcCount).toBe(0);
  });

  it('detects MIL OFF with DTCs (pending only)', () => {
    // 4101 02 07 E5 00 = MIL off, 2 DTCs
    const result = parseMILStatus('41010207E500');
    expect(result.milOn).toBe(false);
    expect(result.dtcCount).toBe(2);
  });

  it('handles response with spaces', () => {
    const result = parseMILStatus('41 01 83 07 65 04');
    expect(result.milOn).toBe(true);
    expect(result.dtcCount).toBe(3);
  });

  it('returns defaults for short response', () => {
    const result = parseMILStatus('41');
    expect(result.milOn).toBe(false);
    expect(result.dtcCount).toBe(0);
  });

  it('returns defaults for wrong header', () => {
    const result = parseMILStatus('410283');
    expect(result.milOn).toBe(false);
    expect(result.dtcCount).toBe(0);
  });
});

// ─── lookupDTC ─────────────────────────────────────────────────────────────

describe('lookupDTC', () => {
  it('looks up known P0171 code', () => {
    const info = lookupDTC('P0171');
    expect(info.description).toContain('Lean');
    expect(info.severity).toBe('warning');
    expect(info.system).toBe('fuel_air');
    expect(info.possibleCauses.length).toBeGreaterThan(0);
  });

  it('looks up known P0300 code', () => {
    const info = lookupDTC('P0300');
    expect(info.description).toContain('Misfire');
    expect(info.severity).toBe('critical');
  });

  it('looks up diesel-specific P2002 code', () => {
    const info = lookupDTC('P2002');
    expect(info.description).toContain('Diesel Particulate Filter');
    expect(info.severity).toBe('critical');
    expect(info.system).toBe('emissions_aux');
  });

  it('generates generic info for unknown codes', () => {
    const info = lookupDTC('P0999');
    expect(info.description).toBeTruthy();
    expect(info.severity).toBeTruthy();
    expect(info.system).toBeTruthy();
  });

  it('handles case insensitivity', () => {
    const info = lookupDTC('p0171');
    expect(info.description).toContain('Lean');
  });

  it('generates generic C-code info', () => {
    const info = lookupDTC('C9999');
    expect(info.system).toBe('chassis');
  });

  it('generates generic B-code info', () => {
    const info = lookupDTC('B9999');
    expect(info.system).toBe('body');
  });

  it('generates generic U-code info', () => {
    const info = lookupDTC('U9999');
    expect(info.system).toBe('network');
  });
});

// ─── Label Exports ─────────────────────────────────────────────────────────

describe('DTC Labels', () => {
  it('DTC_SYSTEM_LABELS has all systems', () => {
    expect(DTC_SYSTEM_LABELS.fuel_air).toBeTruthy();
    expect(DTC_SYSTEM_LABELS.ignition).toBeTruthy();
    expect(DTC_SYSTEM_LABELS.emissions_aux).toBeTruthy();
    expect(DTC_SYSTEM_LABELS.transmission).toBeTruthy();
    expect(DTC_SYSTEM_LABELS.chassis).toBeTruthy();
    expect(DTC_SYSTEM_LABELS.body).toBeTruthy();
    expect(DTC_SYSTEM_LABELS.network).toBeTruthy();
  });

  it('DTC_SEVERITY_LABELS has all severities', () => {
    expect(DTC_SEVERITY_LABELS.critical.label).toBe('CRITICAL');
    expect(DTC_SEVERITY_LABELS.warning.label).toBe('WARNING');
    expect(DTC_SEVERITY_LABELS.info.label).toBe('INFO');
  });
});
