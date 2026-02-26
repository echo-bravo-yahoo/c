/**
 * Tests for store schema functions
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createDefaultIndex, createSession } from '../../src/store/schema.js';

describe('c > store > schema > createDefaultIndex', () => {
  it('returns version 1', () => {
    const index = createDefaultIndex('test-machine');
    assert.strictEqual(index.version, 1);
  });

  it('sets machine_id from argument', () => {
    const index = createDefaultIndex('my-hostname');
    assert.strictEqual(index.machine_id, 'my-hostname');
  });

  it('initializes empty sessions object', () => {
    const index = createDefaultIndex('test');
    assert.deepStrictEqual(index.sessions, {});
  });
});

describe('c > store > schema > createSession', () => {
  it('sets status to live', () => {
    const session = createSession('uuid', '/path', 'key', 'hash');
    assert.strictEqual(session.status, 'live');
  });

  it('defaults waiting to false', () => {
    const session = createSession('uuid', '/path', 'key', 'hash');
    assert.strictEqual(session.waiting, false);
  });

  it('initializes empty resources', () => {
    const session = createSession('uuid', '/path', 'key', 'hash');
    assert.deepStrictEqual(session.resources, {});
  });

  it('initializes empty servers', () => {
    const session = createSession('uuid', '/path', 'key', 'hash');
    assert.deepStrictEqual(session.servers, {});
  });

  it('initializes empty tags', () => {
    const session = createSession('uuid', '/path', 'key', 'hash');
    assert.deepStrictEqual(session.tags, { values: [] });
  });

  it('initializes empty meta', () => {
    const session = createSession('uuid', '/path', 'key', 'hash');
    assert.deepStrictEqual(session.meta, {});
  });

  it('sets id from argument', () => {
    const session = createSession('my-uuid', '/path', 'key', 'hash');
    assert.strictEqual(session.id, 'my-uuid');
  });

  it('sets directory from argument', () => {
    const session = createSession('uuid', '/my/project', 'key', 'hash');
    assert.strictEqual(session.directory, '/my/project');
  });

  it('sets project_key from argument', () => {
    const session = createSession('uuid', '/path', 'my-project-key', 'hash');
    assert.strictEqual(session.project_key, 'my-project-key');
  });

  it('sets humanhash from argument', () => {
    const session = createSession('uuid', '/path', 'key', 'alpha-bravo');
    assert.strictEqual(session.humanhash, 'alpha-bravo');
  });

  it('sets created_at from argument', () => {
    const date = new Date('2024-01-15T10:00:00Z');
    const session = createSession('uuid', '/path', 'key', 'hash', date);
    assert.strictEqual(session.created_at.toISOString(), '2024-01-15T10:00:00.000Z');
  });

  it('sets last_active_at to same as created_at', () => {
    const date = new Date('2024-01-15T10:00:00Z');
    const session = createSession('uuid', '/path', 'key', 'hash', date);
    assert.strictEqual(session.last_active_at.toISOString(), session.created_at.toISOString());
  });

  it('defaults created_at to now when not provided', () => {
    const before = new Date();
    const session = createSession('uuid', '/path', 'key', 'hash');
    const after = new Date();

    assert.ok(session.created_at >= before);
    assert.ok(session.created_at <= after);
  });

  it('initializes name as empty string', () => {
    const session = createSession('uuid', '/path', 'key', 'hash');
    assert.strictEqual(session.name, '');
  });

  it('does not include parent_session_id by default', () => {
    const session = createSession('uuid', '/path', 'key', 'hash');
    assert.strictEqual(session.parent_session_id, undefined);
  });
});
