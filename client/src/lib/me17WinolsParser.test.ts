/**
 * Tests for ME17 WinOLS Project Parser
 * 
 * Verifies:
 * - Header parsing (vehicle, model, ECU ID, software version)
 * - Binary section extraction
 * - Map definition parsing
 * - A2L generation
 */
import { describe, it, expect } from 'vitest';
import { parseME17WinOLSProject, generateME17A2L, exportME17ProjectJSON } from './me17WinolsParser';

describe('ME17 WinOLS Parser', () => {
  describe('Header parsing', () => {
    it('should extract vehicle and model information', () => {
      // Create a minimal WinOLS header buffer
      const header = createMinimalWinOLSHeader();
      const project = parseME17WinOLSProject(header.buffer);

      expect(project).not.toBeNull();
      if (project) {
        expect(project.vehicle).toBe('CAN AM');
        expect(project.model).toBe('Maverick 3R');
        expect(project.ecuId).toBe('VM7E270175A0');
      }
    });

    it('should extract processor version', () => {
      const header = createMinimalWinOLSHeader();
      const project = parseME17WinOLSProject(header.buffer);

      expect(project).not.toBeNull();
      if (project) {
        expect(project.processorVersion).toContain('ME17');
      }
    });
  });

  describe('Binary extraction', () => {
    it('should extract binary section from WinOLS file', () => {
      const header = createMinimalWinOLSHeader();
      const project = parseME17WinOLSProject(header.buffer);

      expect(project).not.toBeNull();
      if (project) {
        expect(project.binary).toBeDefined();
        expect(project.binary.length).toBeGreaterThan(0);
      }
    });

    it('should set correct base address for ME17', () => {
      const header = createMinimalWinOLSHeader();
      const project = parseME17WinOLSProject(header.buffer);

      expect(project).not.toBeNull();
      if (project) {
        expect(project.baseAddress).toBe(0x80020000);
      }
    });
  });

  describe('A2L generation', () => {
    it('should generate valid ASAP2 format', () => {
      const header = createMinimalWinOLSHeader();
      const project = parseME17WinOLSProject(header.buffer);

      expect(project).not.toBeNull();
      if (project) {
        const a2l = generateME17A2L(project);
        expect(a2l).toContain('ASAP2_VERSION');
        expect(a2l).toContain('PROJECT');
        expect(a2l).toContain('MODULE');
        expect(a2l).toContain('RECORD_LAYOUT');
      }
    });

    it('should include ECU ID in A2L', () => {
      const header = createMinimalWinOLSHeader();
      const project = parseME17WinOLSProject(header.buffer);

      expect(project).not.toBeNull();
      if (project) {
        const a2l = generateME17A2L(project);
        expect(a2l).toContain(project.ecuId);
      }
    });

    it('should include software version in A2L', () => {
      const header = createMinimalWinOLSHeader();
      const project = parseME17WinOLSProject(header.buffer);

      expect(project).not.toBeNull();
      if (project) {
        const a2l = generateME17A2L(project);
        expect(a2l).toContain(project.softwareVersion);
      }
    });
  });

  describe('JSON export', () => {
    it('should export project metadata as JSON', () => {
      const header = createMinimalWinOLSHeader();
      const project = parseME17WinOLSProject(header.buffer);

      expect(project).not.toBeNull();
      if (project) {
        const json = exportME17ProjectJSON(project);
        const parsed = JSON.parse(json);

        expect(parsed.metadata).toBeDefined();
        expect(parsed.metadata.vehicle).toBe('CAN AM');
        expect(parsed.metadata.ecuId).toBe('VM7E270175A0');
      }
    });

    it('should include map definitions in JSON', () => {
      const header = createMinimalWinOLSHeader();
      const project = parseME17WinOLSProject(header.buffer);

      expect(project).not.toBeNull();
      if (project) {
        const json = exportME17ProjectJSON(project);
        const parsed = JSON.parse(json);

        expect(parsed.maps).toBeDefined();
        expect(Array.isArray(parsed.maps)).toBe(true);
      }
    });
  });
});

/**
 * Helper: Create a minimal WinOLS header buffer for testing
 */
function createMinimalWinOLSHeader(): { buffer: ArrayBuffer } {
  const parts: Uint8Array[] = [];

  function addLengthPrefixedString(str: string) {
    const encoded = new TextEncoder().encode(str);
    const lengthBuf = new Uint8Array(4);
    new DataView(lengthBuf.buffer).setUint32(0, encoded.length, true);
    parts.push(lengthBuf);
    parts.push(encoded);
  }

  // Magic
  addLengthPrefixedString('WinOLS File');

  // Skip 4 bytes
  parts.push(new Uint8Array(4));

  // Version info (4 bytes)
  parts.push(new Uint8Array(4));

  // Vehicle
  addLengthPrefixedString('CAN AM');

  // Model
  addLengthPrefixedString('Maverick 3R');

  // Processor
  addLengthPrefixedString('Bosch');

  // Processor version
  addLengthPrefixedString('ME17.8.5');

  // ECU ID
  addLengthPrefixedString('VM7E270175A0');

  // Software version
  addLengthPrefixedString('10SW052195');

  // File name
  addLengthPrefixedString('test_project.ols');

  // Version string
  addLengthPrefixedString('OLS 5.0 (WinOLS)');

  // Add binary section marker (2MB)
  const binarySize = 0x200000;
  const binarySizeBuf = new Uint8Array(4);
  new DataView(binarySizeBuf.buffer).setUint32(0, binarySize, true);
  parts.push(binarySizeBuf);

  // Add minimal binary data
  parts.push(new Uint8Array(binarySize).fill(0));

  // Add minimal map section
  const mapMarker = new TextEncoder().encode('MAP[0]');
  parts.push(mapMarker);
  parts.push(new Uint8Array(100)); // Padding

  // Combine all parts
  let totalLength = 0;
  for (const part of parts) {
    totalLength += part.length;
  }

  const buffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    buffer.set(part, offset);
    offset += part.length;
  }

  return { buffer: buffer.buffer };
}
