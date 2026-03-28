/**
 * MapTreeBrowser — Searchable tree for navigating calibration maps
 *
 * Organized by category/subcategory with map count badges.
 * Supports search, expand/collapse, and keyboard navigation.
 */

import { useState, useMemo, useCallback } from 'react';
import { Search, ChevronRight, ChevronDown, Hash, TrendingUp, Grid3X3, Box, FileText } from 'lucide-react';
import { CalibrationMap, MapTreeNode, buildMapTree, searchMaps } from '@/lib/editorEngine';

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

export default function MapTreeBrowser({ maps, selectedMapIndex, onSelectMap, modifiedMaps }: MapTreeBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildMapTree(maps), [maps]);
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return searchMaps(maps, searchQuery);
  }, [maps, searchQuery]);

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

  // Render search results
  if (searchResults) {
    return (
      <div className="flex flex-col h-full">
        {/* Search bar */}
        <div className="p-2 border-b border-zinc-800">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded pl-7 pr-2 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-ppei-red/50"
              placeholder="Search maps..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto">
          {searchResults.map(idx => {
            const m = maps[idx];
            const isSelected = selectedMapIndex === idx;
            const isModified = modifiedMaps.has(idx);
            return (
              <button
                key={idx}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs hover:bg-zinc-800/60 transition-colors
                  ${isSelected ? 'bg-ppei-red/10 border-l-2 border-ppei-red' : 'border-l-2 border-transparent'}
                `}
                onClick={() => onSelectMap(idx)}
              >
                {mapTypeIcon(m.type)}
                <span className={`truncate ${isModified ? 'text-yellow-300' : 'text-zinc-300'}`}>
                  {m.name}
                </span>
                <span className="text-[10px] text-zinc-600 ml-auto shrink-0">{m.type}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Render tree
  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-2 border-b border-zinc-800">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            className="w-full bg-zinc-800/80 border border-zinc-700 rounded pl-7 pr-2 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-ppei-red/50"
            placeholder="Search maps..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
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
