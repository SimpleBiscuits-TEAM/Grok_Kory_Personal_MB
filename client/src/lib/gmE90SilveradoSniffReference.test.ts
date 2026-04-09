import { describe, it, expect } from 'vitest';
import {
  E90_PT_CAN_RX_IDS_OBSERVED_SORTED,
  E90_ECM_DIDS_VERIFIED,
  E90_ECM_DID_NAMES,
  T93_TCM_DIDS_VERIFIED,
  T93_TCM_DID_NAMES,
  E90_EFI_LIVE_ONLY_IDS,
  E90_SPS_SEGMENTS_2021_SIERRA,
  T93_SPS_SEGMENTS_2021_SIERRA,
  E90_OS_CALIBRATION_ID,
  T93_OS_CALIBRATION_ID,
} from './gmE90SilveradoSniffReference';

describe('E90 PT-CAN Baseline', () => {
  it('should have exactly 148 KOER baseline arb IDs', () => {
    expect(E90_PT_CAN_RX_IDS_OBSERVED_SORTED.length).toBe(148);
  });

  it('should be sorted in ascending order', () => {
    for (let i = 1; i < E90_PT_CAN_RX_IDS_OBSERVED_SORTED.length; i++) {
      expect(E90_PT_CAN_RX_IDS_OBSERVED_SORTED[i]!).toBeGreaterThan(
        E90_PT_CAN_RX_IDS_OBSERVED_SORTED[i - 1]!
      );
    }
  });

  it('should not include diagnostic request/response IDs', () => {
    const diagIds = [0x7E0, 0x7E8, 0x7E1, 0x7E9, 0x7E2, 0x7EA, 0x7DF];
    for (const id of diagIds) {
      expect(E90_PT_CAN_RX_IDS_OBSERVED_SORTED).not.toContain(id);
    }
  });

  it('should include known high-range module IDs (0x772-0x78A)', () => {
    expect(E90_PT_CAN_RX_IDS_OBSERVED_SORTED).toContain(0x772);
    expect(E90_PT_CAN_RX_IDS_OBSERVED_SORTED).toContain(0x78A);
  });
});

describe('E90 ECM DIDs', () => {
  it('should have exactly 30 verified ECM DIDs (20 standard + 10 GM-specific)', () => {
    expect(E90_ECM_DIDS_VERIFIED.length).toBe(30);
  });

  it('should include all 20 standard J1979 PIDs', () => {
    const standardPids = [
      0x0004, 0x0005, 0x000B, 0x000C, 0x000D, 0x000E, 0x000F, 0x0010,
      0x0011, 0x0023, 0x0045, 0x0046, 0x0047, 0x0049, 0x004A, 0x004C,
      0x005C, 0x0061, 0x0062, 0x0063,
    ];
    for (const pid of standardPids) {
      expect(E90_ECM_DIDS_VERIFIED).toContain(pid);
    }
  });

  it('should include all 10 GM-specific extended DIDs', () => {
    const gmDids = [
      0x119C, 0x12DA, 0x131F, 0x1470, 0x2012,
      0x204D, 0x208A, 0x248B, 0x308A, 0x328A,
    ];
    for (const did of gmDids) {
      expect(E90_ECM_DIDS_VERIFIED).toContain(did);
    }
  });

  it('should have a name mapping for every verified ECM DID', () => {
    for (const did of E90_ECM_DIDS_VERIFIED) {
      expect(E90_ECM_DID_NAMES[did]).toBeDefined();
      expect(E90_ECM_DID_NAMES[did]).toMatch(/^ECM\./);
    }
  });

  it('should use EFI Live naming convention (ECM.SHORTNAME)', () => {
    expect(E90_ECM_DID_NAMES[0x000C]).toBe('ECM.RPM');
    expect(E90_ECM_DID_NAMES[0x000E]).toBe('ECM.SPARKADV');
    expect(E90_ECM_DID_NAMES[0x119C]).toBe('ECM.ENGOILP');
    expect(E90_ECM_DID_NAMES[0x131F]).toBe('ECM.FRPDI');
    expect(E90_ECM_DID_NAMES[0x2012]).toBe('ECM.TCDBPR');
  });
});

describe('T93 TCM DIDs', () => {
  it('should have exactly 58 verified TCM DIDs', () => {
    expect(T93_TCM_DIDS_VERIFIED.length).toBe(58);
  });

  it('should include core transmission channels', () => {
    const coreDids = [0x1940, 0x1941, 0x1942, 0x194C, 0x194F, 0x1124, 0x197E];
    for (const did of coreDids) {
      expect(T93_TCM_DIDS_VERIFIED).toContain(did);
    }
  });

  it('should include shift timing DIDs (1-2 through last)', () => {
    for (let did = 0x1232; did <= 0x1237; did++) {
      expect(T93_TCM_DIDS_VERIFIED).toContain(did);
    }
  });

  it('should include PCS solenoid pressure control DIDs', () => {
    const pcsDids = [0x2809, 0x280A, 0x280C, 0x280F, 0x2810, 0x2811];
    for (const did of pcsDids) {
      expect(T93_TCM_DIDS_VERIFIED).toContain(did);
    }
  });

  it('should have a name mapping for every verified TCM DID', () => {
    for (const did of T93_TCM_DIDS_VERIFIED) {
      expect(T93_TCM_DID_NAMES[did]).toBeDefined();
      expect(T93_TCM_DID_NAMES[did]).toMatch(/^TCM\./);
    }
  });

  it('should use EFI Live naming convention (TCM.SHORTNAME)', () => {
    expect(T93_TCM_DID_NAMES[0x1940]).toBe('TCM.TFT');
    expect(T93_TCM_DID_NAMES[0x1124]).toBe('TCM.GEAR');
    expect(T93_TCM_DID_NAMES[0x194C]).toBe('TCM.TCCSLIP');
    expect(T93_TCM_DID_NAMES[0x197E]).toBe('TCM.TURBINE');
  });
});

describe('EFI Live Only IDs', () => {
  it('should contain diagnostic request IDs 7E0 and 7E2', () => {
    expect(E90_EFI_LIVE_ONLY_IDS).toContain(0x7E0);
    expect(E90_EFI_LIVE_ONLY_IDS).toContain(0x7E2);
  });

  it('should contain EFI Live broadcast IDs 5E8 and 5EA', () => {
    expect(E90_EFI_LIVE_ONLY_IDS).toContain(0x5E8);
    expect(E90_EFI_LIVE_ONLY_IDS).toContain(0x5EA);
  });

  it('should not overlap with KOER baseline IDs', () => {
    const baselineSet = new Set(E90_PT_CAN_RX_IDS_OBSERVED_SORTED);
    for (const id of E90_EFI_LIVE_ONLY_IDS) {
      expect(baselineSet.has(id)).toBe(false);
    }
  });
});

describe('SPS Segments', () => {
  it('should have 6 E90 ECM segments', () => {
    expect(E90_SPS_SEGMENTS_2021_SIERRA.length).toBe(6);
  });

  it('should have 2 T93 TCM segments', () => {
    expect(T93_SPS_SEGMENTS_2021_SIERRA.length).toBe(2);
  });

  it('should have correct OS calibration IDs', () => {
    expect(E90_OS_CALIBRATION_ID).toBe('12716900');
    expect(T93_OS_CALIBRATION_ID).toBe('24044027');
  });

  it('E90 segment 01 should match OS calibration ID', () => {
    expect(E90_SPS_SEGMENTS_2021_SIERRA[0]!.partNumber).toBe(E90_OS_CALIBRATION_ID);
  });

  it('T93 segment 01 should match OS calibration ID', () => {
    expect(T93_SPS_SEGMENTS_2021_SIERRA[0]!.partNumber).toBe(T93_OS_CALIBRATION_ID);
  });
});
