/**
 * Tests for link command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { setupCLI, type CLIHarness } from '../helpers/cli.ts';

describe('c', () => {
  describe('commands', () => {
    describe('link', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      describe('resource linking', () => {
        it('attaches PR URL', async () => {
          await cli.seed({ id: 'abc12345' });
          await cli.run('link', '--pr', 'https://github.com/org/repo/pull/42', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.resources.pr, 'https://github.com/org/repo/pull/42');
        });

        it('attaches JIRA ticket', async () => {
          await cli.seed({ id: 'abc12345' });
          await cli.run('link', '--jira', 'MAC-123', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.resources.jira, 'MAC-123');
        });

        it('attaches branch name', async () => {
          await cli.seed({ id: 'abc12345' });
          await cli.run('link', '--branch', 'feature/new-thing', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.resources.branch, 'feature/new-thing');
        });

        it('attaches plan slug', async () => {
          await cli.seed({ id: 'abc12345' });
          await cli.run('link', '--plan', 'my-cool-plan', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.resources.plan, 'my-cool-plan');
        });

        it('attaches multiple resources', async () => {
          await cli.seed({ id: 'abc12345' });
          await cli.run('link', '--pr', 'https://github.com/org/repo/pull/42', '--jira', 'MAC-123', '--branch', 'feature/MAC-123-thing', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.resources.pr, 'https://github.com/org/repo/pull/42');
          assert.strictEqual(s.resources.jira, 'MAC-123');
          assert.strictEqual(s.resources.branch, 'feature/MAC-123-thing');
        });

        it('replaces existing resource', async () => {
          await cli.seed({ id: 'abc12345', resources: { pr: 'https://github.com/org/repo/pull/1' } });
          await cli.run('link', '--pr', 'https://github.com/org/repo/pull/42', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.resources.pr, 'https://github.com/org/repo/pull/42');
        });
      });

      describe('timestamp update', () => {
        it('updates last_active_at', async () => {
          const oldDate = new Date('2024-01-01');
          await cli.seed({ id: 'abc12345', last_active_at: oldDate });
          await cli.run('link', '--jira', 'MAC-123', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.ok(s.last_active_at > oldDate);
        });
      });

      describe('session lookup', () => {
        it('finds session by ID prefix', async () => {
          await cli.seed({ id: 'abc-123-full-uuid' });
          await cli.run('link', '--jira', 'MAC-1', 'abc');

          const s = cli.session('abc-123-full-uuid')!;
          assert.strictEqual(s.resources.jira, 'MAC-1');
        });
      });

      describe('error conditions', () => {
        it('exits 1 when no resource specified', async () => {
          await cli.seed({ id: 'abc12345' });
          await cli.run('link', 'abc12345');

          assert.strictEqual(cli.exit.exitCode, 1);
          assert.ok(cli.console.errors.some(l => l.includes('Specify at least one')));
        });

        it('exits 1 when session not found', async () => {
          await cli.run('link', '--pr', 'http://x', 'nonexistent');

          assert.strictEqual(cli.exit.exitCode, 1);
          assert.ok(cli.console.errors.some(l => l.includes('not found')));
        });
      });

      describe('output message', () => {
        it('lists linked resources', async () => {
          await cli.seed({ id: 'abc12345' });
          await cli.run('link', '--pr', 'https://github.com/org/repo/pull/42', '--jira', 'MAC-123', 'abc12345');

          assert.ok(cli.console.logs.some(l => l.includes('Linked')));
          assert.ok(cli.console.logs.some(l => l.includes('PR:')));
          assert.ok(cli.console.logs.some(l => l.includes('JIRA:')));
        });
      });
    });
  });
});
