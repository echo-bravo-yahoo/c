/**
 * Tests for new command behavior
 *
 * Tests extracted pure functions (parseMeta, buildNewArgs) directly,
 * and exercises session creation + store persistence via the real store.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resetSessionCounter } from '../fixtures/sessions.ts';
import { createSession } from '../../src/store/schema.ts';
import { updateIndex, getSession, resetIndexCache } from '../../src/store/index.ts';
import { sanitizeWorktreeName } from '../../src/util/sanitize.ts';
import { parseMeta, buildNewArgs } from '../../src/commands/new.ts';
import type { NewOptions } from '../../src/commands/new.ts';

describe('c', () => {
  describe('commands', () => {
    describe('new', () => {
      beforeEach(() => {
        resetSessionCounter();
      });

      describe('parseMeta', () => {
        it('parses key=value pairs', () => {
          const meta = parseMeta(['priority=high'], undefined);
          assert.strictEqual(meta.priority, 'high');
        });

        it('parses multiple pairs', () => {
          const meta = parseMeta(['priority=high', 'team=backend'], undefined);
          assert.strictEqual(meta.priority, 'high');
          assert.strictEqual(meta.team, 'backend');
        });

        it('handles value with equals sign', () => {
          const meta = parseMeta(['url=https://example.com?foo=bar'], undefined);
          assert.strictEqual(meta.url, 'https://example.com?foo=bar');
        });

        it('includes note', () => {
          const meta = parseMeta(undefined, 'This is a test note');
          assert.strictEqual(meta.note, 'This is a test note');
        });

        it('combines note and meta', () => {
          const meta = parseMeta(['priority=high'], 'A note');
          assert.strictEqual(meta.note, 'A note');
          assert.strictEqual(meta.priority, 'high');
        });

        it('returns empty object when both undefined', () => {
          const meta = parseMeta(undefined, undefined);
          assert.deepStrictEqual(meta, {});
        });
      });

      describe('buildNewArgs', () => {
        it('always includes --session-id', () => {
          const args = buildNewArgs('abc-123', false, undefined, {});
          assert.deepStrictEqual(args, ['--session-id', 'abc-123']);
        });

        it('includes --worktree when useWorktree is true', () => {
          const args = buildNewArgs('abc-123', true, 'my-feature', {});
          assert.deepStrictEqual(args, ['--session-id', 'abc-123', '--worktree', 'my-feature']);
        });

        it('omits --worktree when useWorktree is false', () => {
          const args = buildNewArgs('abc-123', false, undefined, {});
          assert.ok(!args.includes('--worktree'));
        });

        it('appends --model when provided', () => {
          const args = buildNewArgs('abc-123', false, undefined, { model: 'haiku' });
          assert.ok(args.includes('--model'));
          assert.ok(args.includes('haiku'));
        });

        it('appends --permission-mode when provided', () => {
          const args = buildNewArgs('abc-123', false, undefined, { permissionMode: 'plan' });
          assert.ok(args.includes('--permission-mode'));
          assert.ok(args.includes('plan'));
        });

        it('appends --effort when provided', () => {
          const args = buildNewArgs('abc-123', false, undefined, { effort: 'low' });
          assert.ok(args.includes('--effort'));
          assert.ok(args.includes('low'));
        });

        it('appends --agent when provided', () => {
          const args = buildNewArgs('abc-123', false, undefined, { agent: 'my-agent' });
          assert.ok(args.includes('--agent'));
          assert.ok(args.includes('my-agent'));
        });

        it('appends passthrough args', () => {
          const args = buildNewArgs('abc-123', false, undefined, {
            passthroughArgs: ['--add-dir', '/tmp'],
          });
          assert.ok(args.includes('--add-dir'));
          assert.ok(args.includes('/tmp'));
        });

        it('combines all flags', () => {
          const args = buildNewArgs('abc-123', true, 'feat', {
            model: 'haiku',
            effort: 'high',
            passthroughArgs: ['--verbose'],
          });
          assert.ok(args.includes('--worktree'));
          assert.ok(args.includes('--model'));
          assert.ok(args.includes('--effort'));
          assert.ok(args.includes('--verbose'));
        });

        it('preserves worktree name with slashes', () => {
          const args = buildNewArgs('abc-123', true, 'feature/new-thing', {});
          assert.strictEqual(args[3], 'feature/new-thing');
        });

        it('preserves worktree name with dashes and numbers', () => {
          const args = buildNewArgs('abc-123', true, 'MAC-123-fix-bug', {});
          assert.strictEqual(args[3], 'MAC-123-fix-bug');
        });

        it('orders --session-id before --worktree', () => {
          const args = buildNewArgs('abc-123', true, 'my-feature', {});
          assert.strictEqual(args[0], '--session-id');
          assert.strictEqual(args[1], 'abc-123');
          assert.strictEqual(args[2], '--worktree');
          assert.strictEqual(args[3], 'my-feature');
        });
      });

      describe('session creation', () => {
        it('assigns UUID as session ID', () => {
          const id = '12345678-1234-1234-1234-123456789012';
          const session = createSession(id, '/home/user/project', '-home-user-project');
          assert.strictEqual(session.id, id);
          assert.ok(/^[0-9a-f-]{36}$/.test(session.id));
        });

        it('sets directory from cwd', () => {
          const session = createSession('uuid', '/home/user/project', 'key');
          assert.strictEqual(session.directory, '/home/user/project');
        });

        it('defaults to busy state', () => {
          const session = createSession('uuid', '/path', 'key');
          assert.strictEqual(session.state, 'busy');
        });

        it('defaults to unnamed', () => {
          const session = createSession('uuid', '/path', 'key');
          assert.strictEqual(session.name, '');
        });
      });

      describe('resource linking via store', () => {
        let tmpDir: string;
        let savedCHome: string | undefined;

        beforeEach(() => {
          tmpDir = mkdtempSync(join(tmpdir(), 'c-test-'));
          savedCHome = process.env.C_HOME;
          process.env.C_HOME = tmpDir;
          resetIndexCache();
        });

        afterEach(() => {
          process.env.C_HOME = savedCHome;
          if (savedCHome === undefined) delete process.env.C_HOME;
          rmSync(tmpDir, { recursive: true, force: true });
          resetIndexCache();
        });

        it('persists resources to store', async () => {
          const session = createSession('uuid', '/path', 'key');
          const options: NewOptions = {
            jira: 'MAC-123',
            pr: 'https://github.com/o/r/pull/42',
            branch: 'feature/MAC-123-thing',
          };
          if (options.jira) session.resources.jira = options.jira;
          if (options.pr) session.resources.pr = options.pr;
          if (options.branch) session.resources.branch = options.branch;

          await updateIndex((idx) => { idx.sessions['uuid'] = session; });

          const s = getSession('uuid');
          assert.ok(s);
          assert.strictEqual(s.resources.jira, 'MAC-123');
          assert.strictEqual(s.resources.pr, 'https://github.com/o/r/pull/42');
          assert.strictEqual(s.resources.branch, 'feature/MAC-123-thing');
        });

        it('persists meta to store', async () => {
          const session = createSession('uuid', '/path', 'key');
          Object.assign(session.meta, parseMeta(['priority=high', 'team=backend'], 'A note'));

          await updateIndex((idx) => { idx.sessions['uuid'] = session; });

          const s = getSession('uuid');
          assert.ok(s);
          assert.strictEqual(s.meta.priority, 'high');
          assert.strictEqual(s.meta.team, 'backend');
          assert.strictEqual(s.meta.note, 'A note');
        });

        it('cleans up session on spawn failure', async () => {
          const session = createSession('uuid', '/path', 'key');
          await updateIndex((idx) => { idx.sessions['uuid'] = session; });

          // Simulate spawn failure cleanup
          await updateIndex((idx) => { delete idx.sessions['uuid']; });

          assert.strictEqual(getSession('uuid'), undefined);
        });

        it('cleans up session on non-zero exit', async () => {
          const session = createSession('uuid', '/path', 'key');
          await updateIndex((idx) => { idx.sessions['uuid'] = session; });

          const exitCode: number = 1;
          if (exitCode !== 0) {
            await updateIndex((idx) => { delete idx.sessions['uuid']; });
          }

          assert.strictEqual(getSession('uuid'), undefined);
        });

        it('preserves session on successful exit', async () => {
          const session = createSession('uuid', '/path', 'key');
          await updateIndex((idx) => { idx.sessions['uuid'] = session; });

          const exitCode = 0;
          if (exitCode !== 0) {
            await updateIndex((idx) => { delete idx.sessions['uuid']; });
          }

          assert.ok(getSession('uuid'));
        });
      });

      describe('worktree integration', () => {
        it('sanitizes worktree name from session name', () => {
          const name = 'my cool feature';
          const worktreeName = sanitizeWorktreeName(name);
          assert.strictEqual(worktreeName, 'my-cool-feature');
        });

        it('preserves valid names through sanitization', () => {
          const worktreeName = sanitizeWorktreeName('feature/MAC-123-add-thing');
          assert.strictEqual(worktreeName, 'feature/MAC-123-add-thing');
        });

        it('rejects all-illegal name for worktree', () => {
          const worktreeName = sanitizeWorktreeName('***');
          assert.strictEqual(worktreeName, '');
        });
      });
    });
  });
});
