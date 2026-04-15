/**
 * Tests for Claude session reading
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { encodeProjectKey, decodeProjectKey } from '../../src/claude/sessions.ts';

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
          const result = encodeProjectKey('/mnt/d/Human Documents/notes');
          assert.strictEqual(result, '-mnt-d-Human-Documents-notes');
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
          const withSpaces = path.join(base, 'Human Documents');
          fs.mkdirSync(withSpaces, { recursive: true });
          try {
            const result = decodeProjectKey('-tmp-ctestspaces-Human-Documents');
            assert.strictEqual(result, withSpaces);
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
          const withSpaces = path.join(base, 'Human Documents', 'notes');
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

      describe('ExitPlanMode detection', () => {
        it('identifies plan execution from ExitPlanMode', () => {
          const content = [
            '{"type":"user","message":"plan the task"}',
            '{"type":"assistant","slug":"impl-plan","message":{"content":[{"type":"tool_use","name":"ExitPlanMode","input":{}}]}}',
          ].join('\n');

          const lines = content.trim().split('\n');
          let planInfo: { slug: string } | null = null;

          const tailLines = lines.slice(-10);
          for (const line of tailLines.reverse()) {
            const entry = JSON.parse(line);
            if (
              entry.type === 'assistant' &&
              entry.message?.content &&
              Array.isArray(entry.message.content)
            ) {
              for (const block of entry.message.content) {
                if (block.type === 'tool_use' && block.name === 'ExitPlanMode') {
                  if (entry.slug) {
                    planInfo = { slug: entry.slug };
                  }
                  break;
                }
              }
            }
            if (planInfo) break;
          }

          assert.deepStrictEqual(planInfo, { slug: 'impl-plan' });
        });

        it('returns null when no ExitPlanMode', () => {
          const content = [
            '{"type":"user","message":"just chat"}',
            '{"type":"assistant","message":{"content":[{"type":"text","text":"hello"}]}}',
          ].join('\n');

          const lines = content.trim().split('\n');
          let planInfo: { slug: string } | null = null;

          const tailLines = lines.slice(-10);
          for (const line of tailLines.reverse()) {
            const entry = JSON.parse(line);
            if (
              entry.type === 'assistant' &&
              entry.message?.content &&
              Array.isArray(entry.message.content)
            ) {
              for (const block of entry.message.content) {
                if (block.type === 'tool_use' && block.name === 'ExitPlanMode') {
                  if (entry.slug) {
                    planInfo = { slug: entry.slug };
                  }
                  break;
                }
              }
            }
            if (planInfo) break;
          }

          assert.strictEqual(planInfo, null);
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
