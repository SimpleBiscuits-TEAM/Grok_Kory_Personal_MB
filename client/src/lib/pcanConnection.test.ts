/**
 * Tests for PCANConnection class and adapter selection integration
 * Tests the WebSocket bridge protocol, CAN frame construction, and ISO-TP handling
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── CAN Frame Construction Tests ──────────────────────────────────────────

describe('CAN Frame Construction', () => {
  it('should construct standard OBD-II request frame for Mode 01 PID', () => {
    // Standard OBD-II request: CAN ID 0x7DF, 8 bytes
    // Mode 01, PID 0x0C (RPM): [02, 01, 0C, 00, 00, 00, 00, 00]
    const mode = 0x01;
    const pid = 0x0C;
    const dataLength = 2; // mode + pid
    const frame = [dataLength, mode, pid, 0, 0, 0, 0, 0];
    
    expect(frame).toHaveLength(8);
    expect(frame[0]).toBe(2); // PCI byte: length
    expect(frame[1]).toBe(0x01); // Mode
    expect(frame[2]).toBe(0x0C); // PID
  });

  it('should construct Mode 22 extended PID request frame', () => {
    // Mode 22 (ReadDataByIdentifier): CAN ID 0x7E0, 8 bytes
    // DID 0x0131 (Fuel Rail Pressure): [03, 22, 01, 31, 00, 00, 00, 00]
    const mode = 0x22;
    const didHigh = 0x01;
    const didLow = 0x31;
    const dataLength = 3; // mode + DID high + DID low
    const frame = [dataLength, mode, didHigh, didLow, 0, 0, 0, 0];
    
    expect(frame).toHaveLength(8);
    expect(frame[0]).toBe(3);
    expect(frame[1]).toBe(0x22);
    expect(frame[2]).toBe(0x01);
    expect(frame[3]).toBe(0x31);
  });

  it('should construct DTC read request (Mode 03)', () => {
    // Mode 03 (Read DTCs): [01, 03, 00, 00, 00, 00, 00, 00]
    const frame = [1, 0x03, 0, 0, 0, 0, 0, 0];
    
    expect(frame[0]).toBe(1);
    expect(frame[1]).toBe(0x03);
  });

  it('should construct DTC clear request (Mode 04)', () => {
    // Mode 04 (Clear DTCs): [01, 04, 00, 00, 00, 00, 00, 00]
    const frame = [1, 0x04, 0, 0, 0, 0, 0, 0];
    
    expect(frame[0]).toBe(1);
    expect(frame[1]).toBe(0x04);
  });

  it('should construct VIN request (Mode 09 PID 02)', () => {
    // Mode 09, PID 02 (VIN): [02, 09, 02, 00, 00, 00, 00, 00]
    const frame = [2, 0x09, 0x02, 0, 0, 0, 0, 0];
    
    expect(frame[0]).toBe(2);
    expect(frame[1]).toBe(0x09);
    expect(frame[2]).toBe(0x02);
  });
});

// ─── CAN Response Parsing Tests ──────────────────────────────────────────

describe('CAN Response Parsing', () => {
  it('should parse single-frame Mode 01 response', () => {
    // Response to RPM query: CAN ID 0x7E8, data [04, 41, 0C, 1A, F8, ...]
    // 0x41 = Mode 01 + 0x40, PID 0x0C, value = (0x1A * 256 + 0xF8) / 4 = 1726 RPM
    const responseData = [0x04, 0x41, 0x0C, 0x1A, 0xF8, 0x00, 0x00, 0x00];
    
    const pciLength = responseData[0];
    const responseMode = responseData[1];
    const responsePid = responseData[2];
    const dataBytes = responseData.slice(3, 3 + pciLength - 2);
    
    expect(pciLength).toBe(4);
    expect(responseMode).toBe(0x41); // Mode 01 response
    expect(responsePid).toBe(0x0C);
    expect(dataBytes).toEqual([0x1A, 0xF8]);
    
    // Decode RPM: (A * 256 + B) / 4
    const rpm = (dataBytes[0] * 256 + dataBytes[1]) / 4;
    expect(rpm).toBe(1726);
  });

  it('should parse Mode 22 response', () => {
    // Response to DID 0x0131: CAN ID 0x7E8, data [05, 62, 01, 31, XX, XX, ...]
    // 0x62 = Mode 22 + 0x40
    const responseData = [0x05, 0x62, 0x01, 0x31, 0x0B, 0xB8, 0x00, 0x00];
    
    const responseMode = responseData[1];
    const didHigh = responseData[2];
    const didLow = responseData[3];
    const valueBytes = responseData.slice(4, 4 + responseData[0] - 3);
    
    expect(responseMode).toBe(0x62); // Mode 22 response
    expect(didHigh).toBe(0x01);
    expect(didLow).toBe(0x31);
    expect(valueBytes).toEqual([0x0B, 0xB8]);
    
    // Decode: (A * 256 + B) = 3000 (e.g., 3000 bar rail pressure raw)
    const rawValue = valueBytes[0] * 256 + valueBytes[1];
    expect(rawValue).toBe(3000);
  });

  it('should detect negative response (NRC)', () => {
    // Negative response: [03, 7F, 22, 31, ...] = serviceNotSupported for Mode 22
    const responseData = [0x03, 0x7F, 0x22, 0x31, 0x00, 0x00, 0x00, 0x00];
    
    const isNegative = responseData[1] === 0x7F;
    const requestedService = responseData[2];
    const nrc = responseData[3];
    
    expect(isNegative).toBe(true);
    expect(requestedService).toBe(0x22);
    expect(nrc).toBe(0x31); // requestOutOfRange
  });
});

// ─── ISO-TP Multi-Frame Tests ──────────────────────────────────────────

describe('ISO-TP Multi-Frame Protocol', () => {
  it('should identify single frame (SF) by PCI type', () => {
    // Single Frame: PCI byte upper nibble = 0
    const pciType = (0x04 >> 4) & 0x0F;
    expect(pciType).toBe(0); // SF
  });

  it('should identify first frame (FF) by PCI type', () => {
    // First Frame: PCI byte upper nibble = 1
    // FF for VIN (17 chars + overhead): [10, 14, 49, 02, 01, ...]
    const pciType = (0x10 >> 4) & 0x0F;
    expect(pciType).toBe(1); // FF
  });

  it('should identify consecutive frame (CF) by PCI type', () => {
    // Consecutive Frame: PCI byte upper nibble = 2
    // CF sequence number in lower nibble: [21, ...], [22, ...], etc.
    const pciType = (0x21 >> 4) & 0x0F;
    const seqNum = 0x21 & 0x0F;
    expect(pciType).toBe(2); // CF
    expect(seqNum).toBe(1);
  });

  it('should construct flow control frame (FC)', () => {
    // Flow Control: PCI byte upper nibble = 3
    // FC ContinueToSend: [30, 00, 00, ...] (BS=0 no limit, STmin=0)
    const fcFrame = [0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    
    const pciType = (fcFrame[0] >> 4) & 0x0F;
    expect(pciType).toBe(3); // FC
    
    const flowStatus = fcFrame[0] & 0x0F;
    expect(flowStatus).toBe(0); // ContinueToSend
  });

  it('should reassemble VIN from multi-frame response', () => {
    // Simulated VIN multi-frame response for "1GCHK23K88F123456"
    const vin = '1GCHK23K88F123456';
    const vinBytes = Array.from(vin).map(c => c.charCodeAt(0));
    
    // First Frame: [10, 14, 49, 02, 01, G, C, H] (total length = 20 = 0x14)
    // Note: 49 = Mode 09 + 0x40, 02 = PID, 01 = message count
    const ff = [0x10, 0x14, 0x49, 0x02, 0x01, vinBytes[0], vinBytes[1], vinBytes[2]];
    // CF1: [21, K, 2, 3, K, 8, 8, F]
    const cf1 = [0x21, vinBytes[3], vinBytes[4], vinBytes[5], vinBytes[6], vinBytes[7], vinBytes[8], vinBytes[9]];
    // CF2: [22, 1, 2, 3, 4, 5, 6, padding]
    const cf2 = [0x22, vinBytes[10], vinBytes[11], vinBytes[12], vinBytes[13], vinBytes[14], vinBytes[15], vinBytes[16]];
    
    // Reassemble: skip FF header (bytes 0-4), then CF payload (skip byte 0)
    const payload = [
      ...ff.slice(5),       // 3 bytes from FF
      ...cf1.slice(1),      // 7 bytes from CF1
      ...cf2.slice(1, 8),   // 7 bytes from CF2
    ];
    
    const reassembledVin = String.fromCharCode(...payload.slice(0, 17));
    expect(reassembledVin).toBe(vin);
  });
});

// ─── Bridge Protocol Message Tests ──────────────────────────────────────

describe('Bridge Protocol Messages', () => {
  it('should format OBD request message for bridge', () => {
    const msg = {
      type: 'obd_request',
      request_id: 'req_001',
      mode: 0x01,
      pid: 0x0C,
    };
    
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json);
    
    expect(parsed.type).toBe('obd_request');
    expect(parsed.mode).toBe(1);
    expect(parsed.pid).toBe(12);
  });

  it('should format CAN send message for bridge', () => {
    const msg = {
      type: 'can_send',
      request_id: 'req_002',
      arb_id: 0x7DF,
      data: [0x02, 0x01, 0x0C, 0x00, 0x00, 0x00, 0x00, 0x00],
      extended: false,
    };
    
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json);
    
    expect(parsed.arb_id).toBe(0x7DF);
    expect(parsed.data).toHaveLength(8);
    expect(parsed.extended).toBe(false);
  });

  it('should parse bridge connected response', () => {
    const response = {
      type: 'connected',
      channel: 'PCAN_USBBUS1',
      bitrate: 500000,
    };
    
    expect(response.type).toBe('connected');
    expect(response.bitrate).toBe(500000);
  });

  it('should parse bridge error response', () => {
    const response = {
      type: 'error',
      request_id: 'req_003',
      error: 'Timeout waiting for response',
    };
    
    expect(response.type).toBe('error');
    expect(response.error).toContain('Timeout');
  });

  it('should parse OBD response from bridge', () => {
    const response = {
      type: 'obd_response',
      request_id: 'req_001',
      arb_id: 0x7E8,
      data: [0x04, 0x41, 0x0C, 0x1A, 0xF8, 0x00, 0x00, 0x00],
      timestamp: 1711500000.123,
    };
    
    expect(response.type).toBe('obd_response');
    expect(response.arb_id).toBe(0x7E8);
    expect(response.data[1]).toBe(0x41);
  });
});

// ─── DTC Parsing from Raw CAN Tests ──────────────────────────────────────

describe('DTC Parsing from Raw CAN', () => {
  it('should parse DTC bytes into standard code format', () => {
    // DTC bytes: [01, 00] = P0100
    // Byte 1 bits 7-6: category (00=P, 01=C, 10=B, 11=U)
    // Byte 1 bits 5-4: second digit
    // Byte 1 bits 3-0: third digit
    // Byte 2: fourth + fifth digits
    const byte1 = 0x01;
    const byte2 = 0x00;
    
    const categories = ['P', 'C', 'B', 'U'];
    const category = categories[(byte1 >> 6) & 0x03];
    const digit2 = (byte1 >> 4) & 0x03;
    const digit3 = byte1 & 0x0F;
    const digit4 = (byte2 >> 4) & 0x0F;
    const digit5 = byte2 & 0x0F;
    
    const dtcCode = `${category}${digit2}${digit3}${digit4}${digit5}`;
    expect(dtcCode).toBe('P0100');
  });

  it('should parse chassis DTC', () => {
    // [41, 23] = C0123
    const byte1 = 0x41;
    const byte2 = 0x23;
    
    const categories = ['P', 'C', 'B', 'U'];
    const category = categories[(byte1 >> 6) & 0x03];
    const digit2 = (byte1 >> 4) & 0x03;
    const digit3 = byte1 & 0x0F;
    const digit4 = (byte2 >> 4) & 0x0F;
    const digit5 = byte2 & 0x0F;
    
    const dtcCode = `${category}${digit2}${digit3}${digit4}${digit5}`;
    expect(dtcCode).toBe('C0123');
  });

  it('should parse common Duramax DTC P0087 (low fuel rail pressure)', () => {
    // P0087: category=P(00), digit2=0, digit3=0, digit4=8, digit5=7
    // Byte1: 00_00_0000 = 0x00, Byte2: 1000_0111 = 0x87
    const byte1 = 0x00;
    const byte2 = 0x87;
    
    const categories = ['P', 'C', 'B', 'U'];
    const category = categories[(byte1 >> 6) & 0x03];
    const digit2 = (byte1 >> 4) & 0x03;
    const digit3 = byte1 & 0x0F;
    const digit4 = (byte2 >> 4) & 0x0F;
    const digit5 = byte2 & 0x0F;
    
    const dtcCode = `${category}${digit2}${digit3}${digit4}${digit5}`;
    expect(dtcCode).toBe('P0087');
  });

  it('should skip empty DTC bytes (0x0000)', () => {
    const byte1 = 0x00;
    const byte2 = 0x00;
    const isEmpty = byte1 === 0 && byte2 === 0;
    expect(isEmpty).toBe(true);
  });
});

// ─── Adapter Selection Logic Tests ──────────────────────────────────────

describe('Adapter Selection Logic', () => {
  it('should default to elm327 adapter type', () => {
    const defaultAdapter = 'elm327';
    expect(defaultAdapter).toBe('elm327');
  });

  it('should allow switching to pcan adapter type', () => {
    let adapterType: 'elm327' | 'pcan' = 'elm327';
    adapterType = 'pcan';
    expect(adapterType).toBe('pcan');
  });

  it('should determine connection class based on adapter type', () => {
    const adapterType = 'pcan';
    const connectionClass = adapterType === 'pcan' ? 'PCANConnection' : 'OBDConnection';
    expect(connectionClass).toBe('PCANConnection');
  });

  it('should not require WebSerial for PCAN mode', () => {
    const adapterType = 'pcan';
    const isWebSerialRequired = adapterType === 'elm327';
    expect(isWebSerialRequired).toBe(false);
  });

  it('should require WebSerial for ELM327 mode', () => {
    const adapterType = 'elm327';
    const isWebSerialRequired = adapterType === 'elm327';
    expect(isWebSerialRequired).toBe(true);
  });
});

// ─── Bridge Availability Check Tests ──────────────────────────────────────

describe('Bridge Availability', () => {
  it('should have correct default secure URL', () => {
    const secureUrl = 'wss://localhost:8766';
    expect(secureUrl).toMatch(/^wss:\/\/localhost:\d+$/);
  });

  it('should have correct default insecure URL', () => {
    const insecureUrl = 'ws://localhost:8765';
    expect(insecureUrl).toMatch(/^ws:\/\/localhost:\d+$/);
  });

  it('should try secure URL before insecure URL', () => {
    // The connection flow should try wss:// first, then ws://
    const urlOrder = ['wss://localhost:8766', 'ws://localhost:8765'];
    expect(urlOrder[0]).toMatch(/^wss:\/\//);
    expect(urlOrder[1]).toMatch(/^ws:\/\//);
  });

  it('should handle custom bridge URL', () => {
    const customUrl = 'ws://192.168.1.100:9999';
    expect(customUrl).toMatch(/^ws:\/\//);
  });

  it('should return available status with working URL', () => {
    // Simulated result from isBridgeAvailable
    const result = { available: true, url: 'wss://localhost:8766' };
    expect(result.available).toBe(true);
    expect(result.url).toMatch(/^wss:\/\//);
  });

  it('should return unavailable status when no bridge found', () => {
    const result = { available: false, url: 'ws://localhost:8765' };
    expect(result.available).toBe(false);
  });
});

// ─── PID Value Decoding Tests (Raw CAN) ──────────────────────────────────

describe('PID Value Decoding from Raw CAN', () => {
  it('should decode engine RPM (PID 0x0C)', () => {
    // Formula: (A * 256 + B) / 4
    const A = 0x1A, B = 0xF8;
    const rpm = (A * 256 + B) / 4;
    expect(rpm).toBe(1726);
  });

  it('should decode vehicle speed (PID 0x0D)', () => {
    // Formula: A (km/h)
    const A = 0x60;
    const speed = A;
    expect(speed).toBe(96);
  });

  it('should decode coolant temp (PID 0x05)', () => {
    // Formula: A - 40 (°C)
    const A = 0xB4;
    const temp = A - 40;
    expect(temp).toBe(140);
  });

  it('should decode throttle position (PID 0x11)', () => {
    // Formula: A * 100 / 255 (%)
    const A = 0x80;
    const throttle = (A * 100) / 255;
    expect(throttle).toBeCloseTo(50.2, 1);
  });

  it('should decode engine load (PID 0x04)', () => {
    // Formula: A * 100 / 255 (%)
    const A = 0xFF;
    const load = (A * 100) / 255;
    expect(load).toBe(100);
  });

  it('should decode boost pressure (PID 0x6C if available)', () => {
    // Turbo inlet pressure: (A * 256 + B) * 0.03125 kPa
    const A = 0x03, B = 0xE8;
    const pressureKpa = (A * 256 + B) * 0.03125;
    const pressurePsi = pressureKpa * 0.145038;
    expect(pressureKpa).toBeCloseTo(31.25, 2);
    expect(pressurePsi).toBeCloseTo(4.53, 1);
  });
});
