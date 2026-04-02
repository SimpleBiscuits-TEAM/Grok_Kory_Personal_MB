/**
 * ReverseEngineeringPanel - Full reverse engineering workflow UI
 * Upload a raw binary, detect ECU family, discover maps, generate A2L
 */

import { useState, useRef, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { Upload, Cpu, FileDown, Loader2, CheckCircle, AlertCircle, Zap, Database, Search, FileCode2 } from 'lucide-react';

const sFont = { heading: '"Bebas Neue", "Impact", sans-serif', body: '"Rajdhani", sans-serif', mono: '"Share Tech Mono", monospace' };
const sColor = {
  red: 'oklch(0.52 0.22 25)', blue: 'oklch(0.55 0.20 260)', green: 'oklch(0.55 0.20 145)',
  yellow: 'oklch(0.70 0.18 85)', bgDark: 'oklch(0.30 0.005 260)', bgCard: 'oklch(0.33 0.006 260)',
  bgInput: 'oklch(0.31 0.005 260)', border: 'oklch(0.20 0.010 260)', borderLight: 'oklch(0.25 0.010 260)',
  textDim: 'oklch(0.68 0.010 260)', textMuted: 'oklch(0.55 0.010 260)',
};

type PipelineStep = 'idle' | 'uploading' | 'detecting' | 'discovering' | 'generating' | 'validating' | 'complete' | 'error';

interface PipelineResult {
  detection: {
    family: string;
    confidence: number;
    analysis: {
      fileName: string;
      fileSize: number;
      detectedFamily: string | null;
      confidence: number;
      matches: Array<{ ecuFamily: string; confidence: number; matchedPatterns: string[]; offset: number; description: string }>;
      analysis: { hasDeadbeefMarker: boolean; hasMotorola32bitMarker: boolean; hasBoschSignature: boolean; estimatedArchitecture: string };
    };
  };
  discovery: {
    mapCount: number;
    maps: Array<{
      name: string; address: number; size: number; dataType: string;
      dimensions: string; confidence: number; description?: string; category?: string;
    }>;
    totalMaps: number;
  };
  a2l: { content: string; fileSize: number };
  validation: {
    valid: boolean; errors: string[]; warnings: string[];
    stats: { characteristicCount: number; totalSize: number; addressOverlaps: number; duplicateNames: number };
  };
  osNumber?: string;
  message: string;
}

export default function ReverseEngineeringPanel() {
  const [step, setStep] = useState<PipelineStep>('idle');
  const [fileName, setFileName] = useState('');
  const [ecuName, setEcuName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [error, setError] = useState('');
  const [result, setResult] = useState<PipelineResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reverseEngineerMutation = trpc.binaryAnalysis.reverseEngineer.useMutation();

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith('.bin') && !file.name.endsWith('.hex') && !file.name.endsWith('.s19')) {
      setError('Unsupported file type. Please upload a .bin, .hex, or .s19 file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File exceeds 10MB limit.');
      return;
    }

    setFileName(file.name);
    setError('');
    setResult(null);
    setStep('uploading');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      setStep('detecting');

      const response = await reverseEngineerMutation.mutateAsync({
        binaryData: base64,
        fileName: file.name,
        ecuName: ecuName || undefined,
        version: version || '1.0.0',
      });

      if (response.success) {
        setResult(response as unknown as PipelineResult);
        setStep('complete');
      } else {
        setError('Reverse engineering failed. The binary may not contain recognizable patterns.');
        setStep('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error during analysis');
      setStep('error');
    }
  }, [ecuName, version, reverseEngineerMutation]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const downloadA2L = useCallback(() => {
    if (!result?.a2l.content) return;
    const blob = new Blob([result.a2l.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Use OS number if available, otherwise use ECU name or family
    const osNumber = (result as any).osNumber;
    const filename = osNumber || ecuName || result.detection.family || 'generated';
    a.download = `${filename}.a2l`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, ecuName]);

  const stepLabels: Record<PipelineStep, string> = {
    idle: 'Ready',
    uploading: 'Reading binary file...',
    detecting: 'Detecting ECU family & discovering maps...',
    discovering: 'Discovering calibration maps...',
    generating: 'Generating A2L definition...',
    validating: 'Validating output...',
    complete: 'Complete',
    error: 'Error',
  };

  const isProcessing = ['uploading', 'detecting', 'discovering', 'generating', 'validating'].includes(step);

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: `${sColor.red}1f`, border: `1px solid ${sColor.red}4d`, borderRadius: '8px', padding: '10px' }}>
          <Cpu style={{ width: 24, height: 24, color: sColor.red }} />
        </div>
        <div>
          <h2 style={{ fontFamily: sFont.heading, fontSize: '1.6rem', letterSpacing: '0.08em', color: 'white', margin: 0 }}>
            REVERSE ENGINEERING ENGINE
          </h2>
          <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, margin: 0 }}>
            Upload a raw binary to auto-detect ECU family, discover calibration maps, and generate A2L definitions
          </p>
        </div>
      </div>

      {/* Configuration */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <div>
          <label style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, display: 'block', marginBottom: '6px' }}>
            ECU Name (optional, auto-detected)
          </label>
          <input
            type="text"
            value={ecuName}
            onChange={e => setEcuName(e.target.value)}
            placeholder="e.g. CANAM_MG1"
            disabled={isProcessing}
            style={{
              width: '100%', padding: '10px 14px', fontFamily: sFont.mono, fontSize: '0.85rem',
              background: sColor.bgInput, border: `1px solid ${sColor.border}`, color: 'white',
              borderRadius: '4px', outline: 'none',
            }}
          />
        </div>
        <div>
          <label style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, display: 'block', marginBottom: '6px' }}>
            Version
          </label>
          <input
            type="text"
            value={version}
            onChange={e => setVersion(e.target.value)}
            placeholder="1.0.0"
            disabled={isProcessing}
            style={{
              width: '100%', padding: '10px 14px', fontFamily: sFont.mono, fontSize: '0.85rem',
              background: sColor.bgInput, border: `1px solid ${sColor.border}`, color: 'white',
              borderRadius: '4px', outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Upload Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => !isProcessing && fileRef.current?.click()}
        style={{
          border: `2px dashed ${isProcessing ? sColor.textMuted : sColor.border}`,
          borderRadius: '8px', padding: '40px', textAlign: 'center',
          cursor: isProcessing ? 'not-allowed' : 'pointer',
          background: isProcessing ? 'oklch(0.09 0.003 260)' : sColor.bgCard,
          transition: 'all 0.2s',
          marginBottom: '20px',
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".bin,.hex,.s19"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
          }}
        />
        {isProcessing ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <Loader2 style={{ width: 32, height: 32, color: sColor.red, animation: 'spin 1s linear infinite' }} />
            <p style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: 'white', letterSpacing: '0.06em' }}>
              {stepLabels[step]}
            </p>
            {fileName && (
              <p style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.textDim }}>{fileName}</p>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <Upload style={{ width: 32, height: 32, color: sColor.textDim }} />
            <p style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: 'white', letterSpacing: '0.06em' }}>
              DROP BINARY FILE OR CLICK TO UPLOAD
            </p>
            <p style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim }}>
              Supports .bin, .hex, .s19 files up to 10MB
            </p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: `${sColor.red}15`, border: `1px solid ${sColor.red}44`, borderRadius: '6px',
          padding: '14px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <AlertCircle style={{ width: 18, height: 18, color: sColor.red, flexShrink: 0 }} />
          <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.red, margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Results */}
      {result && step === 'complete' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Success Banner */}
          <div style={{
            background: `${sColor.green}15`, border: `1px solid ${sColor.green}44`, borderRadius: '6px',
            padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <CheckCircle style={{ width: 18, height: 18, color: sColor.green, flexShrink: 0 }} />
            <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.green, margin: 0 }}>
              {result.message}
            </p>
          </div>

          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            <StatCard icon={<Cpu style={{ width: 18, height: 18 }} />} label="ECU FAMILY" value={result.detection.family} color={sColor.red} />
            <StatCard icon={<Zap style={{ width: 18, height: 18 }} />} label="CONFIDENCE" value={`${(result.detection.confidence * 100).toFixed(1)}%`} color={sColor.blue} />
            <StatCard icon={<Database style={{ width: 18, height: 18 }} />} label="MAPS FOUND" value={String(result.discovery.totalMaps)} color={sColor.green} />
            <StatCard icon={<FileCode2 style={{ width: 18, height: 18 }} />} label="A2L SIZE" value={formatBytes(result.a2l.fileSize)} color={sColor.yellow} />
          </div>

          {/* Detection Details */}
          <div style={{ background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderLeft: `4px solid ${sColor.red}`, borderRadius: '4px', padding: '16px' }}>
            <h3 style={{ fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.06em', color: 'white', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Search style={{ width: 14, height: 14 }} />
              DETECTION RESULTS
            </h3>
            <div style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.textDim, lineHeight: 1.8 }}>
              <div>File: {result.detection.analysis.fileName} ({formatBytes(result.detection.analysis.fileSize)})</div>
              <div>Architecture: {result.detection.analysis.analysis.estimatedArchitecture}</div>
              <div>DEADBEEF Marker: {result.detection.analysis.analysis.hasDeadbeefMarker ? 'Found' : 'Not found'}</div>
              <div>Bosch Signature: {result.detection.analysis.analysis.hasBoschSignature ? 'Found' : 'Not found'}</div>
              {result.detection.analysis.matches.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ color: 'white', marginBottom: '4px' }}>Signature Matches:</div>
                  {result.detection.analysis.matches.slice(0, 10).map((m, i) => (
                    <div key={i} style={{ paddingLeft: '12px' }}>
                      {m.matchedPatterns.join(', ')} at 0x{m.offset.toString(16).toUpperCase()} ({m.description})
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Discovered Maps */}
          <div style={{ background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderLeft: `4px solid ${sColor.green}`, borderRadius: '4px', padding: '16px' }}>
            <h3 style={{ fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.06em', color: 'white', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Database style={{ width: 14, height: 14 }} />
              DISCOVERED MAPS ({result.discovery.totalMaps})
            </h3>
            <div style={{ maxHeight: '300px', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: sFont.mono, fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${sColor.border}` }}>
                    {['Name', 'Address', 'Size', 'Type', 'Dims', 'Category', 'Confidence'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: sColor.textDim, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.discovery.maps.map((map, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${sColor.border}22` }}>
                      <td style={{ padding: '5px 8px', color: 'white' }}>{map.name}</td>
                      <td style={{ padding: '5px 8px', color: sColor.blue }}>0x{map.address.toString(16).toUpperCase()}</td>
                      <td style={{ padding: '5px 8px', color: sColor.textDim }}>{map.size}B</td>
                      <td style={{ padding: '5px 8px', color: sColor.textDim }}>{map.dataType}</td>
                      <td style={{ padding: '5px 8px', color: sColor.yellow }}>{map.dimensions}</td>
                      <td style={{ padding: '5px 8px', color: sColor.textDim }}>{map.category || '-'}</td>
                      <td style={{ padding: '5px 8px', color: map.confidence > 0.7 ? sColor.green : map.confidence > 0.4 ? sColor.yellow : sColor.red }}>
                        {(map.confidence * 100).toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.discovery.totalMaps > result.discovery.maps.length && (
                <p style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, textAlign: 'center', padding: '8px' }}>
                  Showing {result.discovery.maps.length} of {result.discovery.totalMaps} maps
                </p>
              )}
            </div>
          </div>

          {/* Validation */}
          <div style={{ background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderLeft: `4px solid ${result.validation.valid ? sColor.green : sColor.yellow}`, borderRadius: '4px', padding: '16px' }}>
            <h3 style={{ fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.06em', color: 'white', marginBottom: '12px' }}>
              VALIDATION
            </h3>
            <div style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.textDim, lineHeight: 1.8 }}>
              <div>Status: {result.validation.valid ? 'Valid' : 'Has issues'}</div>
              <div>Characteristics: {result.validation.stats.characteristicCount}</div>
              <div>Total Data Size: {formatBytes(result.validation.stats.totalSize)}</div>
              <div>Address Overlaps: {result.validation.stats.addressOverlaps}</div>
              <div>Duplicate Names: {result.validation.stats.duplicateNames}</div>
              {result.validation.warnings.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ color: sColor.yellow }}>Warnings ({result.validation.warnings.length}):</div>
                  {result.validation.warnings.slice(0, 5).map((w, i) => (
                    <div key={i} style={{ paddingLeft: '12px', color: sColor.yellow }}>{w}</div>
                  ))}
                </div>
              )}
              {result.validation.errors.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ color: sColor.red }}>Errors ({result.validation.errors.length}):</div>
                  {result.validation.errors.slice(0, 5).map((e, i) => (
                    <div key={i} style={{ paddingLeft: '12px', color: sColor.red }}>{e}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* A2L Preview + Download */}
          <div style={{ background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderLeft: `4px solid ${sColor.blue}`, borderRadius: '4px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.06em', color: 'white', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileCode2 style={{ width: 14, height: 14 }} />
                GENERATED A2L DEFINITION
              </h3>
              <button
                onClick={downloadA2L}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: sColor.red, color: 'white', border: 'none',
                  fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.06em',
                  padding: '8px 16px', borderRadius: '4px', cursor: 'pointer',
                }}
              >
                <FileDown style={{ width: 14, height: 14 }} />
                DOWNLOAD A2L
              </button>
            </div>
            <pre style={{
              fontFamily: sFont.mono, fontSize: '0.72rem', color: sColor.textDim,
              background: sColor.bgDark, border: `1px solid ${sColor.border}`,
              borderRadius: '4px', padding: '12px', maxHeight: '300px', overflow: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {result.a2l.content.slice(0, 5000)}
              {result.a2l.content.length > 5000 && `\n\n... (${formatBytes(result.a2l.content.length)} total)`}
            </pre>
          </div>
        </div>
      )}

      {/* Supported ECU Families */}
      {step === 'idle' && (
        <div style={{ background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderRadius: '6px', padding: '16px', marginTop: '8px' }}>
          <h3 style={{ fontFamily: sFont.heading, fontSize: '0.95rem', letterSpacing: '0.06em', color: 'white', marginBottom: '10px' }}>
            SUPPORTED ECU FAMILIES
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
            {[
              { name: 'MG1C', vendor: 'Bosch', arch: 'Motorola 68K' },
              { name: 'CANAM_MG1', vendor: 'Bosch (Can-Am)', arch: 'Motorola 68K' },
              { name: 'ME17', vendor: 'Bosch', arch: 'x86/ARM' },
              { name: 'MED17', vendor: 'Bosch', arch: 'x86/ARM' },
              { name: 'CANAM_ME17', vendor: 'Bosch (Can-Am)', arch: 'x86/ARM' },
            ].map(f => (
              <div key={f.name} style={{
                background: sColor.bgDark, border: `1px solid ${sColor.border}`, borderRadius: '4px', padding: '10px',
              }}>
                <div style={{ fontFamily: sFont.heading, fontSize: '0.85rem', color: 'white', letterSpacing: '0.04em' }}>{f.name}</div>
                <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>{f.vendor} | {f.arch}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div style={{
      background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderTop: `3px solid ${color}`,
      borderRadius: '4px', padding: '14px', textAlign: 'center',
    }}>
      <div style={{ color, marginBottom: '6px', display: 'flex', justifyContent: 'center' }}>
        {icon}
      </div>
      <div style={{ fontFamily: sFont.mono, fontSize: '1.2rem', color: 'white', fontWeight: 700 }}>{value}</div>
      <div style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, letterSpacing: '0.06em', marginTop: '4px' }}>{label}</div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}
