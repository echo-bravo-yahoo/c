/**
 * Tests for meta command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { setupCLI, type CLIHarness } from '../helpers/cli.ts';

describe('c', () => {
  describe('commands', () => {
    describe('meta', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      describe('meta setting', () => {
        it('sets meta key', async () => {
          await cli.seed({ id: 'abc12345', meta: {} });
          await cli.run('meta', 'priority=high', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.meta.priority, 'high');
        });

        it('replaces existing key', async () => {
          await cli.seed({ id: 'abc12345', meta: { priority: 'low' } });
          await cli.run('meta', 'priority=high', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.meta.priority, 'high');
        });

        it('removes key with empty value', async () => {
          await cli.seed({ id: 'abc12345', meta: { remove: 'this' } });
          await cli.run('meta', 'remove=', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.meta.remove, undefined);
        });

        it('preserves other meta keys', async () => {
          await cli.seed({ id: 'abc12345', meta: { existing: 'keep', change: 'old' } });
          await cli.run('meta', 'change=new', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.meta.existing, 'keep');
          assert.strictEqual(s.meta.change, 'new');
        });

        it('preserves equals in value', async () => {
          await cli.seed({ id: 'abc12345', meta: {} });
          await cli.run('meta', 'url=https://example.com?foo=bar', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.meta.url, 'https://example.com?foo=bar');
        });
      });

      describe('timestamp update', () => {
        it('updates last_active_at', async () => {
          const oldDate = new Date('2024-01-01');
          await cli.seed({ id: 'abc12345', meta: {}, last_active_at: oldDate });
          await cli.run('meta', 'key=value', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.ok(s.last_active_at > oldDate);
        });
      });

      describe('error conditions', () => {
        it('exits 1 when session not found', async () => {
          await cli.run('meta', 'key=value', 'nonexistent');

          assert.strictEqual(cli.exit.exitCode, 1);
          assert.ok(cli.console.errors.some(l => l.includes('not found')));
        });

        it('exits 1 on missing equals sign', async () => {
          await cli.seed({ id: 'abc12345' });
          await cli.run('meta', 'invalid', 'abc12345');

          assert.strictEqual(cli.exit.exitCode, 1);
          assert.ok(cli.console.errors.some(l => l.includes('Format')));
        });
      });

      describe('output message', () => {
        it('confirms set in success message', async () => {
          await cli.seed({ id: 'abc12345' });
          await cli.run('meta', 'priority=high', 'abc12345');

          assert.ok(cli.console.logs.some(l => l.includes('priority=high')));
        });

        it('confirms delete in success message', async () => {
          await cli.seed({ id: 'abc12345', meta: { priority: 'high' } });
          await cli.run('meta', 'priority=', 'abc12345');

          assert.ok(cli.console.logs.some(l => l.includes('Removed')));
          assert.ok(cli.console.logs.some(l => l.includes('priority')));
        });
      });
    });
  });
});
