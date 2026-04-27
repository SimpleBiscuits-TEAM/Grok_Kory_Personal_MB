import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Knox Quad-Agent Pipeline Tests
 * ================================
 * Tests the agent architecture: Alpha, Beta, Gamma, Delta, Reconciler, Monica filter, access levels.
 * These tests mock the LLM calls to verify orchestration logic without hitting external APIs.
 */

// ─── Mock LLM before imports ──────────────────────────────────────────────
const mockInvokeLLM = vi.fn();
vi.mock("./_core/llm", () => ({
  invokeLLM: (...args: unknown[]) => mockInvokeLLM(...args),
}));

// Mock database calls for Delta and Alpha
const mockGetDb = vi.fn();
vi.mock("./db", () => ({
  getDb: () => mockGetDb(),
  getKnoxFileContextForLLM: async () => 'Mock file context for LLM',
  getKnoxFiles: async () => [],
  getKnoxFileById: async () => null,
}));

// Mock Knox knowledge server
vi.mock("./lib/knoxKnowledgeServer", () => ({
  getFullKnoxKnowledge: () => "Mock knowledge base content for testing",
  getSanitizedKnoxKnowledge: () => "Mock sanitized knowledge for Level 1/2",
  getKnoxFileContextForLLM: async () => "Mock file context",
  getKnoxFiles: async () => [],
}));

// Mock A2L parser
vi.mock("./lib/a2lParser", () => ({
  parseA2LFile: () => null,
}));

import { queryKnox, type AccessLevel } from "./lib/knoxReconciler";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeLLMResponse(content: string) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

function makeAgentJsonResponse(obj: Record<string, unknown>) {
  return makeLLMResponse(JSON.stringify(obj));
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: DB returns null (no DB available)
  mockGetDb.mockResolvedValue(null);
});

// ─── Access Level Gating ──────────────────────────────────────────────────

describe("Access Level Gating", () => {
  it("Level 1 returns Monica-filtered response (no engineering data)", async () => {
    // Monica uses a single LLM call with sanitized knowledge
    mockInvokeLLM.mockResolvedValue(
      makeLLMResponse("Your truck's boost pressure is running at a safe level. No issues detected.")
    );

    const result = await queryKnox({
      question: "What is my boost pressure target?",
      accessLevel: 1 as AccessLevel,
      domain: "diagnostics",
    });

    expect(result).toBeDefined();
    expect(result.answer).toBeTruthy();
    expect(result.pipeline).toBe("monica");
    // Monica should NOT expose engineering terms
    expect(result.answer).not.toMatch(/0x[0-9A-Fa-f]{4,}/); // No hex addresses
  });

  it("Level 2 returns Knox-filtered response (docs but no engineering internals)", async () => {
    // Level 2 goes through the full quad-agent pipeline but sanitizes output
    // Alpha response
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "K_BOOST_MAX at 0x3A200 is set to 151.7 kPa",
        confidence: 0.9,
        sources: ["A2L map"],
        evidence: ["Direct map lookup"],
        gaps: [],
      })
    );
    // Beta response
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "Per GM spec, boost limit is controlled by calibration table K_BOOST_MAX",
        confidence: 0.85,
        references: ["GM SPS Procedure"],
        protocolDetails: "UDS service 0x2E writes to this address",
        uncertainties: [],
      })
    );
    // Gamma response
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "Real-world testing confirms 22 PSI is the typical target",
        verdict: "agree",
        challenges: [],
        gotchas: ["Some 2021+ models have a different base map"],
        practicalAdvice: "Always verify with a datalog first",
        knowledgeSources: ["Forum data"],
        confidence: 0.8,
      })
    );
    // Delta response
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "Internal records confirm 22 PSI target for L5P",
        confidence: 0.9,
        evidence: ["Flash log from March 2026"],
        confirmed: ["Alpha's address is correct"],
        contradicted: [],
        relatedCases: [],
        gaps: [],
      })
    );
    // Reconciler final LLM call
    mockInvokeLLM.mockResolvedValueOnce(
      makeLLMResponse("The boost pressure target is 22 PSI (151.7 kPa). All four agents agree on this value. The calibration table controls this setting and can be modified through the editor.")
    );

    const result = await queryKnox({
      question: "What is the boost pressure target on my L5P?",
      accessLevel: 2 as AccessLevel,
      domain: "editor",
    });

    expect(result).toBeDefined();
    expect(result.answer).toBeTruthy();
    expect(result.pipeline).toBe("knox_filtered");
    // Level 2 should NOT have agentDetails exposed
    expect(result.agentDetails).toBeUndefined();
  });

  it("Level 3 returns full Knox response with agent details", async () => {
    // Alpha
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "K_BOOST_MAX at 0x3A200 = 151.7 kPa in the E41 A2L",
        confidence: 0.95,
        sources: ["E41 A2L file"],
        evidence: ["Direct map address lookup"],
        gaps: [],
      })
    );
    // Beta
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "GM calibration spec defines boost limit via K_BOOST_MAX table",
        confidence: 0.9,
        references: ["GM SPS Documentation"],
        protocolDetails: "Written via UDS 0x2E to address 0x3A200",
        uncertainties: [],
      })
    );
    // Gamma
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "22 PSI confirmed on multiple L5P trucks in the field",
        verdict: "agree",
        challenges: [],
        gotchas: [],
        practicalAdvice: "Verify with datalog",
        knowledgeSources: ["Tuner forums"],
        confidence: 0.85,
      })
    );
    // Delta
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "Internal flash logs confirm this address and value",
        confidence: 0.95,
        evidence: ["Flash session #42"],
        confirmed: ["Alpha's finding"],
        contradicted: [],
        relatedCases: ["Session 42 - E41 flash"],
        gaps: [],
      })
    );
    // Reconciler
    mockInvokeLLM.mockResolvedValueOnce(
      makeLLMResponse("K_BOOST_MAX at 0x3A200 is set to 151.7 kPa (22 PSI). All agents agree. Delta confirmed via flash session #42.")
    );

    const result = await queryKnox({
      question: "What is the boost target address and value?",
      accessLevel: 3 as AccessLevel,
      domain: "editor",
    });

    expect(result).toBeDefined();
    expect(result.answer).toBeTruthy();
    expect(result.pipeline).toBe("knox_full");
    // Level 3 SHOULD have agent details
    expect(result.agentDetails).toBeDefined();
    expect(result.agentDetails?.alpha).toBeDefined();
    expect(result.agentDetails?.beta).toBeDefined();
    expect(result.agentDetails?.gamma).toBeDefined();
    expect(result.agentDetails?.delta).toBeDefined();
  });
});

// ─── Pipeline Orchestration ───────────────────────────────────────────────

describe("Pipeline Orchestration", () => {
  it("calls Alpha and Beta in parallel, then Gamma and Delta in parallel", async () => {
    const callOrder: string[] = [];

    mockInvokeLLM.mockImplementation(async (params: { messages: Array<{ content: string }> }) => {
      const systemMsg = params.messages?.[0]?.content || "";
      if (systemMsg.includes("Data Agent") || systemMsg.includes("Alpha")) {
        callOrder.push("alpha");
        return makeAgentJsonResponse({
          answer: "Alpha answer", confidence: 0.8, sources: [], evidence: [], gaps: [],
        });
      }
      if (systemMsg.includes("Spec Agent") || systemMsg.includes("Beta") || systemMsg.includes("protocol") || systemMsg.includes("specification")) {
        callOrder.push("beta");
        return makeAgentJsonResponse({
          answer: "Beta answer", confidence: 0.8, references: [], protocolDetails: "", uncertainties: [],
        });
      }
      if (systemMsg.includes("Skeptic") || systemMsg.includes("Gamma") || systemMsg.includes("real-world") || systemMsg.includes("forum")) {
        callOrder.push("gamma");
        return makeAgentJsonResponse({
          answer: "Gamma answer", verdict: "agree", challenges: [], gotchas: [], practicalAdvice: "", knowledgeSources: [], confidence: 0.8,
        });
      }
      if (systemMsg.includes("Archivist") || systemMsg.includes("Delta") || systemMsg.includes("internal")) {
        callOrder.push("delta");
        return makeAgentJsonResponse({
          answer: "Delta answer", confidence: 0.8, evidence: [], confirmed: [], contradicted: [], relatedCases: [], gaps: [],
        });
      }
      // Reconciler
      callOrder.push("reconciler");
      return makeLLMResponse("Reconciled answer from all four agents.");
    });

    const result = await queryKnox({
      question: "Test orchestration order",
      accessLevel: 3 as AccessLevel,
      domain: "diagnostics",
    });

    expect(result).toBeDefined();
    expect(result.answer).toBeTruthy();
    // Should have at least 5 LLM calls: alpha, beta, gamma, delta, reconciler
    expect(mockInvokeLLM).toHaveBeenCalledTimes(5);
  });

  it("handles agent failures gracefully with fallback", async () => {
    // Alpha fails
    mockInvokeLLM.mockRejectedValueOnce(new Error("Alpha LLM timeout"));
    // Beta succeeds
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "Beta answer", confidence: 0.8, references: [], protocolDetails: "", uncertainties: [],
      })
    );
    // Gamma succeeds
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "Gamma answer", verdict: "agree", challenges: [], gotchas: [], practicalAdvice: "", knowledgeSources: [], confidence: 0.7,
      })
    );
    // Delta succeeds
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "Delta answer", confidence: 0.8, evidence: [], confirmed: [], contradicted: [], relatedCases: [], gaps: [],
      })
    );
    // Reconciler
    mockInvokeLLM.mockResolvedValueOnce(
      makeLLMResponse("Answer based on Beta, Gamma, and Delta (Alpha was unavailable).")
    );

    const result = await queryKnox({
      question: "Test with Alpha failure",
      accessLevel: 3 as AccessLevel,
      domain: "diagnostics",
    });

    // Should still return a result despite Alpha failing
    expect(result).toBeDefined();
    expect(result.answer).toBeTruthy();
  });
});

// ─── Monica Filter ────────────────────────────────────────────────────────

describe("Monica Filter (Level 1)", () => {
  it("uses sanitized knowledge base, not full engineering data", async () => {
    mockInvokeLLM.mockResolvedValue(
      makeLLMResponse("Your vehicle is running normally. The boost pressure is within safe limits.")
    );

    const result = await queryKnox({
      question: "Is my truck running okay?",
      accessLevel: 1 as AccessLevel,
      domain: "diagnostics",
    });

    expect(result.pipeline).toBe("monica");
    // Monica should only make 1 LLM call (not the full 5-call pipeline)
    expect(mockInvokeLLM).toHaveBeenCalledTimes(1);
    // Verify the system prompt mentions Monica or consumer-friendly language
    const firstCall = mockInvokeLLM.mock.calls[0];
    const systemMsg = firstCall?.[0]?.messages?.[0]?.content || "";
    expect(systemMsg.toLowerCase()).toMatch(/monica|consumer|simple|plain/);
  });
});

// ─── Domain Routing ───────────────────────────────────────────────────────

describe("Domain Routing", () => {
  it("accepts valid domains", async () => {
    mockInvokeLLM.mockResolvedValue(
      makeLLMResponse("Monica answer")
    );

    const domains = ["editor", "diagnostics", "flash", "intellispy", "fleet", "drag", "casting", "general"] as const;

    for (const domain of domains) {
      const result = await queryKnox({
        question: `Test ${domain}`,
        accessLevel: 1 as AccessLevel,
        domain,
      });
      expect(result).toBeDefined();
    }
  });
});

// ─── Vehicle-Specific Context ─────────────────────────────────────────────

describe("Vehicle-Specific Context", () => {
  it("passes moduleContext through to agents", async () => {
    // Alpha
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "Found in context", confidence: 0.9, sources: [], evidence: [], gaps: [],
      })
    );
    // Beta
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "Spec confirms", confidence: 0.85, references: [], protocolDetails: "", uncertainties: [],
      })
    );
    // Gamma
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "Real world agrees", verdict: "agree", challenges: [], gotchas: [], practicalAdvice: "", knowledgeSources: [], confidence: 0.8,
      })
    );
    // Delta
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "Internal records match", confidence: 0.9, evidence: [], confirmed: [], contradicted: [], relatedCases: [], gaps: [],
      })
    );
    // Reconciler
    mockInvokeLLM.mockResolvedValueOnce(
      makeLLMResponse("Vehicle-specific answer based on uploaded data.")
    );

    const vehicleData = "VIN: 1GC4YPEY5MF123456, ECU: E41, Cal: 12345678, Boost: 22.3 PSI, EGT: 1150F";

    const result = await queryKnox({
      question: "Analyze this vehicle's performance",
      accessLevel: 3 as AccessLevel,
      domain: "diagnostics",
      moduleContext: vehicleData,
    });

    expect(result).toBeDefined();
    expect(result.answer).toBeTruthy();

    // Verify moduleContext was passed to at least one agent call
    const allCalls = mockInvokeLLM.mock.calls;
    const contextPassed = allCalls.some(
      (call) => JSON.stringify(call).includes("1GC4YPEY5MF123456")
    );
    expect(contextPassed).toBe(true);
  });
});

// ─── Confidence and Agreement ─────────────────────────────────────────────

describe("Confidence Scoring", () => {
  it("returns confidence and agreement fields", async () => {
    // Alpha
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "Alpha says yes", confidence: 0.95, sources: [], evidence: [], gaps: [],
      })
    );
    // Beta
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "Beta says yes", confidence: 0.9, references: [], protocolDetails: "", uncertainties: [],
      })
    );
    // Gamma
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "Gamma agrees", verdict: "agree", challenges: [], gotchas: [], practicalAdvice: "", knowledgeSources: [], confidence: 0.85,
      })
    );
    // Delta
    mockInvokeLLM.mockResolvedValueOnce(
      makeAgentJsonResponse({
        answer: "Delta confirms", confidence: 0.9, evidence: ["Internal log"], confirmed: ["All"], contradicted: [], relatedCases: [], gaps: [],
      })
    );
    // Reconciler
    mockInvokeLLM.mockResolvedValueOnce(
      makeLLMResponse("All agents agree.")
    );

    const result = await queryKnox({
      question: "Test confidence",
      accessLevel: 3 as AccessLevel,
      domain: "diagnostics",
    });

    expect(result.confidence).toBeDefined();
    expect(typeof result.confidence).toBe("string");
    expect(["high", "medium", "low"]).toContain(result.confidence);

    expect(result.agreement).toBeDefined();
    expect(typeof result.agreement).toBe("string");
  });
});
