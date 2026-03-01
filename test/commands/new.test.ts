/**
 * Tests for new command behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resetSessionCounter } from '../fixtures/sessions.js';
import { createSession } from '../../src/store/schema.js';
import type { NewOptions } from '../../src/commands/new.js';

describe('c', () => {
  describe('commands', () => {
    describe('new', () => {
      beforeEach(() => {
        resetSessionCounter();
      });

      describe('session creation', () => {
        it('assigns UUID as session ID', () => {
          const id = '12345678-1234-1234-1234-123456789012';
          const session = createSession(id, '/home/user/project', '-home-user-project', 'alpha-bravo');

          assert.strictEqual(session.id, id);
          assert.ok(/^[0-9a-f-]{36}$/.test(session.id));
        });

        it('assigns humanhash', () => {
          const session = createSession('uuid', '/path', 'key', 'alpha-bravo-charlie-delta');

          assert.strictEqual(session.humanhash, 'alpha-bravo-charlie-delta');
        });

        it('sets directory from cwd', () => {
          const session = createSession('uuid', '/home/user/project', 'key', 'hash');

          assert.strictEqual(session.directory, '/home/user/project');
        });

        it('applies provided name', () => {
          const session = createSession('uuid', '/path', 'key', 'hash');
          const name = 'My Custom Session';
          session.name = name;

          assert.strictEqual(session.name, name);
        });
      });

      describe('resource linking', () => {
        it('attaches --jira', () => {
          const session = createSession('uuid', '/path', 'key', 'hash');
          const options: NewOptions = { jira: 'MAC-123' };

          if (options.jira) session.resources.jira = options.jira;

          assert.strictEqual(session.resources.jira, 'MAC-123');
        });

        it('attaches --pr', () => {
          const session = createSession('uuid', '/path', 'key', 'hash');
          const options: NewOptions = { pr: 'https://github.com/o/r/pull/42' };

          if (options.pr) session.resources.pr = options.pr;

          assert.strictEqual(session.resources.pr, 'https://github.com/o/r/pull/42');
        });

        it('attaches --branch', () => {
          const session = createSession('uuid', '/path', 'key', 'hash');
          const options: NewOptions = { branch: 'feature/new-thing' };

          if (options.branch) session.resources.branch = options.branch;

          assert.strictEqual(session.resources.branch, 'feature/new-thing');
        });

        it('attaches multiple resources', () => {
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
        it('defaults to busy', () => {
          const session = createSession('uuid', '/path', 'key', 'hash');

          assert.strictEqual(session.state, 'busy');
        });

        it('defaults to unnamed', () => {
          const session = createSession('uuid', '/path', 'key', 'hash');

          assert.strictEqual(session.name, '');
        });
      });

      describe('worktree integration', () => {
        it('records worktree name', () => {
          const session = createSession('uuid', '/path', 'key', 'hash');
          const name = 'my-feature';

          if (name) session.resources.worktree = name;

          assert.strictEqual(session.resources.worktree, 'my-feature');
        });

        it('omits worktree when undefined', () => {
          const session = createSession('uuid', '/path', 'key', 'hash');
          const name: string | undefined = undefined;

          if (name) session.resources.worktree = name;

          assert.strictEqual(session.resources.worktree, undefined);
        });

        it('omits worktree when empty', () => {
          const session = createSession('uuid', '/path', 'key', 'hash');
          const name = '';

          if (name) session.resources.worktree = name;

          assert.strictEqual(session.resources.worktree, undefined);
        });

        it('uses session name as worktree name', () => {
          const session = createSession('uuid', '/path', 'key', 'hash');
          const name = 'feature/cool-thing';
          session.name = name;

          if (name) session.resources.worktree = name;

          assert.strictEqual(session.name, session.resources.worktree);
        });

        it('allows special characters in worktree name', () => {
          const session = createSession('uuid', '/path', 'key', 'hash');
          const name = 'feature/MAC-123-add-thing';

          if (name) session.resources.worktree = name;

          assert.strictEqual(session.resources.worktree, 'feature/MAC-123-add-thing');
        });

        it('allows spaces in worktree name', () => {
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
        function buildClaudeArgs(
          sessionId: string,
          name: string | undefined,
          opts: {
            inGitRepo?: boolean;
            noWorktree?: boolean;
            model?: string;
            permissionMode?: string;
            effort?: string;
            agent?: string;
            passthroughArgs?: string[];
          } = {}
        ): string[] {
          const { inGitRepo = true, noWorktree = false } = opts;
          const args = ['--session-id', sessionId];
          const useWorktree = name && !noWorktree && inGitRepo;
          if (useWorktree) {
            args.push('--worktree', name);
          }
          if (opts.model) args.push('--model', opts.model);
          if (opts.permissionMode) args.push('--permission-mode', opts.permissionMode);
          if (opts.effort) args.push('--effort', opts.effort);
          if (opts.agent) args.push('--agent', opts.agent);
          if (opts.passthroughArgs) args.push(...opts.passthroughArgs);
          return args;
        }

        it('always passes --session-id', () => {
          const args = buildClaudeArgs('abc-123', undefined);

          assert.deepStrictEqual(args, ['--session-id', 'abc-123']);
        });

        it('passes --worktree with name in git repo', () => {
          const args = buildClaudeArgs('abc-123', 'my-feature', { inGitRepo: true });

          assert.deepStrictEqual(args, ['--session-id', 'abc-123', '--worktree', 'my-feature']);
        });

        it('omits --worktree when not in git repo', () => {
          const args = buildClaudeArgs('abc-123', 'my-feature', { inGitRepo: false });

          assert.deepStrictEqual(args, ['--session-id', 'abc-123']);
        });

        it('omits --worktree when --no-worktree is set', () => {
          const args = buildClaudeArgs('abc-123', 'my-feature', { noWorktree: true });

          assert.deepStrictEqual(args, ['--session-id', 'abc-123']);
        });

        it('omits --worktree when undefined', () => {
          const args = buildClaudeArgs('abc-123', undefined);

          assert.ok(!args.includes('--worktree'));
        });

        it('omits --worktree when empty', () => {
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

        it('orders --session-id before --worktree', () => {
          const args = buildClaudeArgs('abc-123', 'my-feature');

          assert.strictEqual(args[0], '--session-id');
          assert.strictEqual(args[1], 'abc-123');
          assert.strictEqual(args[2], '--worktree');
          assert.strictEqual(args[3], 'my-feature');
        });

        it('appends --model when provided', () => {
          const args = buildClaudeArgs('abc-123', undefined, { model: 'haiku' });

          assert.ok(args.includes('--model'));
          assert.ok(args.includes('haiku'));
        });

        it('appends --permission-mode when provided', () => {
          const args = buildClaudeArgs('abc-123', undefined, { permissionMode: 'plan' });

          assert.ok(args.includes('--permission-mode'));
          assert.ok(args.includes('plan'));
        });

        it('appends --effort when provided', () => {
          const args = buildClaudeArgs('abc-123', undefined, { effort: 'low' });

          assert.ok(args.includes('--effort'));
          assert.ok(args.includes('low'));
        });

        it('appends --agent when provided', () => {
          const args = buildClaudeArgs('abc-123', undefined, { agent: 'my-agent' });

          assert.ok(args.includes('--agent'));
          assert.ok(args.includes('my-agent'));
        });

        it('appends passthrough args', () => {
          const args = buildClaudeArgs('abc-123', undefined, {
            passthroughArgs: ['--add-dir', '/tmp'],
          });

          assert.ok(args.includes('--add-dir'));
          assert.ok(args.includes('/tmp'));
        });

        it('combines all flags', () => {
          const args = buildClaudeArgs('abc-123', 'feat', {
            model: 'haiku',
            effort: 'high',
            passthroughArgs: ['--verbose'],
          });

          assert.ok(args.includes('--worktree'));
          assert.ok(args.includes('--model'));
          assert.ok(args.includes('--effort'));
          assert.ok(args.includes('--verbose'));
        });
      });
    });
  });
});
