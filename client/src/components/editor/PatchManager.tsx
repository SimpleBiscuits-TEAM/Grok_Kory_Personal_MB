import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, CheckCircle, Zap, Download, Upload } from 'lucide-react';

export interface PatchDefinition {
  name: string;
  id: string;
  description: string;
  patches: Array<{
    offset: number;
    original: number[];
    modified: number[];
  }>;
}

// Known patch definitions
const PATCH_DEFINITIONS: Record<string, PatchDefinition> = {
  dynojet: {
    name: 'Dynojet Unlock',
    id: 'dynojet',
    description: 'Single-byte unlock flag (0x030363: 0x23 → 0x03)',
    patches: [
      {
        offset: 0x030363,
        original: [0x23],
        modified: [0x03],
      },
    ],
  },
  hptuners: {
    name: 'HPTuners Unlock',
    id: 'hptuners',
    description: '10-byte comprehensive unlock (checksums + config flags)',
    patches: [
      { offset: 0x018e06, original: [0x30], modified: [0x36] },
      { offset: 0x018e07, original: [0x32], modified: [0x39] },
      { offset: 0x02ee01, original: [0x10], modified: [0x00] },
      { offset: 0x02ee02, original: [0xe5], modified: [0xe4] },
      { offset: 0x03034e, original: [0xe2], modified: [0x44] },
      { offset: 0x03034f, original: [0x0a], modified: [0x00] },
      { offset: 0x032c16, original: [0x30], modified: [0x36] },
      { offset: 0x032c17, original: [0x32], modified: [0x39] },
      { offset: 0x0350ae, original: [0x30], modified: [0x36] },
      { offset: 0x0350af, original: [0x32], modified: [0x39] },
    ],
  },
};

interface PatchStatus {
  patchId: string;
  isApplied: boolean;
  matchCount: number;
  totalPatches: number;
}

interface PatchManagerProps {
  binary: Uint8Array | null;
  onPatchApply?: (patchId: string, binary: Uint8Array) => void;
  onPatchRemove?: (patchId: string, binary: Uint8Array) => void;
}

export const PatchManager: React.FC<PatchManagerProps> = ({
  binary,
  onPatchApply,
  onPatchRemove,
}) => {
  const [patchStatuses, setPatchStatuses] = useState<PatchStatus[]>([]);
  const [selectedPatch, setSelectedPatch] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // Detect which patches are applied
  useEffect(() => {
    if (!binary) return;

    const statuses: PatchStatus[] = [];

    for (const [key, patchDef] of Object.entries(PATCH_DEFINITIONS)) {
      let matchCount = 0;

      for (const patch of patchDef.patches) {
        // Check if modified bytes are present
        let isModified = true;
        for (let i = 0; i < patch.modified.length; i++) {
          if (binary[patch.offset + i] !== patch.modified[i]) {
            isModified = false;
            break;
          }
        }
        if (isModified) matchCount++;
      }

      statuses.push({
        patchId: key,
        isApplied: matchCount === patchDef.patches.length,
        matchCount,
        totalPatches: patchDef.patches.length,
      });
    }

    setPatchStatuses(statuses);
  }, [binary]);

  const handleApplyPatch = async (patchId: string) => {
    if (!binary) return;

    const patchDef = PATCH_DEFINITIONS[patchId];
    if (!patchDef) return;

    setIsApplying(true);

    try {
      // Create a copy of the binary
      const newBinary = new Uint8Array(binary);

      // Apply all patches
      for (const patch of patchDef.patches) {
        for (let i = 0; i < patch.modified.length; i++) {
          newBinary[patch.offset + i] = patch.modified[i];
        }
      }

      onPatchApply?.(patchId, newBinary);
    } finally {
      setIsApplying(false);
    }
  };

  const handleRemovePatch = async (patchId: string) => {
    if (!binary) return;

    const patchDef = PATCH_DEFINITIONS[patchId];
    if (!patchDef) return;

    setIsApplying(true);

    try {
      // Create a copy of the binary
      const newBinary = new Uint8Array(binary);

      // Revert all patches
      for (const patch of patchDef.patches) {
        for (let i = 0; i < patch.original.length; i++) {
          newBinary[patch.offset + i] = patch.original[i];
        }
      }

      onPatchRemove?.(patchId, newBinary);
    } finally {
      setIsApplying(false);
    }
  };

  if (!binary) {
    return (
      <Card className="p-4 bg-amber-50 border-amber-200">
        <div className="flex items-center gap-2 text-amber-800">
          <AlertCircle className="w-4 h-4" />
          <span>Load a binary file to detect and apply patches</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {patchStatuses.map((status) => {
          const patchDef = PATCH_DEFINITIONS[status.patchId];
          if (!patchDef) return null;

          return (
            <Card
              key={status.patchId}
              className={`p-4 cursor-pointer transition-all ${
                selectedPatch === status.patchId
                  ? 'ring-2 ring-blue-500 bg-blue-50'
                  : 'hover:bg-gray-50'
              }`}
              onClick={() => setSelectedPatch(status.patchId)}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {patchDef.name}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {patchDef.description}
                    </p>
                  </div>
                  {status.isApplied ? (
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                </div>

                <div className="text-xs text-gray-600">
                  {status.matchCount} / {status.totalPatches} patches detected
                </div>

                <div className="flex gap-2">
                  {!status.isApplied ? (
                    <Button
                      size="sm"
                      onClick={() => handleApplyPatch(status.patchId)}
                      disabled={isApplying}
                      className="flex-1"
                    >
                      <Zap className="w-3 h-3 mr-1" />
                      Apply
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRemovePatch(status.patchId)}
                      disabled={isApplying}
                      className="flex-1"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {selectedPatch && (
        <Card className="p-4 bg-gray-50">
          <h4 className="font-semibold text-gray-900 mb-3">Patch Details</h4>
          <div className="space-y-2 text-sm font-mono">
            {PATCH_DEFINITIONS[selectedPatch]?.patches.map((patch, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-gray-600">0x{patch.offset.toString(16).toUpperCase().padStart(6, '0')}</span>
                <div className="flex items-center gap-2">
                  <span className="text-red-600">
                    {patch.original.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}
                  </span>
                  <span className="text-gray-400">→</span>
                  <span className="text-green-600">
                    {patch.modified.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
