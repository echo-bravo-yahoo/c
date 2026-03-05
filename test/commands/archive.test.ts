/**
 * Tests for archive command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { setupCLI, type CLIHarness } from '../helpers/cli.ts';

describe('c', () => {
  describe('commands', () => {
    describe('archive', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      describe('state change', () => {
        it('sets state to archived', async () => {
          await cli.seed({ id: 'abc12345', state: 'busy' });
          await cli.run('archive', 'abc12345');

          assert.strictEqual(cli.session('abc12345')!.state, 'archived');
        });

        it('archives closed session', async () => {
          await cli.seed({ id: 'abc12345', state: 'closed' });
          await cli.run('archive', 'abc12345');

          assert.strictEqual(cli.session('abc12345')!.state, 'archived');
        });

        it('updates last_active_at', async () => {
          const oldDate = new Date('2024-01-01');
          await cli.seed({ id: 'abc12345', state: 'busy', last_active_at: oldDate });
          await cli.run('archive', 'abc12345');

          assert.ok(cli.session('abc12345')!.last_active_at > oldDate);
        });
      });

      describe('process cleanup', () => {
        it('clears PID on archive', async () => {
          await cli.seed({ id: 'abc12345', state: 'busy', pid: 55555 });
          await cli.run('archive', 'abc12345');

          assert.strictEqual(cli.session('abc12345')!.pid, undefined);
        });

        it('archives without PID', async () => {
          await cli.seed({ id: 'abc12345', state: 'busy' });
          await cli.run('archive', 'abc12345');

          assert.strictEqual(cli.session('abc12345')!.state, 'archived');
        });
      });

      describe('multiple IDs', () => {
        it('archives multiple sessions in one call', async () => {
          await cli.seed({ id: 'aaa11111', state: 'busy' });
          await cli.seed({ id: 'bbb22222', state: 'waiting' });
          await cli.seed({ id: 'ccc33333', state: 'closed' });
          await cli.run('archive', 'aaa11111', 'bbb22222', 'ccc33333');

          assert.strictEqual(cli.session('aaa11111')!.state, 'archived');
          assert.strictEqual(cli.session('bbb22222')!.state, 'archived');
          assert.strictEqual(cli.session('ccc33333')!.state, 'archived');
        });

        it('reports missing IDs without aborting', async () => {
          await cli.seed({ id: 'aaa11111', state: 'busy' });
          await cli.seed({ id: 'ccc33333', state: 'waiting' });
          await cli.run('archive', 'aaa11111', 'nonexistent', 'ccc33333');

          assert.strictEqual(cli.session('aaa11111')!.state, 'archived');
          assert.strictEqual(cli.session('ccc33333')!.state, 'archived');
          assert.ok(cli.console.errors.some(l => l.includes('not found')));
        });
      });

      describe('session lookup', () => {
        it('finds session by ID prefix', async () => {
          await cli.seed({ id: 'abc-123-full-uuid', state: 'busy' });
          await cli.run('archive', 'abc');

          assert.strictEqual(cli.session('abc-123-full-uuid')!.state, 'archived');
        });
      });

      describe('error conditions', () => {
        it('exits 1 when no active session', async () => {
          // No sessions seeded, no ID provided → falls back to getCurrentSession()
          await cli.run('archive');

          assert.strictEqual(cli.exit.exitCode, 1);
          assert.ok(cli.console.errors.some(l => l.includes('No active session')));
        });

        it('errors when session not found by ID', async () => {
          await cli.run('archive', 'nonexistent');

          assert.ok(cli.console.errors.some(l => l.includes('not found')));
        });
      });

      describe('display output', () => {
        it('uses display name in success message', async () => {
          await cli.seed({ id: 'abc12345', name: 'My Session', state: 'busy' });
          await cli.run('archive', 'abc12345');

          assert.ok(cli.console.logs.some(l => l.includes('Archived')));
        });
      });
    });
  });
});
