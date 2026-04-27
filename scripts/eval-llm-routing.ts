import { classifyIntent } from "../server/lib/llmIntent";
import { buildRelevantContextPack } from "../server/lib/llmContext";

type Case = {
  q: string;
  expectedDomain: string;
  kb?: string;
};

const CASES: Case[] = [
  {
    q: "Why am I seeing P0087 with low rail pressure under load?",
    expectedDomain: "diagnostics",
    kb: "P0087 occurs when rail pressure actual is below desired under demand.",
  },
  {
    q: "My flash fails during seed key unlock on E41, what should I check?",
    expectedDomain: "flash",
    kb: "Unlock and seed key flow is required before programming on secured ECUs.",
  },
  {
    q: "Need to scan CAN frames from PCAN and identify arbitration IDs.",
    expectedDomain: "intellispy",
    kb: "IntelliSpy uses CAN capture and frame filtering by arbitration ID.",
  },
  {
    q: "How can I improve our fleet maintenance scheduling and driver scoring?",
    expectedDomain: "fleet",
    kb: "Fleet module includes orgs, vehicles, alerts, and predictive maintenance.",
  },
  {
    q: "Can you help me read a2l maps and compare binary offsets?",
    expectedDomain: "editor",
    kb: "A2L parsing maps measurement and calibration symbols to binary structures.",
  },
];

function run() {
  let intentPass = 0;
  let contextPass = 0;

  for (const c of CASES) {
    const intent = classifyIntent(c.q);
    const context = buildRelevantContextPack({
      question: c.q,
      sources: [c.kb],
      maxChars: 500,
      maxChunks: 3,
    });

    const intentOk = intent.domain === c.expectedDomain;
    const contextOk = context.context.length > 0;
    if (intentOk) intentPass += 1;
    if (contextOk) contextPass += 1;

    console.log(`Q: ${c.q}`);
    console.log(`  expected=${c.expectedDomain} predicted=${intent.domain} (${intent.confidence}) ${intentOk ? "PASS" : "FAIL"}`);
    console.log(`  context=${contextOk ? "PASS" : "FAIL"} chars=${context.context.length} citations=${context.citations.length}`);
  }

  const total = CASES.length;
  const intentPct = Math.round((intentPass / total) * 100);
  const contextPct = Math.round((contextPass / total) * 100);
  console.log("\n=== Eval Summary ===");
  console.log(`Intent routing: ${intentPass}/${total} (${intentPct}%)`);
  console.log(`Context extraction: ${contextPass}/${total} (${contextPct}%)`);
}

run();
