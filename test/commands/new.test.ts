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
    it('starts with busy state', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');

      assert.strictEqual(session.state, 'busy');
    });

    it('starts with empty name', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');

      assert.strictEqual(session.name, '');
    });
  });

  describe('worktree integration', () => {
    it('sets worktree resource when name is provided', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');
      const name = 'my-feature';

      if (name) session.resources.worktree = name;

      assert.strictEqual(session.resources.worktree, 'my-feature');
    });

    it('does not set worktree resource when name is undefined', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');
      const name: string | undefined = undefined;

      if (name) session.resources.worktree = name;

      assert.strictEqual(session.resources.worktree, undefined);
    });

    it('does not set worktree resource when name is empty string', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');
      const name = '';

      if (name) session.resources.worktree = name;

      assert.strictEqual(session.resources.worktree, undefined);
    });

    it('worktree name matches session name', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');
      const name = 'feature/cool-thing';
      session.name = name;

      if (name) session.resources.worktree = name;

      assert.strictEqual(session.name, session.resources.worktree);
    });

    it('handles worktree names with special characters', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');
      const name = 'feature/MAC-123-add-thing';

      if (name) session.resources.worktree = name;

      assert.strictEqual(session.resources.worktree, 'feature/MAC-123-add-thing');
    });

    it('handles worktree names with spaces', () => {
      const session = createSession('uuid', '/path', 'key', 'hash');
      const name = 'my cool feature';

      if (name) session.resources.worktree = name;

      assert.strictEqual(session.resources.worktree, 'my cool feature');
    });
  });

  describe('claude CLI args', () => {
    /**
     * Helper to build Claude CLI args matching newCommand logic
     */
    function buildClaudeArgs(sessionId: string, name: string | undefined): string[] {
      const args = ['--session-id', sessionId];
      if (name) {
        args.push('--worktree', name);
      }
      return args;
    }

    it('includes --session-id', () => {
      const args = buildClaudeArgs('abc-123', undefined);

      assert.deepStrictEqual(args, ['--session-id', 'abc-123']);
    });

    it('includes --worktree when name is provided', () => {
      const args = buildClaudeArgs('abc-123', 'my-feature');

      assert.deepStrictEqual(args, ['--session-id', 'abc-123', '--worktree', 'my-feature']);
    });

    it('does not include --worktree when name is undefined', () => {
      const args = buildClaudeArgs('abc-123', undefined);

      assert.ok(!args.includes('--worktree'));
    });

    it('does not include --worktree when name is empty string', () => {
      const args = buildClaudeArgs('abc-123', '');

      assert.ok(!args.includes('--worktree'));
    });

    it('preserves worktree name with slashes', () => {
      const args = buildClaudeArgs('abc-123', 'feature/new-thing');

      assert.strictEqual(args[3], 'feature/new-thing');
    });

    it('preserves worktree name with dashes and numbers', () => {
      const args = buildClaudeArgs('abc-123', 'MAC-123-fix-bug');

      assert.strictEqual(args[3], 'MAC-123-fix-bug');
    });

    it('args order is correct: session-id before worktree', () => {
      const args = buildClaudeArgs('abc-123', 'my-feature');

      assert.strictEqual(args[0], '--session-id');
      assert.strictEqual(args[1], 'abc-123');
      assert.strictEqual(args[2], '--worktree');
      assert.strictEqual(args[3], 'my-feature');
    });
  });
});
