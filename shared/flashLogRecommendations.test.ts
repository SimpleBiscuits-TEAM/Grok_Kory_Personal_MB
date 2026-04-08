import { describe, it, expect } from 'vitest';
import {
  analyzeFlashLogForRecommendations,
  patternKeyForNrc,
  FLASH_RECO_DISCLAIMERS,
} from './flashLogRecommendations';
import type { SimulatorLogEntry } from './pcanFlashOrchestrator';

const plan = {
  ecuName: 'Test ECU',
  ecuType: 'E41',
  flashMode: 'FULL_FLASH' as const,
};

describe('flashLogRecommendations', () => {
  it('builds session row and NRC row with pattern key', () => {
    const log: SimulatorLogEntry[] = [
      {
        timestamp: 1200,
        phase: 'SECURITY_ACCESS',
        type: 'nrc',
        message: 'Security denied NRC 0x33',
        nrcCode: 0x33,
      },
    ];
    const a = analyzeFlashLogForRecommendations(log, plan, {
      result: 'FAILED',
      statusMessage: 'Stopped',
      elapsedMs: 5000,
      dryRun: false,
      isRunning: false,
    });
    expect(a.disclaimerLines.length).toBeGreaterThanOrEqual(1);
    expect(a.disclaimerLines[0]).toContain('DISCLAIMER');
    expect(a.rows.some((r) => r.category === 'SESSION')).toBe(true);
    const nrc = a.rows.find((r) => r.category === 'NRC');
    expect(nrc?.patternKey).toBe(patternKeyForNrc('SECURITY_ACCESS', 0x33));
    expect(nrc?.suggestedFix).toMatch(/security/i);
    expect(a.primaryPatternKey).toBe(nrc?.patternKey);
  });

  it('appends community line when aggregate qualifies', () => {
    const log: SimulatorLogEntry[] = [
      {
        timestamp: 100,
        phase: 'BLOCK_TRANSFER',
        type: 'nrc',
        message: 'NRC 0x72',
        nrcCode: 0x72,
      },
    ];
    const pk = patternKeyForNrc('BLOCK_TRANSFER', 0x72);
    const a = analyzeFlashLogForRecommendations(log, plan, {
      result: 'FAILED',
      statusMessage: '',
      elapsedMs: 2000,
      dryRun: true,
      isRunning: false,
    }, {
      aggregates: {
        [pk]: { helpful: 3, unhelpful: 0, topFixes: ['Stable 13.5V bench supply'] },
      },
    });
    const nrc = a.rows.find((r) => r.category === 'NRC');
    expect(nrc?.suggestedFix).toContain('Community');
    expect(nrc?.suggestedFix).toContain('13.5V');
  });

  it('exports static disclaimers', () => {
    expect(FLASH_RECO_DISCLAIMERS.length).toBeGreaterThan(0);
  });
});
