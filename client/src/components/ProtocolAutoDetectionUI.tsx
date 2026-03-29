/**
 * Protocol Auto-Detection UI Component
 * 
 * Displays auto-detection results and allows user to select protocol.
 * Shows confidence scores and supported features for each detected protocol.
 */

import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, AlertCircle, Zap } from 'lucide-react';
import {
  ProtocolDetectionResult,
  DetectionResults,
  getProtocolStyle,
  formatDetectionResult,
} from '@/lib/protocolAutoDetection';

interface ProtocolAutoDetectionUIProps {
  detectionResults: DetectionResults | null;
  isDetecting: boolean;
  selectedProtocol: 'obd2' | 'j1939' | 'kline' | null;
  onProtocolSelect: (protocol: 'obd2' | 'j1939' | 'kline') => void;
  onRetryDetection?: () => void;
}

const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

const sColor = {
  bg: 'oklch(0.10 0.005 260)',
  bgCard: 'oklch(0.13 0.006 260)',
  border: 'oklch(0.22 0.008 260)',
  red: 'oklch(0.52 0.22 25)',
  green: 'oklch(0.65 0.20 145)',
  blue: 'oklch(0.70 0.18 200)',
  yellow: 'oklch(0.75 0.18 60)',
  orange: 'oklch(0.65 0.20 55)',
  text: 'oklch(0.95 0.005 260)',
  textDim: 'oklch(0.55 0.010 260)',
  textMuted: 'oklch(0.45 0.008 260)',
  purple: 'oklch(0.60 0.20 300)',
};

// ─── Detection Status Badge ────────────────────────────────────────────────

function DetectionStatusBadge({ isDetecting, allFailed }: { isDetecting: boolean; allFailed: boolean }) {
  if (isDetecting) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: sColor.yellow }}>
        <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
        <span style={{ fontFamily: sFont.mono, fontSize: '0.75rem', letterSpacing: '0.08em' }}>
          DETECTING...
        </span>
      </div>
    );
  }

  if (allFailed) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: sColor.red }}>
        <AlertCircle style={{ width: 14, height: 14 }} />
        <span style={{ fontFamily: sFont.mono, fontSize: '0.75rem', letterSpacing: '0.08em' }}>
          DETECTION FAILED
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: sColor.green }}>
      <CheckCircle style={{ width: 14, height: 14 }} />
      <span style={{ fontFamily: sFont.mono, fontSize: '0.75rem', letterSpacing: '0.08em' }}>
        DETECTION COMPLETE
      </span>
    </div>
  );
}

// ─── Protocol Card ────────────────────────────────────────────────────────

function ProtocolCard({
  result,
  isSelected,
  onSelect,
}: {
  result: ProtocolDetectionResult;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const style = getProtocolStyle(result.protocol);
  const confidence = Math.round(result.confidence * 100);

  return (
    <button
      onClick={onSelect}
      style={{
        background: isSelected
          ? `linear-gradient(135deg, ${style.color}40, ${style.color}20)`
          : 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
        border: `2px solid ${isSelected ? style.color : sColor.border}`,
        borderRadius: '8px',
        padding: '12px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        flex: 1,
        minWidth: '140px',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = style.color;
        (e.currentTarget as HTMLElement).style.background = `linear-gradient(135deg, ${style.color}30, ${style.color}10)`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = isSelected ? style.color : sColor.border;
        (e.currentTarget as HTMLElement).style.background = isSelected
          ? `linear-gradient(135deg, ${style.color}40, ${style.color}20)`
          : 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)';
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '1.2rem' }}>{style.icon}</span>
          <span style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: style.color, letterSpacing: '0.1em' }}>
            {style.label}
          </span>
        </div>

        {/* Confidence */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: '100%',
              height: '4px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${confidence}%`,
                height: '100%',
                background: style.color,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim, minWidth: '30px' }}>
            {confidence}%
          </span>
        </div>

        {/* Response Time */}
        <div style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted }}>
          {result.responseTime}ms
        </div>
      </div>
    </button>
  );
}

// ─── Features List ────────────────────────────────────────────────────────

function FeaturesList({ features }: { features: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {features.map(feature => (
        <span
          key={feature}
          style={{
            fontFamily: sFont.mono,
            fontSize: '0.6rem',
            background: 'rgba(255,255,255,0.1)',
            border: `1px solid ${sColor.border}`,
            borderRadius: '3px',
            padding: '3px 6px',
            color: sColor.textDim,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {feature}
        </span>
      ))}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function ProtocolAutoDetectionUI({
  detectionResults,
  isDetecting,
  selectedProtocol,
  onProtocolSelect,
  onRetryDetection,
}: ProtocolAutoDetectionUIProps) {
  const [expandedProtocol, setExpandedProtocol] = useState<string | null>(null);

  // Auto-select primary protocol if available
  useEffect(() => {
    if (detectionResults?.primary && !selectedProtocol) {
      onProtocolSelect(detectionResults.primary.protocol);
    }
  }, [detectionResults?.primary]);

  if (!detectionResults && !isDetecting) {
    return null;
  }

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${sColor.bgCard}80 0%, ${sColor.bgCard}40 100%)`,
        border: `1px solid ${sColor.border}`,
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '16px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <div style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: sColor.text, letterSpacing: '0.1em' }}>
            PROTOCOL DETECTION
          </div>
          <div style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, marginTop: '2px' }}>
            {isDetecting ? 'Scanning for supported protocols...' : 'Select protocol to use for logging'}
          </div>
        </div>
        <DetectionStatusBadge isDetecting={isDetecting} allFailed={detectionResults?.allFailed ?? false} />
      </div>

      {/* Protocol Cards */}
      {detectionResults && !detectionResults.allFailed && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {detectionResults.detected.map(result => (
            <ProtocolCard
              key={result.protocol}
              result={result}
              isSelected={selectedProtocol === result.protocol}
              onSelect={() => {
                onProtocolSelect(result.protocol);
                setExpandedProtocol(result.protocol);
              }}
            />
          ))}
        </div>
      )}

      {/* Expanded Details */}
      {expandedProtocol && detectionResults?.detected.find(r => r.protocol === expandedProtocol) && (
        <div
          style={{
            background: 'rgba(0,0,0,0.3)',
            border: `1px solid ${sColor.border}`,
            borderRadius: '6px',
            padding: '12px',
            marginBottom: '12px',
          }}
        >
          {(() => {
            const result = detectionResults.detected.find(r => r.protocol === expandedProtocol);
            if (!result) return null;

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>
                  {formatDetectionResult(result)}
                </div>

                {result.supportedFeatures.length > 0 && (
                  <div>
                    <div style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, marginBottom: '6px' }}>
                      SUPPORTED FEATURES
                    </div>
                    <FeaturesList features={result.supportedFeatures} />
                  </div>
                )}

                {result.vehicleInfo && (
                  <div>
                    <div style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, marginBottom: '6px' }}>
                      DETECTED VEHICLE
                    </div>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.text }}>
                      {result.vehicleInfo.year} {result.vehicleInfo.make} {result.vehicleInfo.model}
                      {result.vehicleInfo.engineType && ` (${result.vehicleInfo.engineType})`}
                    </div>
                  </div>
                )}

                {result.error && (
                  <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.red }}>
                    {result.error}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Retry Button */}
      {detectionResults?.allFailed && onRetryDetection && (
        <button
          onClick={onRetryDetection}
          style={{
            background: `linear-gradient(135deg, ${sColor.orange}40, ${sColor.orange}20)`,
            border: `1px solid ${sColor.orange}`,
            borderRadius: '6px',
            padding: '8px 12px',
            color: sColor.orange,
            fontFamily: sFont.body,
            fontSize: '0.75rem',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            letterSpacing: '0.08em',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = `linear-gradient(135deg, ${sColor.orange}60, ${sColor.orange}40)`;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = `linear-gradient(135deg, ${sColor.orange}40, ${sColor.orange}20)`;
          }}
        >
          <Zap style={{ width: 12, height: 12 }} />
          RETRY DETECTION
        </button>
      )}
    </div>
  );
}

// ─── Hook for Protocol Detection ────────────────────────────────────────────

export function useProtocolDetection(connection: any) {
  const [detectionResults, setDetectionResults] = useState<DetectionResults | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState<'obd2' | 'j1939' | 'kline' | null>(null);

  const runDetection = async () => {
    if (!connection) return;

    setIsDetecting(true);
    try {
      const { autoDetectProtocols } = await import('@/lib/protocolAutoDetection');
      const results = await autoDetectProtocols(connection, { timeout: 5000 });
      setDetectionResults(results);

      if (results.primary) {
        setSelectedProtocol(results.primary.protocol);
      }
    } catch (error) {
      console.error('Protocol detection failed:', error);
      setDetectionResults({
        detected: [],
        primary: null,
        secondary: [],
        allFailed: true,
      });
    } finally {
      setIsDetecting(false);
    }
  };

  return {
    detectionResults,
    isDetecting,
    selectedProtocol,
    setSelectedProtocol,
    runDetection,
  };
}
