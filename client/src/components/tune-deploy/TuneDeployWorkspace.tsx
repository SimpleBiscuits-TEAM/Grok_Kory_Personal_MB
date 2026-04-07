/**
 * Tune Deploy — drag/drop calibration library UX (embedded in FLASH tab or full page).
 * Uses REST for large binaries; tRPC for metadata listing / future vehicle match.
 *
 * Ties to **Flash container** flow: the same parse result fills `sw_c1..sw_c9` on the loaded container
 * (see `FlashContainerPanel` + `shared/containerCalibrationSlots.ts`) so ECU Scan / cloud flasher matching
 * no longer depends on hand-entered part numbers when the binary contains detectable cal/OS tokens.
 */
import { useCallback, useMemo, useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { GUEST_OPEN_ID } from "@shared/guestUser";
import type { TuneDeployContainerCrc32, TuneDeployParsedMetadata } from "@shared/tuneDeploySchemas";
import { TUNE_FILE_STRUCTURE_FAMILY_LABEL } from "@shared/tuneFileStructureFamilies";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Upload,
  Cpu,
  Hash,
  Car,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Search,
  ChevronRight,
  CloudUpload,
  Trash2,
  Gauge,
  Filter,
  FileCode2,
  ShieldCheck,
  ShieldAlert,
  Tag,
  Fingerprint,
  Info,
  Copy,
  Radio,
  Plug,
  Plus,
  X,
  Send,
  Link2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";

type TuneDeployUploadErrorJson = {
  ok?: boolean;
  error?: string;
  code?: string;
  details?: string[];
  detectedFileStructureFamily?: string;
  detectedFileStructureLabel?: string;
  fileStructureNotes?: string[];
  checks?: Array<{ id?: string; label?: string; severity?: string; message?: string }>;
};

function formatTuneDeployUploadError(json: TuneDeployUploadErrorJson, statusText: string): string {
  let msg = json.error || statusText || "Upload failed";
  if (json.code) msg = `[${json.code}] ${msg}`;
  if (json.detectedFileStructureLabel && json.detectedFileStructureFamily) {
    msg += `\nDetected file layout: ${json.detectedFileStructureLabel} (${json.detectedFileStructureFamily})`;
  }
  if (json.fileStructureNotes?.length) {
    msg += `\n• ${json.fileStructureNotes.join("\n• ")}`;
  }
  if (json.details?.length) msg += `\n• ${json.details.join("\n• ")}`;
  if (json.checks?.length) {
    const errs = json.checks.filter((c) => c.severity === "error");
    if (errs.length) msg += `\n${errs.map((e) => `• ${e.label ?? e.id}: ${e.message}`).join("\n")}`;
  }
  return msg;
}

type QueueItem = {
  localId: string;
  file: File;
  status: "queued" | "analyzing" | "analyzed" | "uploading" | "done" | "error";
  analyze?: {
    sha256: string;
    meta: TuneDeployParsedMetadata;
    containerCrc32?: TuneDeployContainerCrc32;
  };
  /** When true, upload sends `X-Tune-Deploy-Fix-Crc: 1` — uses `fixContainerCrc` in shared/flashFileValidator */
  fixCrcOnUpload?: boolean;
  error?: string;
  uploadId?: number;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/* ─── Metadata Inspector ─── polished card replacing raw JSON dump ─── */
function MetadataInspector({
  queueItem,
  libraryRow,
}: {
  queueItem?: QueueItem;
  libraryRow?: { meta: TuneDeployParsedMetadata; fileName: string; sha256: string; sizeBytes: number };
}) {
  const meta = queueItem?.analyze?.meta ?? libraryRow?.meta;
  const crc = queueItem?.analyze?.containerCrc32;
  const fileName = queueItem?.file.name ?? libraryRow?.fileName;
  const sha256 = queueItem?.analyze?.sha256 ?? libraryRow?.sha256;
  const fileSize = queueItem?.file.size ?? libraryRow?.sizeBytes;

  if (!meta) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6">
        <h4 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
          <Hash className="w-4 h-4 text-orange-400" />
          Metadata Inspector
        </h4>
        <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
          <Info className="w-8 h-8 mb-2 text-zinc-700" />
          <p className="text-xs">Select a queue item or library entry to inspect metadata.</p>
        </div>
      </section>
    );
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const formatLabel = meta.containerFormat === "GM_RAW"
    ? "GM Raw Flash Binary"
    : meta.containerFormat === "PPEI"
      ? "PPEI IPF Container"
      : meta.containerFormat === "DEVPROG"
        ? "DevProg V2 Container"
        : meta.containerFormat === "RAW"
          ? "Raw Binary"
          : "Unknown";

  const structureLabel = TUNE_FILE_STRUCTURE_FAMILY_LABEL[meta.fileStructureFamily] ?? meta.fileStructureFamily;

  const yearDisplay = meta.modelYear
    ? String(meta.modelYear)
    : meta.modelYearStart && meta.modelYearEnd
      ? `${meta.modelYearStart}–${meta.modelYearEnd}`
      : meta.modelYearStart
        ? `${meta.modelYearStart}+`
        : "—";

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <Hash className="w-4 h-4 text-orange-400" />
          Metadata Inspector
        </h4>
        {fileName && (
          <span className="text-[10px] text-zinc-500 font-mono truncate max-w-[300px]">{fileName}</span>
        )}
      </div>

      {/* Top row: Vehicle + Format badges */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500/30 text-xs font-semibold text-red-300">
          <Car className="w-3.5 h-3.5" />
          {meta.vehicleFamily} {meta.vehicleSubType !== meta.vehicleFamily ? `· ${meta.vehicleSubType}` : ""}
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600/15 border border-orange-500/25 text-xs font-medium text-orange-300">
          <FileCode2 className="w-3.5 h-3.5" />
          {formatLabel}
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/50 text-xs font-medium text-zinc-300">
          <Calendar className="w-3.5 h-3.5" />
          {yearDisplay}
        </span>
        {meta.ecuType && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/15 border border-blue-500/25 text-xs font-medium text-blue-300">
            <Cpu className="w-3.5 h-3.5" />
            ECU: {meta.ecuType}
          </span>
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* OS Version */}
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-4">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
            <Gauge className="w-3 h-3" /> Operating System
          </div>
          <div className="text-lg font-mono font-bold text-zinc-100">
            {meta.osVersion || <span className="text-zinc-600 text-sm">Not detected</span>}
          </div>
          {meta.osVersion && (
            <button
              type="button"
              onClick={() => copyToClipboard(meta.osVersion!)}
              className="mt-1 text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
            >
              <Copy className="w-2.5 h-2.5" /> Copy
            </button>
          )}
        </div>

        {/* Calibration Part Numbers */}
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-4">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
            <Tag className="w-3 h-3" /> Calibration Part Numbers
          </div>
          {meta.calibrationPartNumbers.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {meta.calibrationPartNumbers.map((pn, i) => (
                <button
                  key={pn}
                  type="button"
                  onClick={() => copyToClipboard(pn)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-mono text-xs transition-colors ${
                    i === 0
                      ? "bg-red-600/25 border border-red-500/30 text-red-200 hover:bg-red-600/40"
                      : "bg-zinc-800/80 border border-zinc-700/40 text-zinc-300 hover:bg-zinc-700/60"
                  }`}
                  title={i === 0 ? "Primary OS / Cal PN — click to copy" : "Click to copy"}
                >
                  {pn}
                  {i === 0 && <span className="text-[9px] text-red-400/80 ml-1">OS</span>}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-xs text-zinc-600">No part numbers detected</span>
          )}
        </div>
      </div>

      {/* Secondary info row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/40 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1">Structure</div>
          <div className="text-[11px] text-zinc-300 font-medium">{structureLabel}</div>
        </div>
        <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/40 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1">Hardware ID</div>
          <div className="text-[11px] text-zinc-300 font-mono">{meta.ecuHardwareId || "—"}</div>
        </div>
        <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/40 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1">VIN</div>
          <div className="text-[11px] text-zinc-300 font-mono">{meta.vin || "—"}</div>
        </div>
        <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/40 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1">File Size</div>
          <div className="text-[11px] text-zinc-300 font-mono">{fileSize ? formatBytes(fileSize) : "—"}</div>
        </div>
      </div>

      {/* Compatibility label */}
      {meta.vehicleCompatibilityLabel && (
        <div className="rounded-lg bg-zinc-900/30 border border-zinc-800/30 px-4 py-2.5 mb-4">
          <div className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1">Compatibility</div>
          <div className="text-xs text-zinc-400">{meta.vehicleCompatibilityLabel}</div>
        </div>
      )}

      {/* CRC32 status */}
      {crc?.applicable && (
        <div className={`rounded-lg border px-4 py-3 mb-4 flex items-start gap-3 ${
          crc.match
            ? "bg-emerald-500/10 border-emerald-500/25"
            : "bg-amber-500/10 border-amber-500/25"
        }`}>
          {crc.match ? (
            <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          )}
          <div>
            <div className={`text-xs font-medium ${crc.match ? "text-emerald-300" : "text-amber-300"}`}>
              Container CRC32 {crc.match ? "Verified" : "Mismatch"}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">{crc.message}</div>
            {(crc.storedHex || crc.computedHex) && (
              <div className="text-[10px] font-mono text-zinc-500 mt-1">
                {crc.storedHex && <span>Stored: <span className="text-zinc-400">{crc.storedHex}</span></span>}
                {crc.storedHex && crc.computedHex && <span className="mx-2">·</span>}
                {crc.computedHex && <span>Computed: <span className="text-zinc-400">{crc.computedHex}</span></span>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SHA256 */}
      {sha256 && (
        <div className="rounded-lg bg-zinc-900/30 border border-zinc-800/30 px-4 py-2.5 mb-4">
          <div className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1 flex items-center gap-1">
            <Fingerprint className="w-3 h-3" /> SHA-256
          </div>
          <button
            type="button"
            onClick={() => copyToClipboard(sha256)}
            className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5"
          >
            {sha256}
            <Copy className="w-2.5 h-2.5 shrink-0" />
          </button>
        </div>
      )}

      {/* Warnings */}
      {meta.warnings.length > 0 && (
        <div className="rounded-lg bg-amber-500/8 border border-amber-500/20 px-4 py-3 mb-4">
          <div className="text-[10px] uppercase tracking-wider text-amber-400/80 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" /> Warnings
          </div>
          <ul className="space-y-1">
            {meta.warnings.map((w, i) => (
              <li key={i} className="text-[11px] text-amber-300/70 flex items-start gap-2">
                <span className="text-amber-500/50 mt-0.5">•</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Structure notes */}
      {meta.fileStructureNotes.length > 0 && (
        <div className="rounded-lg bg-zinc-900/30 border border-zinc-800/30 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2 flex items-center gap-1.5">
            <Info className="w-3 h-3" /> Analysis Notes
          </div>
          <ul className="space-y-1">
            {meta.fileStructureNotes.map((n, i) => (
              <li key={i} className="text-[11px] text-zinc-500">
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function TuneDeployWorkspace() {
  const { user } = useAuth();
  // DEV BYPASS: treat everyone as signed in for faster development
  const signedIn = true; // was: Boolean(user && user.openId !== GUEST_OPEN_ID);
  const canAnalyze = true; // was: signedIn || import.meta.env.DEV;

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null);
  const [selectedLibraryId, setSelectedLibraryId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const listQuery = trpc.tuneDeploy.list.useQuery(
    {
      search: search.trim() || undefined,
      vehicleFamily: familyFilter || undefined,
      modelYear: yearFilter ? parseInt(yearFilter, 10) : undefined,
      limit: 80,
      offset: 0,
    },
    { enabled: true /* was: signedIn */ }
  );

  const deleteMutation = trpc.tuneDeploy.delete.useMutation({
    onSuccess: () => listQuery.refetch(),
  });

  const utils = trpc.useUtils();

  const updateItem = useCallback((localId: string, patch: Partial<QueueItem>) => {
    setQueue((q) => q.map((it) => (it.localId === localId ? { ...it, ...patch } : it)));
  }, []);

  const runAnalyze = useCallback(
    async (item: QueueItem) => {
      if (!canAnalyze) return;
      updateItem(item.localId, { status: "analyzing", error: undefined });
      try {
        const res = await fetch("/api/tune-deploy/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-File-Name": encodeURIComponent(item.file.name),
          },
          body: item.file,
          credentials: "include",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          sha256?: string;
          meta?: TuneDeployParsedMetadata;
          containerCrc32?: TuneDeployContainerCrc32;
        };
        if (!res.ok || !json.ok || !json.meta || !json.sha256) {
          throw new Error(json.error || res.statusText || "Analyze failed");
        }
        const crc = json.containerCrc32;
        const needsCrcFix = Boolean(crc?.applicable && crc.match === false);
        updateItem(item.localId, {
          status: "analyzed",
          fixCrcOnUpload: needsCrcFix,
          analyze: {
            sha256: json.sha256,
            meta: json.meta,
            containerCrc32: json.containerCrc32,
          },
        });
      } catch (e) {
        updateItem(item.localId, {
          status: "error",
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
    [canAnalyze, updateItem]
  );

  const enqueueFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      const next: QueueItem[] = arr.map((file) => ({
        localId: crypto.randomUUID(),
        file,
        status: "queued",
        fixCrcOnUpload: false,
      }));
      setQueue((q) => [...next, ...q]);
      next.forEach((it) => {
        void runAnalyze(it);
      });
    },
    [runAnalyze]
  );

  const uploadToLibrary = useCallback(
    async (item: QueueItem) => {
      if (!signedIn || item.status !== "analyzed") return;
      updateItem(item.localId, { status: "uploading", error: undefined });
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(item.file.name),
        };
        if (item.fixCrcOnUpload) {
          headers["X-Tune-Deploy-Fix-Crc"] = "1";
        }
        const res = await fetch("/api/tune-deploy/upload", {
          method: "POST",
          headers,
          body: item.file,
          credentials: "include",
        });
        const json = (await res.json()) as TuneDeployUploadErrorJson & { id?: number };
        if (!res.ok || !json.ok) {
          const full = formatTuneDeployUploadError(json, res.statusText);
          toast.error("Tune Deploy upload rejected", {
            description: json.error || res.statusText,
            duration: 8000,
          });
          throw new Error(full);
        }
        updateItem(item.localId, { status: "done", uploadId: json.id });
        await utils.tuneDeploy.list.invalidate();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Upload failed";
        updateItem(item.localId, {
          status: "analyzed",
          error: message,
        });
      }
    },
    [signedIn, updateItem, utils.tuneDeploy.list]
  );

  const libraryRows = listQuery.data?.rows ?? [];
  const families = useMemo(() => {
    const s = new Set<string>();
    for (const r of libraryRows) s.add(r.meta.vehicleFamily);
    return Array.from(s).sort();
  }, [libraryRows]);

  const groupedLibrary = useMemo(() => {
    const byFamily = new Map<string, Map<string, typeof libraryRows>>();
    for (const row of libraryRows) {
      const fam = row.meta.vehicleFamily || "Other";
      const y =
        row.meta.modelYear != null
          ? String(row.meta.modelYear)
          : row.meta.modelYearStart != null && row.meta.modelYearEnd != null
            ? `${row.meta.modelYearStart}–${row.meta.modelYearEnd}`
            : row.meta.modelYearStart != null
              ? `${row.meta.modelYearStart}+`
              : "Year ?";
      if (!byFamily.has(fam)) byFamily.set(fam, new Map());
      const inner = byFamily.get(fam)!;
      if (!inner.has(y)) inner.set(y, []);
      inner.get(y)!.push(row);
    }
    return byFamily;
  }, [libraryRows]);

  const selectedQueue = queue.find((q) => q.localId === selectedLocalId);
  const selectedLib = libraryRows.find((r) => r.id === selectedLibraryId);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  return (
    <div className="flex flex-col gap-6 min-h-0">
      <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-400 leading-relaxed">
        <span className="text-zinc-200 font-medium">Same pipeline as FLASH → Flash container:</span>
        {' binaries analyzed here use identical server heuristics to auto-fill '}
        <code className="text-orange-300/90 bg-black/40 px-1 rounded">sw_c1–sw_c9</code>
        {' on the container you load in the other tab, so when a customer connects, ECU Scan can match the vehicle to the tune you uploaded to the cloud—without manual cal/OS entry.'}
        {' '}
        <span className="text-zinc-500">
          DevProg/PPEI container CRC32 at 0x1000 is checked using{' '}
          <code className="text-zinc-400 bg-black/40 px-1 rounded">shared/flashFileValidator.ts</code>
          ; you can opt to apply <code className="text-zinc-400 bg-black/40 px-1 rounded">fixContainerCrc</code> on import when the file fails verification.
        </span>
        <span className="text-zinc-500 block mt-2">
          One vehicle line can use several file structures (V-OP vs EFI Live vs HP Tuners vs Intel HEX, etc.). Analysis labels the inferred layout; library upload remains limited to V-OP DevProg V2 and PPEI IPF until other validators are added.
        </span>
      </div>
      {!signedIn && import.meta.env.PROD && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
          Sign in with your PPEI account to analyze binaries, upload to the team library, and use future
          vehicle-matched tune suggestions.
        </div>
      )}
      {!signedIn && import.meta.env.DEV && (
        <div className="rounded-xl border border-cyan-500/25 bg-cyan-950/40 px-4 py-3 text-sm text-cyan-100/90">
          <span className="font-medium text-cyan-200">Local preview:</span> you can drag or pick files to analyze
          without signing in. Adding to the team library and loading the calibration list still require a PPEI session
          (same as Manus when you are logged in).
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-0">
        {/* Upload column */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900/80 to-zinc-950 p-5 shadow-[0_0_60px_-20px_oklch(0.52_0.22_25/0.35)]"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-red-600/30 to-orange-500/20 border border-red-500/30 flex items-center justify-center">
              <Gauge className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-zinc-100">Deploy queue</h3>
              <p className="text-xs text-zinc-500">
                Drop cal containers — live parse runs on the server (OS, part numbers, ECU hints).
              </p>
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (!canAnalyze) return;
              enqueueFiles(e.dataTransfer.files);
            }}
            onClick={() => canAnalyze && fileRef.current?.click()}
            className={`relative min-h-[160px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors ${
              canAnalyze
                ? "border-zinc-700 hover:border-red-500/50 hover:bg-red-500/5 cursor-pointer"
                : "border-zinc-800 opacity-50 cursor-not-allowed"
            }`}
          >
            <Upload className="w-10 h-10 text-zinc-600" />
            <p className="text-sm text-zinc-400">Drop files or click to browse</p>
            <p className="text-[11px] text-zinc-600">
              .bin · .cal · .hex · .hpt — up to 35 MB (library ingest: V-OP DevProg / PPEI IPF only for now)
            </p>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              accept=".bin,.cal,.hex,.hpt,.BIN,.CAL,.HEX,.HPT"
              onChange={(e) => {
                const f = e.target.files;
                if (f?.length && canAnalyze) enqueueFiles(f);
                e.target.value = "";
              }}
            />
          </div>

          {/* Bulk actions bar */}
          {queue.filter(it => it.status === "analyzed").length > 1 && (
            <div className="mt-3 flex items-center gap-3 px-2 py-2 rounded-lg bg-zinc-900/60 border border-zinc-800">
              <span className="text-[11px] text-zinc-400">
                {queue.filter(it => it.status === "analyzed").length} files ready
              </span>
              <button
                type="button"
                onClick={async () => {
                  const ready = queue.filter(it => it.status === "analyzed");
                  for (const item of ready) {
                    await uploadToLibrary(item);
                  }
                }}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                <CloudUpload className="w-3.5 h-3.5" />
                Upload All to Library
              </button>
              <span className="text-[10px] text-zinc-600">
                {queue.filter(it => it.status === "done").length} uploaded · {queue.filter(it => it.status === "error").length} failed
              </span>
            </div>
          )}

          <div className="mt-4 space-y-2 max-h-[420px] overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {queue.length === 0 && (
                <p className="text-xs text-zinc-600 text-center py-6">No files in queue</p>
              )}
              {queue.map((it) => (
                <motion.div
                  key={it.localId}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                    selectedLocalId === it.localId
                      ? "border-red-500/50 bg-red-500/10"
                      : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                  }`}
                  onClick={() => {
                    setSelectedLocalId(it.localId);
                    setSelectedLibraryId(null);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-200 truncate">{it.file.name}</div>
                      <div className="text-[11px] text-zinc-500">{formatBytes(it.file.size)}</div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      {it.status === "queued" || it.status === "analyzing" ? (
                        <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                      ) : it.status === "error" ? (
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                      ) : it.status === "done" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Cpu className="w-4 h-4 text-zinc-500" />
                      )}
                    </div>
                  </div>
                  {it.analyze && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-200/95 border border-violet-500/25 max-w-full truncate"
                        title={(it.analyze.meta.fileStructureNotes ?? []).join(" ")}
                      >
                        {TUNE_FILE_STRUCTURE_FAMILY_LABEL[it.analyze.meta.fileStructureFamily ?? "UNKNOWN"]}
                      </span>
                      {it.analyze.meta.osVersion && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                          OS {it.analyze.meta.osVersion}
                        </span>
                      )}
                      {it.analyze.meta.calibrationPartNumbers.slice(0, 3).map((p) => (
                        <span
                          key={p}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-200 font-mono"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                  {it.analyze?.containerCrc32 && (
                    <div
                      className={`mt-2 flex items-start gap-1.5 text-[10px] rounded-md px-2 py-1.5 border ${
                        !it.analyze.containerCrc32.applicable
                          ? "border-zinc-800 bg-zinc-900/50 text-zinc-500"
                          : it.analyze.containerCrc32.match
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200/90"
                            : "border-amber-500/35 bg-amber-500/10 text-amber-100/90"
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {!it.analyze.containerCrc32.applicable ? (
                        <Hash className="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-500" />
                      ) : it.analyze.containerCrc32.match ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                      )}
                      <span>{it.analyze.containerCrc32.message}</span>
                    </div>
                  )}
                  {it.status === "analyzed" &&
                    it.analyze?.containerCrc32?.applicable &&
                    it.analyze.containerCrc32.match === false && (
                      <label
                        className="mt-2 flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer select-none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="rounded border-zinc-600 bg-zinc-900"
                          checked={Boolean(it.fixCrcOnUpload)}
                          onChange={() =>
                            updateItem(it.localId, { fixCrcOnUpload: !it.fixCrcOnUpload })
                          }
                        />
                        <span>
                          Apply CRC32 fix at 0x1000 on upload (
                          <code className="text-zinc-500">fixContainerCrc</code>)
                        </span>
                      </label>
                    )}
                  {it.error && <p className="text-[11px] text-red-400 mt-1">{it.error}</p>}
                  {it.status === "analyzed" && signedIn && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void uploadToLibrary(it);
                      }}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-red-600/80 hover:bg-red-600 text-white"
                    >
                      <CloudUpload className="w-3 h-3" /> Add to library
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.section>

        {/* Library column */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 flex flex-col min-h-0"
        >
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-zinc-500" />
            <h3 className="text-lg font-semibold text-zinc-100">Calibration library</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search file, OS, PN, ECU…"
                className="w-full pl-8 pr-2 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-600"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={familyFilter}
                onChange={(e) => setFamilyFilter(e.target.value)}
                className="flex-1 py-2 px-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200"
              >
                <option value="">All families</option>
                {families.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <input
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="Year"
                className="w-20 py-2 px-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200"
              />
            </div>
          </div>

          {listQuery.isLoading && (
            <div className="flex items-center gap-2 text-xs text-zinc-500 py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading library…
            </div>
          )}
          {listQuery.isError && (
            <p className="text-xs text-red-400 py-4">
              {listQuery.error instanceof TRPCClientError
                ? listQuery.error.message
                : listQuery.error instanceof Error
                  ? listQuery.error.message
                  : String(listQuery.error)}
            </p>
          )}

          <div className="flex-1 min-h-[280px] max-h-[420px] overflow-y-auto space-y-4 pr-1">
            {signedIn &&
              Array.from(groupedLibrary.entries()).map(([family, byYear]) => (
                <div key={family}>
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                    <Car className="w-3.5 h-3.5 text-red-400" />
                    {family}
                  </div>
                  {Array.from(byYear.entries()).map(([year, rows]) => (
                    <div key={year} className="ml-2 mb-3">
                      <div className="flex items-center gap-1 text-[11px] text-zinc-500 mb-1">
                        <Calendar className="w-3 h-3" />
                        {year}
                      </div>
                      <div className="space-y-1">
                        {rows.map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => {
                              setSelectedLibraryId(row.id);
                              setSelectedLocalId(null);
                            }}
                            className={`w-full text-left rounded-lg border px-2 py-2 flex items-center gap-2 transition-colors ${
                              selectedLibraryId === row.id
                                ? "border-red-500/40 bg-red-500/10"
                                : "border-zinc-800 hover:border-zinc-600 bg-zinc-900/30"
                            }`}
                          >
                            <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs text-zinc-200 truncate">{row.fileName}</div>
                              <div className="text-[10px] text-zinc-500 font-mono truncate">
                                {row.meta.osVersion || "—"} ·{" "}
                                {row.meta.calibrationPartNumbers[0] || "no PN detected"}
                              </div>
                            </div>
                            {isAdmin && (
                              <button
                                type="button"
                                title="Remove"
                                className="p-1 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm("Delete this calibration from the library?")) {
                                    deleteMutation.mutate({ id: row.id });
                                  }
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}

            {signedIn && libraryRows.length === 0 && !listQuery.isLoading && (
              <p className="text-xs text-zinc-600 text-center py-10">
                Library is empty. Upload a tune to seed R2 + metadata.
              </p>
            )}
          </div>

          {listQuery.data && (
            <p className="text-[10px] text-zinc-600 mt-2 text-center">
              {listQuery.data.total} calibration{listQuery.data.total === 1 ? "" : "s"} indexed
            </p>
          )}
        </motion.section>
      </div>

      {/* Metadata inspector */}
      <MetadataInspector
        queueItem={selectedQueue}
        libraryRow={selectedLib}
      />

      {/* Device Management & Tune Assignment */}
      <DeviceManagementPanel
        libraryRows={libraryRows}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Device Management & Tune Assignment Panel
 * ═══════════════════════════════════════════════════════════════════════════ */

function DeviceManagementPanel({ libraryRows }: {
  libraryRows: Array<{ id: number; fileName: string; meta: TuneDeployParsedMetadata }>;
}) {
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [newDeviceType, setNewDeviceType] = useState<"vop" | "pcan">("vop");
  const [newSerial, setNewSerial] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newVehicle, setNewVehicle] = useState("");
  const [newVin, setNewVin] = useState("");
  const [assignDeviceId, setAssignDeviceId] = useState<number | null>(null);
  const [assignCalId, setAssignCalId] = useState<number | null>(null);
  const [assignNotes, setAssignNotes] = useState("");

  const devicesQuery = trpc.tuneDeploy.listDevices.useQuery();
  const assignmentsQuery = trpc.tuneDeploy.listAssignments.useQuery({});
  const utils = trpc.useUtils();

  const addDeviceMut = trpc.tuneDeploy.addDevice.useMutation({
    onSuccess: () => {
      toast.success("Device registered");
      utils.tuneDeploy.listDevices.invalidate();
      setShowAddDevice(false);
      setNewSerial("");
      setNewLabel("");
      setNewVehicle("");
      setNewVin("");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteDeviceMut = trpc.tuneDeploy.deleteDevice.useMutation({
    onSuccess: () => {
      toast.success("Device removed");
      utils.tuneDeploy.listDevices.invalidate();
      utils.tuneDeploy.listAssignments.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const assignTuneMut = trpc.tuneDeploy.assignTune.useMutation({
    onSuccess: () => {
      toast.success("Tune assigned to device");
      utils.tuneDeploy.listAssignments.invalidate();
      setAssignDeviceId(null);
      setAssignCalId(null);
      setAssignNotes("");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateAssignmentMut = trpc.tuneDeploy.updateAssignment.useMutation({
    onSuccess: () => {
      utils.tuneDeploy.listAssignments.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteAssignmentMut = trpc.tuneDeploy.deleteAssignment.useMutation({
    onSuccess: () => {
      toast.success("Assignment removed");
      utils.tuneDeploy.listAssignments.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const devices = devicesQuery.data ?? [];
  const assignments = assignmentsQuery.data ?? [];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Devices Panel */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-600/30 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Radio className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-100">Devices</h3>
              <p className="text-[11px] text-zinc-500">
                V-OP & PCAN programmers by serial number
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddDevice(!showAddDevice)}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Register Device
          </button>
        </div>

        <AnimatePresence>
          {showAddDevice && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-4"
            >
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">Type</label>
                    <select
                      value={newDeviceType}
                      onChange={(e) => setNewDeviceType(e.target.value as "vop" | "pcan")}
                      className="w-full py-2 px-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200"
                    >
                      <option value="vop">V-OP Programmer</option>
                      <option value="pcan">PCAN USB Adapter</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">Serial Number</label>
                    <input
                      value={newSerial}
                      onChange={(e) => setNewSerial(e.target.value)}
                      placeholder="e.g. VOP-2024-00142"
                      className="w-full py-2 px-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 placeholder:text-zinc-600"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">Label (optional)</label>
                    <input
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="e.g. Shop VOP #1"
                      className="w-full py-2 px-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 placeholder:text-zinc-600"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">Vehicle (optional)</label>
                    <input
                      value={newVehicle}
                      onChange={(e) => setNewVehicle(e.target.value)}
                      placeholder="e.g. 2021 Silverado L5P"
                      className="w-full py-2 px-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 placeholder:text-zinc-600"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">VIN (optional)</label>
                  <input
                    value={newVin}
                    onChange={(e) => setNewVin(e.target.value.toUpperCase().slice(0, 17))}
                    placeholder="17-character VIN"
                    className="w-full py-2 px-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 font-mono placeholder:text-zinc-600"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowAddDevice(false)}
                    className="text-[11px] px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!newSerial.trim() || addDeviceMut.isPending}
                    onClick={() => {
                      addDeviceMut.mutate({
                        deviceType: newDeviceType,
                        serialNumber: newSerial,
                        label: newLabel || undefined,
                        vehicleDescription: newVehicle || undefined,
                        vin: newVin || undefined,
                      });
                    }}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40 transition-colors"
                  >
                    {addDeviceMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
                    Register
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {devicesQuery.isLoading && (
          <div className="flex items-center gap-2 text-xs text-zinc-500 py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading devices…
          </div>
        )}

        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {devices.length === 0 && !devicesQuery.isLoading && (
            <p className="text-xs text-zinc-600 text-center py-8">
              No devices registered. Click "Register Device" to add a V-OP or PCAN programmer.
            </p>
          )}
          {devices.map((dev) => {
            const devAssignments = assignments.filter((a) => a.deviceId === dev.id);
            const pendingCount = devAssignments.filter((a) => a.status === "pending").length;
            return (
              <div
                key={dev.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                    dev.deviceType === "vop"
                      ? "bg-red-500/15 border border-red-500/25"
                      : "bg-blue-500/15 border border-blue-500/25"
                  }`}>
                    {dev.deviceType === "vop"
                      ? <Cpu className="w-4.5 h-4.5 text-red-400" />
                      : <Plug className="w-4.5 h-4.5 text-blue-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-200 truncate">
                        {dev.label || dev.serialNumber}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                        dev.deviceType === "vop"
                          ? "bg-red-500/20 text-red-300 border border-red-500/30"
                          : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                      }`}>
                        {dev.deviceType.toUpperCase()}
                      </span>
                      {pendingCount > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                          {pendingCount} pending
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                      S/N: {dev.serialNumber}
                    </div>
                    {dev.vehicleDescription && (
                      <div className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1">
                        <Car className="w-3 h-3" /> {dev.vehicleDescription}
                      </div>
                    )}
                    {dev.vin && (
                      <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
                        VIN: {dev.vin}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    title="Remove device"
                    onClick={() => {
                      if (confirm(`Remove device ${dev.label || dev.serialNumber}?`)) {
                        deleteDeviceMut.mutate({ id: dev.id });
                      }
                    }}
                    className="p-1.5 rounded-lg hover:bg-red-500/20 text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-zinc-600 mt-3 text-center">
          {devices.length} device{devices.length === 1 ? "" : "s"} registered
        </p>
      </motion.section>

      {/* Assignments Panel */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-600/30 to-green-500/20 border border-emerald-500/30 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">Tune Assignments</h3>
            <p className="text-[11px] text-zinc-500">
              Link calibrations to target devices for deployment
            </p>
          </div>
        </div>

        {/* New Assignment Form */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/15 p-4 mb-4 space-y-3">
          <div className="text-[10px] text-emerald-300/80 uppercase tracking-wider font-semibold mb-1">New Assignment</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">Target Device</label>
              <select
                value={assignDeviceId ?? ""}
                onChange={(e) => setAssignDeviceId(e.target.value ? Number(e.target.value) : null)}
                className="w-full py-2 px-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200"
              >
                <option value="">Select device…</option>
                {devices.filter((d) => d.isActive).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label || d.serialNumber} ({d.deviceType.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">Calibration</label>
              <select
                value={assignCalId ?? ""}
                onChange={(e) => setAssignCalId(e.target.value ? Number(e.target.value) : null)}
                className="w-full py-2 px-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200"
              >
                <option value="">Select calibration…</option>
                {libraryRows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fileName} — {r.meta.osVersion || "no OS"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <input
            value={assignNotes}
            onChange={(e) => setAssignNotes(e.target.value)}
            placeholder="Notes (optional) — e.g. 'Stage 2 tune for dyno day'"
            className="w-full py-2 px-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 placeholder:text-zinc-600"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!assignDeviceId || !assignCalId || assignTuneMut.isPending}
              onClick={() => {
                if (assignDeviceId && assignCalId) {
                  assignTuneMut.mutate({
                    calibrationId: assignCalId,
                    deviceId: assignDeviceId,
                    notes: assignNotes || undefined,
                  });
                }
              }}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition-colors"
            >
              {assignTuneMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Assign Tune
            </button>
          </div>
        </div>

        {/* Assignment List */}
        {assignmentsQuery.isLoading && (
          <div className="flex items-center gap-2 text-xs text-zinc-500 py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading assignments…
          </div>
        )}

        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {assignments.length === 0 && !assignmentsQuery.isLoading && (
            <p className="text-xs text-zinc-600 text-center py-6">
              No assignments yet. Select a device and calibration above to deploy a tune.
            </p>
          )}
          {assignments.map((a: any) => {
            const statusColors: Record<string, string> = {
              pending: "bg-amber-500/20 text-amber-300 border-amber-500/30",
              deployed: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
              failed: "bg-red-500/20 text-red-300 border-red-500/30",
              cancelled: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
            };
            return (
              <div
                key={a.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-zinc-200 truncate">
                        {a.calibrationFileName || `Cal #${a.calibrationId}`}
                      </span>
                      <span className="text-[10px] text-zinc-600">→</span>
                      <span className="text-xs text-zinc-300 truncate">
                        {a.deviceLabel || a.deviceSerial || `Device #${a.deviceId}`}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider border ${statusColors[a.status] || statusColors.pending}`}>
                        {a.status}
                      </span>
                    </div>
                    {a.notes && (
                      <div className="text-[10px] text-zinc-500 mt-1 truncate">{a.notes}</div>
                    )}
                    <div className="text-[10px] text-zinc-600 mt-1">
                      {a.createdAt ? new Date(a.createdAt).toLocaleString() : ""}
                      {a.deployedAt ? ` · Deployed ${new Date(a.deployedAt).toLocaleString()}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {a.status === "pending" && (
                      <button
                        type="button"
                        title="Mark as deployed"
                        onClick={() => updateAssignmentMut.mutate({ id: a.id, status: "deployed" })}
                        className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-zinc-500 hover:text-emerald-400 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Remove assignment"
                      onClick={() => {
                        if (confirm("Remove this tune assignment?")) {
                          deleteAssignmentMut.mutate({ id: a.id });
                        }
                      }}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-zinc-600 mt-3 text-center">
          {assignments.length} assignment{assignments.length === 1 ? "" : "s"}
          {" · "}
          {assignments.filter((a: any) => a.status === "pending").length} pending
        </p>
      </motion.section>
    </div>
  );
}
