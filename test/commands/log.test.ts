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

      describe('summarizeTool branches', () => {
        it('summarizes Bash tool', async () => {
          await cli.seed({ id: 's1' });
          const transcriptDir = join(cli.tmpDir, 'transcripts');
          mkdirSync(transcriptDir, { recursive: true });
          mockTranscriptPath = writeTranscript(transcriptDir,
            makeEntry('assistant', '', [
              { name: 'Bash', input: { command: 'npm test' } },
            ]),
          );
          await cli.run('log', 's1');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('Bash'), 'should contain tool name');
          assert.ok(output.includes('npm test'), 'should contain command');
        });

        it('summarizes Grep tool', async () => {
          await cli.seed({ id: 's1' });
          const transcriptDir = join(cli.tmpDir, 'transcripts');
          mkdirSync(transcriptDir, { recursive: true });
          mockTranscriptPath = writeTranscript(transcriptDir,
            makeEntry('assistant', '', [
              { name: 'Grep', input: { pattern: 'TODO', glob: '*.ts', path: '/src/foo/bar.ts' } },
            ]),
          );
          await cli.run('log', 's1');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('Grep'), 'should contain tool name');
          assert.ok(output.includes('"TODO"'), 'should contain pattern');
          assert.ok(output.includes('--glob *.ts'), 'should contain glob');
          assert.ok(output.includes('foo/bar.ts'), 'should contain short path');
        });

        it('summarizes Glob tool', async () => {
          await cli.seed({ id: 's1' });
          const transcriptDir = join(cli.tmpDir, 'transcripts');
          mkdirSync(transcriptDir, { recursive: true });
          mockTranscriptPath = writeTranscript(transcriptDir,
            makeEntry('assistant', '', [
              { name: 'Glob', input: { pattern: '**/*.ts' } },
            ]),
          );
          await cli.run('log', 's1');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('Glob'), 'should contain tool name');
          assert.ok(output.includes('**/*.ts'), 'should contain glob pattern');
        });

        it('summarizes WebSearch tool', async () => {
          await cli.seed({ id: 's1' });
          const transcriptDir = join(cli.tmpDir, 'transcripts');
          mkdirSync(transcriptDir, { recursive: true });
          mockTranscriptPath = writeTranscript(transcriptDir,
            makeEntry('assistant', '', [
              { name: 'WebSearch', input: { query: 'node coverage' } },
            ]),
          );
          await cli.run('log', 's1');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('WebSearch'), 'should contain tool name');
          assert.ok(output.includes('node coverage'), 'should contain query');
        });

        it('summarizes WebFetch tool', async () => {
          await cli.seed({ id: 's1' });
          const transcriptDir = join(cli.tmpDir, 'transcripts');
          mkdirSync(transcriptDir, { recursive: true });
          mockTranscriptPath = writeTranscript(transcriptDir,
            makeEntry('assistant', '', [
              { name: 'WebFetch', input: { url: 'https://example.com/docs/api' } },
            ]),
          );
          await cli.run('log', 's1');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('WebFetch'), 'should contain tool name');
          assert.ok(output.includes('example.com'), 'should contain hostname');
        });

        it('summarizes Task tool', async () => {
          await cli.seed({ id: 's1' });
          const transcriptDir = join(cli.tmpDir, 'transcripts');
          mkdirSync(transcriptDir, { recursive: true });
          mockTranscriptPath = writeTranscript(transcriptDir,
            makeEntry('assistant', '', [
              { name: 'Task', input: { description: 'explore codebase' } },
            ]),
          );
          await cli.run('log', 's1');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('Task'), 'should contain tool name');
          assert.ok(output.includes('explore codebase'), 'should contain description');
        });

        it('summarizes Write tool', async () => {
          await cli.seed({ id: 's1' });
          const transcriptDir = join(cli.tmpDir, 'transcripts');
          mkdirSync(transcriptDir, { recursive: true });
          mockTranscriptPath = writeTranscript(transcriptDir,
            makeEntry('assistant', '', [
              { name: 'Write', input: { file_path: '/src/foo/bar.ts' } },
            ]),
          );
          await cli.run('log', 's1');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('Write'), 'should contain tool name');
          assert.ok(output.includes('foo/bar.ts'), 'should contain short path');
        });

        it('summarizes Edit tool', async () => {
          await cli.seed({ id: 's1' });
          const transcriptDir = join(cli.tmpDir, 'transcripts');
          mkdirSync(transcriptDir, { recursive: true });
          mockTranscriptPath = writeTranscript(transcriptDir,
            makeEntry('assistant', '', [
              { name: 'Edit', input: { file_path: '/src/a/b/c.ts' } },
            ]),
          );
          await cli.run('log', 's1');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('Edit'), 'should contain tool name');
          assert.ok(output.includes('b/c.ts'), 'should contain short path');
        });
      });

      describe('extractText string content', () => {
        it('handles string content (not array)', async () => {
          await cli.seed({ id: 's1' });
          const transcriptDir = join(cli.tmpDir, 'transcripts');
          mkdirSync(transcriptDir, { recursive: true });
          // Write a transcript entry with string content instead of array
          const entry = {
            type: 'assistant',
            timestamp: new Date().toISOString(),
            message: { content: 'plain text response' },
          };
          const filePath = join(transcriptDir, 'transcript.jsonl');
          writeFileSync(filePath, JSON.stringify(entry));
          mockTranscriptPath = filePath;
          await cli.run('log', 's1');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('plain text response'), 'should render string content');
        });
      });

      describe('tool_result skipping', () => {
        it('skips tool_result entries', async () => {
          await cli.seed({ id: 's1' });
          const transcriptDir = join(cli.tmpDir, 'transcripts');
          mkdirSync(transcriptDir, { recursive: true });
          const entries = [
            makeEntry('user', 'My prompt'),
            // tool_result entry — should be skipped
            {
              type: 'human' as const,
              timestamp: new Date().toISOString(),
              message: {
                content: [{ type: 'tool_result', tool_use_id: 'abc', content: 'result data' }],
              },
            },
            makeEntry('assistant', 'Response after tool'),
          ];
          const filePath = join(transcriptDir, 'transcript.jsonl');
          writeFileSync(filePath, entries.map(e => JSON.stringify(e)).join('\n'));
          mockTranscriptPath = filePath;
          await cli.run('log', 's1');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('My prompt'), 'should show user prompt');
          assert.ok(output.includes('Response after tool'), 'should show assistant response');
          assert.ok(!output.includes('result data'), 'should not render tool_result content');
        });
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
