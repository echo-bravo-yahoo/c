/**
 * Tests for the `c context` command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setupCLI, stripAnsi, type CLIHarness } from '../helpers/cli.ts';
import type { SessionContextInventory } from '../../src/store/schema.ts';

const HOME = homedir();
const claudeDoc = (n: string) => join(HOME, '.claude/docs', n);
const memoryFile = (projectKey: string, n: string) =>
  join(HOME, '.claude/projects', projectKey, 'memory', n);

describe('c', () => {
  describe('commands', () => {
    describe('context', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      it('renders preloaded + read-during-session sections', async () => {
        const ctx: SessionContextInventory = {
          reads: {
            '/home/u/proj/src/a.ts': [1, 3],
            '/home/u/proj/src/b.ts': [2],
            [claudeDoc('jira.md')]: [2, 4],
            [memoryFile('-home-u-proj', 'MEMORY.md')]: [1],
          },
          claude_md: [join(HOME, '.claude/CLAUDE.md'), '/home/u/proj/CLAUDE.md'],
          claude_md_imports: [claudeDoc('github.md')],
          memory_index: memoryFile('-home-u-proj', 'MEMORY.md'),
          mcp_servers: { figma: 0, machinify: 0 },
          skills: { loop: [1, 3] },
        };
        await cli.seed({ id: 'abc-123', name: 'demo', context: ctx, context_pct: 42 });

        await cli.run('context', 'abc-123');

        const output = stripAnsi(cli.console.logs.join('\n'));
        assert.ok(output.includes('Preloaded at startup'));
        assert.ok(output.includes('MCP tools'));
        assert.ok(output.includes('figma'));
        assert.ok(output.includes('CLAUDE.md files   : 2'));
        assert.ok(output.includes('CLAUDE.md imports : 1'));
        assert.ok(output.includes('Memory index'));
        assert.ok(output.includes('Read during session'));
        assert.ok(output.includes('Project files    : 2'));
        assert.ok(output.includes('Claude docs'));
        assert.ok(output.includes('Memory files'));
        assert.ok(output.includes('Skills invoked'));
        assert.ok(output.includes('loop'));
      });

      it('--json emits the raw inventory object unchanged', async () => {
        const ctx: SessionContextInventory = {
          reads: { '/a': [1], '/b': [2, 3] },
          claude_md: ['/x/CLAUDE.md'],
          skills: { loop: [1] },
        };
        await cli.seed({ id: 'abc-123', context: ctx });

        await cli.run('context', 'abc-123', '--json');

        const payload = JSON.parse(cli.stdout.output.join(''));
        assert.deepStrictEqual(payload, ctx);
      });

      it('excludes preloaded imports from the lazy-read buckets', async () => {
        const ctx: SessionContextInventory = {
          reads: {
            [claudeDoc('github.md')]: [1],
            [claudeDoc('jira.md')]: [2],
          },
          claude_md_imports: [claudeDoc('github.md')],
        };
        await cli.seed({ id: 'abc-123', context: ctx });

        await cli.run('context', 'abc-123');

        const output = stripAnsi(cli.console.logs.join('\n'));
        assert.ok(output.includes('Claude docs      : 1 unique'), 'lazy-read docs should exclude github.md preload');
        assert.ok(output.includes('jira.md'));
      });

      it('defaults to the current session when no id given', async () => {
        await cli.seed({
          id: 'cur-123',
          directory: process.cwd(),
          state: 'busy',
          context: { reads: {} },
        });

        await cli.run('context');

        assert.strictEqual(cli.exit.exitCode, null);
        assert.ok(cli.console.logs.some(l => l.includes('cur-123'.slice(0, 8))));
      });

      it('exits 1 when the requested session is not found', async () => {
        await cli.run('context', 'nonexistent');
        assert.strictEqual(cli.exit.exitCode, 1);
      });

      it('shows no-inventory message when session has no context captured', async () => {
        await cli.seed({ id: 'bare-1' });
        await cli.run('context', 'bare-1');

        const output = stripAnsi(cli.console.logs.join('\n'));
        assert.ok(output.includes('(none captured)'));
      });
    });
  });
});
