/**
 * Tests for plan command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { setupCLI, type CLIHarness } from '../helpers/cli.ts';
import { PLANS_DIR } from '../../src/claude/sessions.ts';

describe('c', () => {
  describe('commands', () => {
    describe('plan', () => {
      let cli: CLIHarness;
      beforeEach(() => {
        cli = setupCLI();
        mkdirSync(PLANS_DIR, { recursive: true });
      });
      afterEach(() => { cli.cleanup(); });

      it('renders plan markdown with highlighting', async () => {
        const slug = 'test-plan-slug';
        writeFileSync(join(PLANS_DIR, `${slug}.md`), '# Plan: Test Plan\n\nSome plan content.\n');
        await cli.seed({ id: 's1', resources: { plan: slug } });
        await cli.run('plan', 's1');

        const output = cli.stdout.output.join('');
        assert.ok(output.includes('Test Plan'), 'should contain plan title');
        assert.ok(output.includes('plan content'), 'should contain plan body');
      });

      it('--raw outputs unprocessed markdown', async () => {
        const slug = 'test-raw-slug';
        writeFileSync(join(PLANS_DIR, `${slug}.md`), '# Plan: Raw Test\n\nBody text.\n');
        await cli.seed({ id: 's1', resources: { plan: slug } });
        await cli.run('plan', 's1', '--raw');

        const output = cli.stdout.output.join('');
        assert.ok(output.includes('# Plan: Raw Test'), 'should contain literal markdown');
      });

      it('--path prints file path', async () => {
        const slug = 'test-path-slug';
        writeFileSync(join(PLANS_DIR, `${slug}.md`), '# Plan\n');
        await cli.seed({ id: 's1', resources: { plan: slug } });
        await cli.run('plan', 's1', '--path');

        const output = cli.stdout.output.join('').trim();
        assert.ok(output.endsWith(`${slug}.md`), 'should end with plan filename');
        assert.ok(output.includes('plans'), 'should include plans directory');
      });

      it('exits 1 when session not found', async () => {
        await cli.run('plan', 'nonexistent');

        assert.strictEqual(cli.exit.exitCode, 1);
        assert.ok(cli.console.errors.some(l => l.includes('not found')));
      });

      it('shows dim message when no plan linked', async () => {
        await cli.seed({ id: 's1' });
        await cli.run('plan', 's1');

        assert.ok(cli.console.logs.some(l => l.includes('No plan linked')));
      });

      it('exits 1 when plan file missing on disk', async () => {
        await cli.seed({ id: 's1', resources: { plan: 'nonexistent-slug' } });
        await cli.run('plan', 's1');

        assert.strictEqual(cli.exit.exitCode, 1);
        assert.ok(cli.console.errors.some(l => l.includes('Plan file not found')));
      });
    });
  });
});
