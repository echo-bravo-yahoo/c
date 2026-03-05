/**
 * Tests for tag command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { setupCLI, type CLIHarness } from '../helpers/cli.ts';

describe('c', () => {
  describe('commands', () => {
    describe('tag', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      describe('tag adding', () => {
        it('adds tag to session', async () => {
          await cli.seed({ id: 'abc12345', tags: [] });
          await cli.run('tag', 'important', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.deepStrictEqual(s.tags.values, ['important']);
        });

        it('appends to existing tags', async () => {
          await cli.seed({ id: 'abc12345', tags: ['existing'] });
          await cli.run('tag', 'new', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.deepStrictEqual(s.tags.values, ['existing', 'new']);
        });

        it('prevents duplicate tags', async () => {
          await cli.seed({ id: 'abc12345', tags: ['important'] });
          await cli.run('tag', 'important', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.deepStrictEqual(s.tags.values, ['important']);
        });
      });

      describe('timestamp update', () => {
        it('updates last_active_at', async () => {
          const oldDate = new Date('2024-01-01');
          await cli.seed({ id: 'abc12345', tags: [], last_active_at: oldDate });
          await cli.run('tag', 'important', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.ok(s.last_active_at > oldDate);
        });
      });

      describe('session lookup', () => {
        it('finds session by ID prefix', async () => {
          await cli.seed({ id: 'abc-123-full-uuid', tags: [] });
          await cli.run('tag', 'x', 'abc');

          const s = cli.session('abc-123-full-uuid')!;
          assert.ok(s.tags.values.includes('x'));
        });
      });

      describe('error conditions', () => {
        it('exits 1 when session not found', async () => {
          await cli.run('tag', 'deploy', 'nonexistent');

          assert.strictEqual(cli.exit.exitCode, 1);
          assert.ok(cli.console.errors.some(l => l.includes('not found')));
        });
      });

      describe('output message', () => {
        it('includes tag in success message', async () => {
          await cli.seed({ id: 'abc12345', tags: [] });
          await cli.run('tag', 'important', 'abc12345');

          assert.ok(cli.console.logs.some(l => l.includes('important')));
          assert.ok(cli.console.logs.some(l => l.includes('Tagged')));
        });
      });
    });
  });
});
