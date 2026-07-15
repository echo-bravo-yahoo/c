/**
 * Tests for findPlanExecutionParent (src/store/index.ts)
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { resolve } from 'node:path';

let mockPlanExecutionInfoById: Map<string, { slug: string; title: string | null }> = new Map();

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
    getPlanExecutionInfo: (id: string) => mockPlanExecutionInfoById.get(id) ?? null,
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
        mockPlanExecutionInfoById = new Map();
      });

      it('matches a candidate whose ExitPlanMode slug equals the target, regardless of directory', () => {
        mockPlanExecutionInfoById.set('parent1', { slug: 'impl', title: 'Impl' });
        const match = findPlanExecutionParent(
          [{ id: 'parent1', lastActive: new Date('2025-06-01T11:00:00Z') }],
          'impl',
          new Date('2025-06-01T12:00:00Z')
        );
        assert.deepStrictEqual(match, { sessionId: 'parent1', title: 'Impl' });
      });

      it('returns null when no candidate has a matching slug', () => {
        mockPlanExecutionInfoById.set('parent1', { slug: 'other', title: null });
        const match = findPlanExecutionParent(
          [{ id: 'parent1', lastActive: new Date('2025-06-01T11:00:00Z') }],
          'impl',
          new Date('2025-06-01T12:00:00Z')
        );
        assert.strictEqual(match, null);
      });

      it('excludes a candidate whose lastActive is after the before cutoff', () => {
        mockPlanExecutionInfoById.set('future', { slug: 'impl', title: null });
        const match = findPlanExecutionParent(
          [{ id: 'future', lastActive: new Date('2025-06-01T13:00:00Z') }],
          'impl',
          new Date('2025-06-01T12:00:00Z')
        );
        assert.strictEqual(match, null);
      });

      it('picks the most recently active matching candidate when multiple qualify', () => {
        mockPlanExecutionInfoById.set('older', { slug: 'impl', title: null });
        mockPlanExecutionInfoById.set('newer', { slug: 'impl', title: null });
        const match = findPlanExecutionParent(
          [
            { id: 'older', lastActive: new Date('2025-06-01T09:00:00Z') },
            { id: 'newer', lastActive: new Date('2025-06-01T11:00:00Z') },
          ],
          'impl',
          new Date('2025-06-01T12:00:00Z')
        );
        assert.strictEqual(match?.sessionId, 'newer');
      });
    });
  });
});
