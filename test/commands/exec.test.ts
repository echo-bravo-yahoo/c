/**
 * Tests for exec command — error handling only (spawns processes).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { setupCLI, type CLIHarness } from '../helpers/cli.ts';

describe('c', () => {
  describe('commands', () => {
    describe('exec', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      it('exits 1 when session not found', async () => {
        await cli.run('exec', 'nonexistent', '--', 'echo', 'hi');

        assert.strictEqual(cli.exit.exitCode, 1);
        assert.ok(cli.console.errors.some(l => l.includes('not found')));
      });

      it('exits 1 with no command', async () => {
        await cli.seed({ id: 's1' });
        await cli.run('exec', 's1');

        assert.strictEqual(cli.exit.exitCode, 1);
        assert.ok(cli.console.errors.some(l => l.includes('No command')));
      });
    });
  });
});
