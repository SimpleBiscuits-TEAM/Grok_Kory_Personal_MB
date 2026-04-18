/**
 * AutoDeployPanel — Admin UI for managing auto-deploy calibrations.
 *
 * Features:
 * - Folder hierarchy (Vehicle Type → OS → Part Number)
 * - Auto-deploy flag toggle per calibration
 * - Module type badge (ECM / TCM)
 * - Access level assignment per calibration
 * - Combo pairing (ECM + TCM 1-shot deploy)
 * - Audit log viewer
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  FolderTree,
  FolderPlus,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Cpu,
  Zap,
  Shield,
  Link2,
  Plus,
  X,
  Trash2,
  Settings2,
  ToggleLeft,
  ToggleRight,
  FileCode2,
  History,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Save,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

type Folder = {
  id: number;
  parentId: number | null;
  name: string;
  folderType: string;
  fullPath: string | null;
  sortOrder: number;
};

type EnrichedCalibration = {
  id: number;
  fileName: string;
  osVersion: string | null;
  partNumbersCsv: string | null;
  vehicleFamily: string;
  vehicleSubType: string;
  autoDeploy: boolean;
  autoDeployAccessLevel: number;
  moduleType: "ecm" | "tcm";
  folderId: number | null;
  notes: string | null;
};

type Combo = {
  id: number;
  ecmCalibrationId: number;
  tcmCalibrationId: number;
  label: string | null;
  isActive: boolean;
  ecmFileName?: string;
  tcmFileName?: string;
};

const ACCESS_LEVEL_LABELS: Record<number, string> = {
  0: "Level 0 — Public",
  1: "Level 1 — Basic",
  2: "Level 2 — Advanced",
  3: "Level 3 — Full",
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Panel
// ═══════════════════════════════════════════════════════════════════════════

export default function AutoDeployPanel() {
  const [activeTab, setActiveTab] = useState<"folders" | "calibrations" | "combos" | "logs">("calibrations");

  return (
    <div className="space-y-4">
      {/* Tab Bar */}
      <div className="flex items-center gap-1 bg-zinc-900/60 rounded-xl p-1 border border-zinc-800/50">
        {(
          [
            { key: "calibrations", label: "Calibrations", icon: FileCode2 },
            { key: "folders", label: "Folders", icon: FolderTree },
            { key: "combos", label: "ECM+TCM Combos", icon: Link2 },
            { key: "logs", label: "Deploy Log", icon: History },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === key
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === "calibrations" && (
          <motion.div key="cal" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <CalibrationManagement />
          </motion.div>
        )}
        {activeTab === "folders" && (
          <motion.div key="folders" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <FolderManagement />
          </motion.div>
        )}
        {activeTab === "combos" && (
          <motion.div key="combos" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <ComboManagement />
          </motion.div>
        )}
        {activeTab === "logs" && (
          <motion.div key="logs" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <DeployLogViewer />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Calibration Management — auto-deploy flags, module type, access level
// ═══════════════════════════════════════════════════════════════════════════

function CalibrationManagement() {
  const [moduleFilter, setModuleFilter] = useState<"all" | "ecm" | "tcm">("all");
  const [autoDeployFilter, setAutoDeployFilter] = useState(false);

  const calQuery = trpc.autoDeploy.listCalibrationsEnriched.useQuery(
    {
      moduleType: moduleFilter === "all" ? undefined : moduleFilter,
      autoDeployOnly: autoDeployFilter || undefined,
    },
    { refetchOnWindowFocus: false }
  );

  const foldersQuery = trpc.autoDeploy.listAllFolders.useQuery(undefined, { refetchOnWindowFocus: false });
  const upsertMeta = trpc.autoDeploy.upsertCalibrationMeta.useMutation({
    onSuccess: () => {
      calQuery.refetch();
      toast.success("Auto-deploy settings updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const calibrations = calQuery.data ?? [];
  const folders = foldersQuery.data ?? [];
  const folderMap = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-zinc-900/60 rounded-lg p-0.5 border border-zinc-800/50">
          {(["all", "ecm", "tcm"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setModuleFilter(t)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                moduleFilter === t
                  ? t === "ecm"
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : t === "tcm"
                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                    : "bg-zinc-700/50 text-zinc-300 border border-zinc-600/30"
                  : "text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <button
          onClick={() => setAutoDeployFilter(!autoDeployFilter)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
            autoDeployFilter
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "text-zinc-600 hover:text-zinc-400 border border-zinc-800/50"
          }`}
        >
          {autoDeployFilter ? <ToggleRight className="w-3 h-3" /> : <ToggleLeft className="w-3 h-3" />}
          Auto-Deploy Only
        </button>

        <span className="text-[10px] text-zinc-600 ml-auto">
          {calibrations.length} calibration{calibrations.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Calibration List */}
      {calQuery.isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 text-cyan-500 animate-spin" />
        </div>
      ) : calibrations.length === 0 ? (
        <p className="text-xs text-zinc-600 text-center py-10">
          No calibrations found. Upload calibrations in the library above.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
          {calibrations.map((cal) => (
            <CalibrationRow
              key={cal.id}
              cal={cal}
              folders={folders}
              folderMap={folderMap}
              onUpdate={(updates) =>
                upsertMeta.mutate({ calibrationId: cal.id, ...updates })
              }
              isUpdating={upsertMeta.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CalibrationRow({
  cal,
  folders,
  folderMap,
  onUpdate,
  isUpdating,
}: {
  cal: EnrichedCalibration;
  folders: Folder[];
  folderMap: Map<number, Folder>;
  onUpdate: (updates: Partial<{
    moduleType: "ecm" | "tcm";
    autoDeploy: boolean;
    autoDeployAccessLevel: number;
    folderId: number | null;
    notes: string | null;
  }>) => void;
  isUpdating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const folderName = cal.folderId ? folderMap.get(cal.folderId)?.name : null;

  return (
    <div className="bg-zinc-900/60 rounded-xl border border-zinc-800/50 overflow-hidden">
      {/* Header Row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800/30 transition-colors text-left"
      >
        <ChevronRight
          className={`w-3 h-3 text-zinc-600 transition-transform ${expanded ? "rotate-90" : ""}`}
        />

        {/* Module Type Badge */}
        <span
          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
            cal.moduleType === "ecm"
              ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
              : "bg-purple-500/20 text-purple-400 border border-purple-500/30"
          }`}
        >
          {cal.moduleType}
        </span>

        {/* Auto-Deploy Badge */}
        {cal.autoDeploy && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Zap className="w-2.5 h-2.5 inline mr-0.5" />
            AUTO
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="text-xs text-zinc-200 truncate">{cal.fileName}</div>
          <div className="text-[10px] text-zinc-500 font-mono truncate">
            {cal.osVersion || "—"} · {cal.partNumbersCsv?.split(",")[0] || "no PN"}
            {folderName && (
              <span className="ml-2 text-zinc-600">
                📁 {folderName}
              </span>
            )}
          </div>
        </div>

        {/* Access Level */}
        <span className="text-[9px] text-zinc-500 font-mono shrink-0">
          L{cal.autoDeployAccessLevel}
        </span>
      </button>

      {/* Expanded Settings */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 border-t border-zinc-800/50 space-y-3">
              {/* Module Type */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500 w-24">Module Type</span>
                <div className="flex gap-1">
                  {(["ecm", "tcm"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => onUpdate({ moduleType: t })}
                      disabled={isUpdating}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all ${
                        cal.moduleType === t
                          ? t === "ecm"
                            ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                            : "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                          : "text-zinc-600 hover:text-zinc-400 border border-zinc-800/50"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto-Deploy Toggle */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500 w-24">Auto-Deploy</span>
                <button
                  onClick={() => onUpdate({ autoDeploy: !cal.autoDeploy })}
                  disabled={isUpdating}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                    cal.autoDeploy
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "text-zinc-600 border border-zinc-800/50 hover:border-zinc-700"
                  }`}
                >
                  {cal.autoDeploy ? (
                    <>
                      <ToggleRight className="w-3.5 h-3.5" /> Enabled
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="w-3.5 h-3.5" /> Disabled
                    </>
                  )}
                </button>
              </div>

              {/* Access Level */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500 w-24">Access Level</span>
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((level) => (
                    <button
                      key={level}
                      onClick={() => onUpdate({ autoDeployAccessLevel: level })}
                      disabled={isUpdating}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${
                        cal.autoDeployAccessLevel === level
                          ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                          : "text-zinc-600 hover:text-zinc-400 border border-zinc-800/50"
                      }`}
                    >
                      L{level}
                    </button>
                  ))}
                </div>
                <span className="text-[9px] text-zinc-600">
                  {ACCESS_LEVEL_LABELS[cal.autoDeployAccessLevel] ?? ""}
                </span>
              </div>

              {/* Folder Assignment */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500 w-24">Folder</span>
                <select
                  value={cal.folderId ?? ""}
                  onChange={(e) =>
                    onUpdate({ folderId: e.target.value ? parseInt(e.target.value, 10) : null })
                  }
                  disabled={isUpdating}
                  className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-2 py-1 text-[10px] text-zinc-300 min-w-[180px]"
                >
                  <option value="">— No folder —</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.fullPath || f.name} ({f.folderType})
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-zinc-500 w-24 pt-1">Notes</span>
                <textarea
                  defaultValue={cal.notes ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (cal.notes ?? "")) onUpdate({ notes: v || null });
                  }}
                  placeholder="Admin notes..."
                  className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-2 py-1 text-[10px] text-zinc-300 flex-1 min-h-[40px] resize-y"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Folder Management
// ═══════════════════════════════════════════════════════════════════════════

function FolderManagement() {
  const foldersQuery = trpc.autoDeploy.listAllFolders.useQuery(undefined, { refetchOnWindowFocus: false });
  const createMut = trpc.autoDeploy.createFolder.useMutation({
    onSuccess: () => {
      foldersQuery.refetch();
      toast.success("Folder created");
      setNewName("");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.autoDeploy.deleteFolder.useMutation({
    onSuccess: () => {
      foldersQuery.refetch();
      toast.success("Folder deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState<number | null>(null);
  const [newType, setNewType] = useState<"vehicle_type" | "os" | "part_number" | "custom">("vehicle_type");

  const folders = foldersQuery.data ?? [];

  // Build tree
  const rootFolders = folders.filter((f) => f.parentId === null);
  const childMap = useMemo(() => {
    const map = new Map<number, typeof folders>();
    for (const f of folders) {
      if (f.parentId != null) {
        const arr = map.get(f.parentId) ?? [];
        arr.push(f);
        map.set(f.parentId, arr);
      }
    }
    return map;
  }, [folders]);

  return (
    <div className="space-y-4">
      {/* Create Folder */}
      <div className="bg-zinc-900/60 rounded-xl border border-zinc-800/50 p-3 space-y-2">
        <div className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
          <FolderPlus className="w-3.5 h-3.5 text-cyan-500" />
          Create Folder
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Folder name (e.g. L5P, E41, 12709844)"
            className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-2 py-1.5 text-xs text-zinc-300 flex-1 min-w-[200px]"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as typeof newType)}
            className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-2 py-1.5 text-xs text-zinc-300"
          >
            <option value="vehicle_type">Vehicle Type</option>
            <option value="os">Operating System</option>
            <option value="part_number">Part Number</option>
            <option value="custom">Custom</option>
          </select>
          <select
            value={newParentId ?? ""}
            onChange={(e) => setNewParentId(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-2 py-1.5 text-xs text-zinc-300"
          >
            <option value="">— Root level —</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.folderType})
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              if (!newName.trim()) return toast.error("Folder name required");
              createMut.mutate({
                name: newName.trim(),
                parentId: newParentId,
                folderType: newType,
                fullPath: newParentId
                  ? `${folders.find((f) => f.id === newParentId)?.fullPath ?? folders.find((f) => f.id === newParentId)?.name}/${newName.trim()}`
                  : newName.trim(),
              });
            }}
            disabled={createMut.isPending}
            className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-medium hover:bg-cyan-500/30 transition-all disabled:opacity-50"
          >
            {createMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Folder Tree */}
      <div className="space-y-1">
        {foldersQuery.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 text-cyan-500 animate-spin" />
          </div>
        ) : rootFolders.length === 0 ? (
          <p className="text-xs text-zinc-600 text-center py-10">
            No folders yet. Create a folder structure: Vehicle Type → OS → Part Number
          </p>
        ) : (
          rootFolders.map((f) => (
            <FolderNode
              key={f.id}
              folder={f}
              childMap={childMap}
              depth={0}
              onDelete={(id) => {
                if (confirm("Delete this folder and all children?")) {
                  deleteMut.mutate({ id });
                }
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FolderNode({
  folder,
  childMap,
  depth,
  onDelete,
}: {
  folder: Folder;
  childMap: Map<number, Folder[]>;
  depth: number;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const children = childMap.get(folder.id) ?? [];

  const typeColor =
    folder.folderType === "vehicle_type"
      ? "text-amber-400"
      : folder.folderType === "os"
      ? "text-blue-400"
      : folder.folderType === "part_number"
      ? "text-emerald-400"
      : "text-zinc-400";

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-zinc-800/30 group">
        <button onClick={() => setExpanded(!expanded)} className="p-0.5">
          {children.length > 0 ? (
            expanded ? (
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            ) : (
              <ChevronRight className="w-3 h-3 text-zinc-500" />
            )
          ) : (
            <div className="w-3 h-3" />
          )}
        </button>
        <FolderOpen className={`w-3.5 h-3.5 ${typeColor}`} />
        <span className="text-xs text-zinc-300">{folder.name}</span>
        <span className={`text-[9px] font-mono ${typeColor}`}>
          {folder.folderType.replace("_", " ")}
        </span>
        <button
          onClick={() => onDelete(folder.id)}
          className="ml-auto p-1 rounded hover:bg-red-500/20 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {expanded &&
        children.map((c) => (
          <FolderNode key={c.id} folder={c} childMap={childMap} depth={depth + 1} onDelete={onDelete} />
        ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Combo Management — ECM + TCM 1-shot deploy pairing
// ═══════════════════════════════════════════════════════════════════════════

function ComboManagement() {
  const combosQuery = trpc.autoDeploy.listCombos.useQuery(undefined, { refetchOnWindowFocus: false });
  const calQuery = trpc.autoDeploy.listCalibrationsEnriched.useQuery(undefined, { refetchOnWindowFocus: false });

  const createMut = trpc.autoDeploy.createCombo.useMutation({
    onSuccess: () => {
      combosQuery.refetch();
      toast.success("Combo created");
      setNewEcmId(null);
      setNewTcmId(null);
      setNewLabel("");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.autoDeploy.deleteCombo.useMutation({
    onSuccess: () => {
      combosQuery.refetch();
      toast.success("Combo deleted");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.autoDeploy.updateCombo.useMutation({
    onSuccess: () => {
      combosQuery.refetch();
      toast.success("Combo updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const [newEcmId, setNewEcmId] = useState<number | null>(null);
  const [newTcmId, setNewTcmId] = useState<number | null>(null);
  const [newLabel, setNewLabel] = useState("");

  const combos = combosQuery.data ?? [];
  const calibrations = calQuery.data ?? [];
  const ecmCals = calibrations.filter((c) => c.moduleType === "ecm");
  const tcmCals = calibrations.filter((c) => c.moduleType === "tcm");

  return (
    <div className="space-y-4">
      {/* Create Combo */}
      <div className="bg-zinc-900/60 rounded-xl border border-zinc-800/50 p-3 space-y-2">
        <div className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-cyan-500" />
          Create ECM + TCM Combo (1-Shot Deploy)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1 block">ECM Calibration</label>
            <select
              value={newEcmId ?? ""}
              onChange={(e) => setNewEcmId(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="w-full bg-zinc-800/50 border border-blue-500/30 rounded-lg px-2 py-1.5 text-xs text-zinc-300"
            >
              <option value="">Select ECM...</option>
              {ecmCals.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fileName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1 block">TCM Calibration</label>
            <select
              value={newTcmId ?? ""}
              onChange={(e) => setNewTcmId(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="w-full bg-zinc-800/50 border border-purple-500/30 rounded-lg px-2 py-1.5 text-xs text-zinc-300"
            >
              <option value="">Select TCM...</option>
              {tcmCals.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fileName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1 block">Label (optional)</label>
            <div className="flex gap-1">
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. L5P Stage 2 Combo"
                className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-2 py-1.5 text-xs text-zinc-300"
              />
              <button
                onClick={() => {
                  if (!newEcmId || !newTcmId) return toast.error("Select both ECM and TCM calibrations");
                  createMut.mutate({
                    ecmCalibrationId: newEcmId,
                    tcmCalibrationId: newTcmId,
                    label: newLabel.trim() || undefined,
                  });
                }}
                disabled={createMut.isPending}
                className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-medium hover:bg-cyan-500/30 transition-all disabled:opacity-50"
              >
                {createMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Combo List */}
      {combosQuery.isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 text-cyan-500 animate-spin" />
        </div>
      ) : combos.length === 0 ? (
        <p className="text-xs text-zinc-600 text-center py-10">
          No combos yet. Pair an ECM + TCM calibration for 1-shot deployment.
        </p>
      ) : (
        <div className="space-y-1.5">
          {combos.map((combo) => (
            <div
              key={combo.id}
              className="bg-zinc-900/60 rounded-xl border border-zinc-800/50 px-3 py-2 flex items-center gap-3"
            >
              <Link2 className="w-4 h-4 text-cyan-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-zinc-200 truncate">
                  {combo.label || `Combo #${combo.id}`}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold uppercase">
                    ECM
                  </span>
                  <span className="text-[10px] text-zinc-400 truncate max-w-[200px]">
                    {combo.ecmFileName || `#${combo.ecmCalibrationId}`}
                  </span>
                  <span className="text-zinc-600">+</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 font-bold uppercase">
                    TCM
                  </span>
                  <span className="text-[10px] text-zinc-400 truncate max-w-[200px]">
                    {combo.tcmFileName || `#${combo.tcmCalibrationId}`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => updateMut.mutate({ id: combo.id, isActive: !combo.isActive })}
                  className={`px-2 py-0.5 rounded text-[9px] font-medium transition-all ${
                    combo.isActive
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-zinc-800/50 text-zinc-600 border border-zinc-700/50"
                  }`}
                >
                  {combo.isActive ? "Active" : "Inactive"}
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this combo?")) deleteMut.mutate({ id: combo.id });
                  }}
                  className="p-1 rounded hover:bg-red-500/20 text-zinc-600 hover:text-red-400 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Deploy Log Viewer
// ═══════════════════════════════════════════════════════════════════════════

function DeployLogViewer() {
  const logsQuery = trpc.autoDeploy.listLogs.useQuery({ limit: 50 }, { refetchOnWindowFocus: false });
  const logs = logsQuery.data ?? [];

  return (
    <div className="space-y-2">
      <div className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
        <History className="w-3.5 h-3.5 text-cyan-500" />
        Auto-Deploy Audit Log
        <span className="text-[10px] text-zinc-600 ml-auto">{logs.length} entries</span>
      </div>

      {logsQuery.isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 text-cyan-500 animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <p className="text-xs text-zinc-600 text-center py-10">
          No auto-deploy attempts yet.
        </p>
      ) : (
        <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
          {logs.map((log: any) => (
            <div
              key={log.id}
              className="bg-zinc-900/60 rounded-lg border border-zinc-800/50 px-3 py-2 flex items-center gap-2"
            >
              {log.result === "success" ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : log.result === "no_match" ? (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              ) : (
                <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-zinc-300 truncate">
                  {log.resultMessage || log.result}
                </div>
                <div className="text-[9px] text-zinc-600 font-mono">
                  {log.deployType} · L{log.userAccessLevel} ·{" "}
                  {log.vehicleEcmOs && `ECM: ${log.vehicleEcmOs}`}
                  {log.vehicleTcmOs && ` TCM: ${log.vehicleTcmOs}`}
                </div>
              </div>
              <span className="text-[9px] text-zinc-600 shrink-0">
                {log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
