/**
 * Tests for user-prompt hook behavior
 *
 * Calls the real handleUserPrompt handler against a temp store.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mock } from 'node:test';
import { resolve } from 'node:path';
import { createTestSession } from '../fixtures/sessions.ts';

let mockPlanContinuationInfoById: Map<string, { slug: string }> = new Map();
let mockPlanExecutionInfoById: Map<string, { slug: string; title: string | null; timestamp?: Date }> = new Map();

// Mock claude/sessions before any imports that pull it in. handleUserPrompt imports
// it directly, and transitively via registerNewSession (./session-start.ts) and
// store/index.ts's applyPlanContinuationLink/findPlanExecutionParent.
mock.module(resolve('src/claude/sessions.ts'), {
  namedExports: {
    resetSessionCaches: () => {},
    listClaudeSessions: () => [],
    listClaudeSessionSizes: () => new Map(),
    getClaudeSession: () => null,
    getClaudeSessionsForDirectory: () => [],
    findTranscriptPath: () => null,
    encodeProjectKey: (dir: string) => dir.replace(/[/. ]/g, '-'),
    decodeProjectKey: (key: string) => key.replace(/-/g, '/'),
    readClaudeSessionIndex: () => null,
    getClaudeSessionTitles: () => ({}),
    findClaudeSessionIdsByTitle: () => [],
    getPlanExecutionInfo: () => null,
    getPlanExecutionInfoBefore: (id: string, slug: string, before: Date) => {
      const info = mockPlanExecutionInfoById.get(id);
      if (!info || info.slug !== slug) return null;
      const ts = info.timestamp ?? new Date(0);
      if (ts.getTime() > before.getTime()) return null;
      return { title: info.title, timestamp: ts };
    },
    getPlanContinuationInfo: (id: string) => mockPlanContinuationInfoById.get(id) ?? null,
    getCustomTitleFromTranscriptTail: () => null,
    getCwdFromTranscriptHead: () => null,
    CLAUDE_DIR: '/tmp/mock-claude',
    PROJECTS_DIR: '/tmp/mock-claude/projects',
    PLANS_DIR: '/tmp/mock-claude/plans',
    extractPlanTitle: () => null,
  },
});

const { handleUserPrompt } = await import('../../src/hooks/user-prompt.ts');
const { updateIndex, getSession } = await import('../../src/store/index.ts');
const { encodeProjectKey } = await import('../../src/claude/sessions.ts');
const { setupTempStore } = await import('../helpers/store.ts');
import type { TempStore } from '../helpers/store.ts';

describe('c', () => {
  describe('hooks', () => {
    describe('user-prompt', () => {
      let store: TempStore;

      beforeEach(() => {
        store = setupTempStore();
        mockPlanContinuationInfoById = new Map();
        mockPlanExecutionInfoById = new Map();
      });
      afterEach(() => { store.cleanup(); });

      it('transitions idle to busy', async () => {
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'idle' });
        });

        await handleUserPrompt('s1', '/tmp', null);

        const s = getSession('s1');
        assert.ok(s);
        assert.strictEqual(s.state, 'busy');
      });

      it('transitions waiting to busy', async () => {
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'waiting' });
        });

        await handleUserPrompt('s1', '/tmp', null);

        const s = getSession('s1');
        assert.ok(s);
        assert.strictEqual(s.state, 'busy');
      });

      it('updates last_active_at', async () => {
        const oldDate = new Date('2024-01-01');
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'idle', last_active_at: oldDate });
        });

        await handleUserPrompt('s1', '/tmp', null);

        const s = getSession('s1');
        assert.ok(s);
        assert.ok(s.last_active_at.getTime() > oldDate.getTime());
      });

      it('falls back to cwd session lookup', async () => {
        const dir = '/test/project';
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', directory: dir, state: 'idle' });
          idx.sessions['s2'] = createTestSession({ id: 's2', directory: '/other', state: 'idle' });
        });

        await handleUserPrompt(undefined, dir, null);

        const s1 = getSession('s1');
        const s2 = getSession('s2');
        assert.ok(s1);
        assert.ok(s2);
        assert.strictEqual(s1.state, 'busy');
        assert.strictEqual(s2.state, 'idle');
      });

      it('no-op when session not found', async () => {
        await updateIndex((idx) => {
          idx.sessions['s1'] = createTestSession({ id: 's1', state: 'idle' });
        });

        await handleUserPrompt('nonexistent', '/tmp', null);

        const s = getSession('s1');
        assert.ok(s);
        assert.strictEqual(s.state, 'idle');
      });

      describe('deferred registration', () => {
        it('registers unknown session on first prompt', async () => {
          await handleUserPrompt('new-session', '/some/project', {
            session_id: 'new-session',
            cwd: '/some/project',
          });

          const s = getSession('new-session');
          assert.ok(s, 'session should exist in index');
          assert.strictEqual(s.state, 'busy');
        });

        it('does not overwrite existing session', async () => {
          await updateIndex((idx) => {
            idx.sessions['existing'] = createTestSession({
              id: 'existing',
              name: 'My Session',
              directory: '/some/project',
              state: 'idle',
            });
          });

          await handleUserPrompt('existing', '/some/project', {
            session_id: 'existing',
            cwd: '/some/project',
          });

          const s = getSession('existing');
          assert.ok(s);
          assert.strictEqual(s.name, 'My Session');
          assert.strictEqual(s.state, 'busy');
        });

        it('sets directory and project_key', async () => {
          const cwd = '/home/user/myproject';
          await handleUserPrompt('deferred', cwd, {
            session_id: 'deferred',
            cwd,
          });

          const s = getSession('deferred');
          assert.ok(s, 'session should exist in index');
          assert.strictEqual(s.directory, cwd);
          assert.strictEqual(s.project_key, encodeProjectKey(cwd));
        });

        it('links parent_session_id via deferred registration (regression test for the caf9bffa bug: this is the exact path that silently dropped the link)', async () => {
          const parentId = 'plan-parent';
          const childId = 'never-seen-child';
          const slug = 'regression-slug';

          await updateIndex((idx) => {
            idx.sessions[parentId] = createTestSession({ id: parentId, state: 'closed' });
          });

          mockPlanContinuationInfoById.set(childId, { slug });
          mockPlanExecutionInfoById.set(parentId, {
            slug,
            title: 'Regression Plan',
            timestamp: new Date('2024-01-01'),
          });

          // SessionStart never fired for this id (the "no stdin" case) - UserPromptSubmit
          // is the FIRST hook to see it, and must not lose the parent link that only
          // handleSessionStart used to compute.
          await handleUserPrompt(childId, '/some/project', {
            session_id: childId,
            cwd: '/some/project',
          });

          const s = getSession(childId);
          assert.ok(s, 'session should be registered via deferred registration');
          assert.strictEqual(s.parent_session_id, parentId);
          assert.strictEqual(s.resources.plan, slug);
          assert.strictEqual(s.state, 'busy');

          // Parent backfill happened too, in the same registerNewSession transaction.
          assert.strictEqual(getSession(parentId)?.resources.plan, slug);
        });
      });
    });
  });
});
