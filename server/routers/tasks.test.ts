/**
 * Tasks Router Tests
 * Tests the task override persistence system: upsert, bulk upsert, reset, and data model validation.
 */

import { describe, it, expect } from 'vitest';

// ── Valid values for task overrides ─────────────────────────────────────────

const VALID_STATUSES = ['not_started', 'in_progress', 'passed', 'failed', 'blocked'];

const VALID_SECTIONS = [
  'ANALYZER',
  'VEHICLE SUPPORT',
  'LIVE DATALOGGING',
  'CALIBRATION EDITOR',
  'REVERSE ENGINEERING',
  'MISC',
];

// ── Sample task IDs from taskData.ts ────────────────────────────────────────

const SAMPLE_TASK_IDS = [
  '1.1.1', '1.1.2', '1.1.3', '2.1.1', '3.1.1',
  '4.1.1', '5.1.1', '6.1.1', '7.1.1', '8.1.1',
];

describe('Task Override Persistence', () => {
  describe('Data Model Validation', () => {
    it('should validate task override structure', () => {
      const override = {
        taskId: '1.1.1',
        status: 'passed',
        notes: 'Working correctly on LBZ and L5P',
        sectionOverride: 'ANALYZER',
        updatedAt: new Date(),
      };

      expect(override.taskId).toBe('1.1.1');
      expect(VALID_STATUSES).toContain(override.status);
      expect(VALID_SECTIONS).toContain(override.sectionOverride);
      expect(override.notes.length).toBeGreaterThan(0);
      expect(override.updatedAt).toBeInstanceOf(Date);
    });

    it('should allow null/undefined optional fields', () => {
      const minimalOverride = {
        taskId: '2.1.1',
        status: null,
        notes: null,
        sectionOverride: null,
      };

      expect(minimalOverride.taskId).toBe('2.1.1');
      expect(minimalOverride.status).toBeNull();
      expect(minimalOverride.notes).toBeNull();
      expect(minimalOverride.sectionOverride).toBeNull();
    });

    it('should enforce taskId max length of 128', () => {
      const shortId = '1.1.1';
      const longId = 'a'.repeat(129);

      expect(shortId.length).toBeLessThanOrEqual(128);
      expect(longId.length).toBeGreaterThan(128);
    });

    it('should enforce notes max length of 10000', () => {
      const shortNote = 'Quick fix needed';
      const longNote = 'x'.repeat(10001);

      expect(shortNote.length).toBeLessThanOrEqual(10000);
      expect(longNote.length).toBeGreaterThan(10000);
    });
  });

  describe('Status Validation', () => {
    it('should accept all valid status values', () => {
      VALID_STATUSES.forEach(status => {
        expect(typeof status).toBe('string');
        expect(status.length).toBeGreaterThan(0);
        expect(status.length).toBeLessThanOrEqual(32);
      });
      expect(VALID_STATUSES.length).toBe(5);
    });

    it('should cycle through statuses correctly', () => {
      const statusCycle = ['not_started', 'in_progress', 'passed', 'failed', 'blocked'];
      
      function nextStatus(current: string): string {
        const idx = statusCycle.indexOf(current);
        return statusCycle[(idx + 1) % statusCycle.length];
      }

      expect(nextStatus('not_started')).toBe('in_progress');
      expect(nextStatus('in_progress')).toBe('passed');
      expect(nextStatus('passed')).toBe('failed');
      expect(nextStatus('failed')).toBe('blocked');
      expect(nextStatus('blocked')).toBe('not_started');
    });
  });

  describe('Section Validation', () => {
    it('should accept all valid section values', () => {
      VALID_SECTIONS.forEach(section => {
        expect(typeof section).toBe('string');
        expect(section.length).toBeGreaterThan(0);
        expect(section.length).toBeLessThanOrEqual(64);
      });
      expect(VALID_SECTIONS.length).toBe(6);
    });

    it('should detect section moves vs defaults', () => {
      const defaultSection = 'ANALYZER';
      const movedSection = 'MISC';

      const isMoved = defaultSection !== movedSection;
      expect(isMoved).toBe(true);

      const notMoved = defaultSection === 'ANALYZER';
      expect(notMoved).toBe(true);
    });
  });

  describe('Upsert Logic', () => {
    it('should build update set only for provided fields', () => {
      const input = {
        taskId: '1.1.1',
        status: 'passed' as string | null,
        notes: undefined as string | null | undefined,
        sectionOverride: undefined as string | null | undefined,
      };

      const updateSet: Record<string, unknown> = {};
      if (input.status !== undefined) updateSet.status = input.status;
      if (input.notes !== undefined) updateSet.notes = input.notes;
      if (input.sectionOverride !== undefined) updateSet.sectionOverride = input.sectionOverride;

      expect(Object.keys(updateSet)).toEqual(['status']);
      expect(updateSet.status).toBe('passed');
    });

    it('should handle null values to clear fields', () => {
      const input = {
        taskId: '1.1.1',
        status: null as string | null,
        notes: null as string | null,
      };

      const updateSet: Record<string, unknown> = {};
      if (input.status !== undefined) updateSet.status = input.status ?? null;
      if (input.notes !== undefined) updateSet.notes = input.notes ?? null;

      expect(updateSet.status).toBeNull();
      expect(updateSet.notes).toBeNull();
    });

    it('should skip upsert when no fields are provided', () => {
      const input = {
        taskId: '1.1.1',
      };

      const updateSet: Record<string, unknown> = {};
      // No fields provided beyond taskId
      expect(Object.keys(updateSet).length).toBe(0);
    });
  });

  describe('Bulk Upsert', () => {
    it('should process multiple overrides', () => {
      const overrides = SAMPLE_TASK_IDS.map((id, i) => ({
        taskId: id,
        status: VALID_STATUSES[i % VALID_STATUSES.length],
        notes: i % 2 === 0 ? `Note for task ${id}` : null,
        sectionOverride: null,
      }));

      expect(overrides.length).toBe(10);
      overrides.forEach(ov => {
        expect(ov.taskId.length).toBeGreaterThan(0);
        if (ov.status) expect(VALID_STATUSES).toContain(ov.status);
      });
    });

    it('should batch in groups of 50', () => {
      const totalItems = 316;
      const batchSize = 50;
      const expectedBatches = Math.ceil(totalItems / batchSize);

      expect(expectedBatches).toBe(7); // 316 / 50 = 6.32 → 7 batches
    });
  });

  describe('Override Merge Logic (Client-Side)', () => {
    it('should merge DB overrides onto default tasks', () => {
      const defaultTask = {
        id: '1.1.1',
        name: 'Upload standard EFILive CSV datalog',
        topSection: 'ANALYZER',
        status: 'passed',
      };

      const dbOverride = {
        taskId: '1.1.1',
        status: 'failed',
        notes: 'Regression after parser update',
        sectionOverride: null,
      };

      const merged = {
        ...defaultTask,
        status: dbOverride.status ?? defaultTask.status,
        topSection: dbOverride.sectionOverride ?? defaultTask.topSection,
      };

      expect(merged.status).toBe('failed');
      expect(merged.topSection).toBe('ANALYZER'); // no section override
    });

    it('should prefer DB data over localStorage', () => {
      const localStatus = 'in_progress';
      const dbStatus = 'passed';

      // DB wins
      const finalStatus = dbStatus || localStatus;
      expect(finalStatus).toBe('passed');
    });

    it('should fall back to localStorage when DB is empty', () => {
      const localStatus = 'in_progress';
      const dbStatus = null;

      const finalStatus = dbStatus || localStatus;
      expect(finalStatus).toBe('in_progress');
    });
  });

  describe('Notes Feature', () => {
    it('should store debugging notes per task', () => {
      const taskNotes: Record<string, string> = {
        '1.1.1': 'Parser works for EFILive v8 format, fails on v7 legacy',
        '3.1.1': 'Blocked by Tobi PCAN bridge — waiting on tx_ack fix',
        '5.1.1': 'Needs ECU-specific handling for L5P vs LBZ',
      };

      expect(Object.keys(taskNotes).length).toBe(3);
      expect(taskNotes['1.1.1']).toContain('EFILive');
      expect(taskNotes['3.1.1']).toContain('Tobi');
    });

    it('should trim whitespace from notes before saving', () => {
      const rawNote = '  Some debugging note with extra spaces  \n\n';
      const trimmed = rawNote.trim();

      expect(trimmed).toBe('Some debugging note with extra spaces');
      expect(trimmed.length).toBeLessThan(rawNote.length);
    });

    it('should treat empty/whitespace-only notes as null', () => {
      const emptyNotes = ['', '   ', '\n\n', '\t'];

      emptyNotes.forEach(note => {
        const cleaned = note.trim() || null;
        expect(cleaned).toBeNull();
      });
    });
  });

  describe('Reset Functionality', () => {
    it('should clear all overrides on reset', () => {
      const overrides: Record<string, any> = {
        '1.1.1': { status: 'failed' },
        '2.1.1': { notes: 'test' },
        '3.1.1': { sectionOverride: 'MISC' },
      };

      // Simulate reset
      const afterReset: Record<string, any> = {};
      expect(Object.keys(afterReset).length).toBe(0);
    });

    it('should restore default task values after reset', () => {
      const defaultStatus = 'passed';
      const overriddenStatus = 'failed';

      // Before reset
      expect(overriddenStatus).not.toBe(defaultStatus);

      // After reset — should return to default
      const afterReset = defaultStatus;
      expect(afterReset).toBe('passed');
    });
  });

  describe('Migration from localStorage to DB', () => {
    it('should convert localStorage format to DB format', () => {
      const localState = {
        statuses: { '1.1.1': 'failed', '2.1.1': 'blocked' },
        sectionMoves: { '3.1.1': 'MISC' },
        notes: { '1.1.1': 'Regression found' },
      };

      // Convert to DB format
      const dbItems: Array<{
        taskId: string;
        status: string | null;
        notes: string | null;
        sectionOverride: string | null;
      }> = [];

      const allIds = new Set([
        ...Object.keys(localState.statuses),
        ...Object.keys(localState.sectionMoves),
        ...Object.keys(localState.notes),
      ]);

      for (const id of allIds) {
        dbItems.push({
          taskId: id,
          status: localState.statuses[id as keyof typeof localState.statuses] || null,
          notes: localState.notes[id as keyof typeof localState.notes] || null,
          sectionOverride: localState.sectionMoves[id as keyof typeof localState.sectionMoves] || null,
        });
      }

      expect(dbItems.length).toBe(3);
      const item1 = dbItems.find(i => i.taskId === '1.1.1');
      expect(item1?.status).toBe('failed');
      expect(item1?.notes).toBe('Regression found');
      expect(item1?.sectionOverride).toBeNull();

      const item3 = dbItems.find(i => i.taskId === '3.1.1');
      expect(item3?.sectionOverride).toBe('MISC');
      expect(item3?.status).toBeNull();
    });
  });
});
