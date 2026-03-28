/**
 * MapTreeBrowser — Intelligent search + category tree for calibration maps
 *
 * Search features:
 * - Instant results as you type (debounced)
 * - Smart ranking: exact > starts-with > contains > address > description > fuzzy
 * - Match type badges (EXACT, NAME, ADDR, DESC, CAT, UNIT, FUZZY)
 * - Highlighted matched text in results
 * - Keyboard navigation (↑↓ arrows, Enter to select, Escape to clear)
 * - Result count with search timing
 * - Shows map type, category, address, unit in results
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Search, ChevronRight, ChevronDown, Hash, TrendingUp, Grid3X3, Box, FileText, X, Zap } from 'lucide-react';
import { CalibrationMap, MapTreeNode, buildMapTree, searchMapsDetailed, SearchResult } from '@/lib/editorEngine';

interface MapTreeBrowserProps {
  maps: CalibrationMap[];
  selectedMapIndex: number | null;
  onSelectMap: (index: number) => void;
  modifiedMaps: Set<number>;
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

  // Sort highlights and merge overlapping ranges
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

export default function MapTreeBrowser({ maps, selectedMapIndex, onSelectMap, modifiedMaps }: MapTreeBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [activeResultIdx, setActiveResultIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  const tree = useMemo(() => buildMapTree(maps), [maps]);

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
    for (const cat of tree) {
      all.add(cat.id);
      for (const sub of cat.children || []) {
        all.add(sub.id);
      }
    }
    setExpandedNodes(all);
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

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

  // ─── Search Results View ───────────────────────────────────────────────────

  if (searchData) {
    const { results, elapsed } = searchData;
    return (
      <div className="flex flex-col h-full">
        {/* Search bar */}
        <div className="p-2 border-b border-zinc-800">
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
                  <HighlightedName
                    name={m.name}
                    highlights={result.highlights}
                    className={`text-xs truncate flex-1 ${isModified ? 'text-yellow-300' : 'text-zinc-200'}`}
                  />
                  <span className={`text-[9px] px-1 py-0.5 rounded border shrink-0 font-mono ${matchColor}`}>
                    {matchLabel}
                  </span>
                </div>

                {/* Bottom row: metadata */}
                <div className="flex items-center gap-2 pl-4.5 text-[10px] text-zinc-600">
                  <span className="font-mono">0x{m.address.toString(16).toUpperCase()}</span>
                  <span className="text-zinc-700">·</span>
                  <span>{m.type}</span>
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

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-2 border-b border-zinc-800">
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
        <div className="flex items-center gap-2 mt-1.5">
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

      {/* Tree */}
      <div className="flex-1 overflow-y-auto">
        {tree.map(catNode => {
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
                          {m.unit && (
                            <span className="text-[9px] text-zinc-600 ml-auto shrink-0">{m.unit}</span>
                          )}
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
