/**
 * Tests for name command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { setupCLI, type CLIHarness } from '../helpers/cli.ts';

describe('c', () => {
  describe('commands', () => {
    describe('name', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      describe('name setting', () => {
        it('sets session name', async () => {
          await cli.seed({ id: 'abc12345', name: '' });
          await cli.run('name', 'abc12345', 'My New Name');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.name, 'My New Name');
        });

        it('replaces existing name', async () => {
          await cli.seed({ id: 'abc12345', name: 'Old Name' });
          await cli.run('name', 'abc12345', 'New Name');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.name, 'New Name');
        });

        it('allows special characters', async () => {
          await cli.seed({ id: 'abc12345', name: '' });
          await cli.run('name', 'abc12345', 'Fix: bug #123 (urgent!)');

          const s = cli.session('abc12345')!;
          assert.strictEqual(s.name, 'Fix: bug #123 (urgent!)');
        });
      });

      describe('timestamp update', () => {
        it('updates last_active_at', async () => {
          const oldDate = new Date('2024-01-01');
          await cli.seed({ id: 'abc12345', name: '', last_active_at: oldDate });
          await cli.run('name', 'abc12345', 'New Name');

          const s = cli.session('abc12345')!;
          assert.ok(s.last_active_at > oldDate);
        });
      });

      describe('session lookup', () => {
        it('finds session by ID prefix', async () => {
          await cli.seed({ id: 'abc-123-full-uuid' });
          await cli.run('name', 'abc', 'Test');

          const s = cli.session('abc-123-full-uuid')!;
          assert.strictEqual(s.name, 'Test');
        });
      });

      describe('error conditions', () => {
        it('exits 1 when session not found by ID', async () => {
          await cli.run('name', 'nonexistent', 'Test');

          assert.strictEqual(cli.exit.exitCode, 1);
          assert.ok(cli.console.errors.some(l => l.includes('not found')));
        });
      });

      describe('output message', () => {
        it('confirms name in success message', async () => {
          await cli.seed({ id: 'abc12345' });
          await cli.run('name', 'abc12345', 'My New Name');

          assert.ok(cli.console.logs.some(l => l.includes('My New Name')));
          assert.ok(cli.console.logs.some(l => l.includes('Set name')));
        });
      });
    });
  });
});
