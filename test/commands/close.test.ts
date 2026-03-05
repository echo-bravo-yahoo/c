/**
 * Tests for close command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { setupCLI, type CLIHarness } from '../helpers/cli.ts';

describe('c', () => {
  describe('commands', () => {
    describe('close', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      describe('state transitions', () => {
        it('closes session by ID', async () => {
          await cli.seed({ id: 'abc12345', state: 'busy' });
          await cli.run('close', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.state, 'closed');
          assert.strictEqual(s.pid, undefined);
        });

        it('archives with --archive flag', async () => {
          await cli.seed({ id: 'abc12345', state: 'busy' });
          await cli.run('close', '--archive', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.state, 'archived');
        });

        it('clears pid on close', async () => {
          await cli.seed({ id: 'abc12345', state: 'busy', pid: 12345 });
          await cli.run('close', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.pid, undefined);
        });

        it('updates last_active_at', async () => {
          const oldDate = new Date('2024-01-01');
          await cli.seed({ id: 'abc12345', state: 'busy', last_active_at: oldDate });
          await cli.run('close', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.ok(s.last_active_at > oldDate);
        });
      });

      describe('rejection conditions', () => {
        it('rejects already-closed session', async () => {
          await cli.seed({ id: 'abc12345', state: 'closed' });
          await cli.run('close', 'abc12345');

          assert.ok(cli.console.errors.some(l => l.includes('already closed')));
        });

        it('rejects already-archived session', async () => {
          await cli.seed({ id: 'abc12345', state: 'archived' });
          await cli.run('close', 'abc12345');

          assert.ok(cli.console.errors.some(l => l.includes('already archived')));
        });

        it('accepts busy session', async () => {
          await cli.seed({ id: 'abc12345', state: 'busy' });
          await cli.run('close', 'abc12345');

          assert.strictEqual(cli.session('abc12345')!.state, 'closed');
        });

        it('accepts idle session', async () => {
          await cli.seed({ id: 'abc12345', state: 'idle' });
          await cli.run('close', 'abc12345');

          assert.strictEqual(cli.session('abc12345')!.state, 'closed');
        });

        it('accepts waiting session', async () => {
          await cli.seed({ id: 'abc12345', state: 'waiting' });
          await cli.run('close', 'abc12345');

          assert.strictEqual(cli.session('abc12345')!.state, 'closed');
        });
      });

      describe('multiple IDs', () => {
        it('closes multiple sessions in one call', async () => {
          await cli.seed({ id: 'aaa11111', state: 'busy' });
          await cli.seed({ id: 'bbb22222', state: 'waiting' });
          await cli.seed({ id: 'ccc33333', state: 'idle' });
          await cli.run('close', 'aaa11111', 'bbb22222', 'ccc33333');

          assert.strictEqual(cli.session('aaa11111')!.state, 'closed');
          assert.strictEqual(cli.session('bbb22222')!.state, 'closed');
          assert.strictEqual(cli.session('ccc33333')!.state, 'closed');
        });

        it('skips already-closed sessions in multi-ID call', async () => {
          await cli.seed({ id: 'aaa11111', state: 'busy' });
          await cli.seed({ id: 'bbb22222', state: 'closed' });
          await cli.seed({ id: 'ccc33333', state: 'waiting' });
          await cli.run('close', 'aaa11111', 'bbb22222', 'ccc33333');

          assert.strictEqual(cli.session('aaa11111')!.state, 'closed');
          assert.strictEqual(cli.session('bbb22222')!.state, 'closed'); // unchanged
          assert.strictEqual(cli.session('ccc33333')!.state, 'closed');
          assert.ok(cli.console.errors.some(l => l.includes('already closed')));
        });

        it('reports missing IDs without aborting', async () => {
          await cli.seed({ id: 'aaa11111', state: 'busy' });
          await cli.seed({ id: 'ccc33333', state: 'busy' });
          await cli.run('close', 'aaa11111', 'nonexistent', 'ccc33333');

          assert.strictEqual(cli.session('aaa11111')!.state, 'closed');
          assert.strictEqual(cli.session('ccc33333')!.state, 'closed');
          assert.ok(cli.console.errors.some(l => l.includes('not found')));
        });
      });

      describe('session lookup', () => {
        it('finds session by ID prefix', async () => {
          await cli.seed({ id: 'abc-123-full-uuid', state: 'busy' });
          await cli.run('close', 'abc');

          assert.strictEqual(cli.session('abc-123-full-uuid')!.state, 'closed');
        });
      });

      describe('no ID (current directory fallback)', () => {
        it('closes current-dir session', async () => {
          await cli.seed({ id: 'cwd-sess1', state: 'busy', directory: process.cwd() });
          await cli.run('close');

          const s = cli.session('cwd-sess1')!;
          assert.strictEqual(s.state, 'closed');
          assert.ok(cli.console.logs.some(l => l.includes('Closed')));
        });

        it('archives current-dir session with --archive', async () => {
          await cli.seed({ id: 'cwd-sess2', state: 'busy', directory: process.cwd() });
          await cli.run('close', '--archive');

          const s = cli.session('cwd-sess2')!;
          assert.strictEqual(s.state, 'archived');
          assert.ok(cli.console.logs.some(l => l.includes('Archived')));
        });

        it('exits 1 when no active session in cwd', async () => {
          await cli.run('close');

          assert.strictEqual(cli.exit.exitCode, 1);
          assert.ok(cli.console.errors.some(l => l.includes('No active session')));
        });

        it('exits 1 when only closed session exists in cwd', async () => {
          await cli.seed({ id: 'cwd-closed', state: 'closed', directory: process.cwd() });
          await cli.run('close');

          assert.strictEqual(cli.exit.exitCode, 1);
          assert.ok(cli.console.errors.some(l => l.includes('No active session')));
        });

        it('exits 1 when only archived session exists in cwd', async () => {
          await cli.seed({ id: 'cwd-archived', state: 'archived', directory: process.cwd() });
          await cli.run('close');

          assert.strictEqual(cli.exit.exitCode, 1);
          assert.ok(cli.console.errors.some(l => l.includes('No active session')));
        });

        it('clears pid on close', async () => {
          await cli.seed({ id: 'cwd-pid', state: 'busy', pid: 99999, directory: process.cwd() });
          await cli.run('close');

          const s = cli.session('cwd-pid')!;
          assert.strictEqual(s.pid, undefined);
        });
      });

      describe('output message', () => {
        it('shows success message', async () => {
          await cli.seed({ id: 'abc12345', state: 'busy' });
          await cli.run('close', 'abc12345');

          assert.ok(cli.console.logs.some(l => l.includes('Closed')));
        });

        it('exits 1 when session not found', async () => {
          await cli.run('close', 'nonexistent');

          assert.ok(cli.console.errors.some(l => l.includes('not found')));
        });
      });
    });
  });
});
