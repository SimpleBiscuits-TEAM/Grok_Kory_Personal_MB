/**
 * BinaryUploadPanel — ECU Binary (.bin) file analyzer
 * Parses GM ECU calibration files to extract part numbers, calibration IDs,
 * OS IDs, VIN, module names with hex offsets. Includes hex dump viewer.
 */

import { useState, useCallback, useRef } from 'react';
import { Upload, FileDown, AlertCircle, CheckCircle, Loader2, Copy, ChevronDown, ChevronRight, Search, ArrowRightLeft, Download, X } from 'lucide-react';
import { parseEcuBinary, decodeVinNhtsa, lookupPartNumber, BinaryAnalysis, BinaryFinding, HexRegion, NhtsaVehicleInfo } from '@/lib/binaryParser';
import { setupBinaryPair, executeSegmentSwap, downloadModifiedBinary, BinaryPair, SegmentInfo } from '@/lib/binaryWriter';

const sFont = { heading: '"Bebas Neue", "Impact", sans-serif', body: '"Rajdhani", sans-serif', mono: '"Share Tech Mono", monospace' };
const sColor = {
  bg: 'oklch(0.10 0.005 260)', bgCard: 'oklch(0.13 0.006 260)',
  border: 'oklch(0.22 0.008 260)', borderLight: 'oklch(0.18 0.006 260)',
  red: 'oklch(0.52 0.22 25)', green: 'oklch(0.65 0.20 145)', blue: 'oklch(0.55 0.15 250)',
  yellow: 'oklch(0.75 0.18 60)', text: 'oklch(0.95 0.005 260)', textDim: 'oklch(0.68 0.010 260)',
  textMuted: 'oklch(0.58 0.008 260)',
};

const CATEGORY_COLORS: Record<string, string> = {
  part_number: sColor.red,
  calibration: sColor.green,
  module: sColor.blue,
  vin: sColor.yellow,
  flash_block: 'oklch(0.50 0.12 300)',
  metadata: 'oklch(0.68 0.10 200)',
  string: sColor.textDim,
  segment: 'oklch(0.60 0.18 180)',
  ppei: 'oklch(0.58 0.16 50)',
  signature: 'oklch(0.50 0.14 280)',
};

const CATEGORY_LABELS: Record<string, string> = {
  part_number: 'PART NUMBER',
  calibration: 'CALIBRATION',
  module: 'MODULE',
  vin: 'VIN',
  flash_block: 'FLASH BLOCK',
  metadata: 'METADATA',
  string: 'STRING',
  segment: 'SEGMENT',
  ppei: 'PPEI',
  signature: 'SIGNATURE',
};

// ── Hex Dump Viewer ────────────────────────────────────────────────────────

function HexDumpViewer({ region }: { region: HexRegion }) {
  const [expanded, setExpanded] = useState(false);

  const lines: string[] = [];
  for (let i = 0; i < region.bytes.length; i += 16) {
    const offset = region.offset + i;
    const hex: string[] = [];
    const ascii: string[] = [];
    for (let j = 0; j < 16 && i + j < region.bytes.length; j++) {
      const b = region.bytes[i + j];
      hex.push(b.toString(16).toUpperCase().padStart(2, '0'));
      ascii.push(b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : '.');
    }
    lines.push(`${('0x' + offset.toString(16).toUpperCase().padStart(6, '0'))}  ${hex.join(' ').padEnd(48)}  ${ascii.join('')}`);
  }

  return (
    <div style={{ marginBottom: '8px' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px', width: '100%', textAlign: 'left',
          padding: '6px 10px', background: 'oklch(0.11 0.005 260)', border: `1px solid ${sColor.borderLight}`,
          color: sColor.text, fontFamily: sFont.mono, fontSize: '0.75rem', cursor: 'pointer',
        }}
      >
        {expanded ? <ChevronDown style={{ width: 14, height: 14, flexShrink: 0 }} /> : <ChevronRight style={{ width: 14, height: 14, flexShrink: 0 }} />}
        <span style={{ color: sColor.blue }}>{region.offsetHex}</span>
        <span style={{ color: sColor.textDim }}>|</span>
        <span>{region.label}</span>
        <span style={{ color: sColor.textMuted, marginLeft: 'auto' }}>{region.bytes.length} bytes</span>
      </button>
      {expanded && (
        <pre style={{
          margin: 0, padding: '10px', background: 'oklch(0.08 0.004 260)',
          border: `1px solid ${sColor.borderLight}`, borderTop: 'none',
          fontFamily: sFont.mono, fontSize: '0.7rem', lineHeight: '1.6',
          color: sColor.text, overflowX: 'auto', whiteSpace: 'pre',
        }}>
          {lines.map((line, idx) => (
            <div key={idx}>
              <span style={{ color: sColor.blue }}>{line.slice(0, 10)}</span>
              <span style={{ color: sColor.textDim }}>{line.slice(10, 58)}</span>
              <span style={{ color: sColor.yellow }}>{line.slice(58)}</span>
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

// ── Finding Row ────────────────────────────────────────────────────────────

function FindingRow({ finding, index }: { finding: BinaryFinding; index: number }) {
  const [showHex, setShowHex] = useState(false);
  const catColor = CATEGORY_COLORS[finding.category] || sColor.textDim;
  const catLabel = CATEGORY_LABELS[finding.category] || finding.category.toUpperCase();

  return (
    <div style={{
      background: index % 2 === 0 ? 'oklch(0.11 0.005 260)' : 'oklch(0.12 0.006 260)',
      borderLeft: `3px solid ${catColor}`,
      padding: '10px 14px', marginBottom: '2px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        {/* Category badge */}
        <span style={{
          fontFamily: sFont.mono, fontSize: '0.6rem', letterSpacing: '0.08em',
          background: `${catColor}22`, color: catColor, border: `1px solid ${catColor}44`,
          padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {catLabel}
        </span>

        {/* Offset */}
        <span style={{
          fontFamily: sFont.mono, fontSize: '0.78rem', color: sColor.blue,
          minWidth: '80px', flexShrink: 0,
        }}>
          {finding.offset}
        </span>

        {/* Label + Value */}
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, marginBottom: '2px' }}>
            {finding.label}
          </div>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.85rem', color: 'white', wordBreak: 'break-all' }}>
            {finding.value}
          </div>
          {finding.description && (
            <div style={{ fontFamily: sFont.body, fontSize: '0.72rem', color: sColor.textMuted, marginTop: '2px' }}>
              {finding.description}
            </div>
          )}
        </div>

        {/* Hex dump toggle */}
        {finding.hexDump && (
          <button
            onClick={() => setShowHex(!showHex)}
            style={{
              fontFamily: sFont.mono, fontSize: '0.65rem', padding: '2px 8px',
              background: showHex ? 'oklch(0.16 0.008 260)' : 'transparent',
              border: `1px solid ${sColor.borderLight}`, color: sColor.textDim,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {showHex ? 'HIDE HEX' : 'SHOW HEX'}
          </button>
        )}
      </div>

      {/* Inline hex dump */}
      {showHex && finding.hexDump && (
        <pre style={{
          margin: '8px 0 0', padding: '8px', background: 'oklch(0.08 0.004 260)',
          border: `1px solid ${sColor.borderLight}`, fontFamily: sFont.mono,
          fontSize: '0.68rem', lineHeight: '1.5', color: sColor.textDim,
          overflowX: 'auto', whiteSpace: 'pre',
        }}>
          {finding.hexDump}
        </pre>
      )}
    </div>
  );
}

// ── Vehicle Info Card ──────────────────────────────────────────────────────

function VehicleInfoCard({ info }: { info: NhtsaVehicleInfo }) {
  const fields = [
    { label: 'Make', value: info.make },
    { label: 'Model', value: info.model },
    { label: 'Year', value: info.year },
    { label: 'Engine', value: info.engine },
    { label: 'Displacement', value: info.displacement },
    { label: 'Fuel Type', value: info.fuelType },
    { label: 'Transmission', value: info.transmission },
    { label: 'Drive Type', value: info.driveType },
    { label: 'Body Class', value: info.bodyClass },
    { label: 'Plant', value: [info.plantCity, info.plantCountry].filter(Boolean).join(', ') },
    { label: 'GVWR', value: info.gvwr },
  ].filter(f => f.value);

  return (
    <div style={{
      background: 'oklch(0.12 0.006 260)', border: `1px solid ${sColor.border}`,
      borderLeft: `3px solid ${sColor.green}`, padding: '16px', marginBottom: '16px',
    }}>
      <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.08em', color: 'white', marginBottom: '12px' }}>
        VEHICLE IDENTIFICATION
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
        {fields.map(f => (
          <div key={f.label} style={{ padding: '6px 10px', background: 'oklch(0.10 0.005 260)', border: `1px solid ${sColor.borderLight}` }}>
            <div style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {f.label}
            </div>
            <div style={{ fontFamily: sFont.mono, fontSize: '0.85rem', color: 'white' }}>
              {f.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Calibration ID Card ────────────────────────────────────────────────────

function CalibrationCard({ analysis }: { analysis: BinaryAnalysis }) {
  if (!analysis.calibrationId) return null;
  const cal = analysis.calibrationId;

  return (
    <div style={{
      background: 'oklch(0.12 0.006 260)', border: `1px solid ${sColor.border}`,
      borderLeft: `3px solid ${sColor.green}`, padding: '16px', marginBottom: '16px',
    }}>
      <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.08em', color: 'white', marginBottom: '12px' }}>
        CALIBRATION IDENTIFICATION
      </h3>
      <div style={{ fontFamily: sFont.mono, fontSize: '1.1rem', color: sColor.green, marginBottom: '12px', wordBreak: 'break-all' }}>
        {cal.raw}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
        {[
          { label: 'PREFIX', value: cal.prefix },
          { label: 'PLATFORM', value: cal.platform },
          { label: 'SOFTWARE #', value: cal.softwareNumber },
          { label: 'VARIANT', value: cal.variant },
        ].filter(f => f.value).map(f => (
          <div key={f.label} style={{ padding: '6px 10px', background: 'oklch(0.10 0.005 260)', border: `1px solid ${sColor.borderLight}` }}>
            <div style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textMuted, letterSpacing: '0.06em' }}>{f.label}</div>
            <div style={{ fontFamily: sFont.mono, fontSize: '0.9rem', color: 'white' }}>{f.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Part Number Card ───────────────────────────────────────────────────────

function PartNumberCard({ partNumbers }: { partNumbers: string[] }) {
  if (partNumbers.length === 0) return null;

  return (
    <div style={{
      background: 'oklch(0.12 0.006 260)', border: `1px solid ${sColor.border}`,
      borderLeft: `3px solid ${sColor.red}`, padding: '16px', marginBottom: '16px',
    }}>
      <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.08em', color: 'white', marginBottom: '12px' }}>
        GM PART NUMBERS ({partNumbers.length})
      </h3>
      {partNumbers.map(pn => {
        const info = lookupPartNumber(pn);
        return (
          <div key={pn} style={{
            padding: '10px 12px', background: 'oklch(0.10 0.005 260)',
            border: `1px solid ${sColor.borderLight}`, marginBottom: '6px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: sFont.mono, fontSize: '1.1rem', color: sColor.red, fontWeight: 'bold' }}>
                {pn}
              </span>
              {info && (
                <span style={{
                  fontFamily: sFont.mono, fontSize: '0.6rem', background: `${sColor.green}22`,
                  color: sColor.green, border: `1px solid ${sColor.green}44`, padding: '1px 6px',
                }}>
                  KNOWN
                </span>
              )}
              {!info && (
                <span style={{
                  fontFamily: sFont.mono, fontSize: '0.6rem', background: `${sColor.yellow}22`,
                  color: sColor.yellow, border: `1px solid ${sColor.yellow}44`, padding: '1px 6px',
                }}>
                  UNVERIFIED
                </span>
              )}
            </div>
            {info && (
              <div style={{ marginTop: '6px' }}>
                <div style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.text }}>{info.description}</div>
                <div style={{ fontFamily: sFont.body, fontSize: '0.72rem', color: sColor.textDim }}>{info.application}</div>
                {info.notes && <div style={{ fontFamily: sFont.body, fontSize: '0.68rem', color: sColor.textMuted, marginTop: '2px' }}>{info.notes}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Module Names Card ──────────────────────────────────────────────────────

function ModuleNamesCard({ modules }: { modules: string[] }) {
  if (modules.length === 0) return null;

  return (
    <div style={{
      background: 'oklch(0.12 0.006 260)', border: `1px solid ${sColor.border}`,
      borderLeft: `3px solid ${sColor.blue}`, padding: '16px', marginBottom: '16px',
    }}>
      <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.08em', color: 'white', marginBottom: '12px' }}>
        ECU MODULE TABLE ({modules.length})
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '4px' }}>
        {modules.map(m => {
          const [code, desc] = m.split('-');
          return (
            <div key={m} style={{
              padding: '6px 10px', background: 'oklch(0.10 0.005 260)',
              border: `1px solid ${sColor.borderLight}`, display: 'flex', gap: '8px', alignItems: 'center',
            }}>
              <span style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.blue, fontWeight: 'bold', minWidth: '40px' }}>
                {code}
              </span>
              <span style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.textDim }}>
                {desc}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Panel ─────────────────────────────────────────────────────────────

export default function BinaryUploadPanel() {
  const [analysis, setAnalysis] = useState<BinaryAnalysis | null>(null);
  const [vehicleInfo, setVehicleInfo] = useState<NhtsaVehicleInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [vinLoading, setVinLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showAllFindings, setShowAllFindings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Segment swap state
  const [swapMode, setSwapMode] = useState(false);
  const [targetBinData, setTargetBinData] = useState<Uint8Array | null>(null);
  const [targetFileName, setTargetFileName] = useState('');
  const [sourceBinData, setSourceBinData] = useState<Uint8Array | null>(null);
  const [sourceFileName, setSourceFileName] = useState('');
  const [sourceAnalysis, setSourceAnalysis] = useState<BinaryAnalysis | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [binaryPair, setBinaryPair] = useState<BinaryPair | null>(null);
  const [selectedSegments, setSelectedSegments] = useState<Set<number>>(new Set());
  const [swapResult, setSwapResult] = useState<string | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const [sourceIsDragOver, setSourceIsDragOver] = useState(false);

  const processFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setVehicleInfo(null);
    // Reset swap state
    setSwapMode(false);
    setBinaryPair(null);
    setSourceAnalysis(null);
    setSourceBinData(null);
    setSelectedSegments(new Set());
    setSwapResult(null);
    setSwapError(null);

    try {
      const buffer = await file.arrayBuffer();
      const result = parseEcuBinary(buffer, file.name);
      setAnalysis(result);
      // Store raw binary for segment swap
      setTargetBinData(new Uint8Array(buffer));
      setTargetFileName(file.name);

      // Auto-decode VIN if found
      if (result.vinFound) {
        setVinLoading(true);
        const info = await decodeVinNhtsa(result.vinFound);
        if (info) setVehicleInfo(info);
        setVinLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse binary file');
    } finally {
      setLoading(false);
    }
  }, []);

  // Source file handler for segment swap
  const processSourceFile = useCallback(async (file: File) => {
    if (!analysis || !targetBinData) return;
    setSourceLoading(true);
    setSwapError(null);
    setSwapResult(null);
    setSelectedSegments(new Set());

    try {
      const buffer = await file.arrayBuffer();
      const srcData = new Uint8Array(buffer);
      const srcAnalysis = parseEcuBinary(buffer, file.name);
      setSourceBinData(srcData);
      setSourceFileName(file.name);
      setSourceAnalysis(srcAnalysis);

      // Build the binary pair
      const pair = setupBinaryPair(
        targetBinData, targetFileName, analysis,
        srcData, file.name, srcAnalysis
      );
      setBinaryPair(pair);

      if (!pair.osMatch) {
        setSwapError(`OS mismatch: Target has OS ${pair.target.osPN}, Source has OS ${pair.source.osPN}. Segment swap requires matching OS.`);
      }
    } catch (err) {
      setSwapError(err instanceof Error ? err.message : 'Failed to parse source binary');
    } finally {
      setSourceLoading(false);
    }
  }, [analysis, targetBinData, targetFileName]);

  const handleSourceUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processSourceFile(file);
  }, [processSourceFile]);

  const handleSourceDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setSourceIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const ext = file.name.toLowerCase().split('.').pop();
    if (!['bin', 'hex', 'ori'].includes(ext || '')) {
      setSwapError('Unsupported file type. Please upload a .bin, .hex, or .ori file.');
      return;
    }
    processSourceFile(file);
  }, [processSourceFile]);

  const toggleSegment = useCallback((idx: number) => {
    setSelectedSegments(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const executeSwap = useCallback(() => {
    if (!binaryPair || selectedSegments.size === 0) return;
    setSwapError(null);
    setSwapResult(null);

    const result = executeSegmentSwap(binaryPair, Array.from(selectedSegments));
    if (result.success && result.modifiedData) {
      downloadModifiedBinary(result.modifiedData, targetFileName, result.swappedSegments);
      const summary = result.swappedSegments
        .map(s => `Seg ${s.index} (${s.label}): ${s.targetPN} → ${s.sourcePN} [${(s.bytesWritten / 1024).toFixed(1)} KB]`)
        .join('\n');
      setSwapResult(`Swap complete. ${result.swappedSegments.length} segment(s) written:\n${summary}`);
      if (result.warnings.length > 0) {
        setSwapResult(prev => prev + '\n\nNotes: ' + result.warnings.join('; '));
      }
    } else {
      setSwapError(result.error || 'Swap failed — hex verification did not pass.');
    }
  }, [binaryPair, selectedSegments, targetFileName]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  }, [processFile]);

  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    // Validate extension
    const ext = file.name.toLowerCase().split('.').pop();
    if (!['bin', 'hex', 'ori'].includes(ext || '')) {
      setError('Unsupported file type. Please upload a .bin, .hex, or .ori file.');
      return;
    }
    processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const filteredFindings = analysis?.findings.filter(f =>
    filterCategory === 'all' || f.category === filterCategory
  ) || [];

  const displayFindings = showAllFindings ? filteredFindings : filteredFindings.slice(0, 50);

  const categories = analysis ? Array.from(new Set(analysis.findings.map(f => f.category))) : [];

  return (
    <div>
      {/* Upload Area */}
      {!analysis && (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          style={{
            border: `2px dashed ${isDragOver ? sColor.red : sColor.border}`,
            padding: '4rem 2rem', textAlign: 'center',
            cursor: 'pointer', transition: 'all 0.2s',
            background: isDragOver ? 'oklch(0.14 0.010 25)' : 'oklch(0.11 0.005 260)',
          }}
          onMouseEnter={(e) => { if (!isDragOver) { e.currentTarget.style.borderColor = sColor.red; e.currentTarget.style.background = 'oklch(0.13 0.006 260)'; } }}
          onMouseLeave={(e) => { if (!isDragOver) { e.currentTarget.style.borderColor = sColor.border; e.currentTarget.style.background = 'oklch(0.11 0.005 260)'; } }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".bin,.BIN,.hex,.HEX,.ori,.ORI,*"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          {loading ? (
            <Loader2 style={{ width: 48, height: 48, color: sColor.red, margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
          ) : (
            <Upload style={{ width: 48, height: 48, color: sColor.red, margin: '0 auto 16px' }} />
          )}
          <h3 style={{ fontFamily: sFont.heading, fontSize: '1.5rem', letterSpacing: '0.1em', color: 'white', marginBottom: '8px' }}>
            {loading ? 'ANALYZING BINARY...' : 'UPLOAD ECU BINARY'}
          </h3>
          <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim }}>
            Drop a .bin calibration file to extract part numbers, calibration IDs, VIN, and module data
          </p>
          <p style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textMuted, marginTop: '8px' }}>
            Supports: .bin .hex .ori — WinOLS, EFILive, PPEI container formats (E41, E46, E90, E88, E92)
          </p>
        </div>
      )}

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px',
          background: `${sColor.red}1a`, border: `1px solid ${sColor.red}4d`, marginTop: '12px',
        }}>
          <AlertCircle style={{ width: 18, height: 18, color: sColor.red, flexShrink: 0 }} />
          <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.red }}>{error}</span>
        </div>
      )}

      {/* Results */}
      {analysis && (
        <div>
          {/* File Summary Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
            padding: '12px 16px', background: 'oklch(0.12 0.006 260)', border: `1px solid ${sColor.border}`,
            borderTop: `3px solid ${sColor.red}`, marginBottom: '16px',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle style={{ width: 18, height: 18, color: sColor.green }} />
                <span style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.08em', color: 'white' }}>
                  {analysis.fileName}
                </span>
              </div>
              <div style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.textDim, marginTop: '4px' }}>
                {analysis.fileSize > 1024 * 1024 ? `${(analysis.fileSize / 1024 / 1024).toFixed(2)} MB` : `${(analysis.fileSize / 1024).toFixed(1)} KB`} · {analysis.findings.length} findings · {analysis.partNumbers.length} part numbers · {analysis.moduleNames.length} modules
                {analysis.ecuPlatform && <> · Platform: <span style={{ color: sColor.green }}>{analysis.ecuPlatform}</span></>}
                {analysis.segments.length > 0 && <> · {analysis.segments.length} segments</>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setSwapMode(!swapMode)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 12px',
                  background: swapMode ? `${sColor.red}22` : 'oklch(0.16 0.008 260)',
                  border: `1px solid ${swapMode ? sColor.red : sColor.borderLight}`,
                  color: swapMode ? sColor.red : sColor.textDim,
                  fontFamily: sFont.heading, fontSize: '0.8rem', letterSpacing: '0.06em', cursor: 'pointer',
                }}
              >
                <ArrowRightLeft style={{ width: 14, height: 14 }} />
                {swapMode ? 'CLOSE SWAP' : 'SEGMENT SWAP'}
              </button>
              <button
                onClick={() => { setAnalysis(null); setVehicleInfo(null); setSwapMode(false); setBinaryPair(null); setSourceAnalysis(null); fileInputRef.current && (fileInputRef.current.value = ''); }}
                style={{
                  padding: '6px 12px', background: 'oklch(0.16 0.008 260)',
                  border: `1px solid ${sColor.borderLight}`, color: sColor.textDim,
                  fontFamily: sFont.heading, fontSize: '0.8rem', letterSpacing: '0.06em', cursor: 'pointer',
                }}
              >
                UPLOAD NEW
              </button>
            </div>
          </div>

          {/* Format Detection Card */}
          <div style={{
            background: 'oklch(0.12 0.006 260)', border: `1px solid ${sColor.border}`,
            borderLeft: '3px solid oklch(0.55 0.10 200)', padding: '16px', marginBottom: '16px',
          }}>
            <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.08em', color: 'white', marginBottom: '8px' }}>
              FORMAT: {analysis.fileFormat.replace(/_/g, ' ').toUpperCase()}
            </h3>
            <div style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim }}>
              {analysis.formatDescription}
            </div>
            {analysis.platformFromFilename && (
              <div style={{ fontFamily: sFont.mono, fontSize: '0.78rem', color: sColor.green, marginTop: '6px' }}>
                Platform from filename: {analysis.platformFromFilename}
              </div>
            )}
          </div>

          {/* PPEI Metadata Card */}
          {analysis.ppeiMetadata && (
            <div style={{
              background: 'oklch(0.12 0.006 260)', border: `1px solid ${sColor.border}`,
              borderLeft: '3px solid oklch(0.58 0.16 50)', padding: '16px', marginBottom: '16px',
            }}>
              <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.08em', color: 'white', marginBottom: '12px' }}>
                PPEI FLASH DESCRIPTOR
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                {analysis.ppeiMetadata.author && (
                  <div style={{ padding: '6px 10px', background: 'oklch(0.10 0.005 260)', border: `1px solid ${sColor.borderLight}` }}>
                    <div style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textMuted, letterSpacing: '0.06em' }}>AUTHOR</div>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.9rem', color: 'white' }}>{analysis.ppeiMetadata.author}</div>
                  </div>
                )}
                {analysis.ppeiMetadata.tuner && (
                  <div style={{ padding: '6px 10px', background: 'oklch(0.10 0.005 260)', border: `1px solid ${sColor.borderLight}` }}>
                    <div style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textMuted, letterSpacing: '0.06em' }}>TUNER</div>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.9rem', color: 'white' }}>{analysis.ppeiMetadata.tuner}</div>
                  </div>
                )}
                {analysis.ppeiMetadata.version && (
                  <div style={{ padding: '6px 10px', background: 'oklch(0.10 0.005 260)', border: `1px solid ${sColor.borderLight}` }}>
                    <div style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textMuted, letterSpacing: '0.06em' }}>VERSION</div>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.9rem', color: 'white' }}>{analysis.ppeiMetadata.version}</div>
                  </div>
                )}
                {analysis.ppeiMetadata.canAddress && (
                  <div style={{ padding: '6px 10px', background: 'oklch(0.10 0.005 260)', border: `1px solid ${sColor.borderLight}` }}>
                    <div style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textMuted, letterSpacing: '0.06em' }}>CAN ADDRESS</div>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.9rem', color: 'white' }}>{analysis.ppeiMetadata.canAddress}</div>
                  </div>
                )}
              </div>
              {analysis.ppeiMetadata.softwareParts.length > 0 && (
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textMuted, marginBottom: '6px', letterSpacing: '0.06em' }}>SOFTWARE CALIBRATIONS</div>
                  {analysis.ppeiMetadata.softwareParts.map(sp => (
                    <div key={sp.key} style={{
                      display: 'flex', gap: '12px', alignItems: 'center', padding: '4px 10px',
                      background: 'oklch(0.10 0.005 260)', border: `1px solid ${sColor.borderLight}`, marginBottom: '2px',
                    }}>
                      <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textMuted, minWidth: '40px' }}>{sp.key}</span>
                      <span style={{ fontFamily: sFont.mono, fontSize: '0.85rem', color: sColor.red, fontWeight: 'bold' }}>{sp.partNumber}</span>
                      {sp.function && <span style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.textDim }}>{sp.function}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Segment Map Card */}
          {analysis.segments.length > 0 && (
            <div style={{
              background: 'oklch(0.12 0.006 260)', border: `1px solid ${sColor.border}`,
              borderLeft: '3px solid oklch(0.60 0.18 180)', padding: '16px', marginBottom: '16px',
            }}>
              <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.08em', color: 'white', marginBottom: '12px' }}>
                FLASH SEGMENT MAP ({analysis.segments.length})
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: sFont.mono, fontSize: '0.75rem' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${sColor.border}` }}>
                      {['SEG', 'PART NUMBER', 'FUNCTION', 'BIN OFFSET', 'CHIP ADDR', 'SIZE', 'CVN'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: sColor.textMuted, fontWeight: 'normal', fontSize: '0.65rem', letterSpacing: '0.06em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.segments.map(seg => (
                      <tr key={seg.index} style={{ borderBottom: `1px solid ${sColor.borderLight}` }}>
                        <td style={{ padding: '6px 8px', color: sColor.textDim }}>{String(seg.index).padStart(2, '0')}</td>
                        <td style={{ padding: '6px 8px', color: sColor.red, fontWeight: 'bold' }}>{seg.partNumber}</td>
                        <td style={{ padding: '6px 8px', color: sColor.text, fontFamily: sFont.body }}>{seg.function}</td>
                        <td style={{ padding: '6px 8px', color: sColor.blue }}>{seg.binOffsetHex}</td>
                        <td style={{ padding: '6px 8px', color: sColor.blue }}>{seg.chipAddressHex}</td>
                        <td style={{ padding: '6px 8px', color: sColor.textDim }}>{seg.length > 1024 * 1024 ? `${(seg.length / 1024 / 1024).toFixed(2)} MB` : `${(seg.length / 1024).toFixed(1)} KB`}</td>
                        <td style={{ padding: '6px 8px', color: seg.cvn ? sColor.green : sColor.textMuted }}>{seg.cvn || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── SEGMENT SWAP PANEL ── */}
          {swapMode && (
            <div style={{
              background: 'oklch(0.11 0.008 25)', border: `2px solid ${sColor.red}`,
              padding: '20px', marginBottom: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontFamily: sFont.heading, fontSize: '1.3rem', letterSpacing: '0.1em', color: sColor.red }}>
                  <ArrowRightLeft style={{ width: 20, height: 20, display: 'inline', verticalAlign: 'middle', marginRight: '8px' }} />
                  SEGMENT SWAP
                </h3>
                <button
                  onClick={() => { setSwapMode(false); setBinaryPair(null); setSourceAnalysis(null); setSourceBinData(null); setSelectedSegments(new Set()); setSwapResult(null); setSwapError(null); }}
                  style={{ background: 'none', border: 'none', color: sColor.textDim, cursor: 'pointer' }}
                >
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </div>

              {/* Target info */}
              <div style={{
                padding: '10px 14px', background: 'oklch(0.13 0.006 260)', border: `1px solid ${sColor.border}`,
                marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px',
              }}>
                <div style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textMuted, letterSpacing: '0.06em' }}>TARGET</div>
                <div style={{ fontFamily: sFont.mono, fontSize: '0.85rem', color: 'white' }}>{targetFileName}</div>
                <div style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.green }}>
                  OS: {analysis.partNumbers[0] || 'Unknown'} · {analysis.segments.length} segments
                </div>
              </div>

              {/* Source upload */}
              {!sourceAnalysis ? (
                <div
                  onClick={() => sourceInputRef.current?.click()}
                  onDrop={handleSourceDrop}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setSourceIsDragOver(true); }}
                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setSourceIsDragOver(false); }}
                  style={{
                    border: `2px dashed ${sourceIsDragOver ? sColor.red : sColor.border}`,
                    background: sourceIsDragOver ? `${sColor.red}0d` : 'oklch(0.09 0.004 260)',
                    padding: '24px', textAlign: 'center', cursor: 'pointer', marginBottom: '16px',
                    transition: 'all 0.2s',
                  }}
                >
                  <input
                    ref={sourceInputRef}
                    type="file"
                    accept=".bin,.BIN,.hex,.HEX,.ori,.ORI,*"
                    onChange={handleSourceUpload}
                    style={{ display: 'none' }}
                  />
                  {sourceLoading ? (
                    <Loader2 style={{ width: 32, height: 32, color: sColor.red, margin: '0 auto 8px', animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <Upload style={{ width: 32, height: 32, color: sColor.textDim, margin: '0 auto 8px' }} />
                  )}
                  <div style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.08em', color: 'white', marginBottom: '4px' }}>
                    {sourceLoading ? 'ANALYZING SOURCE...' : 'UPLOAD SOURCE BIN'}
                  </div>
                  <div style={{ fontFamily: sFont.body, fontSize: '0.78rem', color: sColor.textDim }}>
                    Drop the binary that contains the segments you want to swap in
                  </div>
                </div>
              ) : (
                <>
                  {/* Source info */}
                  <div style={{
                    padding: '10px 14px', background: 'oklch(0.13 0.006 260)', border: `1px solid ${sColor.border}`,
                    marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                  }}>
                    <div style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textMuted, letterSpacing: '0.06em' }}>SOURCE</div>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.85rem', color: 'white' }}>{sourceFileName}</div>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.green }}>
                      OS: {sourceAnalysis.partNumbers[0] || 'Unknown'} · {sourceAnalysis.segments.length} segments
                    </div>
                    <button
                      onClick={() => { setSourceAnalysis(null); setSourceBinData(null); setBinaryPair(null); setSelectedSegments(new Set()); setSwapResult(null); setSwapError(null); sourceInputRef.current && (sourceInputRef.current.value = ''); }}
                      style={{ marginLeft: 'auto', padding: '3px 10px', fontFamily: sFont.mono, fontSize: '0.7rem', background: 'oklch(0.16 0.008 260)', border: `1px solid ${sColor.borderLight}`, color: sColor.textDim, cursor: 'pointer' }}
                    >
                      CHANGE SOURCE
                    </button>
                  </div>

                  {/* OS Match indicator */}
                  {binaryPair && (
                    <div style={{
                      padding: '8px 14px', marginBottom: '12px',
                      background: binaryPair.osMatch ? `${sColor.green}0d` : `${sColor.red}1a`,
                      border: `1px solid ${binaryPair.osMatch ? sColor.green + '33' : sColor.red + '4d'}`,
                      display: 'flex', alignItems: 'center', gap: '8px',
                    }}>
                      {binaryPair.osMatch ? (
                        <CheckCircle style={{ width: 16, height: 16, color: sColor.green }} />
                      ) : (
                        <AlertCircle style={{ width: 16, height: 16, color: sColor.red }} />
                      )}
                      <span style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: binaryPair.osMatch ? sColor.green : sColor.red }}>
                        {binaryPair.osMatch
                          ? `OS match confirmed: ${binaryPair.target.osPN}`
                          : `OS mismatch: Target ${binaryPair.target.osPN} ≠ Source ${binaryPair.source.osPN}`}
                      </span>
                    </div>
                  )}

                  {/* Segment comparison table */}
                  {binaryPair && binaryPair.matchedSegments.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textMuted, letterSpacing: '0.06em', marginBottom: '8px' }}>
                        SELECT SEGMENTS TO SWAP (click to toggle)
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: sFont.mono, fontSize: '0.75rem' }}>
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${sColor.border}` }}>
                              {['', 'SEG', 'TARGET PN', 'SOURCE PN', 'FUNCTION', 'SIZE', 'STATUS'].map(h => (
                                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: sColor.textMuted, fontWeight: 'normal', fontSize: '0.65rem', letterSpacing: '0.06em' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {binaryPair.matchedSegments.map(({ source: src, target: tgt }) => {
                              const isSelected = selectedSegments.has(tgt.index);
                              const isSamePN = src.partNumber === tgt.partNumber;
                              const isOsSeg = tgt.label.toLowerCase().includes('operating system') || tgt.label.toLowerCase().includes('os segment');
                              return (
                                <tr
                                  key={tgt.index}
                                  onClick={() => !isOsSeg && toggleSegment(tgt.index)}
                                  style={{
                                    borderBottom: `1px solid ${sColor.borderLight}`,
                                    background: isSelected ? `${sColor.red}15` : 'transparent',
                                    cursor: isOsSeg ? 'not-allowed' : 'pointer',
                                    opacity: isOsSeg ? 0.4 : 1,
                                  }}
                                >
                                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      disabled={isOsSeg}
                                      onChange={() => {}}
                                      style={{ accentColor: sColor.red, cursor: isOsSeg ? 'not-allowed' : 'pointer' }}
                                    />
                                  </td>
                                  <td style={{ padding: '6px 8px', color: sColor.textDim }}>{String(tgt.index).padStart(2, '0')}</td>
                                  <td style={{ padding: '6px 8px', color: sColor.red, fontWeight: 'bold' }}>{tgt.partNumber}</td>
                                  <td style={{ padding: '6px 8px', color: sColor.green, fontWeight: 'bold' }}>{src.partNumber}</td>
                                  <td style={{ padding: '6px 8px', color: sColor.text, fontFamily: sFont.body }}>{tgt.label}</td>
                                  <td style={{ padding: '6px 8px', color: sColor.textDim }}>
                                    {tgt.totalSize > 1024 * 1024 ? `${(tgt.totalSize / 1024 / 1024).toFixed(2)} MB` : `${(tgt.totalSize / 1024).toFixed(1)} KB`}
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    {isOsSeg ? (
                                      <span style={{ color: sColor.textMuted, fontSize: '0.7rem' }}>OS — not swappable</span>
                                    ) : isSamePN ? (
                                      <span style={{ color: sColor.textMuted, fontSize: '0.7rem' }}>Same PN</span>
                                    ) : (
                                      <span style={{ color: sColor.yellow, fontSize: '0.7rem' }}>Different</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Execute swap button */}
                  {selectedSegments.size > 0 && (
                    <button
                      onClick={executeSwap}
                      style={{
                        width: '100%', padding: '12px', marginBottom: '12px',
                        background: sColor.red, border: 'none', color: 'white',
                        fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.1em',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      }}
                    >
                      <Download style={{ width: 18, height: 18 }} />
                      SWAP {selectedSegments.size} SEGMENT{selectedSegments.size > 1 ? 'S' : ''} & DOWNLOAD
                    </button>
                  )}

                  {/* Swap result */}
                  {swapResult && (
                    <div style={{
                      padding: '12px 16px', background: `${sColor.green}0d`, border: `1px solid ${sColor.green}33`,
                      marginBottom: '12px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <CheckCircle style={{ width: 18, height: 18, color: sColor.green, flexShrink: 0, marginTop: '2px' }} />
                        <pre style={{ fontFamily: sFont.mono, fontSize: '0.78rem', color: sColor.green, whiteSpace: 'pre-wrap', margin: 0 }}>
                          {swapResult}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Swap error */}
                  {swapError && (
                    <div style={{
                      padding: '12px 16px', background: `${sColor.red}1a`, border: `1px solid ${sColor.red}4d`,
                      marginBottom: '12px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <AlertCircle style={{ width: 18, height: 18, color: sColor.red, flexShrink: 0, marginTop: '2px' }} />
                        <span style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: sColor.red }}>{swapError}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Summary Cards */}
          <CalibrationCard analysis={analysis} />
          <PartNumberCard partNumbers={analysis.partNumbers} />
          {vehicleInfo && <VehicleInfoCard info={vehicleInfo} />}
          {vinLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', color: sColor.textDim, fontFamily: sFont.body }}>
              <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
              Decoding VIN via NHTSA...
            </div>
          )}
          <ModuleNamesCard modules={analysis.moduleNames} />

          {/* No VIN Notice */}
          {!analysis.vinFound && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 16px',
              background: `${sColor.yellow}0d`, border: `1px solid ${sColor.yellow}33`, marginBottom: '16px',
            }}>
              <AlertCircle style={{ width: 18, height: 18, color: sColor.yellow, flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.yellow, marginBottom: '4px' }}>
                  No VIN found in binary
                </div>
                <div style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.textDim }}>
                  This is normal for calibration-only dumps. VIN is typically stored in a separate EEPROM/NVM section
                  (DID F190) that is not included in standard calibration file exports. To get full vehicle details,
                  enter the VIN manually or use a full flash dump.
                </div>
              </div>
            </div>
          )}

          {/* Findings Table */}
          <div style={{
            background: 'oklch(0.12 0.006 260)', border: `1px solid ${sColor.border}`,
            borderLeft: `3px solid oklch(0.50 0.12 300)`, padding: '16px', marginBottom: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.08em', color: 'white' }}>
                ALL FINDINGS ({filteredFindings.length})
              </h3>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setFilterCategory('all')}
                  style={{
                    padding: '3px 10px', fontFamily: sFont.mono, fontSize: '0.65rem',
                    background: filterCategory === 'all' ? 'oklch(0.20 0.008 260)' : 'transparent',
                    border: `1px solid ${filterCategory === 'all' ? sColor.text : sColor.borderLight}`,
                    color: filterCategory === 'all' ? 'white' : sColor.textDim, cursor: 'pointer',
                  }}
                >
                  ALL
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    style={{
                      padding: '3px 10px', fontFamily: sFont.mono, fontSize: '0.65rem',
                      background: filterCategory === cat ? `${CATEGORY_COLORS[cat]}22` : 'transparent',
                      border: `1px solid ${filterCategory === cat ? CATEGORY_COLORS[cat] : sColor.borderLight}`,
                      color: filterCategory === cat ? CATEGORY_COLORS[cat] : sColor.textDim, cursor: 'pointer',
                    }}
                  >
                    {CATEGORY_LABELS[cat] || cat.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {displayFindings.map((f, i) => (
              <FindingRow key={`${f.offset}-${i}`} finding={f} index={i} />
            ))}

            {filteredFindings.length > 50 && !showAllFindings && (
              <button
                onClick={() => setShowAllFindings(true)}
                style={{
                  width: '100%', padding: '10px', marginTop: '8px',
                  background: 'oklch(0.14 0.006 260)', border: `1px solid ${sColor.borderLight}`,
                  color: sColor.textDim, fontFamily: sFont.heading, fontSize: '0.85rem',
                  letterSpacing: '0.06em', cursor: 'pointer',
                }}
              >
                SHOW ALL {filteredFindings.length} FINDINGS
              </button>
            )}
          </div>

          {/* Hex Region Viewer */}
          {analysis.hexRegions.length > 0 && (
            <div style={{
              background: 'oklch(0.12 0.006 260)', border: `1px solid ${sColor.border}`,
              borderLeft: `3px solid ${sColor.blue}`, padding: '16px',
            }}>
              <h3 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.08em', color: 'white', marginBottom: '12px' }}>
                HEX DUMP — KEY REGIONS ({analysis.hexRegions.length})
              </h3>
              {analysis.hexRegions.map((region, i) => (
                <HexDumpViewer key={`${region.offsetHex}-${i}`} region={region} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
