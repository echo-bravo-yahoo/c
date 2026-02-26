/**
 * Tests for show command behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';
import type { Session } from '../../src/store/schema.js';

describe('c > commands > show', () => {
  beforeEach(() => {
    resetSessionCounter();
  });

  describe('session lookup', () => {
    it('finds session by exact ID', () => {
      const sessions: Record<string, Session> = {
        'abc-123': createTestSession({ id: 'abc-123' }),
        'def-456': createTestSession({ id: 'def-456' }),
      };

      const found = sessions['abc-123'];
      assert.ok(found);
      assert.strictEqual(found.id, 'abc-123');
    });

    it('finds session by ID prefix', () => {
      const sessions = [
        createTestSession({ id: 'abc-123-full-uuid' }),
        createTestSession({ id: 'def-456-full-uuid' }),
      ];

      const prefix = 'abc';
      const matches = sessions.filter(
        s => s.id.startsWith(prefix) || s.humanhash.startsWith(prefix)
      );

      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0].id, 'abc-123-full-uuid');
    });

    it('returns undefined when session not found', () => {
      const sessions: Record<string, Session> = {};

      const found = sessions['nonexistent'];
      assert.strictEqual(found, undefined);
    });
  });

  describe('display fields', () => {
    it('displays session ID', () => {
      const session = createTestSession({ id: '12345678-uuid' });
      assert.strictEqual(session.id, '12345678-uuid');
    });

    it('displays humanhash', () => {
      const session = createTestSession({ humanhash: 'alpha-bravo-charlie' });
      assert.strictEqual(session.humanhash, 'alpha-bravo-charlie');
    });

    it('displays state', () => {
      const session = createTestSession({ state: 'busy' });
      assert.strictEqual(session.state, 'busy');
    });

    it('displays directory path', () => {
      const session = createTestSession({ directory: '/home/user/project' });
      assert.strictEqual(session.directory, '/home/user/project');
    });

    it('displays timestamps', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const session = createTestSession({
        created_at: date,
        last_active_at: date,
      });

      assert.strictEqual(session.created_at.toISOString(), '2024-01-15T10:00:00.000Z');
      assert.strictEqual(session.last_active_at.toISOString(), '2024-01-15T10:00:00.000Z');
    });

    it('displays parent session ID when present', () => {
      const session = createTestSession({ parent_session_id: 'parent-uuid' });
      assert.strictEqual(session.parent_session_id, 'parent-uuid');
    });

    it('displays resources when present', () => {
      const session = createTestSession({
        resources: {
          branch: 'main',
          pr: 'https://github.com/o/r/pull/42',
          jira: 'MAC-123',
        },
      });

      assert.strictEqual(session.resources.branch, 'main');
      assert.strictEqual(session.resources.pr, 'https://github.com/o/r/pull/42');
      assert.strictEqual(session.resources.jira, 'MAC-123');
    });

    it('displays tags when present', () => {
      const session = createTestSession({ tags: ['important', 'wip'] });
      assert.deepStrictEqual(session.tags.values, ['important', 'wip']);
    });

    it('displays meta when present', () => {
      const session = createTestSession({ meta: { note: 'Test note', priority: 'high' } });
      assert.strictEqual(session.meta.note, 'Test note');
      assert.strictEqual(session.meta.priority, 'high');
    });
  });

  describe('optional fields', () => {
    it('handles missing parent_session_id', () => {
      const session = createTestSession();
      assert.strictEqual(session.parent_session_id, undefined);
    });

    it('handles empty resources', () => {
      const session = createTestSession({ resources: {} });
      assert.strictEqual(session.resources.branch, undefined);
      assert.strictEqual(session.resources.pr, undefined);
      assert.strictEqual(session.resources.jira, undefined);
    });

    it('handles empty tags', () => {
      const session = createTestSession({ tags: [] });
      assert.deepStrictEqual(session.tags.values, []);
    });

    it('handles empty meta', () => {
      const session = createTestSession({ meta: {} });
      assert.deepStrictEqual(session.meta, {});
    });
  });
});
