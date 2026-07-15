/**
 * Tests for findPlanExecutionParent (src/store/index.ts)
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { resolve } from 'node:path';

let mockPlanEventsById: Map<string, { slug: string; title: string | null; timestamp: Date }> = new Map();

mock.module(resolve('src/claude/sessions.ts'), {
  namedExports: {
    resetSessionCaches: () => {},
    listClaudeSessions: () => [],
    listClaudeSessionSizes: () => new Map(),
    getClaudeSession: () => null,
    getClaudeSessionsForDirectory: () => [],
    findTranscriptPath: () => null,
    encodeProjectKey: (dir: string) => dir.replace(/\//g, '-'),
    decodeProjectKey: (key: string) => key.replace(/-/g, '/'),
    readClaudeSessionIndex: () => null,
    getClaudeSessionTitles: () => ({}),
    findClaudeSessionIdsByTitle: () => [],
    getPlanExecutionInfo: () => null, // unused by findPlanExecutionParent; kept for export completeness
    getPlanExecutionInfoBefore: (id: string, slug: string, before: Date) => {
      const e = mockPlanEventsById.get(id);
      if (!e || e.slug !== slug || e.timestamp.getTime() > before.getTime()) return null;
      return { title: e.title, timestamp: e.timestamp };
    },
    getPlanContinuationInfo: () => null,
    getCustomTitleFromTranscriptTail: () => null,
    getCwdFromTranscriptHead: () => null,
    CLAUDE_DIR: '/tmp/mock-claude',
    PROJECTS_DIR: '/tmp/mock-claude/projects',
    PLANS_DIR: '/tmp/mock-claude/plans',
    extractPlanTitle: () => null,
  },
});

const { findPlanExecutionParent } = await import('../../src/store/index.ts');

describe('c', () => {
  describe('store', () => {
    describe('findPlanExecutionParent', () => {
      beforeEach(() => {
        mockPlanEventsById = new Map();
      });

      it('matches a candidate whose ExitPlanMode slug equals the target, regardless of directory', () => {
        mockPlanEventsById.set('parent1', { slug: 'impl', title: 'Impl', timestamp: new Date('2025-06-01T11:00:00Z') });
        const match = findPlanExecutionParent(
          ['parent1'],
          'impl',
          new Date('2025-06-01T12:00:00Z')
        );
        assert.deepStrictEqual(match, { sessionId: 'parent1', title: 'Impl' });
      });

      it('returns null when no candidate has a matching slug', () => {
        mockPlanEventsById.set('parent1', { slug: 'other', title: null, timestamp: new Date('2025-06-01T11:00:00Z') });
        const match = findPlanExecutionParent(
          ['parent1'],
          'impl',
          new Date('2025-06-01T12:00:00Z')
        );
        assert.strictEqual(match, null);
      });

      it('excludes a candidate whose plan-write timestamp is after the before cutoff', () => {
        mockPlanEventsById.set('future', { slug: 'impl', title: null, timestamp: new Date('2025-06-01T13:00:00Z') });
        const match = findPlanExecutionParent(
          ['future'],
          'impl',
          new Date('2025-06-01T12:00:00Z')
        );
        assert.strictEqual(match, null);
      });

      it('picks the candidate with the most recent qualifying plan-write event when multiple qualify', () => {
        mockPlanEventsById.set('older', { slug: 'impl', title: null, timestamp: new Date('2025-06-01T09:00:00Z') });
        mockPlanEventsById.set('newer', { slug: 'impl', title: null, timestamp: new Date('2025-06-01T11:00:00Z') });
        const match = findPlanExecutionParent(
          ['older', 'newer'],
          'impl',
          new Date('2025-06-01T12:00:00Z')
        );
        assert.strictEqual(match?.sessionId, 'newer');
      });
    });
  });
});
