/**
 * Tests for Claude session reading
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { encodeProjectKey, decodeProjectKey, getCwdFromTranscriptHead, readPlanEventsFromTranscript } from '../../src/claude/sessions.ts';

// Test with real temp directory for integration tests
let testDir: string;
let projectsDir: string;

describe('c', () => {
  describe('claude', () => {
    describe('sessions', () => {
      beforeEach(() => {
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c-claude-test-'));
        projectsDir = path.join(testDir, 'projects');
        fs.mkdirSync(projectsDir, { recursive: true });
      });

      afterEach(() => {
        if (testDir && fs.existsSync(testDir)) {
          fs.rmSync(testDir, { recursive: true, force: true });
        }
      });

      describe('encodeProjectKey', () => {
        it('replaces slashes with dashes', () => {
          const result = encodeProjectKey('/home/user/project');
          assert.strictEqual(result, '-home-user-project');
        });

        it('replaces dots with dashes', () => {
          const result = encodeProjectKey('/home/user/.config');
          assert.strictEqual(result, '-home-user--config');
        });

        it('replaces both slashes and dots', () => {
          const result = encodeProjectKey('/home/user/app.config/dir');
          assert.strictEqual(result, '-home-user-app-config-dir');
        });

        it('handles path without leading slash', () => {
          const result = encodeProjectKey('relative/path');
          assert.strictEqual(result, 'relative-path');
        });

        it('handles single directory', () => {
          const result = encodeProjectKey('/tmp');
          assert.strictEqual(result, '-tmp');
        });

        it('replaces spaces with hyphens', () => {
          const result = encodeProjectKey('/home/user/my docs/notes');
          assert.strictEqual(result, '-home-user-my-docs-notes');
        });

        it('replaces slashes, dots, and spaces together', () => {
          const result = encodeProjectKey('/home/user/my project/app.config');
          assert.strictEqual(result, '-home-user-my-project-app-config');
        });
      });

      describe('decodeProjectKey', () => {
        it('restores path from key with leading dash', () => {
          const result = decodeProjectKey('-home-user-project');
          assert.strictEqual(result, '/home/user/project');
        });

        it('handles key without leading dash', () => {
          // decodeProjectKey always returns absolute paths (starts from /)
          const result = decodeProjectKey('relative-path');
          assert.strictEqual(result, '/relative/path');
        });

        it('handles single directory key', () => {
          const result = decodeProjectKey('-tmp');
          assert.strictEqual(result, '/tmp');
        });

        it('resolves space-encoded segment when directory with spaces exists on filesystem', () => {
          // Use a fixed base path with no ambiguous dashes so decode resolves cleanly
          const base = '/tmp/ctestspaces';
          const withSpaces = path.join(base, 'my docs');
          fs.mkdirSync(withSpaces, { recursive: true });
          try {
            const result = decodeProjectKey('-tmp-ctestspaces-my-docs');
            assert.strictEqual(result, withSpaces);
          } finally {
            fs.rmSync(base, { recursive: true, force: true });
          }
        });

        it('resolves hyphen-bearing segment when directory with hyphen exists on filesystem', () => {
          // encodeProjectKey preserves hyphens verbatim, so /tmp/ctesthyphen/latitude-ubuntu
          // encodes to -tmp-ctesthyphen-latitude-ubuntu — indistinguishable from
          // /tmp/ctesthyphen/latitude/ubuntu without filesystem probing.
          const base = '/tmp/ctesthyphen';
          const withHyphen = path.join(base, 'latitude-ubuntu');
          fs.mkdirSync(withHyphen, { recursive: true });
          try {
            const result = decodeProjectKey('-tmp-ctesthyphen-latitude-ubuntu');
            assert.strictEqual(result, withHyphen);
          } finally {
            fs.rmSync(base, { recursive: true, force: true });
          }
        });
      });

      describe('project key round-trip', () => {
        it('round-trips paths without dots', () => {
          // Note: dots are not preserved in round-trip
          const original = '/home/user/myproject';
          const encoded = encodeProjectKey(original);
          const decoded = decodeProjectKey(encoded);
          assert.strictEqual(decoded, original);
        });

        it('round-trips paths with spaces when directory exists on filesystem', () => {
          const base = '/tmp/ctestspaces';
          const withSpaces = path.join(base, 'my docs', 'notes');
          fs.mkdirSync(withSpaces, { recursive: true });
          try {
            const encoded = encodeProjectKey(withSpaces);
            const decoded = decodeProjectKey(encoded);
            assert.strictEqual(decoded, withSpaces);
          } finally {
            fs.rmSync(base, { recursive: true, force: true });
          }
        });
      });

      describe('session file structure', () => {
        it('validates UUID format', () => {
          const validUUID = '12345678-1234-1234-1234-123456789012';
          const isValid = /^[0-9a-f-]{36}$/.test(validUUID);
          assert.strictEqual(isValid, true);
        });

        it('rejects invalid UUID', () => {
          const invalid = 'not-a-uuid';
          const isValid = /^[0-9a-f-]{36}$/.test(invalid);
          assert.strictEqual(isValid, false);
        });

        it('rejects partial UUID', () => {
          const partial = '12345678-1234';
          const isValid = /^[0-9a-f-]{36}$/.test(partial);
          assert.strictEqual(isValid, false);
        });
      });

      describe('transcript parsing', () => {
        it('extracts custom title from transcript', () => {
          const content = [
            '{"type":"user","message":"hello"}',
            '{"type":"assistant","message":"hi"}',
            '{"type":"custom-title","customTitle":"My Session"}',
          ].join('\n');

          const lines = content.trim().split('\n');
          let customTitle: string | null = null;

          for (let i = lines.length - 1; i >= 0; i--) {
            const entry = JSON.parse(lines[i]);
            if (entry.type === 'custom-title' && entry.customTitle) {
              customTitle = entry.customTitle;
              break;
            }
          }

          assert.strictEqual(customTitle, 'My Session');
        });

        it('uses most recent custom title', () => {
          const content = [
            '{"type":"custom-title","customTitle":"First"}',
            '{"type":"user","message":"rename again"}',
            '{"type":"custom-title","customTitle":"Second"}',
          ].join('\n');

          const lines = content.trim().split('\n');
          let customTitle: string | null = null;

          for (let i = lines.length - 1; i >= 0; i--) {
            const entry = JSON.parse(lines[i]);
            if (entry.type === 'custom-title' && entry.customTitle) {
              customTitle = entry.customTitle;
              break;
            }
          }

          assert.strictEqual(customTitle, 'Second');
        });

        it('returns null without custom title', () => {
          const content = [
            '{"type":"user","message":"hello"}',
            '{"type":"assistant","message":"hi"}',
          ].join('\n');

          const lines = content.trim().split('\n');
          let customTitle: string | null = null;

          for (let i = lines.length - 1; i >= 0; i--) {
            const entry = JSON.parse(lines[i]);
            if (entry.type === 'custom-title' && entry.customTitle) {
              customTitle = entry.customTitle;
              break;
            }
          }

          assert.strictEqual(customTitle, null);
        });
      });

      describe('readPlanEventsFromTranscript', () => {
        function writeTranscript(name: string, lines: string[]): string {
          const file = path.join(projectsDir, name);
          fs.writeFileSync(file, lines.join('\n') + '\n');
          return file;
        }

        it('extracts slug, title, and timestamp from a single ExitPlanMode call', () => {
          const file = writeTranscript('a.jsonl', [
            '{"type":"user","message":"plan the task"}',
            '{"type":"assistant","slug":"impl-plan","timestamp":"2025-06-01T10:00:00Z","message":{"content":[{"type":"tool_use","name":"ExitPlanMode","input":{}}]}}',
          ]);

          const events = readPlanEventsFromTranscript(file);
          assert.strictEqual(events.length, 1);
          assert.strictEqual(events[0].slug, 'impl-plan');
          assert.strictEqual(events[0].timestamp.toISOString(), '2025-06-01T10:00:00.000Z');
        });

        it('returns an empty array when there is no ExitPlanMode call', () => {
          const file = writeTranscript('b.jsonl', [
            '{"type":"user","message":"just chat"}',
            '{"type":"assistant","message":{"content":[{"type":"text","text":"hello"}]}}',
          ]);

          assert.deepStrictEqual(readPlanEventsFromTranscript(file), []);
        });

        it('returns every ExitPlanMode call, most recent first, for a session that rewrote its plan', () => {
          const file = writeTranscript('c.jsonl', [
            '{"type":"assistant","slug":"impl-plan","timestamp":"2025-06-01T10:00:00Z","message":{"content":[{"type":"tool_use","name":"ExitPlanMode","input":{}}]}}',
            '{"type":"user","message":"actually, one more thing"}',
            '{"type":"assistant","slug":"impl-plan","timestamp":"2025-06-01T11:00:00Z","message":{"content":[{"type":"tool_use","name":"ExitPlanMode","input":{}}]}}',
          ]);

          const events = readPlanEventsFromTranscript(file);
          assert.strictEqual(events.length, 2);
          assert.strictEqual(events[0].timestamp.toISOString(), '2025-06-01T11:00:00.000Z');
          assert.strictEqual(events[1].timestamp.toISOString(), '2025-06-01T10:00:00.000Z');
        });
      });

      describe('getCwdFromTranscriptHead', () => {
        function writeTranscript(name: string, lines: string[]): string {
          const file = path.join(projectsDir, name);
          fs.writeFileSync(file, lines.join('\n') + '\n');
          return file;
        }

        it('returns the cwd from the first entry', () => {
          const file = writeTranscript('a.jsonl', [
            '{"type":"user","cwd":"/home/user/projects/2023-2024 archive/q1 notes","message":"hi"}',
            '{"type":"assistant","cwd":"/home/user/projects/2023-2024 archive/q1 notes"}',
          ]);
          assert.strictEqual(
            getCwdFromTranscriptHead(file),
            '/home/user/projects/2023-2024 archive/q1 notes',
          );
        });

        it('falls through to a later line when the first has no cwd', () => {
          const file = writeTranscript('b.jsonl', [
            '{"type":"summary","summary":"no cwd here"}',
            '{"type":"user","cwd":"/home/user/proj"}',
          ]);
          assert.strictEqual(getCwdFromTranscriptHead(file), '/home/user/proj');
        });

        it('skips malformed lines', () => {
          const file = writeTranscript('c.jsonl', [
            'not json but mentions "cwd"',
            '{"type":"user","cwd":"/home/user/proj"}',
          ]);
          assert.strictEqual(getCwdFromTranscriptHead(file), '/home/user/proj');
        });

        it('returns null when no entry carries a cwd', () => {
          const file = writeTranscript('d.jsonl', [
            '{"type":"user","message":"hi"}',
            '{"type":"assistant","message":"yo"}',
          ]);
          assert.strictEqual(getCwdFromTranscriptHead(file), null);
        });

        it('returns null for a missing file', () => {
          assert.strictEqual(
            getCwdFromTranscriptHead(path.join(projectsDir, 'does-not-exist.jsonl')),
            null,
          );
        });
      });

      describe('session index JSON parsing', () => {
        it('parses sessions-index.json structure', () => {
          const indexContent = {
            version: 1,
            entries: [
              {
                sessionId: 'test-uuid',
                fullPath: '/path/to/session.jsonl',
                fileMtime: Date.now(),
                firstPrompt: 'Hello',
                customTitle: 'My Session',
                summary: 'A test session',
                messageCount: 5,
                created: '2024-01-15T10:00:00Z',
                modified: '2024-01-15T11:00:00Z',
                projectPath: '/home/user/project',
                isSidechain: false,
              },
            ],
            originalPath: '/home/user/project',
          };

          const parsed = JSON.parse(JSON.stringify(indexContent));
          assert.strictEqual(parsed.version, 1);
          assert.strictEqual(parsed.entries.length, 1);
          assert.strictEqual(parsed.entries[0].sessionId, 'test-uuid');
          assert.strictEqual(parsed.entries[0].customTitle, 'My Session');
          assert.strictEqual(parsed.entries[0].summary, 'A test session');
        });

        it('handles entry without custom title', () => {
          const indexContent = {
            version: 1,
            entries: [
              {
                sessionId: 'test-uuid',
                fullPath: '/path/to/session.jsonl',
                firstPrompt: 'Hello',
                messageCount: 5,
                projectPath: '/home/user/project',
                isSidechain: false,
              },
            ],
            originalPath: '/home/user/project',
          };

          const parsed = JSON.parse(JSON.stringify(indexContent));
          assert.strictEqual(parsed.entries[0].customTitle, undefined);
        });
      });
    });
  });
});
