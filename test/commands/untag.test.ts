/**
 * Tests for untag command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { setupCLI, type CLIHarness } from '../helpers/cli.ts';

describe('c', () => {
  describe('commands', () => {
    describe('untag', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      describe('tag removal', () => {
        it('removes tag from session', async () => {
          await cli.seed({ id: 'abc12345', tags: ['important', 'wip'] });
          await cli.run('untag', 'important', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.deepStrictEqual(s.tags.values, ['wip']);
        });

        it('empties tag list when removing last tag', async () => {
          await cli.seed({ id: 'abc12345', tags: ['only-one'] });
          await cli.run('untag', 'only-one', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.deepStrictEqual(s.tags.values, []);
        });

        it('ignores missing tag', async () => {
          await cli.seed({ id: 'abc12345', tags: ['existing'] });
          await cli.run('untag', 'nonexistent', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.deepStrictEqual(s.tags.values, ['existing']);
        });

        it('no-ops on empty tag list', async () => {
          await cli.seed({ id: 'abc12345', tags: [] });
          await cli.run('untag', 'any', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.deepStrictEqual(s.tags.values, []);
        });
      });

      describe('timestamp update', () => {
        it('updates last_active_at', async () => {
          const oldDate = new Date('2024-01-01');
          await cli.seed({ id: 'abc12345', tags: ['important'], last_active_at: oldDate });
          await cli.run('untag', 'important', 'abc12345');

          const s = cli.session('abc12345')!;
          assert.ok(s.last_active_at > oldDate);
        });
      });

      describe('session lookup', () => {
        it('finds session by ID prefix', async () => {
          await cli.seed({ id: 'abc-123-full-uuid', tags: ['x'] });
          await cli.run('untag', 'x', 'abc');

          const s = cli.session('abc-123-full-uuid')!;
          assert.deepStrictEqual(s.tags.values, []);
        });
      });

      describe('error conditions', () => {
        it('exits 1 when session not found', async () => {
          await cli.run('untag', 'deploy', 'nonexistent');

          assert.strictEqual(cli.exit.exitCode, 1);
          assert.ok(cli.console.errors.some(l => l.includes('not found')));
        });
      });

      describe('output message', () => {
        it('includes tag in success message', async () => {
          await cli.seed({ id: 'abc12345', tags: ['important'] });
          await cli.run('untag', 'important', 'abc12345');

          assert.ok(cli.console.logs.some(l => l.includes('important')));
          assert.ok(cli.console.logs.some(l => l.includes('Removed tag')));
        });
      });
    });
  });
});
