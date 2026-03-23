/**
 * Tests for show command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { setupCLI, stripAnsi, type CLIHarness } from '../helpers/cli.ts';

describe('c', () => {
  describe('commands', () => {
    describe('show', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      describe('session lookup', () => {
        it('finds session by exact ID', async () => {
          await cli.seed({ id: 'abc-123' });
          await cli.run('show', 'abc-123');

          assert.strictEqual(cli.exit.exitCode, null);
          assert.ok(cli.console.logs.some(l => l.includes('abc-123')));
        });

        it('finds session by ID prefix', async () => {
          await cli.seed({ id: 'abc-123-full-uuid' });
          await cli.run('show', 'abc');

          assert.strictEqual(cli.exit.exitCode, null);
          assert.ok(cli.console.logs.some(l => l.includes('abc-123-full-uuid')));
        });

        it('exits 1 when session not found', async () => {
          await cli.run('show', 'nonexistent');

          assert.strictEqual(cli.exit.exitCode, 1);
          assert.ok(cli.console.errors.some(l => l.includes('not found')));
        });

        it('finds session by exact name', async () => {
          await cli.seed({ id: 'abc12345', name: 'Resume session by name' });
          await cli.run('show', 'Resume session by name');

          assert.strictEqual(cli.exit.exitCode, null);
          assert.ok(cli.console.logs.some(l => l.includes('abc12345')));
        });

        it('finds session by _custom_title', async () => {
          await cli.seed({ id: 'abc12345', meta: { _custom_title: 'my fancy title' } });
          await cli.run('show', 'my fancy title');

          assert.strictEqual(cli.exit.exitCode, null);
          assert.ok(cli.console.logs.some(l => l.includes('abc12345')));
        });

        it('resolves unquoted multi-word name', async () => {
          await cli.seed({ id: 'abc12345', name: 'my cool thing' });
          await cli.run('show', 'my', 'cool', 'thing');

          assert.strictEqual(cli.exit.exitCode, null);
          assert.ok(cli.console.logs.some(l => l.includes('abc12345')));
        });

        it('parses --json after multi-word name', async () => {
          await cli.seed({ id: 'abc12345', name: 'my cool thing' });
          await cli.run('show', 'my', 'cool', 'thing', '--json');

          assert.strictEqual(cli.exit.exitCode, null);
          assert.ok(cli.stdout.output.join('').includes('abc12345'));
        });

        it('errors on multiple name matches', async () => {
          await cli.seed(
            { id: 'abc12345-0000-0000-0000-000000000001', name: 'same name' },
            { id: 'def67890-0000-0000-0000-000000000001', name: 'same name' },
          );
          await cli.run('show', 'same name');

          assert.strictEqual(cli.exit.exitCode, 1);
          assert.ok(cli.console.errors.some(l => l.includes('Multiple sessions')));
        });

        it('name match wins over _custom_title on different session', async () => {
          await cli.seed(
            { id: 'sname001', name: 'my task' },
            { id: 'stitle01', name: '', meta: { _custom_title: 'my task' } },
          );
          await cli.run('show', 'my task');

          assert.strictEqual(cli.exit.exitCode, null);
          assert.ok(cli.console.logs.some(l => l.includes('sname001')));
        });
      });

      describe('display fields', () => {
        it('displays session ID', async () => {
          await cli.seed({ id: '12345678-uuid' });
          await cli.run('show', '12345678-uuid');

          assert.ok(cli.console.logs.some(l => l.includes('12345678-uuid')));
        });

        it('displays state', async () => {
          await cli.seed({ id: 'abc12345', state: 'busy' });
          await cli.run('show', 'abc12345');

          assert.ok(cli.console.logs.some(l => l.includes('busy')));
        });

        it('displays directory path', async () => {
          await cli.seed({ id: 'abc12345', directory: '/home/user/project' });
          await cli.run('show', 'abc12345');

          assert.ok(cli.console.logs.some(l => l.includes('/home/user/project')));
        });

        it('displays resources when present', async () => {
          await cli.seed({
            id: 'abc12345',
            resources: { branch: 'main', pr: 'https://github.com/o/r/pull/42', jira: 'MAC-123' },
          });
          await cli.run('show', 'abc12345');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('main'));
          assert.ok(output.includes('pull/42'));
          assert.ok(output.includes('MAC-123'));
        });

        it('displays tags when present', async () => {
          await cli.seed({ id: 'abc12345', tags: ['important', 'wip'] });
          await cli.run('show', 'abc12345');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('important'));
          assert.ok(output.includes('wip'));
        });

        it('displays meta when present', async () => {
          await cli.seed({ id: 'abc12345', meta: { note: 'Test note', priority: 'high' } });
          await cli.run('show', 'abc12345');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('Test note'));
          assert.ok(output.includes('high'));
        });
      });

      describe('duration display', () => {
        it('shows minutes for short sessions', async () => {
          const created = new Date('2025-06-01T10:00:00Z');
          const lastActive = new Date('2025-06-01T10:30:00Z');
          await cli.seed({ id: 'abc12345', created_at: created, last_active_at: lastActive });
          await cli.run('show', 'abc12345');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('30m'), 'should show 30m duration');
        });

        it('shows hours and minutes', async () => {
          const created = new Date('2025-06-01T10:00:00Z');
          const lastActive = new Date('2025-06-01T11:30:00Z');
          await cli.seed({ id: 'abc12345', created_at: created, last_active_at: lastActive });
          await cli.run('show', 'abc12345');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('1h 30m'), 'should show 1h 30m duration');
        });

        it('shows days and hours', async () => {
          const created = new Date('2025-06-01T10:00:00Z');
          const lastActive = new Date('2025-06-03T13:00:00Z');
          await cli.seed({ id: 'abc12345', created_at: created, last_active_at: lastActive });
          await cli.run('show', 'abc12345');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('2d 3h'), 'should show 2d 3h duration');
        });
      });

      describe('resources section', () => {
        it('shows branch', async () => {
          await cli.seed({
            id: 'abc12345',
            resources: { branch: 'feature/auth' },
          });
          await cli.run('show', 'abc12345');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('Branch:'), 'should have Branch label');
          assert.ok(output.includes('feature/auth'), 'should show branch name');
        });

        it('shows PR', async () => {
          await cli.seed({
            id: 'abc12345',
            resources: { pr: 'https://github.com/o/r/pull/42' },
          });
          await cli.run('show', 'abc12345');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('PR:'), 'should have PR label');
          assert.ok(output.includes('pull/42'), 'should show PR URL');
        });

        it('shows JIRA', async () => {
          await cli.seed({
            id: 'abc12345',
            resources: { jira: 'PROJ-99' },
          });
          await cli.run('show', 'abc12345');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('JIRA:'), 'should have JIRA label');
          assert.ok(output.includes('PROJ-99'), 'should show JIRA ticket');
        });

        it('shows worktree', async () => {
          await cli.seed({
            id: 'abc12345',
            resources: { worktree: 'my-worktree' },
          });
          await cli.run('show', 'abc12345');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('Worktree:'), 'should have Worktree label');
          assert.ok(output.includes('my-worktree'), 'should show worktree name');
        });
      });

      describe('servers display', () => {
        it('shows servers when present', async () => {
          await cli.seed({
            id: 'abc12345',
            servers: { '1234:8080': 'node server.js' },
          });
          await cli.run('show', 'abc12345');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('Servers:'), 'should have Servers label');
          assert.ok(output.includes('1234:8080'), 'should show PID:port');
          assert.ok(output.includes('node server.js'), 'should show command');
        });
      });

      describe('family tree', () => {
        it('shows family tree for child session', async () => {
          await cli.seed(
            { id: 'sparent1', state: 'busy', name: 'Parent' },
            { id: 'schild01', state: 'busy', name: 'Child', parent_session_id: 'sparent1' },
          );
          await cli.run('show', 'schild01');

          const output = stripAnsi(cli.console.logs.join('\n'));
          assert.ok(output.includes('Family tree:'), 'should have Family tree label');
          assert.ok(output.includes('sparent'), 'should show parent ID');
          assert.ok(output.includes('schild0'), 'should show child ID');
        });

        it('shows family tree for parent session', async () => {
          await cli.seed(
            { id: 'sparent2', state: 'busy', name: 'Parent' },
            { id: 'schild02', state: 'busy', name: 'Child', parent_session_id: 'sparent2' },
          );
          await cli.run('show', 'sparent2');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('Family tree:'), 'should have Family tree label');
        });
      });

      describe('--json output', () => {
        it('JSON matches seeded session', async () => {
          const t = new Date('2025-06-01T12:00:00Z');
          const seed = {
            id: 'abc12345', state: 'busy' as const, name: 'Full Session',
            directory: '/home/u/proj',
            created_at: t, last_active_at: t,
            resources: { branch: 'main', pr: 'https://github.com/o/r/pull/1', jira: 'PROJ-1', worktree: 'wt-1' },
            servers: { '123:8080': 'node server.js' },
            tags: ['wip', 'urgent'],
            meta: { priority: 'high' },
            pid: 42567,
            parent_session_id: 'parent-uuid',
          };
          await cli.seed(seed);
          await cli.run('show', 'abc12345', '--json');

          assert.deepStrictEqual(JSON.parse(cli.stdout.output.join('')), {
            ...seed,
            project_key: '-home-test-project',
            created_at: t.toISOString(),
            last_active_at: t.toISOString(),
            tags: { values: seed.tags },
          });
        });

        it('exits 1 with no JSON when session not found', async () => {
          await cli.run('show', 'nonexistent', '--json');

          assert.strictEqual(cli.exit.exitCode, 1);
          assert.strictEqual(cli.stdout.output.join(''), '', 'no JSON on stdout');
          assert.ok(cli.console.errors.some(l => l.includes('not found')));
        });
      });

      describe('pid display', () => {
        it('shows PID when session has one', async () => {
          await cli.seed({ id: 'abc12345', pid: 42567 });
          await cli.run('show', 'abc12345');

          const output = cli.console.logs.join('\n');
          assert.match(output, /PID/);
          assert.match(output, /42567/);
        });

        it('shows dash when session has no PID', async () => {
          await cli.seed({ id: 'abc12345' });
          await cli.run('show', 'abc12345');

          const output = cli.console.logs.join('\n');
          assert.match(output, /PID/);
          assert.match(output, /–/);
        });

        it('always includes PID line', async () => {
          for (const state of ['busy', 'idle', 'waiting', 'closed', 'archived'] as const) {
            const cli2 = setupCLI();
            await cli2.seed({ id: 'abc12345', state });
            await cli2.run('show', 'abc12345');

            const output = cli2.console.logs.join('\n');
            assert.match(output, /PID/, `PID missing for state: ${state}`);
            cli2.cleanup();
          }
        });
      });
    });
  });
});
