/**
 * Tests for context-inventory parser
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import {
  readTranscriptInventory,
  canonicalizePath,
  extractBashReadPaths,
  applyInventoryDelta,
} from '../../src/claude/context-inventory.ts';
import type { SessionContextInventory } from '../../src/store/schema.ts';

function userEntry(cwd = '/proj'): string {
  return JSON.stringify({ type: 'user', cwd, message: { role: 'user', content: 'hello' } });
}

function assistantToolUse(blocks: unknown[], cwd = '/proj'): string {
  return JSON.stringify({
    type: 'assistant',
    cwd,
    message: { role: 'assistant', content: blocks },
  });
}

function readBlock(file_path: string) {
  return { type: 'tool_use', name: 'Read', input: { file_path } };
}

function bashBlock(command: string) {
  return { type: 'tool_use', name: 'Bash', input: { command } };
}

function skillBlock(skill: string) {
  return { type: 'tool_use', name: 'Skill', input: { skill } };
}

describe('c', () => {
  describe('claude', () => {
    describe('context-inventory', () => {
      let tmpDir: string;

      beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'c-inv-')); });
      afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

      function writeTx(...lines: string[]): string {
        const p = join(tmpDir, 'transcript.jsonl');
        writeFileSync(p, lines.join('\n') + '\n');
        return p;
      }

      describe('canonicalizePath', () => {
        it('expands leading ~/', () => {
          assert.strictEqual(canonicalizePath('~/foo.md', '/cwd'), join(homedir(), 'foo.md'));
        });

        it('resolves relative paths against the given cwd', () => {
          assert.strictEqual(canonicalizePath('./foo.md', '/proj/a'), '/proj/a/foo.md');
          assert.strictEqual(canonicalizePath('bar.ts', '/proj/b'), '/proj/b/bar.ts');
        });

        it('keeps absolute paths absolute', () => {
          assert.strictEqual(canonicalizePath('/abs/x.md', '/cwd'), '/abs/x.md');
        });

        it('normalizes .. and .', () => {
          assert.strictEqual(canonicalizePath('/a/b/../c/./d.ts', '/cwd'), '/a/c/d.ts');
        });

        it('rejects globs and command substitution', () => {
          assert.strictEqual(canonicalizePath('/a/*.ts', '/cwd'), null);
          assert.strictEqual(canonicalizePath('/a/?.ts', '/cwd'), null);
          assert.strictEqual(canonicalizePath('$(cmd)', '/cwd'), null);
        });
      });

      describe('extractBashReadPaths', () => {
        it('extracts cat file arg', () => {
          assert.deepStrictEqual(
            extractBashReadPaths('cat /proj/a.md', '/cwd'),
            ['/proj/a.md'],
          );
        });

        it('extracts multiple pipeline segments', () => {
          assert.deepStrictEqual(
            extractBashReadPaths('cat /a.md | head -5 /b.md', '/cwd'),
            ['/a.md', '/b.md'],
          );
        });

        it('skips pattern arg for grep/rg/ag/sed/awk/jq', () => {
          assert.deepStrictEqual(
            extractBashReadPaths('grep foo /proj/x.md /proj/y.md', '/cwd'),
            ['/proj/x.md', '/proj/y.md'],
          );
          // rg with a dir target: the extractor reports the positional path even though
          // rg will actually recurse; downstream consumers can categorize as needed.
          assert.deepStrictEqual(
            extractBashReadPaths('rg pattern /proj/src', '/cwd'),
            ['/proj/src'],
          );
          assert.deepStrictEqual(
            extractBashReadPaths("sed 's/a/b/' /proj/file.ts", '/cwd'),
            ['/proj/file.ts'],
          );
          assert.deepStrictEqual(
            extractBashReadPaths('jq .key /proj/data.json', '/cwd'),
            ['/proj/data.json'],
          );
        });

        it('captures < redirects without treating jq filter as a path', () => {
          assert.deepStrictEqual(
            extractBashReadPaths('jq . < /proj/data.json', '/cwd'),
            ['/proj/data.json'],
          );
        });

        it('ignores unknown commands', () => {
          assert.deepStrictEqual(
            extractBashReadPaths('git status', '/cwd'),
            [],
          );
        });

        it('resolves relative paths against cwd', () => {
          assert.deepStrictEqual(
            extractBashReadPaths('cat ./local.md', '/proj'),
            ['/proj/local.md'],
          );
        });

        it('ignores glob-containing args', () => {
          assert.deepStrictEqual(
            extractBashReadPaths('cat *.md', '/proj'),
            [],
          );
        });
      });

      describe('readTranscriptInventory', () => {
        it('counts turns from user entries and attributes tool_uses', () => {
          const tx = writeTx(
            userEntry('/proj'),
            assistantToolUse([readBlock('/proj/a.md')], '/proj'),
            userEntry('/proj'),
            assistantToolUse([readBlock('/proj/b.md'), readBlock('/proj/a.md')], '/proj'),
          );
          const delta = readTranscriptInventory(tx, 0, 0);
          assert.ok(delta);
          assert.deepStrictEqual(delta.reads, [
            { path: '/proj/a.md', turn: 1, via: 'Read' },
            { path: '/proj/b.md', turn: 2, via: 'Read' },
            { path: '/proj/a.md', turn: 2, via: 'Read' },
          ]);
          assert.strictEqual(delta.new_turn, 2);
        });

        it('picks up mid-transcript via offset + startTurn', () => {
          const line1 = userEntry('/proj');
          const line2 = assistantToolUse([readBlock('/proj/a.md')], '/proj');
          writeFileSync(join(tmpDir, 'transcript.jsonl'), [line1, line2].join('\n') + '\n');
          const first = readTranscriptInventory(join(tmpDir, 'transcript.jsonl'), 0, 0);
          assert.ok(first);
          assert.strictEqual(first.reads.length, 1);

          writeFileSync(
            join(tmpDir, 'transcript.jsonl'),
            [line1, line2, userEntry('/proj'), assistantToolUse([readBlock('/proj/b.md')], '/proj')].join('\n') + '\n',
          );
          const second = readTranscriptInventory(join(tmpDir, 'transcript.jsonl'), first.new_offset, first.new_turn);
          assert.ok(second);
          assert.deepStrictEqual(second.reads, [{ path: '/proj/b.md', turn: 2, via: 'Read' }]);
        });

        it('returns no reads and no turn advance when re-read at end-of-file', () => {
          const tx = writeTx(
            userEntry('/proj'),
            assistantToolUse([readBlock('/proj/a.md')], '/proj'),
          );
          const first = readTranscriptInventory(tx, 0, 0);
          assert.ok(first);
          const again = readTranscriptInventory(tx, first.new_offset, first.new_turn);
          assert.strictEqual(again, null);
        });

        it('extracts Bash reads with via=Bash', () => {
          const tx = writeTx(
            userEntry('/proj'),
            assistantToolUse([bashBlock('cat /proj/notes.md')], '/proj'),
          );
          const delta = readTranscriptInventory(tx, 0, 0);
          assert.ok(delta);
          assert.deepStrictEqual(delta.reads, [
            { path: '/proj/notes.md', turn: 1, via: 'Bash' },
          ]);
        });

        it('extracts Skill invocations', () => {
          const tx = writeTx(
            userEntry('/proj'),
            assistantToolUse([skillBlock('loop'), skillBlock('commit')], '/proj'),
          );
          const delta = readTranscriptInventory(tx, 0, 0);
          assert.ok(delta);
          assert.deepStrictEqual(delta.skills, [
            { name: 'loop', turn: 1 },
            { name: 'commit', turn: 1 },
          ]);
        });

        it('returns null for empty transcript', () => {
          writeFileSync(join(tmpDir, 't.jsonl'), '');
          assert.strictEqual(readTranscriptInventory(join(tmpDir, 't.jsonl'), 0, 0), null);
        });

        it('skips malformed JSON lines', () => {
          const tx = writeTx(
            'not json',
            userEntry('/proj'),
            assistantToolUse([readBlock('/proj/x.md')], '/proj'),
          );
          const delta = readTranscriptInventory(tx, 0, 0);
          assert.ok(delta);
          assert.strictEqual(delta.reads.length, 1);
        });
      });

      describe('applyInventoryDelta', () => {
        it('accumulates turn arrays', () => {
          const inv: SessionContextInventory = { reads: {} };
          applyInventoryDelta(inv, {
            reads: [
              { path: '/a', turn: 1, via: 'Read' },
              { path: '/b', turn: 1, via: 'Read' },
              { path: '/a', turn: 3, via: 'Read' },
            ],
            skills: [],
            new_offset: 0,
            new_turn: 3,
          });
          assert.deepStrictEqual(inv.reads['/a'], [1, 3]);
          assert.deepStrictEqual(inv.reads['/b'], [1]);
          assert.strictEqual(inv.reads_via, undefined);
        });

        it('backfills reads_via when a Bash read arrives after prior Reads', () => {
          const inv: SessionContextInventory = { reads: {} };
          applyInventoryDelta(inv, {
            reads: [
              { path: '/a', turn: 1, via: 'Read' },
              { path: '/a', turn: 2, via: 'Read' },
              { path: '/a', turn: 3, via: 'Bash' },
            ],
            skills: [],
            new_offset: 0,
            new_turn: 3,
          });
          assert.deepStrictEqual(inv.reads['/a'], [1, 2, 3]);
          assert.deepStrictEqual(inv.reads_via?.['/a'], ['Read', 'Read', 'Bash']);
        });

        it('accumulates skills by name', () => {
          const inv: SessionContextInventory = { reads: {} };
          applyInventoryDelta(inv, {
            reads: [],
            skills: [
              { name: 'loop', turn: 1 },
              { name: 'loop', turn: 3 },
              { name: 'commit', turn: 2 },
            ],
            new_offset: 0,
            new_turn: 3,
          });
          assert.deepStrictEqual(inv.skills?.loop, [1, 3]);
          assert.deepStrictEqual(inv.skills?.commit, [2]);
        });
      });
    });
  });
});
