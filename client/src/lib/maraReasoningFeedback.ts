/**
 * Mara's Reasoning Feedback Loop
 * Continuously improves diagnostics and fault detection based on learned insights
 * Every A2L and binary upload refines the reasoning engine
 */

import type { LearnedParameter, LearnedMap } from './maraLearningEngine';

export interface ReasoningModelUpdate {
  type: 'THRESHOLD' | 'FAULT_DETECTION' | 'SAFETY_LIMIT' | 'TUNING_RECOMMENDATION';
  parameterName: string;
  oldValue: any;
  newValue: any;
  confidence: number;
  reason: string;
  affectedDiagnostics: string[];
  timestamp: number;
}

export interface DiagnosticThreshold {
  parameterName: string;
  ecuFamily: string;
  minSafe: number;
  maxSafe: number;
  minWarning: number;
  maxWarning: number;
  minCritical: number;
  maxCritical: number;
  confidence: number;
}

/**
 * Mara's Reasoning Feedback System
 * Updates reasoning models based on learned insights from A2L and binary files
 */
export class MaraReasoningFeedback {
  private diagnosticThresholds: Map<string, DiagnosticThreshold> = new Map();
  private modelUpdates: ReasoningModelUpdate[] = [];
  private faultDetectionRules: Map<string, any> = new Map();

  constructor() {
    this.initializeDefaultThresholds();
  }

  /**
   * Initialize default diagnostic thresholds
   */
  private initializeDefaultThresholds(): void {
    // Cummins fuel injection quantity thresholds
    this.addThreshold({
      parameterName: 'Fuel Injection Quantity',
      ecuFamily: 'CM2100',
      minSafe: 20,
      maxSafe: 150,
      minWarning: 15,
      maxWarning: 160,
      minCritical: 10,
      maxCritical: 180,
      confidence: 80,
    });

    // Cummins rail pressure thresholds
    this.addThreshold({
      parameterName: 'Rail Pressure',
      ecuFamily: 'CM2100',
      minSafe: 5000,
      maxSafe: 30000,
      minWarning: 4500,
      maxWarning: 32000,
      minCritical: 4000,
      maxCritical: 35000,
      confidence: 85,
    });

    // Cummins EGT thresholds
    this.addThreshold({
      parameterName: 'Exhaust Gas Temperature',
      ecuFamily: 'CM2100',
      minSafe: 300,
      maxSafe: 1200,
      minWarning: 250,
      maxWarning: 1400,
      minCritical: 200,
      maxCritical: 1600,
      confidence: 90,
    });

    // Cummins boost pressure thresholds
    this.addThreshold({
      parameterName: 'Boost Pressure',
      ecuFamily: 'CM2100',
      minSafe: 5,
      maxSafe: 35,
      minWarning: 2,
      maxWarning: 40,
      minCritical: 0,
      maxCritical: 45,
      confidence: 85,
    });
  }

  /**
   * Update reasoning model based on learned parameter
   */
  updateFromLearnedParameter(param: LearnedParameter): ReasoningModelUpdate[] {
    const updates: ReasoningModelUpdate[] = [];

    // Update diagnostic thresholds if parameter has recommended range
    if (param.recommendedRange) {
      const key = `${param.ecuFamily}:${param.name}`;
      const oldThreshold = this.diagnosticThresholds.get(key);

      const newThreshold: DiagnosticThreshold = {
        parameterName: param.name,
        ecuFamily: param.ecuFamily,
        minSafe: param.recommendedRange.min,
        maxSafe: param.recommendedRange.max,
        minWarning: param.recommendedRange.min * 0.9,
        maxWarning: param.recommendedRange.max * 1.1,
        minCritical: param.minValue,
        maxCritical: param.maxValue,
        confidence: param.confidence,
      };

      this.diagnosticThresholds.set(key, newThreshold);

      if (oldThreshold) {
        updates.push({
          type: 'THRESHOLD',
          parameterName: param.name,
          oldValue: oldThreshold,
          newValue: newThreshold,
          confidence: param.confidence,
          reason: `Updated from A2L file for ${param.ecuFamily}`,
          affectedDiagnostics: this.getAffectedDiagnostics(param.name),
          timestamp: Date.now(),
        });
      }
    }

    // Update safety limits based on parameter safety level
    if (param.safetyLevel === 'CRITICAL') {
      const safetyUpdate = this.updateSafetyLimits(param);
      if (safetyUpdate) {
        updates.push(safetyUpdate);
      }
    }

    // Update fault detection rules based on parameter warnings
    if (param.warnings && param.warnings.length > 0) {
      const faultUpdate = this.updateFaultDetectionRules(param);
      if (faultUpdate) {
        updates.push(faultUpdate);
      }
    }

    // Store updates for audit trail
    this.modelUpdates.push(...updates);

    return updates;
  }

  /**
   * Update reasoning model based on learned map
   */
  updateFromLearnedMap(map: LearnedMap): ReasoningModelUpdate[] {
    const updates: ReasoningModelUpdate[] = [];

    // Update fault detection based on map axis types
    if (map.axes.x.name.toLowerCase().includes('rpm') || map.axes.y.name.toLowerCase().includes('rpm')) {
      // This is likely an operating-point dependent map
      // Improve fault detection to account for operating point context
      const update = this.improveOperatingPointContext(map);
      if (update) {
        updates.push(update);
      }
    }

    // Update safety limits based on map data ranges
    if (map.safetyLevel === 'CRITICAL') {
      const safetyUpdate = this.updateMapSafetyLimits(map);
      if (safetyUpdate) {
        updates.push(safetyUpdate);
      }
    }

    this.modelUpdates.push(...updates);
    return updates;
  }

  /**
   * Update safety limits based on learned parameter
   */
  private updateSafetyLimits(param: LearnedParameter): ReasoningModelUpdate | null {
    if (!param.recommendedRange) return null;

    // For critical parameters, tighten safety limits
    const safetyFactor = 0.95; // 5% safety margin

    return {
      type: 'SAFETY_LIMIT',
      parameterName: param.name,
      oldValue: { min: param.minValue, max: param.maxValue },
      newValue: {
        min: param.recommendedRange.min * safetyFactor,
        max: param.recommendedRange.max * safetyFactor,
      },
      confidence: param.confidence,
      reason: `Critical parameter safety limits updated for ${param.ecuFamily}`,
      affectedDiagnostics: ['All fault detection for ' + param.name],
      timestamp: Date.now(),
    };
  }

  /**
   * Update fault detection rules based on parameter warnings
   */
  private updateFaultDetectionRules(param: LearnedParameter): ReasoningModelUpdate | null {
    if (!param.warnings || param.warnings.length === 0) return null;

    const key = `${param.ecuFamily}:${param.name}`;
    const rule = {
      parameterName: param.name,
      ecuFamily: param.ecuFamily,
      warnings: param.warnings,
      relatedParameters: param.relatedParameters || [],
      detectionLogic: this.buildDetectionLogic(param),
    };

    this.faultDetectionRules.set(key, rule);

    return {
      type: 'FAULT_DETECTION',
      parameterName: param.name,
      oldValue: null,
      newValue: rule,
      confidence: param.confidence,
      reason: `Fault detection rules created from A2L warnings for ${param.ecuFamily}`,
      affectedDiagnostics: param.warnings,
      timestamp: Date.now(),
    };
  }

  /**
   * Improve operating point context in fault detection
   */
  private improveOperatingPointContext(map: LearnedMap): ReasoningModelUpdate | null {
    return {
      type: 'FAULT_DETECTION',
      parameterName: map.name,
      oldValue: 'Fixed thresholds',
      newValue: `Operating-point dependent thresholds (${map.axes.x.name} × ${map.axes.y.name})`,
      confidence: map.confidence,
      reason: `Learned map structure enables context-aware fault detection for ${map.ecuFamily}`,
      affectedDiagnostics: ['All faults related to ' + map.name],
      timestamp: Date.now(),
    };
  }

  /**
   * Update map safety limits
   */
  private updateMapSafetyLimits(map: LearnedMap): ReasoningModelUpdate | null {
    return {
      type: 'SAFETY_LIMIT',
      parameterName: map.name,
      oldValue: 'Generic limits',
      newValue: {
        xMin: map.axes.x.min,
        xMax: map.axes.x.max,
        yMin: map.axes.y.min,
        yMax: map.axes.y.max,
      },
      confidence: map.confidence,
      reason: `Safety limits learned from ${map.ecuFamily} A2L file`,
      affectedDiagnostics: ['All faults related to ' + map.name],
      timestamp: Date.now(),
    };
  }

  /**
   * Build detection logic from parameter warnings
   */
  private buildDetectionLogic(param: LearnedParameter): string {
    let logic = `// Auto-generated detection logic for ${param.name}\n`;
    logic += `// Safety Level: ${param.safetyLevel}\n`;
    logic += `// Confidence: ${param.confidence}%\n\n`;

    if (param.warnings) {
      for (const warning of param.warnings) {
        logic += `// WARNING: ${warning}\n`;
      }
    }

    logic += `\nif (value < ${param.recommendedRange?.min || param.minValue}) {\n`;
    logic += `  severity = 'LOW';\n`;
    logic += `  reason = 'Value below recommended minimum';\n`;
    logic += `}\n\n`;

    logic += `if (value > ${param.recommendedRange?.max || param.maxValue}) {\n`;
    logic += `  severity = '${param.safetyLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH'}';\n`;
    logic += `  reason = 'Value above recommended maximum';\n`;
    logic += `}\n`;

    return logic;
  }

  /**
   * Get affected diagnostics for a parameter
   */
  private getAffectedDiagnostics(parameterName: string): string[] {
    const diagnostics: string[] = [];

    // Map common parameters to their related diagnostics
    const diagnosticMap: { [key: string]: string[] } = {
      'Fuel Injection Quantity': ['P0087', 'P0088', 'High EGT', 'Smoke'],
      'Rail Pressure': ['P0087', 'P0088', 'P0089', 'Fuel System Fault'],
      'Exhaust Gas Temperature': ['EGT Fault', 'DPF Fault', 'Turbo Fault'],
      'Boost Pressure': ['P0299', 'P0046', 'Turbo Fault'],
      'VGT Vane Position': ['P0046', 'Boost Fault'],
    };

    return diagnosticMap[parameterName] || [];
  }

  /**
   * Add diagnostic threshold
   */
  private addThreshold(threshold: DiagnosticThreshold): void {
    const key = `${threshold.ecuFamily}:${threshold.parameterName}`;
    this.diagnosticThresholds.set(key, threshold);
  }

  /**
   * Get diagnostic threshold for parameter
   */
  getThreshold(parameterName: string, ecuFamily: string): DiagnosticThreshold | undefined {
    const key = `${ecuFamily}:${parameterName}`;
    return this.diagnosticThresholds.get(key);
  }

  /**
   * Get all model updates (audit trail)
   */
  getModelUpdates(limit: number = 100): ReasoningModelUpdate[] {
    return this.modelUpdates.slice(-limit);
  }

  /**
   * Get model update statistics
   */
  getUpdateStats(): {
    totalUpdates: number;
    byType: { [key: string]: number };
    averageConfidence: number;
    lastUpdated: number;
  } {
    const stats = {
      totalUpdates: this.modelUpdates.length,
      byType: {} as { [key: string]: number },
      averageConfidence: 0,
      lastUpdated: this.modelUpdates.length > 0 ? this.modelUpdates[this.modelUpdates.length - 1].timestamp : 0,
    };

    let totalConfidence = 0;
    for (const update of this.modelUpdates) {
      stats.byType[update.type] = (stats.byType[update.type] || 0) + 1;
      totalConfidence += update.confidence;
    }

    if (this.modelUpdates.length > 0) {
      stats.averageConfidence = totalConfidence / this.modelUpdates.length;
    }

    return stats;
  }

  /**
   * Export reasoning model for persistence
   */
  exportModel(): string {
    const data = {
      diagnosticThresholds: Array.from(this.diagnosticThresholds.entries()),
      faultDetectionRules: Array.from(this.faultDetectionRules.entries()),
      modelUpdates: this.modelUpdates,
    };
    return JSON.stringify(data);
  }

  /**
   * Import reasoning model from persistence
   */
  importModel(data: string): void {
    const parsed = JSON.parse(data);
    this.diagnosticThresholds = new Map(parsed.diagnosticThresholds);
    this.faultDetectionRules = new Map(parsed.faultDetectionRules);
    this.modelUpdates = parsed.modelUpdates;
  }
}
