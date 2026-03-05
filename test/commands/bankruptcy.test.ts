/**
 * Tests for bankruptcy command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { setupCLI, type CLIHarness } from '../helpers/cli.ts';

describe('c', () => {
  describe('commands', () => {
    describe('bankruptcy', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      describe('archives all non-archived sessions', () => {
        it('archives busy, idle, waiting, and closed sessions', async () => {
          await cli.seed({ id: 'aaa11111', state: 'busy' });
          await cli.seed({ id: 'bbb22222', state: 'idle' });
          await cli.seed({ id: 'ccc33333', state: 'waiting' });
          await cli.seed({ id: 'ddd44444', state: 'closed' });
          await cli.run('bankruptcy');

          assert.strictEqual(cli.session('aaa11111')!.state, 'archived');
          assert.strictEqual(cli.session('bbb22222')!.state, 'archived');
          assert.strictEqual(cli.session('ccc33333')!.state, 'archived');
          assert.strictEqual(cli.session('ddd44444')!.state, 'archived');
        });

        it('prints correct count', async () => {
          await cli.seed({ id: 'aaa11111', state: 'busy' });
          await cli.seed({ id: 'bbb22222', state: 'waiting' });
          await cli.seed({ id: 'ccc33333', state: 'closed' });
          await cli.run('bankruptcy');

          assert.ok(cli.console.logs.some(l => l.includes('Archived 3 sessions')));
        });

        it('prints singular when one session', async () => {
          await cli.seed({ id: 'aaa11111', state: 'busy' });
          await cli.run('bankruptcy');

          assert.ok(cli.console.logs.some(l => l.includes('Archived 1 session')));
        });
      });

      describe('skips already-archived sessions', () => {
        it('does not re-archive archived sessions', async () => {
          const oldDate = new Date('2024-01-01');
          await cli.seed({ id: 'aaa11111', state: 'archived', last_active_at: oldDate });
          await cli.seed({ id: 'bbb22222', state: 'busy' });
          await cli.run('bankruptcy');

          assert.strictEqual(cli.session('bbb22222')!.state, 'archived');
          // Archived session's last_active_at should not have changed
          assert.strictEqual(
            cli.session('aaa11111')!.last_active_at.toISOString(),
            oldDate.toISOString()
          );
          assert.ok(cli.console.logs.some(l => l.includes('Archived 1 session')));
        });
      });

      describe('--skip', () => {
        it('excludes specified sessions by full ID', async () => {
          await cli.seed({ id: 'aaa11111', state: 'busy' });
          await cli.seed({ id: 'bbb22222', state: 'waiting' });
          await cli.seed({ id: 'ccc33333', state: 'closed' });
          await cli.run('bankruptcy', '--skip', 'bbb22222');

          assert.strictEqual(cli.session('aaa11111')!.state, 'archived');
          assert.strictEqual(cli.session('bbb22222')!.state, 'waiting');
          assert.strictEqual(cli.session('ccc33333')!.state, 'archived');
          assert.ok(cli.console.logs.some(l => l.includes('Archived 2 sessions')));
        });

        it('excludes specified sessions by ID prefix', async () => {
          await cli.seed({ id: 'abc-123-full-uuid', state: 'busy' });
          await cli.seed({ id: 'def-456-full-uuid', state: 'busy' });
          await cli.run('bankruptcy', '--skip', 'abc');

          assert.strictEqual(cli.session('abc-123-full-uuid')!.state, 'busy');
          assert.strictEqual(cli.session('def-456-full-uuid')!.state, 'archived');
        });

        it('warns on unknown skip ID but still archives the rest', async () => {
          await cli.seed({ id: 'aaa11111', state: 'busy' });
          await cli.seed({ id: 'bbb22222', state: 'waiting' });
          await cli.run('bankruptcy', '--skip', 'nonexistent');

          assert.strictEqual(cli.session('aaa11111')!.state, 'archived');
          assert.strictEqual(cli.session('bbb22222')!.state, 'archived');
          assert.ok(cli.console.errors.some(l => l.includes('Skip target not found')));
        });
      });

      describe('process cleanup', () => {
        it('clears PIDs on archived sessions', async () => {
          await cli.seed({ id: 'aaa11111', state: 'busy', pid: 55555 });
          await cli.seed({ id: 'bbb22222', state: 'waiting', pid: 66666 });
          await cli.run('bankruptcy');

          assert.strictEqual(cli.session('aaa11111')!.pid, undefined);
          assert.strictEqual(cli.session('bbb22222')!.pid, undefined);
        });
      });

      describe('updates last_active_at', () => {
        it('sets last_active_at to current time', async () => {
          const oldDate = new Date('2024-01-01');
          await cli.seed({ id: 'aaa11111', state: 'busy', last_active_at: oldDate });
          await cli.run('bankruptcy');

          assert.ok(cli.session('aaa11111')!.last_active_at > oldDate);
        });
      });

      describe('empty store', () => {
        it('prints no-op message when no sessions exist', async () => {
          await cli.run('bankruptcy');

          assert.ok(cli.console.logs.some(l => l.includes('No sessions to archive')));
        });

        it('prints no-op when all sessions already archived', async () => {
          await cli.seed({ id: 'aaa11111', state: 'archived' });
          await cli.run('bankruptcy');

          assert.ok(cli.console.logs.some(l => l.includes('No sessions to archive')));
        });
      });
    });
  });
});
