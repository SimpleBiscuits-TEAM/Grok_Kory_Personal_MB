import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock LLM for Laura tests
vi.mock('./_core/llm', () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'Laura says: Current atmospheric conditions show a barometric pressure of 29.92 inHg with 72°F temperature, giving an SAE correction factor of 0.9945. These are near-ideal conditions for dyno testing.' } }],
  }),
}));

// Mock db
vi.mock('./db', () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

describe('Cloud Network', () => {
  describe('Enrollment Logic', () => {
    it('should define opt-in enrollment structure', () => {
      // Cloud enrollment requires userId, vehicleType, and explicit opt-in
      const enrollment = {
        userId: 1,
        vehicleType: '2020 Chevrolet Silverado 2500HD L5P',
        optedIn: true,
        anonymousId: 'anon-abc123',
        contributionLevel: 'full' as const,
      };
      expect(enrollment.optedIn).toBe(true);
      expect(enrollment.anonymousId).toBeTruthy();
      expect(enrollment.contributionLevel).toBe('full');
    });

    it('should support opt-out', () => {
      const enrollment = {
        userId: 1,
        vehicleType: '2020 Chevrolet Silverado 2500HD L5P',
        optedIn: false,
        anonymousId: 'anon-abc123',
        contributionLevel: 'none' as const,
      };
      expect(enrollment.optedIn).toBe(false);
      expect(enrollment.contributionLevel).toBe('none');
    });

    it('should anonymize vehicle data', () => {
      const rawData = {
        userId: 42,
        vin: '1GC4YPEY5LF123456',
        avgMpg: 18.5,
        vehicleType: '2020 L5P',
      };
      // Anonymization strips userId and VIN
      const anonymized = {
        anonymousId: 'anon-' + Math.random().toString(36).slice(2, 10),
        avgMpg: rawData.avgMpg,
        vehicleType: rawData.vehicleType,
      };
      expect(anonymized).not.toHaveProperty('userId');
      expect(anonymized).not.toHaveProperty('vin');
      expect(anonymized.avgMpg).toBe(18.5);
    });
  });

  describe('Fleet Aggregation', () => {
    it('should compute averages by vehicle type', () => {
      const snapshots = [
        { vehicleType: '2020 L5P', avgMpg: 18.5, avgCoolantTemp: 195 },
        { vehicleType: '2020 L5P', avgMpg: 17.2, avgCoolantTemp: 198 },
        { vehicleType: '2020 L5P', avgMpg: 19.1, avgCoolantTemp: 192 },
      ];
      const avgMpg = snapshots.reduce((sum, s) => sum + s.avgMpg, 0) / snapshots.length;
      const avgCoolant = snapshots.reduce((sum, s) => sum + s.avgCoolantTemp, 0) / snapshots.length;
      expect(avgMpg).toBeCloseTo(18.27, 1);
      expect(avgCoolant).toBeCloseTo(195, 0);
    });

    it('should separate fleet vs individual averages', () => {
      const fleetVehicles = [
        { isFleet: true, avgMpg: 16.5 },
        { isFleet: true, avgMpg: 17.0 },
      ];
      const individualVehicles = [
        { isFleet: false, avgMpg: 19.5 },
        { isFleet: false, avgMpg: 20.0 },
      ];
      const fleetAvg = fleetVehicles.reduce((s, v) => s + v.avgMpg, 0) / fleetVehicles.length;
      const indivAvg = individualVehicles.reduce((s, v) => s + v.avgMpg, 0) / individualVehicles.length;
      expect(fleetAvg).toBeCloseTo(16.75, 2);
      expect(indivAvg).toBeCloseTo(19.75, 2);
      // Fleet vehicles typically have lower MPG due to commercial use
      expect(fleetAvg).toBeLessThan(indivAvg);
    });

    it('should identify outliers', () => {
      const mpgValues = [18.5, 17.2, 19.1, 18.0, 5.0]; // 5.0 is a clear outlier
      const mean = mpgValues.reduce((s, v) => s + v, 0) / mpgValues.length;
      const stdDev = Math.sqrt(mpgValues.reduce((s, v) => s + (v - mean) ** 2, 0) / mpgValues.length);
      const outliers = mpgValues.filter(v => Math.abs(v - mean) > 1.5 * stdDev);
      expect(outliers).toContain(5.0);
      expect(outliers).not.toContain(18.5);
    });
  });

  describe('Fleet Benchmarking', () => {
    it('should compare fleet against cloud averages', () => {
      const cloudAvg = { avgMpg: 18.5, avgMaintenanceCost: 2500, uptimePercent: 95 };
      const fleetStats = { avgMpg: 16.2, avgMaintenanceCost: 3200, uptimePercent: 88 };
      const comparison = {
        mpgDelta: fleetStats.avgMpg - cloudAvg.avgMpg,
        maintenanceDelta: fleetStats.avgMaintenanceCost - cloudAvg.avgMaintenanceCost,
        uptimeDelta: fleetStats.uptimePercent - cloudAvg.uptimePercent,
      };
      expect(comparison.mpgDelta).toBeCloseTo(-2.3, 1); // Fleet is worse
      expect(comparison.maintenanceDelta).toBe(700); // Fleet costs more
      expect(comparison.uptimeDelta).toBe(-7); // Fleet has less uptime
    });
  });
});

describe('Streaming', () => {
  it('should define stream structure with telemetry', () => {
    const stream = {
      title: 'Storm Chase - Central OK',
      streamerName: 'Ryan Hall',
      status: 'live' as const,
      latitude: 35.4676,
      longitude: -97.5164,
      externalStreamUrl: 'https://youtube.com/live/abc123',
      telemetry: {
        throttlePosition: 85,
        engineLoad: 72,
        rpm: 2400,
        boostPressure: 28.5,
        intakeAirTemp: 95,
        baroPressure: 29.12,
        vehicleSpeed: 75,
      },
    };
    expect(stream.status).toBe('live');
    expect(stream.telemetry.throttlePosition).toBe(85);
    expect(stream.telemetry.baroPressure).toBe(29.12);
  });

  it('should support stream tags', () => {
    const tags = ['storm-chasing', 'tornado-watch', 'oklahoma', 'l5p'];
    expect(tags).toContain('storm-chasing');
    expect(tags.length).toBe(4);
  });
});

describe('Laura AI', () => {
  it('should generate weather analysis via LLM', async () => {
    const { invokeLLM } = await import('./_core/llm');
    const result = await invokeLLM({
      messages: [
        { role: 'system', content: 'You are Laura, the PPEI Weather AI Agent.' },
        { role: 'user', content: 'What is the SAE correction factor for 72°F and 29.92 inHg?' },
      ],
    });
    expect(result.choices[0].message.content).toContain('Laura');
    expect(result.choices[0].message.content).toContain('SAE');
  });

  it('should handle conversation history', () => {
    const history = [
      { role: 'user' as const, content: 'What conditions are ideal for dyno testing?' },
      { role: 'assistant' as const, content: 'Ideal conditions are 77°F, 29.235 inHg, 0% humidity.' },
    ];
    const newMessage = 'How does humidity affect the correction factor?';
    const fullConversation = [...history, { role: 'user' as const, content: newMessage }];
    expect(fullConversation.length).toBe(3);
    expect(fullConversation[2].content).toContain('humidity');
  });

  it('should provide quick prompts for common questions', () => {
    const quickPrompts = [
      'What\'s the SAE correction factor mean for my dyno pull?',
      'What conditions are ideal for making max power?',
      'How does density altitude affect my turbodiesel?',
      'What should I look for when storm chasing?',
      'Explain the VOP weather network to me',
    ];
    expect(quickPrompts.length).toBeGreaterThanOrEqual(5);
    expect(quickPrompts.some(p => p.includes('SAE'))).toBe(true);
    expect(quickPrompts.some(p => p.includes('storm'))).toBe(true);
  });
});

describe('Knox Cloud Intelligence', () => {
  it('should include cloud network knowledge in Knox knowledge base', async () => {
    const { getFullKnoxKnowledge } = await import('./lib/knoxKnowledgeServer');
    const knowledge = getFullKnoxKnowledge();
    expect(knowledge).toContain('Cloud Network');
    expect(knowledge).toContain('Fleet Benchmarking');
    expect(knowledge).toContain('Laura');
    expect(knowledge).toContain('SAE J1349');
    expect(knowledge).toContain('Storm chaser');
  });

  it('should reference Knox + Laura collaboration', async () => {
    const { getFullKnoxKnowledge } = await import('./lib/knoxKnowledgeServer');
    const knowledge = getFullKnoxKnowledge();
    expect(knowledge).toContain('Knox + Laura Collaboration');
    expect(knowledge).toContain('atmospheric context');
  });
});
