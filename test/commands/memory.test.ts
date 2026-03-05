/**
 * Tests for memory command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { setupCLI, type CLIHarness } from '../helpers/cli.js';

describe('c', () => {
  describe('commands', () => {
    describe('memory', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      it('renders CLAUDE.md with highlighting', async () => {
        const dir = join(cli.tmpDir, 'project');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'CLAUDE.md'), '# Heading\n\nSome body text.\n');
        await cli.seed({ id: 's1', directory: dir });
        await cli.run('memory', 's1');

        const output = cli.stdout.output.join('');
        // marked-terminal renders headings — the text should still appear
        assert.ok(output.includes('Heading'), 'should contain heading text');
      });

      it('--raw outputs unprocessed markdown', async () => {
        const dir = join(cli.tmpDir, 'project');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'CLAUDE.md'), '# Heading\n\nBody text.\n');
        await cli.seed({ id: 's1', directory: dir });
        await cli.run('memory', 's1', '--raw');

        const output = cli.stdout.output.join('');
        assert.ok(output.includes('# Heading'), 'should contain literal markdown');
      });

      it('exits 1 when session not found', async () => {
        await cli.run('memory', 'nonexistent');

        assert.strictEqual(cli.exit.exitCode, 1);
        assert.ok(cli.console.errors.some(l => l.includes('not found')));
      });

      it('shows dim message when no CLAUDE.md', async () => {
        const dir = join(cli.tmpDir, 'project-no-md');
        mkdirSync(dir, { recursive: true });
        await cli.seed({ id: 's1', directory: dir });
        await cli.run('memory', 's1');

        assert.ok(cli.console.logs.some(l => l.includes('No CLAUDE.md')));
      });
    });
  });
});
