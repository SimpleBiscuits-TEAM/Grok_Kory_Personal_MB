/**
 * One-off generator: Flash fix summary PDF for documentation / handoff.
 * Run: pnpm exec tsx scripts/generate-flash-fix-pdf.ts
 */
import { jsPDF } from "jspdf";
import path from "path";
import fs from "fs";

const outPath = path.join(process.cwd(), "docs", "Flash-Fix-Summary-PCAN-Engine.pdf");

const lines = [
  "V-OP / Good Gravy — PCAN Flash Engine Fix Summary",
  "",
  "Date: April 6, 2026",
  "Component: client/src/lib/pcanFlashEngine.ts (PCANFlashEngine)",
  "",
  "Problem addressed",
  "The flash engine derived CAN TX/RX addresses and protocol mode (GMLAN vs UDS)",
  "only from the generated flash plan and the static ECU database. When a container",
  "included explicit verify metadata (addresses, J1939 flag) that differed from those",
  "defaults, behavior could drift from the source container / tooling definitions.",
  "",
  "What was fixed",
  "1. After resolving addresses from the plan (and ECU DB protocol), the engine now",
  "   reads config.header.verify when present.",
  "2. If verify.txadr / verify.rxadr are set, they override the inferred TX/RX",
  "   arbitration IDs (parsed as hex, with or without 0x prefix).",
  "3. Protocol hint: if verify.j1939 === 'true', protocol is treated as UDS for",
  "   engine routing (not GMLAN). If either TX or RX address is greater than",
  "   0x7FF (29-bit / extended-ID style), protocol is inferred as UDS.",
  "4. When verify does not supply overrides, behavior is unchanged (plan +",
  "   shared/ecuDatabase.ts as before).",
  "",
  "Why this matters",
  "Flashing stays aligned with the DevProg / container verify section rather than",
  "generic assumptions. This does not replace a full E42-specific ECU_DATABASE",
  "entry; it ensures container-level addressing is respected when embedded.",
  "",
  "Files touched",
  "• client/src/lib/pcanFlashEngine.ts — constructor + parseHexAddr +",
  "  inferProtocolFromVerify helpers",
  "",
  "Note: Protocol and seed/key data in this project are local TypeScript ports",
  "(shared/seedKeyAlgorithms.ts, shared/ecuDatabase.ts). The app does not fetch",
  "flash protocols from the public internet for execution.",
];

function main() {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 18;
  let y = margin;
  const lineHeight = 5.2;
  const maxW = 180;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  for (const line of lines) {
    if (y > 280) {
      doc.addPage();
      y = margin;
    }
    const parts = doc.splitTextToSize(line || " ", maxW);
    doc.text(parts, margin, y);
    y += lineHeight * Math.max(1, parts.length);
  }

  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, doc.output("arraybuffer"));
  console.log("Wrote:", outPath);
}

main();
