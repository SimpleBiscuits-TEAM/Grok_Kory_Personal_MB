/**
 * MapTreeBrowser — Intelligent search + category tree for calibration maps
 *
 * Features:
 * - Instant search with smart ranking
 * - Match type badges (EXACT, NAME, ADDR, DESC, CAT, UNIT, FUZZY)
 * - Highlighted matched text in results
 * - Keyboard navigation (↑↓ arrows, Enter to select, Escape to clear)
 * - Map dimension display (1×1, 1×16, 16×16) next to each map
 * - Magic Mode: AI-powered friendly name toggle with smart categories
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Search, ChevronRight, ChevronDown, Hash, TrendingUp, Grid3X3, Box, FileText, X, Zap, Sparkles, Loader2 } from 'lucide-react';
import { CalibrationMap, MapTreeNode, buildMapTree, searchMapsDetailed, SearchResult } from '@/lib/editorEngine';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

export interface MagicModeMap {
  friendlyName: string;
  smartCategory: string;
  confidence: 'high' | 'medium' | 'low';
}

interface MapTreeBrowserProps {
  maps: CalibrationMap[];
  selectedMapIndex: number | null;
  onSelectMap: (index: number) => void;
  modifiedMaps: Set<number>;
  ecuFamily?: string;
}

function mapTypeIcon(type: string) {
  switch (type) {
    case 'VALUE': return <Hash className="w-3 h-3 text-zinc-500" />;
    case 'CURVE': return <TrendingUp className="w-3 h-3 text-cyan-500" />;
    case 'MAP': return <Grid3X3 className="w-3 h-3 text-emerald-500" />;
    case 'VAL_BLK': return <Box className="w-3 h-3 text-amber-500" />;
    default: return <FileText className="w-3 h-3 text-zinc-500" />;
  }
}

/** Get map dimension string like "1×1", "1×16", "16×16" */
function getMapDimensions(m: CalibrationMap): string {
  if (m.rows && m.cols) return `${m.rows}×${m.cols}`;
  if (m.type === 'VALUE') return '1×1';
  if (m.type === 'CURVE') {
    const pts = m.axes?.[0]?.maxAxisPoints || 1;
    return `1×${pts}`;
  }
  if (m.type === 'MAP') {
    const xPts = m.axes?.[0]?.maxAxisPoints || 1;
    const yPts = m.axes?.[1]?.maxAxisPoints || 1;
    return `${yPts}×${xPts}`;
  }
  if (m.type === 'VAL_BLK') {
    const pts = m.axes?.[0]?.maxAxisPoints || '?';
    return `1×${pts}`;
  }
  return '';
}

/** Dimension badge color based on map complexity */
function dimBadgeColor(dim: string): string {
  if (dim === '1×1') return 'text-zinc-700';
  if (dim.startsWith('1×')) return 'text-cyan-800';
  return 'text-emerald-700';
}

const MATCH_TYPE_COLORS: Record<string, string> = {
  'exact': 'bg-green-500/20 text-green-400 border-green-500/30',
  'starts-with': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'contains': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'address': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'description': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'category': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'unit': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  'fuzzy': 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

const MATCH_TYPE_LABELS: Record<string, string> = {
  'exact': 'EXACT',
  'starts-with': 'NAME',
  'contains': 'NAME',
  'address': 'ADDR',
  'description': 'DESC',
  'category': 'CAT',
  'unit': 'UNIT',
  'fuzzy': 'FUZZY',
};

/** Render map name with highlighted matched portions */
function HighlightedName({ name, highlights, className }: { name: string; highlights: SearchResult['highlights']; className?: string }) {
  if (!highlights || highlights.length === 0) {
    return <span className={className}>{name}</span>;
  }

  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const h of sorted) {
    const last = merged[merged.length - 1];
    if (last && h.start <= last.end) {
      last.end = Math.max(last.end, h.end);
    } else {
      merged.push({ ...h });
    }
  }

  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (let i = 0; i < merged.length; i++) {
    const h = merged[i];
    if (pos < h.start) {
      parts.push(<span key={`t${i}`}>{name.slice(pos, h.start)}</span>);
    }
    parts.push(
      <span key={`h${i}`} className="bg-ppei-red/30 text-white rounded-sm px-0.5">
        {name.slice(h.start, h.end)}
      </span>
    );
    pos = h.end;
  }
  if (pos < name.length) {
    parts.push(<span key="tail">{name.slice(pos)}</span>);
  }

  return <span className={className}>{parts}</span>;
}

/** Build a tree from magic mode smart categories */
function buildMagicTree(maps: CalibrationMap[], magicMap: Map<string, MagicModeMap>): MapTreeNode[] {
  const catGroups = new Map<string, { maps: { idx: number; map: CalibrationMap; magic: MagicModeMap }[] }>();

  maps.forEach((m, idx) => {
    const magic = magicMap.get(m.name);
    const cat = magic?.smartCategory || 'Unknown';
    if (!catGroups.has(cat)) {
      catGroups.set(cat, { maps: [] });
    }
    catGroups.get(cat)!.maps.push({ idx, map: m, magic: magic || { friendlyName: m.name, smartCategory: 'Unknown', confidence: 'low' } });
  });

  // Sort categories alphabetically, but put "Unknown" last
  const sortedCats = Array.from(catGroups.entries()).sort((a: [string, { maps: { idx: number; map: CalibrationMap; magic: MagicModeMap }[] }], b: [string, { maps: { idx: number; map: CalibrationMap; magic: MagicModeMap }[] }]) => {
    if (a[0] === 'Unknown') return 1;
    if (b[0] === 'Unknown') return -1;
    return a[0].localeCompare(b[0]);
  });

  return sortedCats.map(([cat, group]) => ({
    id: `magic-${cat}`,
    label: cat,
    mapCount: group.maps.length,
    children: group.maps
      .sort((a: { idx: number; map: CalibrationMap; magic: MagicModeMap }, b: { idx: number; map: CalibrationMap; magic: MagicModeMap }) => a.magic.friendlyName.localeCompare(b.magic.friendlyName))
      .map((item: { idx: number; map: CalibrationMap; magic: MagicModeMap }) => ({
        id: `magic-${cat}-${item.idx}`,
        label: item.magic.friendlyName,
        mapIndex: item.idx,
        mapCount: 0,
      })),
  }));
}

export default function MapTreeBrowser({ maps, selectedMapIndex, onSelectMap, modifiedMaps, ecuFamily }: MapTreeBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [activeResultIdx, setActiveResultIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  // Magic Mode state
  const [magicMode, setMagicMode] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicMap, setMagicMap] = useState<Map<string, MagicModeMap>>(new Map());
  const [magicProgress, setMagicProgress] = useState({ done: 0, total: 0 });
  const magicCacheKeyRef = useRef<string>('');

  const simplifyMutation = trpc.editor.simplifyMaps.useMutation();

  const tree = useMemo(() => buildMapTree(maps), [maps]);
  const magicTree = useMemo(() => {
    if (!magicMode || magicMap.size === 0) return [];
    return buildMagicTree(maps, magicMap);
  }, [maps, magicMode, magicMap]);

  // Intelligent search with timing
  const searchData = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const start = performance.now();
    const results = searchMapsDetailed(maps, searchQuery);
    const elapsed = performance.now() - start;
    return { results, elapsed };
  }, [maps, searchQuery]);

  // Reset active index when search changes
  useEffect(() => {
    setActiveResultIdx(0);
  }, [searchQuery]);

  // Scroll active item into view
  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeResultIdx]);

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(Array.from(prev));
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const all = new Set<string>();
    const activeTree = magicMode && magicMap.size > 0 ? magicTree : tree;
    for (const cat of activeTree) {
      all.add(cat.id);
      for (const sub of cat.children || []) {
        all.add(sub.id);
      }
    }
    setExpandedNodes(all);
  }, [tree, magicTree, magicMode, magicMap]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

  // ── Magic Mode: batch simplify maps via LLM ──
  const activateMagicMode = useCallback(async () => {
    // Check if we already have results cached for this map set
    const cacheKey = maps.map(m => m.name).join('|').slice(0, 500);
    if (magicCacheKeyRef.current === cacheKey && magicMap.size > 0) {
      setMagicMode(true);
      return;
    }

    setMagicLoading(true);
    setMagicMode(true);
    const newMap = new Map<string, MagicModeMap>();

    // Process in batches of 100
    const BATCH_SIZE = 100;
    const totalBatches = Math.ceil(maps.length / BATCH_SIZE);
    setMagicProgress({ done: 0, total: maps.length });

    try {
      for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
        const start = batchIdx * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, maps.length);
        const batch = maps.slice(start, end);

        const result = await simplifyMutation.mutateAsync({
          maps: batch.map(m => ({
            name: m.name,
            description: m.description || undefined,
            category: m.category || undefined,
            type: m.type || undefined,
            unit: m.unit || undefined,
          })),
          ecuFamily: ecuFamily || undefined,
          batchIndex: batchIdx,
        });

        if (result.success && result.results) {
          for (const item of result.results) {
            const originalMap = batch[item.index];
            if (originalMap) {
              newMap.set(originalMap.name, {
                friendlyName: item.friendlyName,
                smartCategory: item.smartCategory,
                confidence: item.confidence as 'high' | 'medium' | 'low',
              });
            }
          }
        }

        setMagicProgress({ done: end, total: maps.length });
        setMagicMap(new Map(newMap)); // trigger re-render progressively
      }

      magicCacheKeyRef.current = cacheKey;
      toast.success('Magic Mode Active', {
        description: `Translated ${newMap.size} map names into plain English`
      });
    } catch (err: any) {
      toast.error('Magic Mode Error', {
        description: err.message || 'Failed to simplify map names'
      });
    } finally {
      setMagicLoading(false);
    }
  }, [maps, ecuFamily, simplifyMutation, magicMap]);

  const toggleMagicMode = useCallback(() => {
    if (magicMode) {
      setMagicMode(false);
    } else {
      activateMagicMode();
    }
  }, [magicMode, activateMagicMode]);

  // Keyboard navigation for search results
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!searchData?.results.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveResultIdx(prev => Math.min(prev + 1, searchData.results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveResultIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const result = searchData.results[activeResultIdx];
      if (result) onSelectMap(result.idx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSearchQuery('');
    }
  }, [searchData, activeResultIdx, onSelectMap]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  }, []);

  /** Get display name for a map (magic or engineering) */
  const getDisplayName = useCallback((m: CalibrationMap): string => {
    if (magicMode && magicMap.size > 0) {
      const magic = magicMap.get(m.name);
      if (magic) return magic.friendlyName;
    }
    return m.name;
  }, [magicMode, magicMap]);

  // ─── Search Results View ───────────────────────────────────────────────────

  if (searchData) {
    const { results, elapsed } = searchData;
    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Search bar */}
        <div className="p-2 border-b border-zinc-800 shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              ref={searchInputRef}
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded pl-7 pr-7 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-ppei-red/50"
              placeholder="Search maps, addresses, units..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              autoFocus
            />
            {searchQuery && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                onClick={clearSearch}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
            <Zap className="w-2.5 h-2.5" />
            <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
            <span className="text-zinc-700">·</span>
            <span>{elapsed.toFixed(1)}ms</span>
            {results.length > 0 && (
              <>
                <span className="text-zinc-700">·</span>
                <span className="text-zinc-600">↑↓ navigate · Enter select · Esc clear</span>
              </>
            )}
          </div>
        </div>

        {/* Results list */}
        <div ref={resultsContainerRef} className="flex-1 overflow-y-auto">
          {results.length === 0 && (
            <div className="p-4 text-center text-xs text-zinc-500">
              No maps found for "{searchQuery}"
            </div>
          )}
          {results.map((result, rIdx) => {
            const m = maps[result.idx];
            const isSelected = selectedMapIndex === result.idx;
            const isActive = rIdx === activeResultIdx;
            const isModified = modifiedMaps.has(result.idx);
            const matchColor = MATCH_TYPE_COLORS[result.matchType] || MATCH_TYPE_COLORS.fuzzy;
            const matchLabel = MATCH_TYPE_LABELS[result.matchType] || 'MATCH';
            const displayName = getDisplayName(m);

            return (
              <button
                key={`${result.idx}-${rIdx}`}
                ref={isActive ? activeItemRef : undefined}
                className={`w-full text-left px-2 py-1.5 flex flex-col gap-0.5 transition-colors border-l-2
                  ${isSelected ? 'bg-ppei-red/10 border-ppei-red' : isActive ? 'bg-zinc-800/80 border-cyan-500/50' : 'border-transparent hover:bg-zinc-800/40'}
                `}
                onClick={() => onSelectMap(result.idx)}
                onMouseEnter={() => setActiveResultIdx(rIdx)}
              >
                {/* Top row: icon + name + match badge */}
                <div className="flex items-center gap-1.5 w-full">
                  {mapTypeIcon(m.type)}
                  {magicMode && magicMap.has(m.name) ? (
                    <span className={`text-xs truncate flex-1 ${isModified ? 'text-yellow-300' : 'text-zinc-200'}`}>
                      {displayName}
                    </span>
                  ) : (
                    <HighlightedName
                      name={m.name}
                      highlights={result.highlights}
                      className={`text-xs truncate flex-1 ${isModified ? 'text-yellow-300' : 'text-zinc-200'}`}
                    />
                  )}
                  <span className={`text-[9px] px-1 py-0.5 rounded border shrink-0 font-mono ${matchColor}`}>
                    {matchLabel}
                  </span>
                </div>

                {/* Engineering name subtitle in magic mode */}
                {magicMode && magicMap.has(m.name) && (
                  <div className="pl-4.5 text-[10px] text-zinc-600 font-mono truncate">
                    {m.name}
                  </div>
                )}

                {/* Bottom row: metadata */}
                <div className="flex items-center gap-2 pl-4.5 text-[10px] text-zinc-600">
                  <span className="font-mono">0x{m.address.toString(16).toUpperCase()}</span>
                  <span className="text-zinc-700">·</span>
                  <span>{m.type}</span>
                  <span className="text-zinc-700">·</span>
                  <span className={dimBadgeColor(getMapDimensions(m))}>{getMapDimensions(m)}</span>
                  {m.unit && (
                    <>
                      <span className="text-zinc-700">·</span>
                      <span className="text-zinc-500">{m.unit}</span>
                    </>
                  )}
                  {m.category && (
                    <>
                      <span className="text-zinc-700">·</span>
                      <span className="text-zinc-600 truncate">{m.category}{m.subcategory ? `/${m.subcategory}` : ''}</span>
                    </>
                  )}
                  {result.matchType === 'description' && m.description && (
                    <>
                      <span className="text-zinc-700">·</span>
                      <span className="text-amber-600 truncate max-w-[150px]">{m.description}</span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Tree View ─────────────────────────────────────────────────────────────

  const activeTree = magicMode && magicMap.size > 0 ? magicTree : tree;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search bar */}
      <div className="p-2 border-b border-zinc-800 shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            ref={searchInputRef}
            className="w-full bg-zinc-800/80 border border-zinc-700 rounded pl-7 pr-2 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-ppei-red/50"
            placeholder="Search maps, addresses, units..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
        </div>

        {/* Magic Mode toggle + Expand/Collapse */}
        <div className="flex items-center gap-2 mt-1.5">
          <button
            className={`text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded transition-all ${
              magicMode
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'text-zinc-500 hover:text-purple-400 hover:bg-purple-500/10'
            }`}
            onClick={toggleMagicMode}
            disabled={magicLoading}
            title={magicMode ? 'Switch to Engineering names' : 'Switch to Magic Mode (AI-simplified names)'}
          >
            {magicLoading ? (
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
            ) : (
              <Sparkles className="w-2.5 h-2.5" />
            )}
            <span>{magicLoading ? `${magicProgress.done}/${magicProgress.total}` : 'Magic'}</span>
          </button>
          <span className="text-zinc-700">|</span>
          <button
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            onClick={expandAll}
          >
            Expand All
          </button>
          <span className="text-zinc-700">|</span>
          <button
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            onClick={collapseAll}
          >
            Collapse All
          </button>
          <span className="text-[10px] text-zinc-600 ml-auto">{maps.length} maps</span>
        </div>
      </div>

      {/* Magic Mode loading indicator */}
      {magicLoading && (
        <div className="px-2 py-1 bg-purple-500/5 border-b border-purple-500/20 shrink-0">
          <div className="flex items-center gap-2 text-[10px] text-purple-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Erika is translating map names...</span>
            <span className="ml-auto text-purple-500">{Math.round((magicProgress.done / Math.max(magicProgress.total, 1)) * 100)}%</span>
          </div>
          <div className="mt-1 h-0.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all duration-300"
              style={{ width: `${(magicProgress.done / Math.max(magicProgress.total, 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto">
        {activeTree.map(catNode => {
          const isExpanded = expandedNodes.has(catNode.id);
          return (
            <div key={catNode.id}>
              {/* Category */}
              <button
                className="w-full text-left px-2 py-1.5 flex items-center gap-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800/40 transition-colors"
                onClick={() => toggleNode(catNode.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                )}
                <span>{catNode.label}</span>
                <span className="text-[10px] text-zinc-600 ml-auto">{catNode.mapCount}</span>
              </button>

              {isExpanded && catNode.children?.map(subNode => {
                // In magic mode, children are leaf maps directly under category
                if (magicMode && magicMap.size > 0 && subNode.mapIndex !== undefined) {
                  const idx = subNode.mapIndex;
                  const m = maps[idx];
                  const isSelected = selectedMapIndex === idx;
                  const isModified = modifiedMaps.has(idx);
                  const magic = magicMap.get(m.name);
                  const confidence = magic?.confidence || 'low';

                  return (
                    <button
                      key={subNode.id}
                      className={`w-full text-left pl-6 pr-2 py-1 flex flex-col gap-0 hover:bg-zinc-800/50 transition-colors
                        ${isSelected ? 'bg-ppei-red/10 border-l-2 border-ppei-red' : 'border-l-2 border-transparent'}
                      `}
                      onClick={() => onSelectMap(idx)}
                    >
                      <div className="flex items-center gap-1.5 text-xs">
                        {mapTypeIcon(m.type)}
                        <span className={`truncate ${isModified ? 'text-yellow-300' : 'text-zinc-300'}`}>
                          {magic?.friendlyName || m.name}
                        </span>
                        <span className="text-[9px] ml-auto shrink-0 flex items-center gap-1">
                          {confidence !== 'high' && (
                            <span className={`${confidence === 'medium' ? 'text-amber-700' : 'text-red-800'}`}>
                              {confidence === 'medium' ? '~' : '?'}
                            </span>
                          )}
                          <span className={dimBadgeColor(getMapDimensions(m))}>{getMapDimensions(m)}</span>
                          {m.unit && <span className="text-zinc-600">{m.unit}</span>}
                        </span>
                      </div>
                      <div className="pl-4.5 text-[9px] text-zinc-700 font-mono truncate">
                        {m.name}
                      </div>
                    </button>
                  );
                }

                // Normal mode: subcategory folders
                const subExpanded = expandedNodes.has(subNode.id);
                return (
                  <div key={subNode.id}>
                    {/* Subcategory */}
                    <button
                      className="w-full text-left pl-5 pr-2 py-1 flex items-center gap-1.5 text-xs text-zinc-400 hover:bg-zinc-800/30 transition-colors"
                      onClick={() => toggleNode(subNode.id)}
                    >
                      {subExpanded ? (
                        <ChevronDown className="w-3 h-3 text-zinc-600" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-zinc-600" />
                      )}
                      <span>{subNode.label}</span>
                      <span className="text-[10px] text-zinc-600 ml-auto">{subNode.mapCount}</span>
                    </button>

                    {subExpanded && subNode.children?.map(mapNode => {
                      const idx = mapNode.mapIndex!;
                      const m = maps[idx];
                      const isSelected = selectedMapIndex === idx;
                      const isModified = modifiedMaps.has(idx);
                      return (
                        <button
                          key={mapNode.id}
                          className={`w-full text-left pl-9 pr-2 py-1 flex items-center gap-1.5 text-xs hover:bg-zinc-800/50 transition-colors
                            ${isSelected ? 'bg-ppei-red/10 border-l-2 border-ppei-red' : 'border-l-2 border-transparent'}
                          `}
                          onClick={() => onSelectMap(idx)}
                        >
                          {mapTypeIcon(m.type)}
                          <span className={`truncate ${isModified ? 'text-yellow-300' : 'text-zinc-300'}`}>
                            {m.name}
                          </span>
                          <span className="text-[9px] ml-auto shrink-0 flex items-center gap-1">
                            <span className={dimBadgeColor(getMapDimensions(m))}>{getMapDimensions(m)}</span>
                            {m.unit && <span className="text-zinc-600">{m.unit}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
