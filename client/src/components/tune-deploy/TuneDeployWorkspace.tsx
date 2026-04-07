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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

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

export default function TuneDeployWorkspace() {
  const { user } = useAuth();
  const signedIn = Boolean(user && user.openId !== GUEST_OPEN_ID);

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
    { enabled: signedIn }
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
      if (!signedIn) return;
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
    [signedIn, updateItem]
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
      {!signedIn && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
          Sign in with your PPEI account to analyze binaries, upload to the team library, and use future
          vehicle-matched tune suggestions.
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
              if (!signedIn) return;
              enqueueFiles(e.dataTransfer.files);
            }}
            onClick={() => signedIn && fileRef.current?.click()}
            className={`relative min-h-[160px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors ${
              signedIn
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
                if (f?.length) enqueueFiles(f);
                e.target.value = "";
              }}
            />
          </div>

          <div className="mt-4 space-y-2 max-h-[320px] overflow-y-auto pr-1">
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
            <p className="text-xs text-red-400 py-4">{(listQuery.error as Error).message}</p>
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
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
        <h4 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
          <Hash className="w-4 h-4 text-orange-400" />
          Metadata preview
        </h4>
        {!selectedQueue && !selectedLib && (
          <p className="text-xs text-zinc-600">Select a queue item or library row for full metadata.</p>
        )}
        {selectedQueue?.analyze && (
          <>
            {selectedQueue.analyze.containerCrc32 && (
              <pre className="text-[11px] leading-relaxed text-zinc-400 font-mono overflow-x-auto p-3 rounded-lg bg-black/50 border border-zinc-800/80 mb-2">
                {JSON.stringify({ containerCrc32: selectedQueue.analyze.containerCrc32 }, null, 2)}
              </pre>
            )}
            <pre className="text-[11px] leading-relaxed text-zinc-400 font-mono overflow-x-auto p-3 rounded-lg bg-black/50 border border-zinc-800/80">
              {JSON.stringify(selectedQueue.analyze.meta, null, 2)}
            </pre>
          </>
        )}
        {selectedLib && (
          <pre className="text-[11px] leading-relaxed text-zinc-400 font-mono overflow-x-auto p-3 rounded-lg bg-black/50 border border-zinc-800/80">
            {JSON.stringify(selectedLib.meta, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}
