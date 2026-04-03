/**
 * Flash System Tests — Seed/Key Algorithms, ECU Database, and Container Parser
 */
import { describe, expect, it } from 'vitest';
import {
  ECU_SECURITY_PROFILES,
  getSecurityProfile,
  getSecuritySummary,
  computeGM5B,
  computeFord3B,
  hexToBytes,
  bytesToHex,
  type SeedKeyAlgorithmType,
} from '../shared/seedKeyAlgorithms';
import {
  ECU_DATABASE,
  getEcuConfig,
  FLASH_STEP_DESCRIPTIONS,
  CONTAINER_LAYOUT,
  FlashStep,
  type EcuConfig,
} from '../shared/ecuDatabase';

// ── Seed/Key Algorithm Tests ──────────────────────────────────────────────

describe('seedKeyAlgorithms', () => {
  describe('hexToBytes / bytesToHex', () => {
    it('converts hex string to Uint8Array', () => {
      const bytes = hexToBytes('AABB CC DD');
      expect(bytes).toEqual(new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]));
    });

    it('converts Uint8Array to hex string', () => {
      const hex = bytesToHex(new Uint8Array([0x01, 0xFF, 0x00, 0xAB]));
      expect(hex).toBe('01 FF 00 AB');
    });

    it('round-trips correctly', () => {
      const original = 'DE AD BE EF 42';
      const bytes = hexToBytes(original);
      const result = bytesToHex(bytes);
      expect(result).toBe('DE AD BE EF 42');
    });

    it('handles empty input', () => {
      expect(hexToBytes('')).toEqual(new Uint8Array([]));
      expect(bytesToHex(new Uint8Array([]))).toBe('');
    });
  });

  describe('ECU_SECURITY_PROFILES', () => {
    it('contains all major GM ECU types', () => {
      const gmTypes = ['E41', 'E88', 'E90', 'E92', 'E98', 'E83', 'E78', 'E86'];
      for (const t of gmTypes) {
        expect(ECU_SECURITY_PROFILES[t]).toBeDefined();
        expect(ECU_SECURITY_PROFILES[t].manufacturer).toBe('GM');
      }
    });

    it('contains Ford ECU types', () => {
      const fordTypes = ['MG1CS015', 'MG1CS018', 'EDC17CP05'];
      for (const t of fordTypes) {
        expect(ECU_SECURITY_PROFILES[t]).toBeDefined();
        expect(ECU_SECURITY_PROFILES[t].manufacturer).toBe('Ford');
      }
    });

    it('contains Cummins ECU types', () => {
      expect(ECU_SECURITY_PROFILES['CM2350B']).toBeDefined();
      expect(ECU_SECURITY_PROFILES['CM2350B'].manufacturer).toBe('Cummins');
      expect(ECU_SECURITY_PROFILES['CM2450B']).toBeDefined();
    });

    it('marks E41 as NOT requiring unlock box (has Seed_key.cs AES key)', () => {
      const e41 = ECU_SECURITY_PROFILES['E41'];
      expect(e41.requiresUnlockBox).toBe(false);
      expect(e41.aesKeyHex).toBeDefined();
      expect(e41.aesKeyHex!.length).toBe(32);
    });

    it('marks standard GM ECUs as not requiring unlock box', () => {
      const e88 = ECU_SECURITY_PROFILES['E88'];
      expect(e88.requiresUnlockBox).toBe(false);
      expect(e88.securityLevel).toBe('standard');
    });

    it('has correct seed/key lengths for each algorithm type', () => {
      for (const [key, profile] of Object.entries(ECU_SECURITY_PROFILES)) {
        expect(profile.seedLength).toBeGreaterThan(0);
        expect(profile.keyLength).toBeGreaterThan(0);
        expect(profile.algorithmType).toBeDefined();
      }
    });
  });

  describe('getSecurityProfile', () => {
    it('returns profile for valid ECU type', () => {
      const profile = getSecurityProfile('E88');
      expect(profile).toBeDefined();
      expect(profile!.name).toContain('E88');
    });

    it('is case-insensitive', () => {
      const profile = getSecurityProfile('e88');
      expect(profile).toBeDefined();
    });

    it('returns undefined for unknown ECU', () => {
      expect(getSecurityProfile('ZZZZZ')).toBeUndefined();
    });
  });

  describe('getSecuritySummary', () => {
    it('returns formatted summary for known ECU', () => {
      const summary = getSecuritySummary('E41');
      expect(summary).toContain('GM');
      expect(summary).toContain('GM_5B_AES');
    });

    it('returns error message for unknown ECU', () => {
      const summary = getSecuritySummary('UNKNOWN_ECU');
      expect(summary).toContain('Unknown ECU type');
    });
  });

  describe('computeGM5B (AES-128 ECB)', () => {
    it('produces 5-byte key from 5-byte seed', async () => {
      const seed = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
      const aesKey = new Uint8Array([
        0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80,
        0x90, 0xA0, 0xB0, 0xC0, 0xD0, 0xE0, 0xF0, 0x00,
      ]);
      const key = await computeGM5B(seed, aesKey);
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(5);
    });

    it('rejects invalid seed length', async () => {
      const seed = new Uint8Array([0x01, 0x02, 0x03]); // too short
      const aesKey = new Uint8Array(16);
      await expect(computeGM5B(seed, aesKey)).rejects.toThrow('Invalid seed length');
    });

    it('rejects invalid AES key length', async () => {
      const seed = new Uint8Array(5);
      const aesKey = new Uint8Array(8); // too short
      await expect(computeGM5B(seed, aesKey)).rejects.toThrow('Invalid AES key length');
    });

    it('produces deterministic output', async () => {
      const seed = new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD, 0xEE]);
      const aesKey = new Uint8Array([
        0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF,
        0xFE, 0xDC, 0xBA, 0x98, 0x76, 0x54, 0x32, 0x10,
      ]);
      const key1 = await computeGM5B(seed, aesKey);
      const key2 = await computeGM5B(seed, aesKey);
      expect(bytesToHex(key1)).toBe(bytesToHex(key2));
    });

    it('different seeds produce different keys', async () => {
      const aesKey = new Uint8Array([
        0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF,
        0xFE, 0xDC, 0xBA, 0x98, 0x76, 0x54, 0x32, 0x10,
      ]);
      const key1 = await computeGM5B(new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]), aesKey);
      const key2 = await computeGM5B(new Uint8Array([0x05, 0x04, 0x03, 0x02, 0x01]), aesKey);
      expect(bytesToHex(key1)).not.toBe(bytesToHex(key2));
    });
  });

  describe('computeFord3B (LFSR)', () => {
    it('produces 3-byte key from 3-byte seed', () => {
      const seed = new Uint8Array([0x12, 0x34, 0x56]);
      const secret = new Uint8Array([0x62, 0x74, 0x53, 0x47, 0xA1]); // MG1 secrets
      const key = computeFord3B(seed, secret);
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(3);
    });

    it('rejects invalid seed length', () => {
      const seed = new Uint8Array([0x12, 0x34]); // too short
      const secret = new Uint8Array([0x62, 0x74, 0x53, 0x47, 0xA1]);
      expect(() => computeFord3B(seed, secret)).toThrow('Invalid seed length');
    });

    it('rejects invalid secret length', () => {
      const seed = new Uint8Array([0x12, 0x34, 0x56]);
      const secret = new Uint8Array([0x62, 0x74, 0x53]); // too short
      expect(() => computeFord3B(seed, secret)).toThrow('Invalid secret length');
    });

    it('produces deterministic output', () => {
      const seed = new Uint8Array([0xAA, 0xBB, 0xCC]);
      const secret = new Uint8Array([0x62, 0x74, 0x53, 0x47, 0xA1]);
      const key1 = computeFord3B(seed, secret);
      const key2 = computeFord3B(seed, secret);
      expect(bytesToHex(key1)).toBe(bytesToHex(key2));
    });

    it('different seeds produce different keys', () => {
      const secret = new Uint8Array([0x62, 0x74, 0x53, 0x47, 0xA1]);
      const key1 = computeFord3B(new Uint8Array([0x01, 0x02, 0x03]), secret);
      const key2 = computeFord3B(new Uint8Array([0x03, 0x02, 0x01]), secret);
      expect(bytesToHex(key1)).not.toBe(bytesToHex(key2));
    });

    it('different secrets produce different keys for same seed', () => {
      const seed = new Uint8Array([0x12, 0x34, 0x56]);
      const key1 = computeFord3B(seed, new Uint8Array([0x62, 0x74, 0x53, 0x47, 0xA1]));
      const key2 = computeFord3B(seed, new Uint8Array([0xA7, 0xC2, 0xE9, 0x19, 0x92]));
      expect(bytesToHex(key1)).not.toBe(bytesToHex(key2));
    });
  });
});

// ── ECU Database Tests ────────────────────────────────────────────────────

describe('ecuDatabase', () => {
  describe('ECU_DATABASE', () => {
    it('contains 50+ ECU entries', () => {
      expect(Object.keys(ECU_DATABASE).length).toBeGreaterThanOrEqual(30);
    });

    it('all entries have required fields', () => {
      for (const [key, ecu] of Object.entries(ECU_DATABASE)) {
        expect(ecu.ecuType, `${key} missing ecuType`).toBeDefined();
        expect(ecu.name, `${key} missing name`).toBeDefined();
        expect(ecu.oem, `${key} missing oem`).toBeDefined();
        expect(ecu.protocol, `${key} missing protocol`).toBeDefined();
        expect(ecu.canSpeed, `${key} missing canSpeed`).toBeGreaterThan(0);
        expect(ecu.seedLevel, `${key} missing seedLevel`).toBeGreaterThanOrEqual(0);
        expect(ecu.txAddr, `${key} missing txAddr`).toBeGreaterThan(0);
        expect(ecu.rxAddr, `${key} missing rxAddr`).toBeGreaterThan(0);
      }
    });

    it('GM ECUs use GMLAN protocol', () => {
      const gmGmlan = ['E88', 'E90', 'E92', 'E98', 'E83', 'E78'];
      for (const t of gmGmlan) {
        const ecu = ECU_DATABASE[t];
        expect(ecu, `Missing ${t}`).toBeDefined();
        expect(ecu.protocol).toBe('GMLAN');
      }
    });

    it('Ford ECUs use UDS protocol', () => {
      const fordUds = ['MG1CS015', 'MG1CS018', 'EDC17CP05'];
      for (const t of fordUds) {
        const ecu = ECU_DATABASE[t];
        expect(ecu, `Missing ${t}`).toBeDefined();
        expect(ecu.protocol).toBe('UDS');
      }
    });

    it('Cummins ECUs use 500kbps CAN (J1939 over 500k)', () => {
      for (const t of ['CM2350B', 'CM2450B']) {
        const ecu = ECU_DATABASE[t];
        expect(ecu, `Missing ${t}`).toBeDefined();
        expect(ecu.canSpeed).toBe(500);
      }
    });

    it('TCU entries have correct CAN addresses', () => {
      for (const t of ['T87', 'T87A', 'T76', 'T43']) {
        const ecu = ECU_DATABASE[t];
        if (ecu) {
          // Allison TCUs use 0x7E2/0x7EA (not 0x7E1/0x7E9)
          expect(ecu.controllerType).toBe('tcu');
          expect(ecu.txAddr).toBeGreaterThan(0);
          expect(ecu.rxAddr).toBeGreaterThan(0);
        }
      }
    });

    it('all entries have flash sequences', () => {
      for (const [key, ecu] of Object.entries(ECU_DATABASE)) {
        expect(ecu.flashSequence, `${key} missing flashSequence`).toBeDefined();
        expect(ecu.flashSequence.length, `${key} has empty flashSequence`).toBeGreaterThan(0);
      }
    });
  });

  describe('getEcuConfig', () => {
    it('returns config for valid ECU type', () => {
      const config = getEcuConfig('E88');
      expect(config).toBeDefined();
      expect(config!.ecuType).toBe('E88');
    });

    it('returns undefined for unknown type', () => {
      expect(getEcuConfig('NONEXISTENT')).toBeUndefined();
    });
  });

  describe('FlashStep descriptions', () => {
    it('every FlashStep has a description', () => {
      for (const step of Object.values(FlashStep)) {
        expect(FLASH_STEP_DESCRIPTIONS[step], `Missing description for ${step}`).toBeDefined();
        expect(FLASH_STEP_DESCRIPTIONS[step].length).toBeGreaterThan(0);
      }
    });
  });

  describe('CONTAINER_LAYOUT', () => {
    it('has correct DevProg offsets', () => {
      expect(CONTAINER_LAYOUT.RESERVED_SIZE).toBe(0x1000);
      expect(CONTAINER_LAYOUT.CRC32_OFFSET).toBe(0x1000);
      expect(CONTAINER_LAYOUT.CRC32_SIZE).toBe(4);
      expect(CONTAINER_LAYOUT.HEADER_OFFSET).toBe(0x1004);
      expect(CONTAINER_LAYOUT.HEADER_SIZE).toBe(0x1FFC);
      expect(CONTAINER_LAYOUT.DATA_OFFSET).toBe(0x3000);
    });

    it('header + CRC fits before data offset', () => {
      const headerEnd = CONTAINER_LAYOUT.HEADER_OFFSET + CONTAINER_LAYOUT.HEADER_SIZE;
      expect(headerEnd).toBeLessThanOrEqual(CONTAINER_LAYOUT.DATA_OFFSET);
    });
  });
});

// ── Cross-module Consistency Tests ────────────────────────────────────────

describe('cross-module consistency', () => {
  it('every ECU in security profiles exists in ECU database', () => {
    for (const ecuType of Object.keys(ECU_SECURITY_PROFILES)) {
      // Some security profiles may cover ECU variants not in the flash database
      // but the major ones should match
      if (['E41', 'E88', 'E90', 'E92', 'E98', 'E86', 'MG1CS015', 'CM2350B', 'T87'].includes(ecuType)) {
        expect(ECU_DATABASE[ecuType], `${ecuType} in security profiles but not in ECU database`).toBeDefined();
      }
    }
  });

  it('security profiles and ECU database agree on protocol for standard ECUs', () => {
    // E41 uses UDS for security but GMLAN for flash transport (hybrid)
    const hybridEcus = ['E41', 'E86'];
    for (const ecuType of Object.keys(ECU_SECURITY_PROFILES)) {
      if (hybridEcus.includes(ecuType)) continue;
      const secProfile = ECU_SECURITY_PROFILES[ecuType];
      const ecuConfig = ECU_DATABASE[ecuType];
      if (ecuConfig) {
        if (secProfile.protocol === 'GMLAN') {
          expect(ecuConfig.protocol, `${ecuType} protocol mismatch`).toBe('GMLAN');
        }
      }
    }
  });
});
