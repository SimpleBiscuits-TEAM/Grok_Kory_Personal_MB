import { describe, expect, it } from 'vitest';
import { inferProtocolFromVerify, isTruthyVerifyFlag, parseHexCanId } from './flashVerify';

describe('flashVerify', () => {
  it('parseHexCanId accepts valid 11-bit and 29-bit ids', () => {
    expect(parseHexCanId('7E0')).toBe(0x7e0);
    expect(parseHexCanId('0x18DA00F1')).toBe(0x18da00f1);
    expect(parseHexCanId('  7E0  ')).toBe(0x7e0);
  });

  it('parseHexCanId rejects invalid', () => {
    expect(parseHexCanId('')).toBeNull();
    expect(parseHexCanId('GG')).toBeNull();
    expect(parseHexCanId('20000000')).toBeNull();
  });

  it('isTruthyVerifyFlag handles common container truthy forms', () => {
    expect(isTruthyVerifyFlag('true')).toBe(true);
    expect(isTruthyVerifyFlag('TRUE')).toBe(true);
    expect(isTruthyVerifyFlag('1')).toBe(true);
    expect(isTruthyVerifyFlag('yes')).toBe(true);
    expect(isTruthyVerifyFlag('false')).toBe(false);
    expect(isTruthyVerifyFlag('0')).toBe(false);
  });

  it('inferProtocolFromVerify prefers UDS for j1939 or extended-style ids', () => {
    expect(inferProtocolFromVerify('false', 0x7e0, 0x7e8)).toBeNull();
    expect(inferProtocolFromVerify('true', 0x7e0, 0x7e8)).toBe('UDS');
    expect(inferProtocolFromVerify(undefined, 0x18da00f1, 0x7e8)).toBe('UDS');
  });
});
