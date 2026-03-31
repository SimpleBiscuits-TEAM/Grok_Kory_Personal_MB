/**
 * KnoxFileBrowser — ECU Definition File Library
 *
 * Browse, search, and filter the Knox ECU file library.
 * Supports:
 *  - Search by filename
 *  - Filter by platform, collection, file type
 *  - Detail view with full ECU metadata + analysis JSON
 *  - Download link to S3-stored files
 *  - Bulk file upload with drag-and-drop
 */

import { useState, useCallback, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Search, Filter, Database, FileText, HardDrive, Cpu, ChevronLeft,
  Upload, X, FolderOpen, ArrowDown, ExternalLink, Loader2, Package,
  FileCode, Binary, AlertCircle, CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';

// File type icons & colors
const FILE_TYPE_CONFIG: Record<string, { icon: typeof FileText; color: string; label: string }> = {
  a2l: { icon: FileCode, color: 'text-emerald-400', label: 'A2L Definition' },
  binary: { icon: Binary, color: 'text-amber-400', label: 'Binary (H32)' },
  vst_text: { icon: FileText, color: 'text-cyan-400', label: 'VST (Text)' },
  vst_binary: { icon: HardDrive, color: 'text-purple-400', label: 'VST (Binary)' },
  source: { icon: FileCode, color: 'text-yellow-400', label: 'C Source' },
  ati: { icon: Package, color: 'text-orange-400', label: 'ATI File' },
  vbf: { icon: HardDrive, color: 'text-pink-400', label: 'VBF Flash' },
  error_log: { icon: AlertCircle, color: 'text-red-400', label: 'Error Log' },
};

interface KnoxFile {
  id: number;
  filename: string;
  fileType: string;
  sizeMb: string;
  platform: string;
  ecuId: string | null;
  projectId: string | null;
  projectName: string | null;
  version: string | null;
  cpuType: string | null;
  totalCalibratables: number | null;
  totalMeasurements: number | null;
  totalFunctions: number | null;
  sourceCollection: string | null;
  s3Url: string;
  createdAt: Date;
}

interface KnoxFileDetail extends KnoxFile {
  sizeBytes: number;
  epk: string | null;
  s3Key: string;
  analysisJson: any;
  updatedAt: Date;
}

export default function KnoxFileBrowser() {
  // State
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [collectionFilter, setCollectionFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const PAGE_SIZE = 30;

  // Queries
  const { data: filesData, isLoading: filesLoading, refetch: refetchFiles } = trpc.editor.knoxFileList.useQuery({
    search: search || undefined,
    platform: platformFilter || undefined,
    collection: collectionFilter || undefined,
    fileType: typeFilter || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const { data: platforms } = trpc.editor.knoxPlatforms.useQuery();
  const { data: collections } = trpc.editor.knoxCollections.useQuery();

  const { data: fileDetail, isLoading: detailLoading } = trpc.editor.knoxFileDetail.useQuery(
    { id: selectedFileId! },
    { enabled: !!selectedFileId }
  );

  const files = filesData?.files || [];
  const total = filesData?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Handlers
  const clearFilters = useCallback(() => {
    setSearch('');
    setPlatformFilter('');
    setCollectionFilter('');
    setTypeFilter('');
    setPage(0);
  }, []);

  const handleFileClick = useCallback((id: number) => {
    setSelectedFileId(id);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedFileId(null);
  }, []);

  // Stats
  const totalA2L = useMemo(() => {
    if (!platforms) return 0;
    return platforms.reduce((sum, p) => sum + (p.cnt as number), 0);
  }, [platforms]);

  // ── Detail View ──
  if (selectedFileId && fileDetail) {
    const ftConfig = FILE_TYPE_CONFIG[fileDetail.fileType] || FILE_TYPE_CONFIG.a2l;
    const Icon = ftConfig.icon;
    const analysis = fileDetail.analysisJson as any;

    return (
      <div className="flex flex-col h-full overflow-auto p-3 gap-3">
        {/* Back button */}
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors w-fit"
        >
          <ChevronLeft className="w-3 h-3" />
          BACK TO LIBRARY
        </button>

        {/* File header */}
        <div className="flex items-start gap-3 bg-zinc-900/50 border border-zinc-800 rounded p-3">
          <div className={`p-2 rounded ${ftConfig.color} bg-zinc-800/50`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-zinc-200 truncate">{fileDetail.filename}</h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">{ftConfig.label} &middot; {fileDetail.sizeMb} MB &middot; {fileDetail.sourceCollection || 'Unknown'}</p>
            <p className="text-[10px] text-zinc-400 mt-1">{fileDetail.platform}</p>
          </div>
        </div>

        {/* ECU Metadata */}
        <div className="bg-zinc-900/30 border border-zinc-800 rounded p-3">
          <h4 className="text-[10px] font-bold text-zinc-400 tracking-wider mb-2">ECU METADATA</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
            {fileDetail.ecuId && <MetaRow label="ECU ID" value={fileDetail.ecuId} />}
            {fileDetail.projectId && <MetaRow label="Project ID" value={fileDetail.projectId} />}
            {fileDetail.projectName && <MetaRow label="Project Name" value={fileDetail.projectName} />}
            {fileDetail.version && <MetaRow label="Version" value={fileDetail.version} />}
            {fileDetail.cpuType && <MetaRow label="CPU Type" value={fileDetail.cpuType} />}
            {fileDetail.epk && <MetaRow label="EPK" value={fileDetail.epk} wide />}
          </div>
        </div>

        {/* Parameter Counts */}
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Calibratables" value={fileDetail.totalCalibratables || 0} color="text-emerald-400" />
          <StatCard label="Measurements" value={fileDetail.totalMeasurements || 0} color="text-cyan-400" />
          <StatCard label="Functions" value={fileDetail.totalFunctions || 0} color="text-amber-400" />
        </div>

        {/* Analysis Details */}
        {analysis && Object.keys(analysis).length > 0 && (
          <div className="bg-zinc-900/30 border border-zinc-800 rounded p-3">
            <h4 className="text-[10px] font-bold text-zinc-400 tracking-wider mb-2">ANALYSIS</h4>
            {analysis.parameters && (
              <div className="mb-2">
                <span className="text-[9px] text-zinc-500 font-bold">PARAMETER TYPES:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {Object.entries(analysis.parameters).map(([key, val]) => (
                    <span key={key} className="px-1.5 py-0.5 bg-zinc-800 rounded text-[9px] text-zinc-400">
                      {key}: {String(val)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {analysis.memory_segments && (
              <div className="mb-2">
                <span className="text-[9px] text-zinc-500 font-bold">MEMORY SEGMENTS:</span>
                <div className="mt-1 space-y-0.5">
                  {(analysis.memory_segments as any[]).slice(0, 8).map((seg: any, i: number) => (
                    <div key={i} className="text-[9px] text-zinc-500 font-mono">
                      {seg.name}: {seg.address} ({seg.size} bytes) — {seg.type}
                    </div>
                  ))}
                  {(analysis.memory_segments as any[]).length > 8 && (
                    <div className="text-[9px] text-zinc-600 italic">
                      +{(analysis.memory_segments as any[]).length - 8} more segments
                    </div>
                  )}
                </div>
              </div>
            )}
            {analysis.subsystems_sample && (
              <div className="mb-2">
                <span className="text-[9px] text-zinc-500 font-bold">SUBSYSTEMS (sample):</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(analysis.subsystems_sample as string[]).slice(0, 12).map((s: string, i: number) => (
                    <span key={i} className="px-1.5 py-0.5 bg-zinc-800/50 rounded text-[9px] text-zinc-500">
                      {s}
                    </span>
                  ))}
                  {analysis.subsystem_count > 12 && (
                    <span className="px-1.5 py-0.5 text-[9px] text-zinc-600 italic">
                      +{analysis.subsystem_count - 12} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Download */}
        <a
          href={fileDetail.s3Url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 px-3 py-2 bg-red-600/20 border border-red-600/30 rounded text-[11px] font-bold text-red-400 hover:bg-red-600/30 transition-colors"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          DOWNLOAD FILE
        </a>
      </div>
    );
  }

  // Loading detail
  if (selectedFileId && detailLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-red-500" />
        <span className="text-[10px] text-zinc-500">Loading file details...</span>
      </div>
    );
  }

  // ── List View ──
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-zinc-800/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-red-500" />
            <span className="text-[11px] font-bold text-zinc-300 tracking-wider">KNOX FILE LIBRARY</span>
            <span className="text-[9px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">{total} files</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[9px] gap-1 border-red-600/30 text-red-400 hover:bg-red-600/10"
            onClick={() => setShowUpload(!showUpload)}
          >
            <Upload className="w-3 h-3" />
            UPLOAD
          </Button>
        </div>

        {/* Upload area */}
        {showUpload && (
          <div
            className={`mb-2 p-4 border-2 border-dashed rounded transition-colors text-center ${
              dragOver
                ? 'border-red-500 bg-red-500/10'
                : 'border-zinc-700 bg-zinc-900/30 hover:border-zinc-600'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const droppedFiles = Array.from(e.dataTransfer.files);
              if (droppedFiles.length > 0) {
                toast.info(`${droppedFiles.length} file(s) queued — bulk upload coming soon. For now, share files in chat.`);
              }
            }}
          >
            <Upload className="w-6 h-6 text-zinc-600 mx-auto mb-2" />
            <p className="text-[10px] text-zinc-400">Drag & drop A2L, H32, VST, or BIN files here</p>
            <p className="text-[9px] text-zinc-600 mt-1">Files will be analyzed and added to Knox automatically</p>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search files..."
            className="w-full pl-7 pr-8 py-1.5 bg-zinc-900/50 border border-zinc-800 rounded text-[11px] text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-red-600/50"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-3 h-3 text-zinc-600 hover:text-zinc-400" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-1.5 flex-wrap">
          <select
            value={platformFilter}
            onChange={(e) => { setPlatformFilter(e.target.value); setPage(0); }}
            className="px-2 py-1 bg-zinc-900/50 border border-zinc-800 rounded text-[10px] text-zinc-400 focus:outline-none focus:border-red-600/50 max-w-[140px]"
          >
            <option value="">All Platforms</option>
            {platforms?.map((p) => (
              <option key={p.platform} value={p.platform}>
                {p.platform} ({p.cnt})
              </option>
            ))}
          </select>

          <select
            value={collectionFilter}
            onChange={(e) => { setCollectionFilter(e.target.value); setPage(0); }}
            className="px-2 py-1 bg-zinc-900/50 border border-zinc-800 rounded text-[10px] text-zinc-400 focus:outline-none focus:border-red-600/50 max-w-[120px]"
          >
            <option value="">All Collections</option>
            {collections?.map((c) => (
              <option key={c.collection} value={c.collection || ''}>
                {c.collection || 'Unknown'} ({c.cnt})
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
            className="px-2 py-1 bg-zinc-900/50 border border-zinc-800 rounded text-[10px] text-zinc-400 focus:outline-none focus:border-red-600/50 max-w-[100px]"
          >
            <option value="">All Types</option>
            <option value="a2l">A2L</option>
            <option value="binary">Binary</option>
            <option value="vst_text">VST (Text)</option>
            <option value="vst_binary">VST (Binary)</option>
            <option value="source">Source</option>
            <option value="ati">ATI</option>
            <option value="vbf">VBF</option>
          </select>

          {(search || platformFilter || collectionFilter || typeFilter) && (
            <button
              onClick={clearFilters}
              className="px-2 py-1 text-[9px] text-red-400 hover:text-red-300 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {filesLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-red-500" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Database className="w-6 h-6 text-zinc-700 mb-2" />
            <p className="text-[10px] text-zinc-500">No files found</p>
            <p className="text-[9px] text-zinc-600 mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {files.map((file) => {
              const ftConfig = FILE_TYPE_CONFIG[file.fileType] || FILE_TYPE_CONFIG.a2l;
              const Icon = ftConfig.icon;
              return (
                <button
                  key={file.id}
                  onClick={() => handleFileClick(file.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-800/30 transition-colors text-left"
                >
                  <Icon className={`w-4 h-4 shrink-0 ${ftConfig.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-300 font-medium truncate">{file.filename}</span>
                      <span className="text-[8px] text-zinc-600 shrink-0">{file.sizeMb} MB</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-zinc-500 truncate">{file.platform}</span>
                      {file.sourceCollection && (
                        <span className="text-[8px] text-zinc-600 bg-zinc-800/50 px-1 py-0.5 rounded shrink-0">
                          {file.sourceCollection}
                        </span>
                      )}
                    </div>
                    {(file.totalCalibratables && file.totalCalibratables > 0) && (
                      <div className="flex gap-2 mt-0.5">
                        <span className="text-[8px] text-emerald-600">{file.totalCalibratables?.toLocaleString()} cals</span>
                        {file.totalMeasurements && file.totalMeasurements > 0 && (
                          <span className="text-[8px] text-cyan-600">{file.totalMeasurements?.toLocaleString()} meas</span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-zinc-800/50">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="text-[9px] text-zinc-600">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Helper Components ──

function MetaRow({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <span className="text-zinc-600">{label}:</span>
      <span className="text-zinc-300 ml-1 font-mono break-all">{value}</span>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-zinc-900/30 border border-zinc-800 rounded p-2 text-center">
      <div className={`text-sm font-bold ${color}`}>{value.toLocaleString()}</div>
      <div className="text-[8px] text-zinc-600 mt-0.5">{label}</div>
    </div>
  );
}
