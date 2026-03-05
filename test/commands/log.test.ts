/**
 * Tests for log command
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Controlled transcript path — tests set this before running.
let mockTranscriptPath: string | null = null;

mock.module(resolve('src/claude/sessions.ts'), {
  namedExports: {
    getClaudeSession: () => ({ id: 'stub' }),
    listClaudeSessions: () => [],
    getClaudeSessionTitles: () => ({ customTitle: null, summary: null }),
    getClaudeSessionsForDirectory: () => [],
    readClaudeSessionIndex: () => null,
    getPlanExecutionInfo: () => null,
    findTranscriptPath: () => mockTranscriptPath,
    getCustomTitleFromTranscriptTail: () => null,
    findClaudeSessionIdsByTitle: () => [],
    decodeProjectKey: (k: string) => k,
    encodeProjectKey: (d: string) => d,
    CLAUDE_DIR: '/tmp/mock-claude',
    PROJECTS_DIR: '/tmp/mock-claude/projects',
  },
});

type CLIHarness = import('../helpers/cli.ts').CLIHarness;
const { setupCLI } = await import('../helpers/cli.ts');

interface TranscriptEntry {
  type: 'human' | 'user' | 'assistant';
  timestamp: string;
  message: {
    content: unknown;
  };
}

function makeEntry(role: 'user' | 'assistant', text: string, tools?: { name: string; input: Record<string, unknown> }[]): TranscriptEntry {
  const content: unknown[] = [];
  if (text) content.push({ type: 'text', text });
  if (tools) {
    for (const t of tools) {
      content.push({ type: 'tool_use', name: t.name, input: t.input });
    }
  }
  return {
    type: role === 'user' ? 'human' : 'assistant',
    timestamp: new Date().toISOString(),
    message: { content },
  };
}

function writeTranscript(dir: string, ...entries: TranscriptEntry[]): string {
  const filePath = join(dir, 'transcript.jsonl');
  writeFileSync(filePath, entries.map(e => JSON.stringify(e)).join('\n'));
  return filePath;
}

describe('c', () => {
  describe('commands', () => {
    describe('log', () => {
      let cli: CLIHarness;
      beforeEach(() => {
        cli = setupCLI();
        mockTranscriptPath = null;
      });
      afterEach(() => { cli.cleanup(); });

      it('shows user prompts', async () => {
        await cli.seed({ id: 's1' });
        const transcriptDir = join(cli.tmpDir, 'transcripts');
        mkdirSync(transcriptDir, { recursive: true });
        mockTranscriptPath = writeTranscript(transcriptDir,
          makeEntry('user', 'Hello world'),
        );
        await cli.run('log', 's1');

        const output = cli.console.logs.join('\n');
        assert.ok(output.includes('Hello world'));
      });

      it('shows claude text', async () => {
        await cli.seed({ id: 's1' });
        const transcriptDir = join(cli.tmpDir, 'transcripts');
        mkdirSync(transcriptDir, { recursive: true });
        mockTranscriptPath = writeTranscript(transcriptDir,
          makeEntry('assistant', 'Here is the answer'),
        );
        await cli.run('log', 's1');

        const output = cli.console.logs.join('\n');
        assert.ok(output.includes('Here is the answer'));
      });

      it('summarizes tool uses', async () => {
        await cli.seed({ id: 's1' });
        const transcriptDir = join(cli.tmpDir, 'transcripts');
        mkdirSync(transcriptDir, { recursive: true });
        mockTranscriptPath = writeTranscript(transcriptDir,
          makeEntry('assistant', '', [
            { name: 'Read', input: { file_path: '/src/commands/b.ts' } },
          ]),
        );
        await cli.run('log', 's1');

        const output = cli.console.logs.join('\n');
        assert.ok(output.includes('Read'), 'should contain tool name');
        assert.ok(output.includes('b.ts'), 'should contain short path');
      });

      it('collapses consecutive assistant entries', async () => {
        await cli.seed({ id: 's1' });
        const transcriptDir = join(cli.tmpDir, 'transcripts');
        mkdirSync(transcriptDir, { recursive: true });
        mockTranscriptPath = writeTranscript(transcriptDir,
          makeEntry('assistant', 'First part'),
          makeEntry('assistant', 'Second part'),
        );
        await cli.run('log', 's1');

        // Both texts should appear but only one time prefix (one "claude" label)
        const output = cli.console.logs.join('\n');
        assert.ok(output.includes('First part'));
        assert.ok(output.includes('Second part'));
        // Count "claude" role occurrences — should be 1 block
        const claudeMatches = cli.console.logs.filter(l => l.includes('claude'));
        assert.strictEqual(claudeMatches.length, 1, 'should collapse to single block');
      });

      it('--prompts shows only user entries', async () => {
        await cli.seed({ id: 's1' });
        const transcriptDir = join(cli.tmpDir, 'transcripts');
        mkdirSync(transcriptDir, { recursive: true });
        mockTranscriptPath = writeTranscript(transcriptDir,
          makeEntry('user', 'My prompt'),
          makeEntry('assistant', 'Claude response'),
          makeEntry('user', 'Follow up'),
        );
        await cli.run('log', 's1', '--prompts');

        const output = cli.console.logs.join('\n');
        assert.ok(output.includes('My prompt'));
        assert.ok(output.includes('Follow up'));
        assert.ok(!output.includes('Claude response'));
      });

      it('--lines limits output', async () => {
        await cli.seed({ id: 's1' });
        const transcriptDir = join(cli.tmpDir, 'transcripts');
        mkdirSync(transcriptDir, { recursive: true });
        mockTranscriptPath = writeTranscript(transcriptDir,
          makeEntry('user', 'First'),
          makeEntry('assistant', 'Reply one'),
          makeEntry('user', 'Second'),
          makeEntry('assistant', 'Reply two'),
          makeEntry('user', 'Third'),
        );
        await cli.run('log', 's1', '--lines', '2');

        const output = cli.console.logs.join('\n');
        // Should show only the last 2 blocks
        assert.ok(!output.includes('First'), 'first block should be trimmed');
        assert.ok(output.includes('Third'), 'last block should be visible');
      });

      it('exits 1 when session not found', async () => {
        await cli.run('log', 'nonexistent');

        assert.strictEqual(cli.exit.exitCode, 1);
        assert.ok(cli.console.errors.some(l => l.includes('not found')));
      });

      it('exits 1 when transcript not found', async () => {
        await cli.seed({ id: 's1' });
        mockTranscriptPath = null;
        await cli.run('log', 's1');

        assert.strictEqual(cli.exit.exitCode, 1);
        assert.ok(cli.console.errors.some(l => l.includes('Transcript not found')));
      });
    });
  });
});
