import { describe, it, expect } from "vitest";
import {
  parseCanSniffCsvLine,
  extractDiagEvents,
  correlatePeriodicWithDiagResponses,
  inferFromCanSniffCsv,
} from "./canSniffObdInference";

describe("canSniffObdInference", () => {
  it("parses CSV-style Busmaster/EFI export lines", () => {
    const f = parseCanSniffCsvLine("1000,7E8,8,04,41,0C,1A,F8,00,00,00,00", 0);
    expect(f).not.toBeNull();
    expect(f!.canId).toBe(0x7e8);
    expect(f!.data).toEqual([0x04, 0x41, 0x0c, 0x1a, 0xf8, 0, 0, 0]);
  });

  it("extracts Mode 01 RPM response and decodes J1979", () => {
    const frames = [
      parseCanSniffCsvLine("0,7E0,8,02,01,0C,00,00,00,00,00,00", 0)!,
      parseCanSniffCsvLine("5,7E8,8,04,41,0C,1A,F8,00,00,00,00", 1)!,
    ];
    const ev = extractDiagEvents(frames);
    const rpm = ev.find((e) => e.kind === "mode01_response" && e.pid === 0x0c);
    expect(rpm).toBeDefined();
    expect(rpm!.decodedValue).toBeCloseTo(1726, 3);
    expect(rpm!.label).toBe("Engine RPM");
  });

  it("extracts UDS $22 request/response on ECM IDs", () => {
    const frames = [
      parseCanSniffCsvLine("0,7E0,8,03,22,01,31,00,00,00,00,00", 0)!,
      parseCanSniffCsvLine("10,7E8,8,05,62,01,31,0B,B8,00,00,00", 1)!,
    ];
    const ev = extractDiagEvents(frames);
    expect(ev.some((e) => e.kind === "uds22_request" && e.did === 0x0131)).toBe(true);
    expect(ev.some((e) => e.kind === "uds22_response" && e.did === 0x0131)).toBe(true);
  });

  it("correlates periodic frame bytes with diagnostic payload in time window", () => {
    const frames = [
      parseCanSniffCsvLine("100,7E8,8,04,41,0C,1A,F8,00,00,00,00", 0)!,
      parseCanSniffCsvLine("102,280,8,00,00,1A,F8,00,00,00,00,00", 1)!,
      parseCanSniffCsvLine("200,7E8,8,04,41,0C,1B,00,00,00,00,00", 2)!,
      parseCanSniffCsvLine("201,280,8,00,00,1B,00,00,00,00,00,00", 3)!,
    ];
    const diag = extractDiagEvents(frames);
    const hints = correlatePeriodicWithDiagResponses(frames, diag, { windowMs: 50 });
    const h = hints.find((x) => x.arbId === 0x280 && x.pidOrDid === 0x0c);
    expect(h).toBeDefined();
    expect(h!.matchCount).toBeGreaterThanOrEqual(2);
  });

  it("inferFromCanSniffCsv returns structured report", () => {
    const csv = `0,7E0,8,02,01,0C,00,00,00,00,00,00
5,7E8,8,04,41,0C,1A,F8,00,00,00,00`;
    const r = inferFromCanSniffCsv(csv);
    expect(r.framesParsed).toBe(2);
    expect(r.diagEvents.length).toBeGreaterThanOrEqual(2);
  });
});
