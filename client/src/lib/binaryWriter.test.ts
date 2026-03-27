import { describe, it, expect } from 'vitest';
import { discoverSegments, findOsPN, setupBinaryPair, validateSwap, executeSegmentSwap } from './binaryWriter';
import type { BinaryAnalysis, FlashSegment } from './binaryParser';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build a synthetic binary with known segment structure */
function buildTestBinary(segments: { pnOffset: number; pn: string; dataSize: number }[], osOffset?: number, osPN?: string): Uint8Array {
  // Find the max offset needed
  let maxOffset = 0;
  for (const seg of segments) {
    const end = seg.pnOffset + 16 + seg.dataSize;
    if (end > maxOffset) maxOffset = end;
  }
  if (osOffset !== undefined) {
    maxOffset = Math.max(maxOffset, osOffset + 16);
  }
  maxOffset = Math.max(maxOffset, 0x10000); // minimum size

  const data = new Uint8Array(maxOffset);
  data.fill(0xFF); // Fill with 0xFF like a real flash

  // Write OS PN
  if (osOffset !== undefined && osPN) {
    for (let i = 0; i < osPN.length; i++) {
      data[osOffset + i] = osPN.charCodeAt(i);
    }
    // Null bytes after OS PN
    for (let i = osPN.length; i < 16; i++) {
      data[osOffset + i] = 0x00;
    }
  }

  // Write segments
  for (const seg of segments) {
    // Write 16B header before PN (some non-zero, non-FF bytes)
    const headerStart = seg.pnOffset - 16;
    for (let i = 0; i < 16; i++) {
      data[headerStart + i] = (i * 17 + 0x3C) & 0xFF;
    }

    // Write 8-digit PN
    for (let i = 0; i < seg.pn.length; i++) {
      data[seg.pnOffset + i] = seg.pn.charCodeAt(i);
    }

    // Write 8 null bytes after PN
    for (let i = 8; i < 16; i++) {
      data[seg.pnOffset + i] = 0x00;
    }

    // Write some identifiable calibration data
    for (let i = 0; i < seg.dataSize; i++) {
      data[seg.pnOffset + 16 + i] = (seg.pn.charCodeAt(i % 8) + i) & 0xFF;
    }
  }

  return data;
}

/** Build a minimal BinaryAnalysis mock */
function mockAnalysis(segments: { index: number; pn: string; fn: string; binOffset: number }[], ppei?: boolean): BinaryAnalysis {
  return {
    fileName: 'test.bin',
    fileSize: 0x10000,
    findings: [],
    partNumbers: segments.map(s => s.pn),
    moduleNames: [],
    flashBlocks: [],
    segments: segments.map(s => ({
      index: s.index,
      partNumber: s.pn,
      function: s.fn,
      chipAddress: 0,
      binOffset: s.binOffset,
      size: 0x3000,
    })) as FlashSegment[],
    hexRegions: [],
    vinFound: null,
    ecuPlatform: null,
    ppeiMetadata: ppei ? { version: '1', softwareParts: [], signatures: [] } as any : null,
    fileFormat: ppei ? 'ppei_container' : 'efilive_editable',
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Binary Segment Swap Engine', () => {
  describe('discoverSegments', () => {
    it('should discover segments from parser offsets with hex verification', () => {
      const segs = [
        { pnOffset: 0x1010, pn: '12688302', dataSize: 0x2000 },
        { pnOffset: 0x4010, pn: '12688295', dataSize: 0x2000 },
        { pnOffset: 0x7010, pn: '12712812', dataSize: 0x2000 },
      ];
      const data = buildTestBinary(segs, 0x20, '12709843');
      const analysis = mockAnalysis([
        { index: 1, pn: '12688302', fn: 'System', binOffset: 0x1000 },
        { index: 2, pn: '12688295', fn: 'Fuel', binOffset: 0x4000 },
        { index: 3, pn: '12712812', fn: 'Diag', binOffset: 0x7000 },
      ]);

      const result = discoverSegments(data, analysis);
      expect(result.length).toBe(3);
      expect(result[0].partNumber).toBe('12688302');
      expect(result[0].pnOffset).toBe(0x1010);
      expect(result[0].verified).toBe(true);
      expect(result[1].partNumber).toBe('12688295');
      expect(result[2].partNumber).toBe('12712812');
    });

    it('should compute end offsets correctly (next segment header)', () => {
      const segs = [
        { pnOffset: 0x1010, pn: '12688302', dataSize: 0x2000 },
        { pnOffset: 0x4010, pn: '12688295', dataSize: 0x2000 },
      ];
      const data = buildTestBinary(segs, 0x20, '12709843');
      const analysis = mockAnalysis([
        { index: 1, pn: '12688302', fn: 'System', binOffset: 0x1000 },
        { index: 2, pn: '12688295', fn: 'Fuel', binOffset: 0x4000 },
      ]);

      const result = discoverSegments(data, analysis);
      expect(result[0].endOffset).toBe(result[1].headerOffset);
      expect(result[0].totalSize).toBe(result[1].headerOffset - result[0].headerOffset);
    });
  });

  describe('findOsPN', () => {
    it('should find OS PN at standard PPEI offset (0x000020)', () => {
      const data = buildTestBinary([], 0x20, '12709843');
      const analysis = mockAnalysis([]);
      expect(findOsPN(data, analysis)).toBe('12709843');
    });

    it('should find OS PN at EFILive offset (0x200020)', () => {
      const segs = [{ pnOffset: 0x1010, pn: '12688302', dataSize: 0x100 }];
      // Build a larger binary for EFILive
      const data = new Uint8Array(0x200030);
      data.fill(0xFF);
      // Write OS at 0x200020
      const osPN = '12709844';
      for (let i = 0; i < 8; i++) data[0x200020 + i] = osPN.charCodeAt(i);
      for (let i = 8; i < 16; i++) data[0x200020 + i] = 0x00;

      const analysis = mockAnalysis([]);
      expect(findOsPN(data, analysis)).toBe('12709844');
    });
  });

  describe('setupBinaryPair', () => {
    it('should detect OS match between two binaries', () => {
      const segs = [
        { pnOffset: 0x1010, pn: '12688302', dataSize: 0x2000 },
      ];
      const targetData = buildTestBinary(segs, 0x20, '12709843');
      const sourceSegs = [
        { pnOffset: 0x1010, pn: '12688303', dataSize: 0x2000 },
      ];
      const sourceData = buildTestBinary(sourceSegs, 0x20, '12709843');

      const targetAnalysis = mockAnalysis([
        { index: 1, pn: '12688302', fn: 'System', binOffset: 0x1000 },
      ]);
      const sourceAnalysis = mockAnalysis([
        { index: 1, pn: '12688303', fn: 'System', binOffset: 0x1000 },
      ]);

      const pair = setupBinaryPair(
        targetData, 'target.bin', targetAnalysis,
        sourceData, 'source.bin', sourceAnalysis
      );

      expect(pair.osMatch).toBe(true);
      expect(pair.target.osPN).toBe('12709843');
      expect(pair.source.osPN).toBe('12709843');
      expect(pair.matchedSegments.length).toBe(1);
    });

    it('should detect OS mismatch', () => {
      const targetData = buildTestBinary(
        [{ pnOffset: 0x1010, pn: '12688302', dataSize: 0x2000 }],
        0x20, '12709843'
      );
      const sourceData = buildTestBinary(
        [{ pnOffset: 0x1010, pn: '12688303', dataSize: 0x2000 }],
        0x20, '12709844'
      );

      const pair = setupBinaryPair(
        targetData, 'target.bin',
        mockAnalysis([{ index: 1, pn: '12688302', fn: 'System', binOffset: 0x1000 }]),
        sourceData, 'source.bin',
        mockAnalysis([{ index: 1, pn: '12688303', fn: 'System', binOffset: 0x1000 }])
      );

      expect(pair.osMatch).toBe(false);
    });
  });

  describe('validateSwap', () => {
    it('should validate a valid swap', () => {
      const targetData = buildTestBinary(
        [{ pnOffset: 0x1010, pn: '12688302', dataSize: 0x2000 }],
        0x20, '12709843'
      );
      const sourceData = buildTestBinary(
        [{ pnOffset: 0x1010, pn: '12688303', dataSize: 0x2000 }],
        0x20, '12709843'
      );

      const pair = setupBinaryPair(
        targetData, 'target.bin',
        mockAnalysis([{ index: 1, pn: '12688302', fn: 'System', binOffset: 0x1000 }]),
        sourceData, 'source.bin',
        mockAnalysis([{ index: 1, pn: '12688303', fn: 'System', binOffset: 0x1000 }])
      );

      const plan = validateSwap(pair, 1);
      expect(plan.canSwap).toBe(true);
    });

    it('should warn when PNs are the same', () => {
      const targetData = buildTestBinary(
        [{ pnOffset: 0x1010, pn: '12688302', dataSize: 0x2000 }],
        0x20, '12709843'
      );
      const sourceData = buildTestBinary(
        [{ pnOffset: 0x1010, pn: '12688302', dataSize: 0x2000 }],
        0x20, '12709843'
      );

      const pair = setupBinaryPair(
        targetData, 'target.bin',
        mockAnalysis([{ index: 1, pn: '12688302', fn: 'System', binOffset: 0x1000 }]),
        sourceData, 'source.bin',
        mockAnalysis([{ index: 1, pn: '12688302', fn: 'System', binOffset: 0x1000 }])
      );

      const plan = validateSwap(pair, 1);
      expect(plan.canSwap).toBe(true);
      expect(plan.warnings.some(w => w.includes('same part number'))).toBe(true);
    });

    it('should reject swap for non-existent segment', () => {
      const targetData = buildTestBinary(
        [{ pnOffset: 0x1010, pn: '12688302', dataSize: 0x2000 }],
        0x20, '12709843'
      );
      const sourceData = buildTestBinary(
        [{ pnOffset: 0x1010, pn: '12688303', dataSize: 0x2000 }],
        0x20, '12709843'
      );

      const pair = setupBinaryPair(
        targetData, 'target.bin',
        mockAnalysis([{ index: 1, pn: '12688302', fn: 'System', binOffset: 0x1000 }]),
        sourceData, 'source.bin',
        mockAnalysis([{ index: 1, pn: '12688303', fn: 'System', binOffset: 0x1000 }])
      );

      const plan = validateSwap(pair, 99);
      expect(plan.canSwap).toBe(false);
      expect(plan.error).toContain('not found');
    });
  });

  describe('executeSegmentSwap', () => {
    it('should swap a segment and update the PN', () => {
      const targetData = buildTestBinary(
        [
          { pnOffset: 0x1010, pn: '12688302', dataSize: 0x2000 },
          { pnOffset: 0x4010, pn: '12712812', dataSize: 0x2000 },
        ],
        0x20, '12709843'
      );
      const sourceData = buildTestBinary(
        [
          { pnOffset: 0x1010, pn: '12688302', dataSize: 0x2000 },
          { pnOffset: 0x4010, pn: '12712811', dataSize: 0x2000 },
        ],
        0x20, '12709843'
      );

      const pair = setupBinaryPair(
        targetData, 'target.bin',
        mockAnalysis([
          { index: 1, pn: '12688302', fn: 'System', binOffset: 0x1000 },
          { index: 2, pn: '12712812', fn: 'Diag', binOffset: 0x4000 },
        ]),
        sourceData, 'source.bin',
        mockAnalysis([
          { index: 1, pn: '12688302', fn: 'System', binOffset: 0x1000 },
          { index: 2, pn: '12712811', fn: 'Diag', binOffset: 0x4000 },
        ])
      );

      const result = executeSegmentSwap(pair, [2]);
      expect(result.success).toBe(true);
      expect(result.swappedSegments.length).toBe(1);
      expect(result.swappedSegments[0].sourcePN).toBe('12712811');
      expect(result.swappedSegments[0].targetPN).toBe('12712812');
      expect(result.swappedSegments[0].bytesWritten).toBeGreaterThan(0);

      // Verify the PN was actually written
      const modified = new Uint8Array(result.modifiedData!);
      const newPN = String.fromCharCode(...modified.slice(0x4010, 0x4018));
      expect(newPN).toBe('12712811');

      // Verify seg 1 was NOT changed
      const seg1PN = String.fromCharCode(...modified.slice(0x1010, 0x1018));
      expect(seg1PN).toBe('12688302');
    });

    it('should swap multiple segments at once', () => {
      const targetData = buildTestBinary(
        [
          { pnOffset: 0x1010, pn: '12688302', dataSize: 0x2000 },
          { pnOffset: 0x4010, pn: '12712812', dataSize: 0x2000 },
          { pnOffset: 0x7010, pn: '12712800', dataSize: 0x2000 },
        ],
        0x20, '12709843'
      );
      const sourceData = buildTestBinary(
        [
          { pnOffset: 0x1010, pn: '12688302', dataSize: 0x2000 },
          { pnOffset: 0x4010, pn: '12712811', dataSize: 0x2000 },
          { pnOffset: 0x7010, pn: '12712799', dataSize: 0x2000 },
        ],
        0x20, '12709843'
      );

      const pair = setupBinaryPair(
        targetData, 'target.bin',
        mockAnalysis([
          { index: 1, pn: '12688302', fn: 'System', binOffset: 0x1000 },
          { index: 2, pn: '12712812', fn: 'Diag', binOffset: 0x4000 },
          { index: 3, pn: '12712800', fn: 'Operation', binOffset: 0x7000 },
        ]),
        sourceData, 'source.bin',
        mockAnalysis([
          { index: 1, pn: '12688302', fn: 'System', binOffset: 0x1000 },
          { index: 2, pn: '12712811', fn: 'Diag', binOffset: 0x4000 },
          { index: 3, pn: '12712799', fn: 'Operation', binOffset: 0x7000 },
        ])
      );

      const result = executeSegmentSwap(pair, [2, 3]);
      expect(result.success).toBe(true);
      expect(result.swappedSegments.length).toBe(2);

      const modified = new Uint8Array(result.modifiedData!);
      // Seg 2 swapped
      expect(String.fromCharCode(...modified.slice(0x4010, 0x4018))).toBe('12712811');
      // Seg 3 swapped
      expect(String.fromCharCode(...modified.slice(0x7010, 0x7018))).toBe('12712799');
      // Seg 1 unchanged
      expect(String.fromCharCode(...modified.slice(0x1010, 0x1018))).toBe('12688302');
    });

    it('should copy calibration data, not just the PN', () => {
      const targetData = buildTestBinary(
        [{ pnOffset: 0x1010, pn: '12688302', dataSize: 0x100 }],
        0x20, '12709843'
      );
      const sourceData = buildTestBinary(
        [{ pnOffset: 0x1010, pn: '12688303', dataSize: 0x100 }],
        0x20, '12709843'
      );

      // The buildTestBinary writes identifiable data based on PN chars
      // So source and target calibration data will differ

      const pair = setupBinaryPair(
        targetData, 'target.bin',
        mockAnalysis([{ index: 1, pn: '12688302', fn: 'System', binOffset: 0x1000 }]),
        sourceData, 'source.bin',
        mockAnalysis([{ index: 1, pn: '12688303', fn: 'System', binOffset: 0x1000 }])
      );

      const result = executeSegmentSwap(pair, [1]);
      expect(result.success).toBe(true);

      const modified = new Uint8Array(result.modifiedData!);
      // Check that calibration data (after PN+null) matches source, not target
      const calStart = 0x1010 + 16; // After PN (8) + null (8)
      for (let i = 0; i < 16; i++) {
        expect(modified[calStart + i]).toBe(sourceData[calStart + i]);
      }
    });
  });
});
