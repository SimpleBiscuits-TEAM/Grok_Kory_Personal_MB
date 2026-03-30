/**
 * Knox's Learning Engine
 * Learns from uploaded binaries and A2L files to build dynamic knowledge base
 * Every upload makes Knox smarter and more helpful for tuning guidance
 */

export interface LearnedParameter {
  name: string;
  description: string;
  units: string;
  minValue: number;
  maxValue: number;
  scale: number;
  offset: number;
  dataType: string;
  ramAddress?: number;
  flashAddress?: number;
  accessType: 'READ' | 'WRITE' | 'READ_WRITE';
  ecuFamily: string;
  platform: 'CUMMINS' | 'POWERSPORTS' | 'FORD' | 'DURAMAX' | 'OTHER';
  category: string; // 'Fuel', 'Timing', 'Boost', 'Emissions', 'Transmission', etc.
  safetyLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; // Impact on engine safety
  recommendedRange?: { min: number; max: number };
  warnings?: string[];
  relatedParameters?: string[]; // Other params that affect this one
  learningSource: 'A2L' | 'BINARY_PATTERN' | 'USER_FEEDBACK';
  confidence: number; // 0-100%
  lastUpdated: number;
}

export interface LearnedMap {
  name: string;
  description: string;
  ecuFamily: string;
  platform: string;
  axes: {
    x: { name: string; units: string; min: number; max: number };
    y: { name: string; units: string; min: number; max: number };
  };
  dataType: string;
  ramAddress?: number;
  flashAddress?: number;
  accessType: 'READ' | 'WRITE' | 'READ_WRITE';
  safetyLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: string;
  learningSource: 'A2L' | 'BINARY_PATTERN' | 'USER_FEEDBACK';
  confidence: number;
  lastUpdated: number;
}

export interface KnoxKnowledgeBase {
  parameters: Map<string, LearnedParameter>;
  maps: Map<string, LearnedMap>;
  ecuFamilies: Set<string>;
  platforms: Set<string>;
  categories: Set<string>;
  lastUpdated: number;
}

/**
 * Knox's Learning Engine
 */
export class KnoxLearningEngine {
  private knowledgeBase: KnoxKnowledgeBase = {
    parameters: new Map(),
    maps: new Map(),
    ecuFamilies: new Set(),
    platforms: new Set(),
    categories: new Set(),
    lastUpdated: Date.now(),
  };

  constructor() {
    this.initializeBaseKnowledge();
  }

  /**
   * Initialize with base knowledge (Cummins, Powersports, etc.)
   */
  private initializeBaseKnowledge(): void {
    // Base Cummins parameters
    this.addParameter({
      name: 'Fuel Injection Quantity',
      description: 'Amount of fuel injected per cycle (mg/stroke)',
      units: 'mg/stroke',
      minValue: 0,
      maxValue: 200,
      scale: 0.1,
      offset: 0,
      dataType: 'UINT16',
      accessType: 'READ_WRITE',
      ecuFamily: 'CM2100',
      platform: 'CUMMINS',
      category: 'Fuel',
      safetyLevel: 'CRITICAL',
      recommendedRange: { min: 20, max: 150 },
      warnings: ['High values increase EGT and smoke', 'Low values reduce power'],
      learningSource: 'A2L',
      confidence: 95,
      lastUpdated: Date.now(),
    });

    this.addParameter({
      name: 'Fuel Injection Timing',
      description: 'Timing of fuel injection relative to TDC (degrees)',
      units: '°BTDC',
      minValue: -20,
      maxValue: 20,
      scale: 0.1,
      offset: 0,
      dataType: 'INT16',
      accessType: 'READ_WRITE',
      ecuFamily: 'CM2100',
      platform: 'CUMMINS',
      category: 'Timing',
      safetyLevel: 'CRITICAL',
      recommendedRange: { min: -5, max: 5 },
      warnings: ['Advanced timing increases EGT', 'Retarded timing reduces power'],
      learningSource: 'A2L',
      confidence: 95,
      lastUpdated: Date.now(),
    });

    this.addParameter({
      name: 'Boost Pressure Target',
      description: 'Target boost pressure (PSI)',
      units: 'PSI',
      minValue: 0,
      maxValue: 50,
      scale: 0.1,
      offset: 0,
      dataType: 'UINT16',
      accessType: 'READ_WRITE',
      ecuFamily: 'CM2100',
      platform: 'CUMMINS',
      category: 'Boost',
      safetyLevel: 'HIGH',
      recommendedRange: { min: 15, max: 35 },
      warnings: ['High boost increases turbo stress', 'Monitor EGT carefully'],
      relatedParameters: ['VGT Vane Position Target', 'Fuel Injection Quantity'],
      learningSource: 'A2L',
      confidence: 95,
      lastUpdated: Date.now(),
    });

    this.addParameter({
      name: 'Speed Limiter',
      description: 'Maximum vehicle speed (MPH)',
      units: 'MPH',
      minValue: 0,
      maxValue: 200,
      scale: 1,
      offset: 0,
      dataType: 'UINT8',
      accessType: 'READ_WRITE',
      ecuFamily: 'CM2100',
      platform: 'CUMMINS',
      category: 'Limiter',
      safetyLevel: 'MEDIUM',
      recommendedRange: { min: 65, max: 120 },
      warnings: ['Setting too high may void warranty'],
      learningSource: 'A2L',
      confidence: 90,
      lastUpdated: Date.now(),
    });

    this.addParameter({
      name: 'Torque Limiter',
      description: 'Maximum engine torque (lb-ft)',
      units: 'lb-ft',
      minValue: 0,
      maxValue: 2000,
      scale: 1,
      offset: 0,
      dataType: 'UINT16',
      accessType: 'READ_WRITE',
      ecuFamily: 'CM2100',
      platform: 'CUMMINS',
      category: 'Limiter',
      safetyLevel: 'HIGH',
      recommendedRange: { min: 400, max: 1200 },
      warnings: ['High values stress transmission', 'Match to transmission capability'],
      learningSource: 'A2L',
      confidence: 90,
      lastUpdated: Date.now(),
    });
  }

  /**
   * Learn from uploaded A2L file
   */
  async learnFromA2L(a2lContent: string, ecuFamily: string): Promise<void> {
    // Parse A2L and extract parameters
    const parameters = this.parseA2L(a2lContent);

    for (const param of parameters) {
      param.ecuFamily = ecuFamily;
      param.learningSource = 'A2L';
      param.confidence = 95;
      param.lastUpdated = Date.now();
      this.addParameter(param);
    }
  }

  /**
   * Learn from uploaded binary file
   */
  async learnFromBinary(binary: Uint8Array, ecuFamily: string, platform: string): Promise<void> {
    // Scan for map patterns
    const maps = this.scanBinaryForMaps(binary);

    for (const map of maps) {
      map.ecuFamily = ecuFamily;
      map.platform = platform as any;
      map.learningSource = 'BINARY_PATTERN';
      map.confidence = 60; // Lower confidence for binary-only patterns
      map.lastUpdated = Date.now();
      this.addMap(map);
    }
  }

  /**
   * Add learned parameter to knowledge base
   */
  private addParameter(param: LearnedParameter): void {
    const key = `${param.ecuFamily}:${param.name}`;
    this.knowledgeBase.parameters.set(key, param);
    this.knowledgeBase.ecuFamilies.add(param.ecuFamily);
    this.knowledgeBase.platforms.add(param.platform);
    this.knowledgeBase.categories.add(param.category);
    this.knowledgeBase.lastUpdated = Date.now();
  }

  /**
   * Add learned map to knowledge base
   */
  private addMap(map: LearnedMap): void {
    const key = `${map.ecuFamily}:${map.name}`;
    this.knowledgeBase.maps.set(key, map);
    this.knowledgeBase.ecuFamilies.add(map.ecuFamily);
    this.knowledgeBase.platforms.add(map.platform);
    this.knowledgeBase.categories.add(map.category);
    this.knowledgeBase.lastUpdated = Date.now();
  }

  /**
   * Get parameter guidance for Knox to provide to user
   */
  getParameterGuidance(parameterName: string, ecuFamily?: string): string {
    const key = ecuFamily ? `${ecuFamily}:${parameterName}` : parameterName;
    const param = this.knowledgeBase.parameters.get(key);

    if (!param) {
      return `I don't have information about "${parameterName}" yet. Try uploading an A2L file for this ECU.`;
    }

    let guidance = `**${param.name}**\n`;
    guidance += `${param.description}\n\n`;
    guidance += `**Units:** ${param.units}\n`;
    guidance += `**Range:** ${param.minValue} - ${param.maxValue}\n`;

    if (param.recommendedRange) {
      guidance += `**Recommended:** ${param.recommendedRange.min} - ${param.recommendedRange.max}\n`;
    }

    if (param.warnings && param.warnings.length > 0) {
      guidance += `\n**Warnings:**\n`;
      for (const warning of param.warnings) {
        guidance += `- ${warning}\n`;
      }
    }

    if (param.relatedParameters && param.relatedParameters.length > 0) {
      guidance += `\n**Related Parameters:**\n`;
      for (const related of param.relatedParameters) {
        guidance += `- ${related}\n`;
      }
    }

    guidance += `\n**Safety Level:** ${param.safetyLevel}\n`;
    guidance += `**Confidence:** ${param.confidence}%\n`;

    return guidance;
  }

  /**
   * Get all parameters for a specific ECU family
   */
  getParametersForECU(ecuFamily: string): LearnedParameter[] {
    const params: LearnedParameter[] = [];
    for (const [key, param] of Array.from(this.knowledgeBase.parameters)) {
      if (key.startsWith(ecuFamily)) {
        params.push(param);
      }
    }
    return params;
  }

  /**
   * Get all parameters in a category
   */
  getParametersByCategory(category: string, platform?: string): LearnedParameter[] {
    const params: LearnedParameter[] = [];
    const paramValues = Array.from(this.knowledgeBase.parameters.values());
    for (let i = 0; i < paramValues.length; i++) {
      const param = paramValues[i];
      if (param.category === category && (!platform || param.platform === platform)) {
        params.push(param);
      }
    }
    return params;
  }

  /**
   * Parse A2L file to extract parameters
   */
  private parseA2L(a2lContent: string): LearnedParameter[] {
    const parameters: LearnedParameter[] = [];

    // Simple A2L parser - extract CHARACTERISTIC and AXIS_PTS blocks
    const charRegex = /CHARACTERISTIC\s+"([^"]+)"\s+"([^"]+)"\s+VALUE\s+0x([0-9A-Fa-f]+)/g;
    let match;

    while ((match = charRegex.exec(a2lContent)) !== null) {
      const name = match[1];
      const description = match[2];
      const address = parseInt(match[3], 16);

      parameters.push({
        name,
        description,
        units: 'unknown',
        minValue: 0,
        maxValue: 100,
        scale: 1,
        offset: 0,
        dataType: 'UINT16',
        ramAddress: address,
        accessType: 'READ_WRITE',
        ecuFamily: 'UNKNOWN',
        platform: 'OTHER',
        category: 'Other',
        safetyLevel: 'MEDIUM',
        learningSource: 'A2L',
        confidence: 80,
        lastUpdated: Date.now(),
      });
    }

    return parameters;
  }

  /**
   * Scan binary for map patterns
   */
  private scanBinaryForMaps(binary: Uint8Array): LearnedMap[] {
    const maps: LearnedMap[] = [];

    // Look for common map signatures
    // This is a simplified pattern matcher
    for (let i = 0; i < binary.length - 100; i++) {
      // Check for monotonic axis pattern (common in calibration maps)
      if (this.isMonotonicAxis(binary, i)) {
        const map: LearnedMap = {
          name: `Map_0x${i.toString(16)}`,
          description: 'Auto-discovered map from binary pattern',
          ecuFamily: 'UNKNOWN',
          platform: 'OTHER',
          axes: {
            x: { name: 'X Axis', units: 'unknown', min: 0, max: 100 },
            y: { name: 'Y Axis', units: 'unknown', min: 0, max: 100 },
          },
          dataType: 'UINT16',
          ramAddress: i,
          accessType: 'READ_WRITE',
          safetyLevel: 'MEDIUM',
          category: 'Unknown',
          learningSource: 'BINARY_PATTERN',
          confidence: 50,
          lastUpdated: Date.now(),
        };

        maps.push(map);
      }
    }

    return maps;
  }

  /**
   * Check if binary region contains monotonic axis (common in maps)
   */
  private isMonotonicAxis(binary: Uint8Array, offset: number): boolean {
    // Simple check: look for increasing 16-bit values
    let increasing = 0;
    for (let i = 0; i < 32; i += 2) {
      if (offset + i + 2 < binary.length) {
        const val1 = (binary[offset + i] << 8) | binary[offset + i + 1];
        const val2 = (binary[offset + i + 2] << 8) | binary[offset + i + 3];
        if (val2 > val1) {
          increasing++;
        }
      }
    }
    return increasing > 10; // At least 10 increasing values
  }

  /**
   * Get knowledge base statistics
   */
  getStats(): {
    totalParameters: number;
    totalMaps: number;
    ecuFamilies: number;
    platforms: number;
    categories: number;
    lastUpdated: number;
  } {
    return {
      totalParameters: this.knowledgeBase.parameters.size,
      totalMaps: this.knowledgeBase.maps.size,
      ecuFamilies: this.knowledgeBase.ecuFamilies.size,
      platforms: this.knowledgeBase.platforms.size,
      categories: this.knowledgeBase.categories.size,
      lastUpdated: this.knowledgeBase.lastUpdated,
    };
  }

  /**
   * Export knowledge base for persistence
   */
  exportKnowledgeBase(): string {
    const data = {
      parameters: Array.from(this.knowledgeBase.parameters.entries()),
      maps: Array.from(this.knowledgeBase.maps.entries()),
      ecuFamilies: Array.from(this.knowledgeBase.ecuFamilies),
      platforms: Array.from(this.knowledgeBase.platforms),
      categories: Array.from(this.knowledgeBase.categories),
      lastUpdated: this.knowledgeBase.lastUpdated,
    };
    return JSON.stringify(data);
  }

  /**
   * Import knowledge base from persistence
   */
  importKnowledgeBase(data: string): void {
    const parsed = JSON.parse(data);
    this.knowledgeBase.parameters = new Map(parsed.parameters);
    this.knowledgeBase.maps = new Map(parsed.maps);
    this.knowledgeBase.ecuFamilies = new Set(parsed.ecuFamilies);
    this.knowledgeBase.platforms = new Set(parsed.platforms);
    this.knowledgeBase.categories = new Set(parsed.categories);
    this.knowledgeBase.lastUpdated = parsed.lastUpdated;
  }
}
