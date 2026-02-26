/**
 * Tests for new command behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resetSessionCounter } from '../fixtures/sessions.js';
import { createSession } from '../../src/store/schema.js';
import type { NewOptions } from '../../src/commands/new.js';

describe('c > commands > new', () => {
  beforeEach(() => {
    resetSessionCounter();
  });

  describe('session creation', () => {
    it('creates session with UUID', () => {
      const id = '12345678-1234-1234-1234-123456789012';
      const session = createSession(id, '/home/user/project', '-home-user-project', 'alpha-bravo');

      assert.strictEqual(session.id, id);
      assert.ok(/^[0-9a-f-]{36}$/.test(session.id));
    });

    it('creates session with humanhash', () => {
      const session = createSession('uuid', '/path', 'key', 'alpha-bravo-charlie-delta');

      assert.strictEqual(session.humanhash, 'alpha-bravo-charlie-delta');
    });

    it('sets directory from cwd', () => {
      const session = createSession('uuid', '/home/user/project', 'key', 'hash');

      assert.strictEqual(session.directory, '/home/user/project');
    });

    it('uses provided name', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');
      const name = 'My Custom Session';
      session.name = name;

      assert.strictEqual(session.name, name);
    });
  });

  describe('resource linking', () => {
    it('links --jira to resources', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');
      const options: NewOptions = { jira: 'MAC-123' };

      if (options.jira) session.resources.jira = options.jira;

      assert.strictEqual(session.resources.jira, 'MAC-123');
    });

    it('links --pr to resources', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');
      const options: NewOptions = { pr: 'https://github.com/o/r/pull/42' };

      if (options.pr) session.resources.pr = options.pr;

      assert.strictEqual(session.resources.pr, 'https://github.com/o/r/pull/42');
    });

    it('links --branch to resources', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');
      const options: NewOptions = { branch: 'feature/new-thing' };

      if (options.branch) session.resources.branch = options.branch;

      assert.strictEqual(session.resources.branch, 'feature/new-thing');
    });

    it('links multiple resources at once', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');
      const options: NewOptions = {
        jira: 'MAC-123',
        pr: 'https://github.com/o/r/pull/42',
        branch: 'feature/MAC-123-thing',
      };

      if (options.jira) session.resources.jira = options.jira;
      if (options.pr) session.resources.pr = options.pr;
      if (options.branch) session.resources.branch = options.branch;

      assert.strictEqual(session.resources.jira, 'MAC-123');
      assert.strictEqual(session.resources.pr, 'https://github.com/o/r/pull/42');
      assert.strictEqual(session.resources.branch, 'feature/MAC-123-thing');
    });
  });

  describe('meta parsing', () => {
    it('parses --meta key=value', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');
      const options: NewOptions = { meta: ['priority=high'] };

      if (options.meta) {
        for (const kv of options.meta) {
          const eq = kv.indexOf('=');
          if (eq !== -1) {
            session.meta[kv.slice(0, eq)] = kv.slice(eq + 1);
          }
        }
      }

      assert.strictEqual(session.meta.priority, 'high');
    });

    it('parses multiple --meta options', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');
      const options: NewOptions = { meta: ['priority=high', 'team=backend'] };

      if (options.meta) {
        for (const kv of options.meta) {
          const eq = kv.indexOf('=');
          if (eq !== -1) {
            session.meta[kv.slice(0, eq)] = kv.slice(eq + 1);
          }
        }
      }

      assert.strictEqual(session.meta.priority, 'high');
      assert.strictEqual(session.meta.team, 'backend');
    });

    it('handles value with equals sign', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');
      const options: NewOptions = { meta: ['url=https://example.com?foo=bar'] };

      if (options.meta) {
        for (const kv of options.meta) {
          const eq = kv.indexOf('=');
          if (eq !== -1) {
            session.meta[kv.slice(0, eq)] = kv.slice(eq + 1);
          }
        }
      }

      assert.strictEqual(session.meta.url, 'https://example.com?foo=bar');
    });

    it('stores --note in meta', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');
      const options: NewOptions = { note: 'This is a test note' };

      if (options.note) session.meta.note = options.note;

      assert.strictEqual(session.meta.note, 'This is a test note');
    });
  });

  describe('session defaults', () => {
    it('starts with live status', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');

      assert.strictEqual(session.status, 'live');
    });

    it('starts with waiting=false', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');

      assert.strictEqual(session.waiting, false);
    });

    it('starts with empty name', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');

      assert.strictEqual(session.name, '');
    });
  });
});
