/**
 * Tests for show command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { setupCLI, type CLIHarness } from '../helpers/cli.js';

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
