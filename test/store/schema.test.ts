/**
 * Tests for store schema functions
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createDefaultIndex, createSession } from '../../src/store/schema.js';

describe('c', () => {
  describe('store', () => {
    describe('schema', () => {
      describe('createDefaultIndex', () => {
        it('defaults to version 1', () => {
          const index = createDefaultIndex('test-machine');
          assert.strictEqual(index.version, 1);
        });

        it('sets machine_id from argument', () => {
          const index = createDefaultIndex('my-hostname');
          assert.strictEqual(index.machine_id, 'my-hostname');
        });

        it('starts with no sessions', () => {
          const index = createDefaultIndex('test');
          assert.deepStrictEqual(index.sessions, {});
        });
      });

      describe('createSession', () => {
        it('defaults to busy', () => {
          const session = createSession('uuid', '/path', 'key');
          assert.strictEqual(session.state, 'busy');
        });

        it('starts with no resources', () => {
          const session = createSession('uuid', '/path', 'key');
          assert.deepStrictEqual(session.resources, {});
        });

        it('starts with no servers', () => {
          const session = createSession('uuid', '/path', 'key');
          assert.deepStrictEqual(session.servers, {});
        });

        it('starts with no tags', () => {
          const session = createSession('uuid', '/path', 'key');
          assert.deepStrictEqual(session.tags, { values: [] });
        });

        it('starts with no meta', () => {
          const session = createSession('uuid', '/path', 'key');
          assert.deepStrictEqual(session.meta, {});
        });

        it('sets id from argument', () => {
          const session = createSession('my-uuid', '/path', 'key');
          assert.strictEqual(session.id, 'my-uuid');
        });

        it('sets directory from argument', () => {
          const session = createSession('uuid', '/my/project', 'key');
          assert.strictEqual(session.directory, '/my/project');
        });

        it('sets project_key from argument', () => {
          const session = createSession('uuid', '/path', 'my-project-key');
          assert.strictEqual(session.project_key, 'my-project-key');
        });

        it('sets created_at from argument', () => {
          const date = new Date('2024-01-15T10:00:00Z');
          const session = createSession('uuid', '/path', 'key', date);
          assert.strictEqual(session.created_at.toISOString(), '2024-01-15T10:00:00.000Z');
        });

        it('mirrors created_at for last_active_at', () => {
          const date = new Date('2024-01-15T10:00:00Z');
          const session = createSession('uuid', '/path', 'key', date);
          assert.strictEqual(session.last_active_at.toISOString(), session.created_at.toISOString());
        });

        it('defaults created_at to now when not provided', () => {
          const before = new Date();
          const session = createSession('uuid', '/path', 'key');
          const after = new Date();

          assert.ok(session.created_at >= before);
          assert.ok(session.created_at <= after);
        });

        it('defaults to unnamed', () => {
          const session = createSession('uuid', '/path', 'key');
          assert.strictEqual(session.name, '');
        });

        it('omits parent_session_id by default', () => {
          const session = createSession('uuid', '/path', 'key');
          assert.strictEqual(session.parent_session_id, undefined);
        });
      });
    });
  });
});
