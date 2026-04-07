import { describe, it, expect } from "vitest";
import { Buffer } from "node:buffer";
import { parseTuneDeployBinary, buildTuneDeployObjectKey } from "./tuneDeployParser";

/**
 * Build a synthetic GM raw flash binary with 0xAA55 header and part number at 0x20.
 */
function buildGmRawBinary(osPN: string = "12709844", size: number = 0x5000): Buffer {
  const buf = Buffer.alloc(size, 0xFF);
  // 0xAA55 header magic
  buf[0] = 0xAA;
  buf[1] = 0x55;
  // Write OS part number at offset 0x20
  buf.write(osPN, 0x20, "ascii");
  // Null-terminate
  buf[0x28] = 0x00;
  // 0x55AA footer at end - 0x10
  const footerOffset = size - 0x10;
  buf[footerOffset] = 0x55;
  buf[footerOffset + 1] = 0xAA;
  return buf;
}

describe("parseTuneDeployBinary — GM raw binary support", () => {
  it("detects GM_RAW container format from 0xAA55 header", () => {
    const buf = buildGmRawBinary("12709844");
    const meta = parseTuneDeployBinary(buf, "E41_STOCK_12709844.BIN");
    expect(meta.containerFormat).toBe("GM_RAW");
    expect(meta.fileStructureFamily).toBe("GM_RAW_BINARY");
  });

  it("extracts OS number from binary offset 0x20", () => {
    const buf = buildGmRawBinary("12709844");
    const meta = parseTuneDeployBinary(buf, "E41_STOCK_12709844.BIN");
    expect(meta.osVersion).toBe("12709844");
  });

  it("extracts part numbers from filename", () => {
    const buf = buildGmRawBinary("12709844");
    const fileName = "E41_STOCK_12709844_12688366_12688360_12688384_12712835_12712823.BIN";
    const meta = parseTuneDeployBinary(buf, fileName);
    expect(meta.calibrationPartNumbers).toContain("12709844");
    expect(meta.calibrationPartNumbers).toContain("12688366");
    expect(meta.calibrationPartNumbers).toContain("12688360");
    expect(meta.calibrationPartNumbers).toContain("12688384");
    expect(meta.calibrationPartNumbers).toContain("12712835");
    expect(meta.calibrationPartNumbers).toContain("12712823");
  });

  it("extracts ECU type E41 from filename", () => {
    const buf = buildGmRawBinary("12709844");
    const meta = parseTuneDeployBinary(buf, "E41_STOCK_12709844.BIN");
    expect(meta.ecuType).toBe("E41");
  });

  it("infers Duramax vehicle family from E41 ECU type", () => {
    const buf = buildGmRawBinary("12709844");
    const meta = parseTuneDeployBinary(buf, "E41_STOCK_12709844.BIN");
    expect(meta.vehicleFamily).toBe("Duramax");
    expect(meta.vehicleSubType).toBe("E41");
    expect(meta.modelYearStart).toBe(2017);
  });

  it("does not produce unrecognized_container warnings", () => {
    const buf = buildGmRawBinary("12709844");
    const meta = parseTuneDeployBinary(buf, "E41_STOCK_12709844.BIN");
    const hasUnrecognized = meta.warnings.some((w) =>
      w.toLowerCase().includes("not recognized")
    );
    expect(hasUnrecognized).toBe(false);
  });

  it("builds correct object key for GM raw binary", () => {
    const buf = buildGmRawBinary("12709844");
    const meta = parseTuneDeployBinary(buf, "E41_STOCK_12709844.BIN");
    const key = buildTuneDeployObjectKey(meta, "abc123", "E41_STOCK_12709844.BIN");
    expect(key).toContain("tune-deploy/Duramax/E41/2017/");
    expect(key).toContain("abc123");
  });

  it("handles GM raw binary without part number at 0x20", () => {
    const buf = Buffer.alloc(0x5000, 0xFF);
    buf[0] = 0xAA;
    buf[1] = 0x55;
    // No ASCII PN at 0x20 — all 0xFF
    const meta = parseTuneDeployBinary(buf, "unknown_file.BIN");
    expect(meta.containerFormat).toBe("GM_RAW");
    expect(meta.fileStructureFamily).toBe("GM_RAW_BINARY");
  });

  it("does not misclassify PPEI IPF as GM_RAW", () => {
    const buf = Buffer.alloc(0x5000, 0xFF);
    // IPF magic: 0x49 0x50 0x46
    buf[0] = 0x49;
    buf[1] = 0x50;
    buf[2] = 0x46;
    const meta = parseTuneDeployBinary(buf, "test.bin");
    expect(meta.containerFormat).toBe("PPEI");
  });
});
