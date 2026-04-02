/**
 * Tests for USB adapter detection and identification logic.
 * Verifies that PCAN-USB, Kvaser, IXXAT, CANable are correctly identified
 * as incompatible, while OBDLink/ELM327 adapters are compatible.
 */
import { describe, it, expect } from 'vitest';
import { identifyAdapter, KNOWN_ADAPTERS, type KnownAdapter } from './obdConnection';

describe('identifyAdapter', () => {
  // ── PCAN-USB (PEAK System) ──
  it('identifies PEAK PCAN-USB by VID 0x0C72', () => {
    const result = identifyAdapter(0x0C72);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('pcan');
    expect(result!.compatible).toBe(false);
    expect(result!.name).toContain('PCAN');
  });

  it('identifies PCAN-USB with any product ID', () => {
    const result = identifyAdapter(0x0C72, 0x000C);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('pcan');
    expect(result!.compatible).toBe(false);
  });

  it('PCAN-USB has a reason explaining raw CAN incompatibility', () => {
    const result = identifyAdapter(0x0C72);
    expect(result!.reason).toBeDefined();
    expect(result!.reason!.toLowerCase()).toContain('raw can');
    expect(result!.reason!.toLowerCase()).toContain('elm327');
  });

  it('PCAN-USB has a suggestion for compatible adapters', () => {
    const result = identifyAdapter(0x0C72);
    expect(result!.suggestion).toBeDefined();
    expect(result!.suggestion!.toLowerCase()).toContain('obdlink');
  });

  // ── Kvaser ──
  it('identifies Kvaser by VID 0x0BFD', () => {
    const result = identifyAdapter(0x0BFD);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('kvaser');
    expect(result!.compatible).toBe(false);
  });

  // ── IXXAT ──
  it('identifies IXXAT by VID 0x08D8', () => {
    const result = identifyAdapter(0x08D8);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('ixxat');
    expect(result!.compatible).toBe(false);
  });

  // ── CANable ──
  it('identifies CANable by VID 0x1D50 + PID 0x606F', () => {
    const result = identifyAdapter(0x1D50, 0x606F);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('canable');
    expect(result!.compatible).toBe(false);
  });

  it('does not match VID 0x1D50 with different PID (not CANable)', () => {
    // VID 0x1D50 is OpenMoko/generic — only PID 0x606F is CANable
    const result = identifyAdapter(0x1D50, 0x1234);
    expect(result).toBeNull();
  });

  // ── Compatible adapters ──
  it('identifies FTDI-based adapter (OBDLink/ELM327) by VID 0x0403', () => {
    const result = identifyAdapter(0x0403);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('elm327');
    expect(result!.compatible).toBe(true);
  });

  it('identifies OBDLink STN direct by VID 0x1EAF', () => {
    const result = identifyAdapter(0x1EAF);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('elm327');
    expect(result!.compatible).toBe(true);
  });

  // ── Unknown adapters ──
  it('returns null for unknown VID', () => {
    const result = identifyAdapter(0x9999);
    expect(result).toBeNull();
  });

  it('returns null when vendorId is undefined', () => {
    const result = identifyAdapter(undefined);
    expect(result).toBeNull();
  });

  it('returns null when vendorId is undefined with productId', () => {
    const result = identifyAdapter(undefined, 0x1234);
    expect(result).toBeNull();
  });
});

describe('KNOWN_ADAPTERS database', () => {
  it('has entries for all expected adapter types', () => {
    const types = new Set(KNOWN_ADAPTERS.map(a => a.type));
    expect(types.has('pcan')).toBe(true);
    expect(types.has('kvaser')).toBe(true);
    expect(types.has('ixxat')).toBe(true);
    expect(types.has('canable')).toBe(true);
    expect(types.has('elm327')).toBe(true);
  });

  it('all incompatible adapters have reason and suggestion', () => {
    const incompatible = KNOWN_ADAPTERS.filter(a => !a.compatible);
    expect(incompatible.length).toBeGreaterThan(0);
    for (const adapter of incompatible) {
      expect(adapter.reason).toBeDefined();
      expect(adapter.reason!.length).toBeGreaterThan(10);
      expect(adapter.suggestion).toBeDefined();
      expect(adapter.suggestion!.length).toBeGreaterThan(10);
    }
  });

  it('all compatible adapters do not have reason/suggestion (or they are undefined)', () => {
    const compatible = KNOWN_ADAPTERS.filter(a => a.compatible);
    expect(compatible.length).toBeGreaterThan(0);
    for (const adapter of compatible) {
      // Compatible adapters should not have error reasons
      expect(adapter.reason).toBeUndefined();
    }
  });

  it('all adapters have unique vendorId (or vendorId+productId combo)', () => {
    // Check that we don't have duplicate entries
    const seen = new Set<string>();
    for (const adapter of KNOWN_ADAPTERS) {
      const key = adapter.productIds?.length
        ? adapter.productIds.map(p => `${adapter.vendorId}:${p}`).join(',')
        : `${adapter.vendorId}:*`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('PEAK VID is 0x0C72 (decimal 3186)', () => {
    const peak = KNOWN_ADAPTERS.find(a => a.type === 'pcan');
    expect(peak).toBeDefined();
    expect(peak!.vendorId).toBe(0x0C72);
    expect(peak!.vendorId).toBe(3186);
  });
});
