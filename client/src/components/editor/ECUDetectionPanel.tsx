import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, CheckCircle, Loader2, Download, Upload } from 'lucide-react';
import { detectECUFamily, getConfidenceDescription, getA2LFilenameForFamily } from '@/lib/ecuDetection';
import { getA2LForFamily, registerA2L } from '@/lib/a2lRegistry';

interface ECUDetectionPanelProps {
  binary: Uint8Array | null;
  onA2LDetected?: (a2lContent: string, family: string) => void;
  onA2LRegistered?: (family: string, filename: string) => void;
}

export const ECUDetectionPanel: React.FC<ECUDetectionPanelProps> = ({
  binary,
  onA2LDetected,
  onA2LRegistered,
}) => {
  const [detection, setDetection] = useState<any>(null);
  const [registeredA2L, setRegisteredA2L] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [autoLoadStatus, setAutoLoadStatus] = useState<'idle' | 'loading' | 'success' | 'not-found'>('idle');

  // Detect ECU family when binary changes
  useEffect(() => {
    if (!binary) {
      setDetection(null);
      setRegisteredA2L(null);
      return;
    }

    setIsLoading(true);
    try {
      const result = detectECUFamily(binary);
      setDetection(result);

      if (result) {
        // Check if A2L is registered
        const registered = getA2LForFamily(result.family);
        setRegisteredA2L(registered);

        // Auto-load if available
        if (registered) {
          setAutoLoadStatus('success');
          onA2LDetected?.(registered.content, result.family);
        } else {
          setAutoLoadStatus('not-found');
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [binary, onA2LDetected]);

  const handleRegisterA2L = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !detection) return;

    try {
      const content = await file.text();
      const success = registerA2L(detection.family, file.name, content);

      if (success) {
        setRegisteredA2L({
          family: detection.family,
          filename: file.name,
          content,
          uploadedAt: Date.now(),
          size: file.size,
        });
        onA2LRegistered?.(detection.family, file.name);
        onA2LDetected?.(content, detection.family);
      }
    } catch (err) {
      console.error('Failed to register A2L:', err);
    }
  };

  if (!binary) {
    return (
      <Card className="p-4 bg-gray-50 border-gray-200">
        <p className="text-sm text-gray-600">Load a binary file to detect ECU family</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Detection Result */}
      <Card className={`p-4 ${detection ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-start gap-3">
          {isLoading ? (
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0 mt-0.5" />
          ) : detection ? (
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          )}

          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">
              {detection ? 'ECU Detected' : 'ECU Not Detected'}
            </h3>

            {detection && (
              <div className="mt-2 space-y-1 text-sm">
                <p className="text-gray-700">
                  <span className="font-medium">Family:</span> {detection.family}
                  {detection.variant && ` (${detection.variant})`}
                </p>
                <p className="text-gray-700">
                  <span className="font-medium">Confidence:</span>{' '}
                  <span className={`font-semibold ${
                    detection.confidence >= 0.9 ? 'text-green-600' :
                    detection.confidence >= 0.7 ? 'text-blue-600' :
                    'text-amber-600'
                  }`}>
                    {getConfidenceDescription(detection.confidence)} ({(detection.confidence * 100).toFixed(0)}%)
                  </span>
                </p>
                <p className="text-gray-700">
                  <span className="font-medium">Signatures Found:</span> {detection.signatures.length}
                </p>
                {detection.baseAddress && (
                  <p className="text-gray-700">
                    <span className="font-medium">Base Address:</span> 0x{detection.baseAddress.toString(16).toUpperCase()}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* A2L Status */}
      {detection && (
        <Card className={`p-4 ${
          registeredA2L ? 'bg-green-50 border-green-200' :
          autoLoadStatus === 'not-found' ? 'bg-amber-50 border-amber-200' :
          'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900">
                {registeredA2L ? 'A2L Registered' : 'A2L Not Registered'}
              </h4>

              {registeredA2L ? (
                <div className="mt-2 space-y-1 text-sm text-gray-700">
                  <p>
                    <span className="font-medium">File:</span> {registeredA2L.filename}
                  </p>
                  <p>
                    <span className="font-medium">Size:</span> {(registeredA2L.size / 1024).toFixed(1)} KB
                  </p>
                  <p>
                    <span className="font-medium">Uploaded:</span>{' '}
                    {new Date(registeredA2L.uploadedAt).toLocaleString()}
                  </p>
                  <p className="text-green-600 font-medium mt-2">
                    ✓ Auto-loaded successfully
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-600">
                  Upload an A2L file for {detection.family} to enable auto-loading
                </p>
              )}
            </div>

            {!registeredA2L && (
              <label className="flex-shrink-0">
                <Button size="sm" variant="outline" asChild>
                  <span className="cursor-pointer gap-2">
                    <Upload className="w-4 h-4" />
                    Upload A2L
                  </span>
                </Button>
                <input
                  type="file"
                  accept=".a2l"
                  onChange={handleRegisterA2L}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </Card>
      )}

      {/* Signature Details */}
      {detection && (
        <Card className="p-4 bg-gray-50">
          <h4 className="font-semibold text-gray-900 mb-2">Detection Signatures</h4>
          <div className="space-y-1 text-sm">
            {detection.signatures.map((sig: string, idx: number) => (
              <p key={idx} className="text-gray-700">
                • {sig}
              </p>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
