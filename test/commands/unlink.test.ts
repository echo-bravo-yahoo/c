/**
 * Tests for unlink command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { setupCLI, type CLIHarness } from '../helpers/cli.ts';

describe('c', () => {
  describe('commands', () => {
    describe('unlink', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      describe('resource removal', () => {
        it('detaches PR', async () => {
          await cli.seed({ id: 'abc12345', resources: { pr: 'https://github.com/org/repo/pull/42' } });
          await cli.run('unlink', '--pr', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.resources.pr, undefined);
        });

        it('detaches JIRA ticket', async () => {
          await cli.seed({ id: 'abc12345', resources: { jira: 'MAC-123' } });
          await cli.run('unlink', '--jira', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.resources.jira, undefined);
        });

        it('detaches branch', async () => {
          await cli.seed({ id: 'abc12345', resources: { branch: 'feature/thing' } });
          await cli.run('unlink', '--branch', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.resources.branch, undefined);
        });

        it('detaches plan', async () => {
          await cli.seed({ id: 'abc12345', resources: { plan: 'my-plan-slug' } });
          await cli.run('unlink', '--plan', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.resources.plan, undefined);
        });

        it('detaches multiple resources', async () => {
          await cli.seed({
            id: 'abc12345',
            resources: {
              pr: 'https://github.com/org/repo/pull/42',
              jira: 'MAC-123',
              branch: 'feature/thing',
            },
          });
          await cli.run('unlink', '--pr', '--jira', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.resources.pr, undefined);
          assert.strictEqual(s.resources.jira, undefined);
          assert.strictEqual(s.resources.branch, 'feature/thing');
        });
      });

      describe('no-op behavior', () => {
        it('ignores missing resource', async () => {
          await cli.seed({ id: 'abc12345', resources: {} });
          await cli.run('unlink', '--pr', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.resources.pr, undefined);
        });
      });

      describe('timestamp update', () => {
        it('updates last_active_at', async () => {
          const oldDate = new Date('2024-01-01');
          await cli.seed({ id: 'abc12345', resources: { jira: 'MAC-123' }, last_active_at: oldDate });
          await cli.run('unlink', '--jira', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.ok(s.last_active_at > oldDate);
        });
      });

      describe('error conditions', () => {
        it('exits 1 when no resource specified', async () => {
          await cli.seed({ id: 'abc12345' });
          await cli.run('unlink', 'abc12345');

          assert.strictEqual(cli.exit.exitCode, 1);
          assert.ok(cli.console.errors.some(l => l.includes('Specify at least one')));
        });

        it('exits 1 when session not found', async () => {
          await cli.run('unlink', '--pr', 'nonexistent');

          assert.strictEqual(cli.exit.exitCode, 1);
          assert.ok(cli.console.errors.some(l => l.includes('not found')));
        });
      });

      describe('output message', () => {
        it('lists detached resources in output', async () => {
          await cli.seed({ id: 'abc12345', resources: { pr: 'http://x', jira: 'J-1' } });
          await cli.run('unlink', '--pr', '--jira', 'abc12345');

          assert.ok(cli.console.logs.some(l => l.includes('Unlinked')));
          assert.ok(cli.console.logs.some(l => l.includes('PR')));
          assert.ok(cli.console.logs.some(l => l.includes('JIRA')));
        });
      });
    });
  });
});
