#!/usr/bin/env python3
"""Replace the heavy useMemo rows/pidList computation with a throttled approach."""

import re

filepath = '/home/ubuntu/vop/client/src/components/OBDDatalogViewer.tsx'

with open(filepath, 'r') as f:
    content = f.read()

# The old block to replace (lines 712-767)
old_block = '''  // Build unified row data from readingHistory
  // IMPORTANT: pidList always uses the full pids array during live monitoring
  // to keep channel indices stable. Only imported data uses its own pidList.
  const { rows, pidList } = useMemo(() => {
    // Use imported data if available
    if (importedData) return { rows: importedData.rows, pidList: importedData.pidList };
    // Always use full pids array as pidList to keep indices stable
    const activePids = pids.filter(p => readingHistory.has(p.pid) && (readingHistory.get(p.pid)?.length ?? 0) > 0);
    if (activePids.length === 0) return { rows: [] as DataRow[], pidList: pids };
    // Collect all unique timestamps
    const tsSet = new Set<number>();
    for (const pid of activePids) {
      const readings = readingHistory.get(pid.pid) || [];
      for (const r of readings) tsSet.add(r.timestamp);
    }
    const timestamps = Array.from(tsSet).sort((a, b) => a - b);
    // Build lookup: pid -> timestamp -> value
    const pidValueMaps = new Map<number, Map<number, number>>();
    for (const pid of activePids) {
      const readings = readingHistory.get(pid.pid) || [];
      const map = new Map<number, number>();
      for (const r of readings) map.set(r.timestamp, r.value);
      pidValueMaps.set(pid.pid, map);
    }
    // Build rows with forward-fill for missing values
    const dataRows: DataRow[] = [];
    const lastKnown = new Map<number, number>();
    for (const ts of timestamps) {
      const values: number[] = [];
      for (const pid of activePids) {
        const map = pidValueMaps.get(pid.pid);
        const v = map?.get(ts);
        if (v !== undefined) {
          lastKnown.set(pid.pid, v);
          values.push(v);
        } else {
          values.push(lastKnown.get(pid.pid) ?? 0);
        }
      }
      dataRows.push({ timestamp: ts, values });
    }
    // Use full pids array as pidList for stable indices.
    // Build rows with values for ALL pids (0 for inactive ones).
    const fullRows: DataRow[] = dataRows.map(row => {
      const fullValues: number[] = pids.map(p => {
        const activeIdx = activePids.indexOf(p);
        return activeIdx >= 0 ? row.values[activeIdx] : 0;
      });
      return { timestamp: row.timestamp, values: fullValues };
    });
    return { rows: fullRows, pidList: pids };
  }, [pids, readingHistory, importedData]);'''

new_block = '''  // Build unified row data from readingHistory.
  // Throttled: recompute at most every 250ms to avoid blocking UI on every reading.
  const buildRowsFromHistory = useCallback((rh: Map<number, PIDReading[]>, pidArr: PIDDefinition[]): DataRow[] => {
    const activePids = pidArr.filter(p => rh.has(p.pid) && (rh.get(p.pid)?.length ?? 0) > 0);
    if (activePids.length === 0) return [];
    // Build a quick index of active pid positions (avoids O(n\u00b2) indexOf)
    const activeIdxMap = new Map<PIDDefinition, number>();
    activePids.forEach((p, i) => activeIdxMap.set(p, i));
    const tsSet = new Set<number>();
    for (const pid of activePids) {
      const readings = rh.get(pid.pid) || [];
      for (const r of readings) tsSet.add(r.timestamp);
    }
    const timestamps = Array.from(tsSet).sort((a, b) => a - b);
    const pidValueMaps = new Map<number, Map<number, number>>();
    for (const pid of activePids) {
      const readings = rh.get(pid.pid) || [];
      const map = new Map<number, number>();
      for (const r of readings) map.set(r.timestamp, r.value);
      pidValueMaps.set(pid.pid, map);
    }
    const lastKnown = new Map<number, number>();
    const dataRows: DataRow[] = [];
    for (const ts of timestamps) {
      const values: number[] = [];
      for (const pid of activePids) {
        const map = pidValueMaps.get(pid.pid);
        const v = map?.get(ts);
        if (v !== undefined) { lastKnown.set(pid.pid, v); values.push(v); }
        else values.push(lastKnown.get(pid.pid) ?? 0);
      }
      dataRows.push({ timestamp: ts, values });
    }
    return dataRows.map(row => {
      const fullValues: number[] = pidArr.map(p => {
        const ai = activeIdxMap.get(p);
        return ai !== undefined ? row.values[ai] : 0;
      });
      return { timestamp: row.timestamp, values: fullValues };
    });
  }, []);

  const [computedRows, setComputedRows] = useState<DataRow[]>([]);
  const rowBuildTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRowBuildRef = useRef(0);

  // pidList is always the full pids array for stable channel indices
  const pidList = useMemo(() => importedData ? importedData.pidList : pids, [importedData, pids]);

  // Throttled row builder \u2014 recomputes at most every 250ms during live data
  useEffect(() => {
    if (importedData) {
      setComputedRows(importedData.rows);
      return;
    }
    const now = Date.now();
    const elapsed = now - lastRowBuildRef.current;
    if (elapsed >= 250) {
      lastRowBuildRef.current = now;
      setComputedRows(buildRowsFromHistory(readingHistory, pids));
    } else {
      if (rowBuildTimer.current) clearTimeout(rowBuildTimer.current);
      rowBuildTimer.current = setTimeout(() => {
        lastRowBuildRef.current = Date.now();
        setComputedRows(buildRowsFromHistory(readingHistory, pids));
      }, 250 - elapsed);
    }
    return () => { if (rowBuildTimer.current) clearTimeout(rowBuildTimer.current); };
  }, [readingHistory, pids, importedData, buildRowsFromHistory]);

  const rows = computedRows;'''

# Find by markers instead of exact block match
start_marker = '  // Build unified row data from readingHistory'
end_marker = '  }, [pids, readingHistory, importedData]);'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx >= 0 and end_idx >= 0:
    end_idx += len(end_marker)
    content = content[:start_idx] + new_block + content[end_idx:]
    with open(filepath, 'w') as f:
        f.write(content)
    print(f'SUCCESS: Replaced block from pos {start_idx} to {end_idx}')
else:
    print(f'ERROR: start={start_idx}, end={end_idx}')
