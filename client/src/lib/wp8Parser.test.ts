import { describe, it, expect } from 'vitest';
import { parseWP8, isWP8File, wp8ToCSV, getHondaTalonKeyChannels, wp8ToDuramaxData } from './wp8Parser';
import * as fs from 'fs';
import * as path from 'path';

/**
 * WP8 Parser Tests
 *
 * Uses a synthetic binary for basic format tests and the real sample file
 * for integration tests when available.
 */

// Build a minimal WP8 binary that the parser can successfully scan.
// The key insight: after channel blocks, the parser scans byte-by-byte looking
// for 00 10 markers. To prevent it from consuming data rows (03 10), we add
// enough padding (0xFF bytes) between channels and data to force the scanner
// past the channel section quickly.
function buildWP8Binary(opts: {
  partNumber?: string;
  channelNames?: string[];
  rowCount?: number;
}): ArrayBuffer {
  const partNumber = opts.partNumber || '0801EB0401';
  const channelNames = opts.channelNames || ['Engine Speed', 'Throttle Position', 'DCT Clutch 1 Pressure', 'Alpha N'];
  const rowCount = opts.rowCount || 3;
  const buf: number[] = [];

  // Magic FECEFACE big-endian
  buf.push(0xFE, 0xCE, 0xFA, 0xCE);
  // Header padding 12 bytes
  for (let i = 0; i < 12; i++) buf.push(0x00);
  // Part number at 0x10
  for (let i = 0; i < partNumber.length; i++) buf.push(partNumber.charCodeAt(i));
  buf.push(0x00);

  // Channel blocks
  for (const name of channelNames) {
    buf.push(0x00, 0x10); // channel marker
    const payloadContent = 2 + 4 + name.length;
    const blockSize = Math.max(payloadContent + 2, 8);
    buf.push(blockSize & 0xFF);
    buf.push(0x01, 0x10); // name sub-marker
    buf.push(name.length & 0xFF, 0, 0, 0); // string length LE
    for (let i = 0; i < name.length; i++) buf.push(name.charCodeAt(i));
    const written = 2 + 4 + name.length;
    for (let i = written; i < blockSize; i++) buf.push(0x00);
  }

  // Separator: 8 bytes of 0xFF to stop the channel scanner
  // The scanner looks for 00 10 markers; 0xFF bytes won't match
  // and will cause channelStartPos to advance past this section
  for (let i = 0; i < 8; i++) buf.push(0xFF);

  // Data rows
  const numChannels = channelNames.length;
  for (let r = 0; r < rowCount; r++) {
    buf.push(0x03, 0x10); // row marker
    const rowSize = 4 + numChannels * 4;
    buf.push(rowSize & 0xFF, (rowSize >> 8) & 0xFF); // row size LE
    buf.push(0x00, 0x00); // padding
    buf.push(r & 0xFF, (r >> 8) & 0xFF, 0x00, 0x00); // timestamp LE
    for (let c = 0; c < numChannels; c++) {
      const val = (r + 1) * 1000 + c * 100;
      const f32 = new Float32Array([val]);
      const bytes = new Uint8Array(f32.buffer);
      buf.push(bytes[0], bytes[1], bytes[2], bytes[3]);
    }
  }

  return new Uint8Array(buf).buffer;
}

// Check if real sample file exists for integration tests
const SAMPLE_PATH = '/home/ubuntu/upload/Log2PPEI_GTX2860R_ID1050_HG_e85_Rev_2_2_0801EB0401_LOG_1.wp8';
const hasSampleFile = fs.existsSync(SAMPLE_PATH);

describe('WP8 Parser', () => {
  describe('isWP8File', () => {
    it('should detect valid WP8 magic bytes', () => {
      expect(isWP8File(buildWP8Binary({}))).toBe(true);
    });

    it('should reject non-WP8 files', () => {
      expect(isWP8File(new Uint8Array([0, 1, 2, 3]).buffer)).toBe(false);
    });

    it('should reject empty buffers', () => {
      expect(isWP8File(new Uint8Array([]).buffer)).toBe(false);
    });

    it('should reject short buffers', () => {
      expect(isWP8File(new Uint8Array([0xFE, 0xCE]).buffer)).toBe(false);
    });
  });

  describe('parseWP8 - synthetic binary', () => {
    it('should extract magic and part number', () => {
      const result = parseWP8(buildWP8Binary({ partNumber: '0801EB0401' }));
      expect(result.magic).toBe(0xFECEFACE);
      expect(result.partNumber).toBe('0801EB0401');
    });

    it('should detect Honda Talon vehicle type', () => {
      const result = parseWP8(buildWP8Binary({
        partNumber: '0801EB0401',
        channelNames: ['Engine Speed', 'DCT Clutch 1 Pressure', 'Alpha N'],
      }));
      expect(result.vehicleType).toBe('HONDA_TALON');
    });

    it('should detect UNKNOWN for non-Honda parts without DCT', () => {
      const result = parseWP8(buildWP8Binary({
        partNumber: 'GENERIC123',
        channelNames: ['Engine Speed', 'Throttle Position'],
      }));
      expect(result.vehicleType).toBe('UNKNOWN');
    });

    it('should detect Honda Talon via DCT + Alpha N without matching part', () => {
      const result = parseWP8(buildWP8Binary({
        partNumber: 'OTHER_PART',
        channelNames: ['Engine Speed', 'DCT Clutch 1 Pressure', 'Alpha N'],
      }));
      expect(result.vehicleType).toBe('HONDA_TALON');
    });

    it('should throw for invalid magic bytes', () => {
      expect(() => parseWP8(new Uint8Array(100).buffer)).toThrow('Invalid WP8 file');
    });

    it('should parse channel names from synthetic binary', () => {
      const result = parseWP8(buildWP8Binary({
        channelNames: ['Engine Speed', 'Throttle Position', 'DCT Clutch 1 Pressure', 'Alpha N'],
      }));
      const names = result.channels.map(c => c.name);
      expect(names).toContain('Engine Speed');
      expect(names).toContain('Throttle Position');
      expect(names).toContain('DCT Clutch 1 Pressure');
      expect(names).toContain('Alpha N');
    });

    it('should parse data rows from synthetic binary', () => {
      const result = parseWP8(buildWP8Binary({
        channelNames: ['RPM', 'DCT Clutch 1 Pressure', 'Alpha N'],
        rowCount: 3,
      }));
      expect(result.totalRows).toBe(3);
      expect(result.rows.length).toBe(3);
      // First row values: 1000, 1100, 1200
      expect(result.rows[0].values[0]).toBeCloseTo(1000, 0);
      expect(result.rows[0].values[1]).toBeCloseTo(1100, 0);
      expect(result.rows[0].values[2]).toBeCloseTo(1200, 0);
    });

    it('should detect Honda Talon with 0801EA part prefix', () => {
      const result = parseWP8(buildWP8Binary({
        partNumber: '0801EA0301',
        channelNames: ['Engine Speed', 'DCT Line Pressure'],
      }));
      expect(result.vehicleType).toBe('HONDA_TALON');
    });

    it('should not detect Honda Talon with only part number match (no DCT)', () => {
      const result = parseWP8(buildWP8Binary({
        partNumber: '0801EB0401',
        channelNames: ['Engine Speed', 'Throttle Position'],
      }));
      expect(result.vehicleType).toBe('UNKNOWN');
    });
  });

  describe('wp8ToCSV', () => {
    it('should produce CSV with channel names as headers', () => {
      const result = parseWP8(buildWP8Binary({ channelNames: ['RPM', 'TPS'], rowCount: 2 }));
      const csv = wp8ToCSV(result);
      const lines = csv.split('\n');
      expect(lines[0]).toBe('RPM,TPS');
      expect(lines.length).toBe(1 + result.totalRows);
    });

    it('should produce valid numeric values', () => {
      const result = parseWP8(buildWP8Binary({ channelNames: ['Speed'], rowCount: 1 }));
      const csv = wp8ToCSV(result);
      const lines = csv.split('\n');
      if (lines.length > 1) {
        const val = parseFloat(lines[1]);
        expect(Number.isFinite(val)).toBe(true);
        expect(val).toBeGreaterThan(0);
      }
    });
  });

  describe('getHondaTalonKeyChannels', () => {
    it('should find key channels by name', () => {
      const result = parseWP8(buildWP8Binary({
        channelNames: ['Engine Speed', 'Throttle Position', 'DCT Clutch 1 Pressure', 'Alpha N'],
      }));
      const keys = getHondaTalonKeyChannels(result);
      expect(keys.engineSpeed).toBeGreaterThanOrEqual(0);
      expect(keys.throttlePosition).toBeGreaterThanOrEqual(0);
      expect(keys.dctClutch1Pressure).toBeGreaterThanOrEqual(0);
      expect(keys.alphaN).toBeGreaterThanOrEqual(0);
    });

    it('should return -1 for missing channels', () => {
      const result = parseWP8(buildWP8Binary({
        channelNames: ['Engine Speed', 'DCT Clutch 1 Pressure', 'Alpha N'],
      }));
      const keys = getHondaTalonKeyChannels(result);
      expect(keys.vehicleSpeed).toBe(-1);
      expect(keys.coolantTemp).toBe(-1);
    });
  });

  describe('sessionStorage serialization roundtrip', () => {
    it('should survive JSON serialize/deserialize with Float32Array reconstruction', () => {
      const buffer = buildWP8Binary({
        channelNames: ['RPM', 'DCT Clutch 1 Pressure', 'Alpha N'],
        rowCount: 3,
      });
      const original = parseWP8(buffer);

      // Simulate Home.tsx serialization
      const serializable = {
        magic: original.magic,
        partNumber: original.partNumber,
        channels: original.channels,
        totalRows: original.totalRows,
        rawSize: original.rawSize,
        vehicleType: original.vehicleType,
        rows: original.rows.map(r => ({
          timestamp: r.timestamp,
          values: Array.from(r.values),
        })),
      };
      const json = JSON.stringify(serializable);

      // Simulate Advanced.tsx deserialization
      const parsed = JSON.parse(json);
      parsed.rows = parsed.rows.map((r: any) => ({
        timestamp: r.timestamp,
        values: new Float32Array(Array.isArray(r.values) ? r.values : []),
      }));

      expect(parsed.magic).toBe(original.magic);
      expect(parsed.partNumber).toBe(original.partNumber);
      expect(parsed.vehicleType).toBe(original.vehicleType);
      expect(parsed.channels.length).toBe(original.channels.length);
      expect(parsed.rows.length).toBe(original.rows.length);

      for (let i = 0; i < original.rows.length; i++) {
        expect(parsed.rows[i].timestamp).toBe(original.rows[i].timestamp);
        for (let j = 0; j < original.rows[i].values.length; j++) {
          expect(parsed.rows[i].values[j]).toBeCloseTo(original.rows[i].values[j], 2);
        }
      }
    });
  });

  // Integration test with V3 format file (flat-row data)
  const V3_SAMPLE_PATH = '/home/ubuntu/upload/PPEITuned_Rev_11_LOG_4.wp8';
  const hasV3SampleFile = fs.existsSync(V3_SAMPLE_PATH);

  describe.skipIf(!hasV3SampleFile)('parseWP8 - V3 flat-row format', () => {
    it('should parse the V3 Honda Talon WP8 file', () => {
      const fileBuffer = fs.readFileSync(V3_SAMPLE_PATH);
      const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
      const result = parseWP8(arrayBuffer);

      expect(result.magic).toBe(0xFECEFACE);
      expect(result.partNumber).toBe('0801EB0502');
      expect(result.vehicleType).toBe('HONDA_TALON');
      expect(result.channels.length).toBe(53);
      expect(result.totalRows).toBe(972);
    });

    it('should have correct channel names', () => {
      const fileBuffer = fs.readFileSync(V3_SAMPLE_PATH);
      const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
      const result = parseWP8(arrayBuffer);
      const names = result.channels.map(c => c.name);

      expect(names).toContain('Manifold Absolute Pressure');
      expect(names).toContain('Alpha N');
      expect(names).toContain('Engine Speed');
      expect(names).toContain('Air Fuel Ratio 1');
      expect(names).toContain('DCT Clutch 1 Pressure');
      expect(names).toContain('Vehicle Speed');
    });

    it('should have reasonable data values', () => {
      const fileBuffer = fs.readFileSync(V3_SAMPLE_PATH);
      const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
      const result = parseWP8(arrayBuffer);
      const keys = getHondaTalonKeyChannels(result);

      // First row: MAP ~67, Alpha N = 1, Engine Speed ~1213
      const row0 = result.rows[0];
      expect(row0.timestamp).toBe(13);
      expect(row0.values[keys.engineSpeed]).toBeCloseTo(1213, 0);
      expect(row0.values[keys.alphaN]).toBe(1);
      expect(row0.values[keys.afr1]).toBeCloseTo(13.95, 1);
    });

    it('should produce valid CSV from V3 file', () => {
      const fileBuffer = fs.readFileSync(V3_SAMPLE_PATH);
      const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
      const result = parseWP8(arrayBuffer);
      const csv = wp8ToCSV(result);

      const lines = csv.split('\n');
      expect(lines.length).toBe(973); // header + 972 rows
      expect(lines[0].split(',').length).toBe(53);
    });

    it('should have monotonically increasing timestamps', () => {
      const fileBuffer = fs.readFileSync(V3_SAMPLE_PATH);
      const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
      const result = parseWP8(arrayBuffer);

      for (let i = 1; i < result.rows.length; i++) {
        expect(result.rows[i].timestamp).toBeGreaterThan(result.rows[i - 1].timestamp);
      }
    });
  });

  // Integration test with real sample file (only runs if file exists)
  describe.skipIf(!hasSampleFile)('parseWP8 - real sample file', () => {
    it('should parse the real Honda Talon WP8 file', () => {
      const fileBuffer = fs.readFileSync(SAMPLE_PATH);
      const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
      const result = parseWP8(arrayBuffer);

      expect(result.magic).toBe(0xFECEFACE);
      expect(result.partNumber).toContain('0801EB');
      expect(result.vehicleType).toBe('HONDA_TALON');
      expect(result.channels.length).toBeGreaterThan(10);
      expect(result.totalRows).toBeGreaterThan(100);

      // Should have DCT channels
      const names = result.channels.map(c => c.name);
      expect(names.some(n => n.includes('DCT'))).toBe(true);
      expect(names).toContain('Engine Speed');
    });

    it('should produce valid CSV from real file', () => {
      const fileBuffer = fs.readFileSync(SAMPLE_PATH);
      const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
      const result = parseWP8(arrayBuffer);
      const csv = wp8ToCSV(result);

      const lines = csv.split('\n');
      expect(lines.length).toBeGreaterThan(100);
      // First line should be channel names
      expect(lines[0].split(',').length).toBe(result.channels.length);
    });

    it('should find Honda Talon key channels in real file', () => {
      const fileBuffer = fs.readFileSync(SAMPLE_PATH);
      const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
      const result = parseWP8(arrayBuffer);
      const keys = getHondaTalonKeyChannels(result);

      expect(keys.engineSpeed).toBeGreaterThanOrEqual(0);
      expect(keys.dctClutch1Pressure).toBeGreaterThanOrEqual(0);
    });
  });

  describe('wp8ToDuramaxData', () => {
    it('should convert a synthetic Honda Talon WP8 to DuramaxData', () => {
      const wp8 = parseWP8(buildWP8Binary({
        partNumber: '0801EB0401',
        channelNames: ['Engine Speed', 'Throttle Position', 'DCT Clutch 1 Pressure', 'Alpha N', 'Vehicle Speed', 'Coolant Temperature'],
        rowCount: 5,
      }));

      const data = wp8ToDuramaxData(wp8);

      // Should have arrays of length 5
      expect(data.rpm.length).toBe(5);
      expect(data.throttlePosition.length).toBe(5);
      expect(data.vehicleSpeed.length).toBe(5);
      expect(data.coolantTemp.length).toBe(5);
      expect(data.boost.length).toBe(5);
      expect(data.offset.length).toBe(5);

      // RPM should have non-zero values from the synthetic data
      expect(data.rpm[0]).toBeGreaterThan(0);

      // Should have gasoline fuel type in vehicleMeta
      expect(data.vehicleMeta?.fuelType).toBe('gasoline');
      expect(data.vehicleMeta?.make).toBe('Honda');
      expect(data.vehicleMeta?.model).toBe('Talon');

      // Should have correct boost source
      expect(data.boostSource).toBe('none'); // no MAP channel in this synthetic

      // Diesel-specific channels should be empty
      expect(data.turboSpeed).toEqual([]);
      expect(data.dpfSootLevel).toEqual([]);
      expect(data.egrPosition).toEqual([]);

      // Missing PIDs should be listed
      expect(data.pidsMissing.length).toBeGreaterThan(0);
    });

    it('should handle UNKNOWN vehicle type', () => {
      const wp8 = parseWP8(buildWP8Binary({
        partNumber: 'GENERIC123',
        channelNames: ['Engine Speed', 'Throttle Position'],
        rowCount: 2,
      }));

      const data = wp8ToDuramaxData(wp8);

      expect(data.rpm.length).toBe(2);
      expect(data.vehicleMeta?.make).toBeUndefined();
      expect(data.vehicleMeta?.model).toBeUndefined();
      expect(data.vehicleMeta?.fuelType).toBe('gasoline');
    });

    it('should produce data that processData can consume without throwing', async () => {
      const { processData } = await import('./dataProcessor');
      const wp8 = parseWP8(buildWP8Binary({
        partNumber: '0801EB0401',
        channelNames: ['Engine Speed', 'Throttle Position', 'DCT Clutch 1 Pressure', 'Vehicle Speed', 'Coolant Temperature'],
        rowCount: 10,
      }));

      const rawData = wp8ToDuramaxData(wp8);
      // This should not throw
      const processed = processData(rawData);

      expect(processed.rpm.length).toBe(10);
      expect(processed.timeMinutes.length).toBe(10);
    });
  });

  // Integration test: wp8ToDuramaxData with real V4 file
  const V4_SAMPLE_PATH = '/home/ubuntu/upload/PPEI_Rev_0_4_0801EB0402(6)_LOG_1.wp8';
  const hasV4SampleFile = fs.existsSync(V4_SAMPLE_PATH);

  describe.skipIf(!hasV4SampleFile)('wp8ToDuramaxData - V4 real file', () => {
    it('should convert the V4 Honda Talon WP8 file to DuramaxData', () => {
      const fileBuffer = fs.readFileSync(V4_SAMPLE_PATH);
      const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
      const wp8 = parseWP8(arrayBuffer);
      const data = wp8ToDuramaxData(wp8);

      expect(data.rpm.length).toBeGreaterThan(100);
      expect(data.vehicleMeta?.make).toBe('Honda');
      expect(data.vehicleMeta?.model).toBe('Talon');
      expect(data.vehicleMeta?.fuelType).toBe('gasoline');

      // Should have some non-zero RPM values
      expect(data.rpm.some(v => v > 0)).toBe(true);
    });

    it('should produce data that processData can consume', async () => {
      const { processData, downsampleData } = await import('./dataProcessor');
      const fileBuffer = fs.readFileSync(V4_SAMPLE_PATH);
      const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
      const wp8 = parseWP8(arrayBuffer);
      const rawData = wp8ToDuramaxData(wp8);

      const processed = processData(rawData);
      expect(processed.rpm.length).toBeGreaterThan(100);

      const downsampled = downsampleData(processed, 2000);
      expect(downsampled.rpm.length).toBeGreaterThan(0);
      expect(downsampled.rpm.length).toBeLessThanOrEqual(2000);
    });
  });
});
