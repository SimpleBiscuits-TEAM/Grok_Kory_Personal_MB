/**
 * Offset Calibration Panel
 * 
 * UI component for detecting and correcting binary offset mismatches
 * between a2L files and binary files
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AlertCircle, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import {
  detectOffsetMismatch,
  validateOffsetCorrection,
  generateOffsetReport,
  OffsetDetectionResult,
} from '@/lib/binaryOffsetDetection';

interface OffsetCalibrationPanelProps {
  binary: Uint8Array;
  a2lOffsets: Map<string, number>;
  onOffsetDetected?: (offsetDelta: number, confidence: number) => void;
  onCorrectionApplied?: (offsetDelta: number) => void;
}

const OffsetCalibrationPanelComponent: React.FC<OffsetCalibrationPanelProps> = ({
  binary,
  a2lOffsets,
  onOffsetDetected,
  onCorrectionApplied,
}) => {
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState<OffsetDetectionResult | null>(null);
  const [manualOffset, setManualOffset] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<boolean | null>(null);
  const [report, setReport] = useState('');

  const handleAutoDetect = async () => {
    setIsDetecting(true);
    try {
      // Simulate async detection
      await new Promise(resolve => setTimeout(resolve, 500));

      const result = detectOffsetMismatch(binary, a2lOffsets, []);
      setDetectionResult(result);
      setReport(generateOffsetReport(result));

      if (onOffsetDetected && result.detectedOffset !== null) {
        onOffsetDetected(result.offsetDelta, result.confidence);
      }
    } catch (error) {
      console.error('Offset detection error:', error);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleManualEntry = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setManualOffset(value);
  };

  const handleValidateManualOffset = async () => {
    if (!manualOffset) return;

    setIsValidating(true);
    try {
      const offsetDelta = parseInt(manualOffset, 16) || parseInt(manualOffset, 10);
      await new Promise(resolve => setTimeout(resolve, 300));

      const isValid = validateOffsetCorrection(binary, a2lOffsets, offsetDelta, []);
      setValidationResult(isValid);

      if (isValid && onCorrectionApplied) {
        onCorrectionApplied(offsetDelta);
      }
    } catch (error) {
      console.error('Validation error:', error);
      setValidationResult(false);
    } finally {
      setIsValidating(false);
    }
  };

  const handleApplyCorrection = () => {
    if (detectionResult?.offsetDelta !== undefined && onCorrectionApplied) {
      onCorrectionApplied(detectionResult.offsetDelta);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'suspected':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 p-6 bg-background rounded-lg border border-border">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Binary Offset Calibration</h2>
        <p className="text-sm text-muted-foreground">
          Detect and correct offset mismatches between a2L and binary files
        </p>
      </div>

      {/* Auto-Detection Section */}
      <Card className="p-4 bg-card border-border">
        <h3 className="text-lg font-semibold text-card-foreground mb-4">Auto-Detection</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Scan binary for known table signatures to detect offset mismatches automatically
        </p>
        <Button
          onClick={handleAutoDetect}
          disabled={isDetecting}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {isDetecting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Detecting...
            </>
          ) : (
            'Start Auto-Detection'
          )}
        </Button>
      </Card>

      {/* Detection Results */}
      {detectionResult && (
        <Card className="p-4 bg-card border-border">
          <div className="flex items-start gap-3 mb-4">
            {getStatusIcon(detectionResult.validationStatus)}
            <div className="flex-1">
              <h4 className="font-semibold text-card-foreground">
                {detectionResult.validationStatus === 'confirmed'
                  ? 'Offset Detected'
                  : detectionResult.validationStatus === 'suspected'
                    ? 'Offset Suspected'
                    : 'Detection Failed'}
              </h4>
              <p className="text-sm text-muted-foreground mt-1">{detectionResult.details}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-background p-3 rounded">
              <p className="text-xs text-muted-foreground mb-1">Offset Delta</p>
              <p className="text-lg font-mono text-foreground">
                {detectionResult.offsetDelta} bytes
              </p>
              <p className="text-xs text-muted-foreground">
                0x{detectionResult.offsetDelta.toString(16).toUpperCase()}
              </p>
            </div>
            <div className="bg-background p-3 rounded">
              <p className="text-xs text-muted-foreground mb-1">Confidence</p>
              <p className="text-lg font-semibold text-foreground">
                {detectionResult.confidence.toFixed(1)}%
              </p>
            </div>
          </div>

          {detectionResult.matchedSignatures.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Matched Tables ({detectionResult.matchedSignatures.length})
              </p>
              <div className="space-y-1">
                {detectionResult.matchedSignatures.slice(0, 5).map((sig, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    • {sig}
                  </p>
                ))}
                {detectionResult.matchedSignatures.length > 5 && (
                  <p className="text-xs text-muted-foreground">
                    + {detectionResult.matchedSignatures.length - 5} more
                  </p>
                )}
              </div>
            </div>
          )}

          <p className="text-sm text-muted-foreground mb-4">{detectionResult.recommendedAction}</p>

          {detectionResult.validationStatus !== 'failed' && (
            <Button
              onClick={handleApplyCorrection}
              className="w-full bg-green-600 text-white hover:bg-green-700"
            >
              Apply Offset Correction
            </Button>
          )}
        </Card>
      )}

      {/* Manual Offset Entry */}
      <Card className="p-4 bg-card border-border">
        <h3 className="text-lg font-semibold text-card-foreground mb-4">Manual Offset Entry</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Enter offset manually (decimal or hexadecimal with 0x prefix)
        </p>
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="e.g., 7141146 or 0x6C3B9A"
            value={manualOffset}
            onChange={handleManualEntry}
            className="flex-1"
          />
          <Button
            onClick={handleValidateManualOffset}
            disabled={isValidating || !manualOffset}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isValidating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Validate'
            )}
          </Button>
        </div>

        {validationResult !== null && (
          <div className="mt-4 p-3 rounded bg-background border border-border">
            <div className="flex items-center gap-2">
              {validationResult ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-sm text-green-600">Offset validation passed</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <span className="text-sm text-red-600">Offset validation failed</span>
                </>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Report Display */}
      {report && (
        <Card className="p-4 bg-background border-border">
          <h3 className="text-sm font-mono text-foreground whitespace-pre-wrap">{report}</h3>
        </Card>
      )}

      {/* Info Box */}
      <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded">
        <p className="text-sm text-blue-900 dark:text-blue-100">
          <strong>Note:</strong> Offset corrections are applied to all a2L addresses when loading
          editor files. Corrections are stored per ECU/vehicle type for future use.
        </p>
      </div>
    </div>
  );
};

export default OffsetCalibrationPanelComponent;
