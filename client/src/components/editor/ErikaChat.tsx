/**
 * ErikaChat — AI Calibration Assistant
 *
 * Named "Erika" — an LLM-powered chat that understands the loaded A2L/binary,
 * can trace control logic, help design features, identify tables, and correlate
 * with datalogs.
 *
 * Enhancements:
 *  - Diagnostic integration: automatically injects DiagnosticReport + ReasoningReport
 *    findings into context so Erika knows what the analyzer found
 *  - RAG map search: builds a TF-IDF index over map names/descriptions and retrieves
 *    the most relevant maps for each user query (eliminates truncation problem)
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Send, Bot, User, Loader2, Sparkles, X, Minimize2, Activity, Brain } from 'lucide-react';
import { EcuDefinition, CalibrationMap } from '@/lib/editorEngine';
import { trpc } from '@/lib/trpc';
import { Streamdown } from 'streamdown';
import { buildMapSearchIndex, searchMaps, formatSearchResultsForContext, MapSearchIndex } from '@/lib/erikaMapSearch';
import type { DiagnosticReport } from '@/lib/diagnostics';
import type { ReasoningReport } from '@/lib/reasoningEngine';

interface ErikaChatProps {
  ecuDef: EcuDefinition | null;
  selectedMap: CalibrationMap | null;
  onNavigateToMap: (mapName: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  /** Optional: diagnostic report from the analyzer */
  diagnosticReport?: DiagnosticReport | null;
  /** Optional: reasoning report from the AI reasoning engine */
  reasoningReport?: ReasoningReport | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/** Max characters for the context string sent to the LLM */
const MAX_CONTEXT_CHARS = 60000;
/** Reserve chars for RAG results */
const RAG_BUDGET_CHARS = 15000;
/** Reserve chars for diagnostics */
const DIAG_BUDGET_CHARS = 8000;

export default function ErikaChat({
  ecuDef,
  selectedMap,
  onNavigateToMap,
  isOpen,
  onToggle,
  diagnosticReport,
  reasoningReport,
}: ErikaChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `Hey! I'm **Erika** — your calibration engineering partner. Think of me as that friend who's spent way too many late nights staring at hex dumps and forum threads. I might get things wrong sometimes, but hey — if you're so good at this, then don't mind me ;-)\n\nI can help you with:\n\n- **Finding tables** — "Where's the fuel rail pressure limiter?"\n- **Understanding maps** — "What does KaDFIR_FaultInfo actually control?"\n- **Designing features** — "How would I build launch control from scratch?"\n- **DTC troubleshooting** — "What's the enable criteria for P0087?"\n- **Calibration strategy** — "What tables interact with boost at 3000 RPM?"\n\nLoad up an A2L and binary and let's get to work. What are you wrenching on?`,
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageStartRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(1);

  const chatMutation = trpc.editor.erikaChat.useMutation();

  // ─── Build RAG search index when ECU definition changes ─────────────────
  const searchIndex = useMemo<MapSearchIndex | null>(() => {
    if (!ecuDef || ecuDef.maps.length === 0) return null;
    return buildMapSearchIndex(ecuDef.maps);
  }, [ecuDef]);

  // Scroll so the NEW message's top is visible (not the very bottom)
  useEffect(() => {
    if (messages.length <= prevMessageCountRef.current) {
      prevMessageCountRef.current = messages.length;
      return;
    }
    prevMessageCountRef.current = messages.length;

    // Scroll the start of the last message into view at the top of the viewport
    requestAnimationFrame(() => {
      if (lastMessageStartRef.current) {
        lastMessageStartRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }, [messages]);

  // ─── Build diagnostic context string ────────────────────────────────────
  const buildDiagnosticContext = useCallback((): string => {
    const parts: string[] = [];

    if (diagnosticReport && diagnosticReport.issues.length > 0) {
      parts.push('\n--- DIAGNOSTIC ANALYSIS RESULTS (from V-OP Analyzer) ---');
      parts.push(`Summary: ${diagnosticReport.summary}`);
      parts.push(`Issues found: ${diagnosticReport.issues.length}`);
      for (const issue of diagnosticReport.issues.slice(0, 15)) {
        parts.push(`  [${issue.severity.toUpperCase()}] ${issue.code}: ${issue.title}`);
        parts.push(`    ${issue.description}`);
        parts.push(`    Recommendation: ${issue.recommendation}`);
        if (issue.detectedAt) parts.push(`    Detected at: ${issue.detectedAt}`);
      }
      if (diagnosticReport.issues.length > 15) {
        parts.push(`  ... and ${diagnosticReport.issues.length - 15} more issues`);
      }
    }

    if (reasoningReport) {
      parts.push('\n--- AI REASONING ENGINE RESULTS ---');
      parts.push(`Summary: ${reasoningReport.summary}`);

      // Operating context
      const ctx = reasoningReport.operatingContext;
      parts.push(`Operating Context: ${ctx.platform} platform, ${ctx.logDuration.toFixed(1)}s log`);
      parts.push(`  Max RPM: ${ctx.maxRpmObserved}, Max Speed: ${ctx.maxVehicleSpeedMph} mph`);
      parts.push(`  Coolant: ${ctx.minCoolantTempF.toFixed(0)}-${ctx.maxCoolantTempF.toFixed(0)}F`);
      if (ctx.warmupPhaseDetected) parts.push(`  Warmup detected, completed at ${ctx.warmupCompletedAt.toFixed(0)}s`);
      if (ctx.tccFullLockDetected) parts.push(`  TCC full lock detected (${ctx.tccFullLockSamples} samples)`);

      // Findings
      if (reasoningReport.findings.length > 0) {
        parts.push(`\nFindings (${reasoningReport.findings.length}):`);
        for (const f of reasoningReport.findings.slice(0, 10)) {
          parts.push(`  [${f.type.toUpperCase()}/${f.confidence}] ${f.title}`);
          parts.push(`    Reasoning: ${f.reasoning}`);
          if (f.evidence.length > 0) {
            parts.push(`    Evidence: ${f.evidence.slice(0, 3).join('; ')}`);
          }
          if (f.suggestion) parts.push(`    Suggestion: ${f.suggestion}`);
        }
        if (reasoningReport.findings.length > 10) {
          parts.push(`  ... and ${reasoningReport.findings.length - 10} more findings`);
        }
      }

      // Beta improvements
      if (reasoningReport.betaImprovements.length > 0) {
        parts.push(`\nBeta Improvement Suggestions (${reasoningReport.betaImprovements.length}):`);
        for (const b of reasoningReport.betaImprovements.slice(0, 5)) {
          parts.push(`  [${b.priority}] ${b.area}: ${b.observation}`);
          parts.push(`    Suggestion: ${b.suggestion}`);
        }
      }
    }

    let result = parts.join('\n');
    if (result.length > DIAG_BUDGET_CHARS) {
      result = result.substring(0, DIAG_BUDGET_CHARS) + '\n[Diagnostic context truncated]';
    }
    return result;
  }, [diagnosticReport, reasoningReport]);

  /**
   * Build a context summary for the LLM that stays within size limits.
   * Strategy:
   *  - Always include: ECU metadata, category summary, selected map details
   *  - RAG: retrieve maps relevant to the user's query
   *  - Diagnostics: inject analyzer findings when available
   *  - For small A2Ls (<= 800 maps): include all map names
   *  - For medium A2Ls (800-5000): include map names by category, truncated
   *  - For large A2Ls (5000+): category summary only + top maps per category
   */
  const buildContext = useCallback((userQuery?: string): string => {
    if (!ecuDef) return 'No ECU definition loaded.';

    const parts: string[] = [];
    parts.push(`ECU Family: ${ecuDef.ecuFamily}`);
    parts.push(`Source: ${ecuDef.source} (${ecuDef.fileName})`);
    parts.push(`Total Maps: ${ecuDef.stats.totalMaps}`);
    parts.push(`Total Measurements: ${ecuDef.stats.totalMeasurements}`);
    parts.push(`Map Types: ${Object.entries(ecuDef.stats.mapsByType).map(([k, v]) => `${k}:${v}`).join(', ')}`);

    // Group maps by category
    const mapsByCategory = new Map<string, typeof ecuDef.maps>();
    for (const m of ecuDef.maps) {
      const cat = m.category || 'Other';
      if (!mapsByCategory.has(cat)) mapsByCategory.set(cat, []);
      mapsByCategory.get(cat)!.push(m);
    }

    // Category summary (always included)
    const catEntries: string[] = [];
    mapsByCategory.forEach((v, k) => catEntries.push(`${k}(${v.length})`));
    parts.push(`\nCategories: ${catEntries.join(', ')}`);

    const totalMaps = ecuDef.maps.length;

    // ─── RAG: retrieve relevant maps for the user's query ─────────────────
    if (userQuery && searchIndex && totalMaps > 800) {
      const ragResults = searchMaps(searchIndex, userQuery, ecuDef.maps, 25);
      if (ragResults.length > 0) {
        const ragContext = formatSearchResultsForContext(ragResults, userQuery);
        if (ragContext.length <= RAG_BUDGET_CHARS) {
          parts.push(ragContext);
        } else {
          parts.push(ragContext.substring(0, RAG_BUDGET_CHARS) + '\n[RAG results truncated]');
        }
      }
    }

    // ─── Standard map list (tiered by size) ───────────────────────────────
    if (totalMaps <= 800) {
      // Small A2L: include all map names
      parts.push(`\nCOMPLETE MAP LIST (all ${totalMaps} maps):`);
      const sortedEntries: [string, CalibrationMap[]][] = [];
      mapsByCategory.forEach((v, k) => sortedEntries.push([k, v]));
      sortedEntries.sort((a, b) => a[0].localeCompare(b[0]));
      for (const [cat, maps] of sortedEntries) {
        parts.push(`\n### ${cat} (${maps.length} maps)`);
        for (const m of maps) {
          parts.push(`  ${m.name} [${m.type}] - ${m.description || m.subcategory || ''}`);
        }
      }
    } else if (totalMaps <= 5000) {
      // Medium A2L: include map names but cap per category
      const maxPerCat = Math.floor(300 / mapsByCategory.size);
      parts.push(`\nMAP LIST (sampled from ${totalMaps} maps — ask for specific categories to see all):`);
      const sortedEntries: [string, CalibrationMap[]][] = [];
      mapsByCategory.forEach((v, k) => sortedEntries.push([k, v]));
      sortedEntries.sort((a, b) => a[0].localeCompare(b[0]));
      for (const [cat, maps] of sortedEntries) {
        parts.push(`\n### ${cat} (${maps.length} maps, showing first ${Math.min(maps.length, maxPerCat)}):`);
        for (const m of maps.slice(0, maxPerCat)) {
          parts.push(`  ${m.name} [${m.type}] - ${m.description || m.subcategory || ''}`);
        }
        if (maps.length > maxPerCat) parts.push(`  ... and ${maps.length - maxPerCat} more`);
      }
    } else {
      // Large A2L (50K+): category summary + top 5 per category
      parts.push(`\nLARGE A2L (${totalMaps} maps). Showing top maps per category — ask for specific categories to see more:`);
      const sortedEntries: [string, CalibrationMap[]][] = [];
      mapsByCategory.forEach((v, k) => sortedEntries.push([k, v]));
      sortedEntries.sort((a, b) => a[0].localeCompare(b[0]));
      for (const [cat, maps] of sortedEntries) {
        parts.push(`\n### ${cat} (${maps.length} maps):`);
        for (const m of maps.slice(0, 5)) {
          parts.push(`  ${m.name} [${m.type}] - ${m.description || m.subcategory || ''}`);
        }
        if (maps.length > 5) parts.push(`  ... and ${maps.length - 5} more`);
      }
    }

    // Include measurement names (limited)
    if (ecuDef.measurements.length > 0) {
      const measLimit = Math.min(ecuDef.measurements.length, 100);
      const measNames = ecuDef.measurements.slice(0, measLimit).map(m => `${m.name} - ${m.description}`);
      parts.push(`\nMEASUREMENTS (${measLimit} of ${ecuDef.measurements.length}):\n${measNames.join('\n')}`);
    }

    // Include parse errors (limited)
    if (ecuDef.errors.length > 0) {
      parts.push(`\nPARSE ERRORS (${ecuDef.errors.length} issues):`);
      for (const err of ecuDef.errors.slice(0, 20)) {
        parts.push(`  ${err}`);
      }
      if (ecuDef.errors.length > 20) {
        parts.push(`  ... and ${ecuDef.errors.length - 20} more errors`);
      }
    }

    // If a map is selected, include its full details (always)
    if (selectedMap) {
      parts.push(`\n--- CURRENTLY SELECTED MAP ---`);
      parts.push(`Name: ${selectedMap.name}`);
      parts.push(`Type: ${selectedMap.type}, Address: 0x${selectedMap.address.toString(16).toUpperCase()}`);
      parts.push(`Description: ${selectedMap.description || 'none'}`);
      parts.push(`Category: ${selectedMap.category}/${selectedMap.subcategory}`);
      if (selectedMap.rows && selectedMap.cols) {
        parts.push(`Dimensions: ${selectedMap.rows} rows x ${selectedMap.cols} cols`);
      }
      if (selectedMap.physValues) {
        const vals = selectedMap.physValues.slice(0, 100);
        parts.push(`Values (first ${vals.length}): ${vals.map(v => v.toFixed(2)).join(', ')}`);
      }
      if (selectedMap.axisXValues) {
        parts.push(`X Axis: ${selectedMap.axisXValues.map(v => v.toFixed(2)).join(', ')}`);
      }
      if (selectedMap.axisYValues) {
        parts.push(`Y Axis: ${selectedMap.axisYValues.map(v => v.toFixed(2)).join(', ')}`);
      }
    }

    // ─── Inject diagnostic/reasoning context ──────────────────────────────
    const diagContext = buildDiagnosticContext();
    if (diagContext) {
      parts.push(diagContext);
    }

    // Final truncation safety net
    let result = parts.join('\n');
    if (result.length > MAX_CONTEXT_CHARS) {
      result = result.substring(0, MAX_CONTEXT_CHARS) + '\n\n[Context truncated — ask for specific categories or maps]';
    }

    return result;
  }, [ecuDef, selectedMap, searchIndex, buildDiagnosticContext]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Build context with RAG retrieval based on user's query
      const context = buildContext(text);
      // Only send last 6 messages to keep payload small
      const history = messages.slice(-6).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content.substring(0, 4000), // Truncate long assistant replies
      }));

      const response = await chatMutation.mutateAsync({
        message: text,
        context,
        history,
      });

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: String(response.reply),
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: `Hmm, hit a snag: ${err.message || 'Unknown error'}. Try again — if it keeps happening, the payload might be too large. Try selecting a specific map first so I have focused context.`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, buildContext, messages, chatMutation]);

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          className="flex items-center gap-2 bg-zinc-900 border border-ppei-red/30 rounded-full px-4 py-2 shadow-lg hover:border-ppei-red/60 transition-colors"
          onClick={() => setIsMinimized(false)}
        >
          <Sparkles className="w-4 h-4 text-ppei-red" />
          <span className="text-xs font-semibold text-white">Erika</span>
          {isLoading && <Loader2 className="w-3 h-3 text-ppei-red animate-spin" />}
        </button>
      </div>
    );
  }

  const hasDiagnostics = (diagnosticReport && diagnosticReport.issues.length > 0) || reasoningReport;

  return (
    <div className="flex flex-col h-full border-l border-zinc-800 bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-ppei-red" />
          <span className="text-sm font-bold text-white">Erika</span>
          <span className="text-[10px] text-zinc-500">Calibration Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
            onClick={() => setIsMinimized(true)}
            title="Minimize"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
            onClick={onToggle}
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ECU + Diagnostics context indicator */}
      <div className="px-3 py-1 border-b border-zinc-800/50 text-[10px] font-mono space-y-0.5">
        {ecuDef ? (
          <div className="text-zinc-500">
            Context: {ecuDef.ecuFamily} — {ecuDef.stats.totalMaps.toLocaleString()} maps
            {selectedMap && <span className="text-cyan-400/60 ml-2">→ {selectedMap.name}</span>}
            {searchIndex && <span className="text-emerald-400/50 ml-2">RAG ready</span>}
          </div>
        ) : (
          <div className="text-zinc-600">No ECU loaded</div>
        )}
        {hasDiagnostics && (
          <div className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-amber-400/70" />
            <span className="text-amber-400/70">
              Diagnostics active
              {diagnosticReport && diagnosticReport.issues.length > 0 && (
                <span> — {diagnosticReport.issues.length} issue{diagnosticReport.issues.length !== 1 ? 's' : ''}</span>
              )}
            </span>
            {reasoningReport && (
              <>
                <Brain className="w-3 h-3 text-purple-400/70 ml-1" />
                <span className="text-purple-400/70">
                  {reasoningReport.findings.length} finding{reasoningReport.findings.length !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            ref={i === messages.length - 1 ? lastMessageStartRef : undefined}
            className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-ppei-red/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-ppei-red" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-ppei-red/20 text-white'
                  : 'bg-zinc-800/60 text-zinc-300'
              }`}
            >
              <Streamdown>{msg.content}</Streamdown>
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-zinc-400" />
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-ppei-red/20 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-ppei-red" />
            </div>
            <div className="bg-zinc-800/60 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-ppei-red animate-spin" />
                <span className="text-[10px] text-zinc-500">Erika is thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-zinc-800 shrink-0">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            className="flex-1 bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 resize-none focus:outline-none focus:border-ppei-red/50"
            placeholder="Ask Erika about calibration..."
            rows={2}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button
            className="self-end p-2 bg-ppei-red/20 rounded-lg text-ppei-red hover:bg-ppei-red/30 transition-colors disabled:opacity-50"
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="text-[10px] text-zinc-600 mt-1">
          Enter to send · Shift+Enter for new line
          {hasDiagnostics && <span className="text-amber-400/40 ml-2">· Diagnostics linked</span>}
        </div>
      </div>
    </div>
  );
}
