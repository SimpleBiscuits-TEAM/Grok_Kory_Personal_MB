/**
 * Protocol Selector Component
 * 
 * Allows users to select which protocol to use for logging and diagnostics.
 * Auto-detects available protocols based on vehicle info.
 */

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  detectSupportedProtocols,
  determinePrimaryProtocol,
  getProtocolFeatures,
  getRecommendedAdapter,
  SupportedProtocol,
  ProtocolCapability,
} from '@/lib/protocolDetection';
import { VehicleInfo } from '@/lib/obdConnection';

export interface ProtocolSelectorProps {
  vehicleInfo?: VehicleInfo;
  onProtocolSelected?: (protocol: SupportedProtocol) => void;
  currentProtocol?: SupportedProtocol;
}

export function ProtocolSelector({
  vehicleInfo,
  onProtocolSelected,
  currentProtocol = 'obd2',
}: ProtocolSelectorProps) {
  const [protocols, setProtocols] = useState<ProtocolCapability[]>([]);
  const [selectedProtocol, setSelectedProtocol] = useState<SupportedProtocol>(currentProtocol);

  // Detect available protocols
  useEffect(() => {
    const available = detectSupportedProtocols(vehicleInfo);
    setProtocols(available);

    // Auto-select primary protocol if not already selected
    if (!currentProtocol || currentProtocol === 'obd2') {
      const primary = determinePrimaryProtocol(vehicleInfo);
      setSelectedProtocol(primary);
    }
  }, [vehicleInfo, currentProtocol]);

  const handleProtocolChange = (protocol: SupportedProtocol) => {
    setSelectedProtocol(protocol);
    onProtocolSelected?.(protocol);
  };

  const getProtocolIcon = (protocol: SupportedProtocol) => {
    switch (protocol) {
      case 'j1939':
        return '🚛';
      case 'kline':
        return '🔧';
      case 'vop':
        return '⚡';
      case 'obd2':
      default:
        return '🔌';
    }
  };

  const getProtocolDescription = (protocol: SupportedProtocol): string => {
    switch (protocol) {
      case 'j1939':
        return 'Heavy-duty trucks and commercial vehicles (250kbps CAN)';
      case 'kline':
        return 'Legacy vehicles and European cars (10.4kbaud single-wire)';
      case 'vop':
        return 'Proprietary PPEI V-OP protocol for advanced vehicle optimization (coming soon)';
      case 'obd2':
      default:
        return 'Universal standard for all post-1996 vehicles (10.4kbaud)';
    }
  };

  return (
    <div className="space-y-4">
      {/* Vehicle Info */}
      {vehicleInfo && (
        <Card className="p-3 bg-muted/30 border-0">
          <div className="text-sm space-y-1">
            <div className="font-semibold">
              {vehicleInfo.year} {vehicleInfo.make} {vehicleInfo.model}
            </div>
            <div className="text-muted-foreground">
              {vehicleInfo.engineType} • {vehicleInfo.fuelType}
            </div>
            {vehicleInfo.vin && (
              <div className="text-xs text-muted-foreground font-mono">
                VIN: {vehicleInfo.vin}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Protocol Cards */}
      <div className="space-y-2">
        {protocols.map((protocol) => {
          const isSelected = selectedProtocol === protocol.protocol;
          const isRecommended = protocols[0].protocol === protocol.protocol;

          return (
            <Card
              key={protocol.protocol}
              className={`p-4 cursor-pointer transition-all ${
                isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'
              }`}
              onClick={() => handleProtocolChange(protocol.protocol)}
            >
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="text-2xl">{getProtocolIcon(protocol.protocol)}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold capitalize">
                          {protocol.protocol === 'obd2' ? 'OBD-II' : protocol.protocol === 'vop' ? 'V-OP' : protocol.protocol.toUpperCase()}
                        </div>
                        {isRecommended && (
                          <Badge variant="default" className="text-xs">
                            Recommended
                          </Badge>
                        )}
                        {protocol.supported && (
                          <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                            Supported
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {getProtocolDescription(protocol.protocol)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground'
                      }`}
                    >
                      {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                  </div>
                </div>

                {/* Confidence and Baud Rate */}
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    {protocol.supported ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-yellow-600" />
                    )}
                    <span>
                      {protocol.confidence}% confidence
                      {!protocol.supported && ' (may not work)'}
                    </span>
                  </div>
                  {protocol.baudRate && (
                    <div className="text-muted-foreground">
                      {protocol.baudRate === 250000
                        ? '250kbps'
                        : `${protocol.baudRate / 1000}kbaud`}
                    </div>
                  )}
                </div>

                {/* Features */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground">Features:</div>
                  <div className="grid grid-cols-2 gap-2">
                    {protocol.features.slice(0, 4).map((feature, idx) => (
                      <div key={idx} className="text-xs text-muted-foreground flex items-start gap-1">
                        <span className="text-primary">✓</span>
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                  {protocol.features.length > 4 && (
                    <div className="text-xs text-muted-foreground">
                      +{protocol.features.length - 4} more features
                    </div>
                  )}
                </div>

                {/* Adapter Info */}
                <div className="pt-2 border-t">
                  <div className="text-xs text-muted-foreground">
                    <strong>Recommended adapter:</strong> {getRecommendedAdapter(protocol.protocol)}
                  </div>
                </div>

                {/* Reason (if not supported) */}
                {!protocol.supported && protocol.reason && (
                  <div className="pt-2 border-t">
                    <div className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded">
                      {protocol.reason}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Info Box */}
      <Card className="p-3 bg-blue-50 border-blue-200">
        <div className="text-xs text-blue-900 space-y-1">
          <div className="font-semibold">💡 Protocol Selection Tips:</div>
          <ul className="list-disc list-inside space-y-1">
            <li>OBD-II works on all post-1996 vehicles</li>
            <li>J1939 provides more detailed engine/transmission data on heavy-duty trucks</li>
            <li>K-Line is for older European vehicles (pre-2010)</li>
            <li>Some adapters support multiple protocols - check your adapter specs</li>
            <li>V-OP is a proprietary PPEI protocol — full support arriving soon</li>
          </ul>
        </div>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          variant="default"
          onClick={() => onProtocolSelected?.(selectedProtocol)}
          className="flex-1"
        >
          Connect with {selectedProtocol === 'obd2' ? 'OBD-II' : selectedProtocol === 'vop' ? 'V-OP' : selectedProtocol.toUpperCase()}
        </Button>
      </div>
    </div>
  );
}
