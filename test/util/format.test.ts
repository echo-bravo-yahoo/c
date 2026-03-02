/**
 * Tests for formatting utilities
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { useFakeTime } from '../setup.js';

// These are pure functions we can test directly
import { relativeTime, shortId, displayWidth, getRepoName, getBranchDisplay, formatSessionLine, computeUniquePrefixLength, highlightId, buildPrefixMap } from '../../src/util/format.js';
import type { Session } from '../../src/store/schema.js';
import type { ColumnLayout } from '../../src/util/layout.js';
import chalk from 'chalk';

describe('c', () => {
  describe('util', () => {
    describe('format', () => {
      describe('relativeTime', () => {
        let fakeTime: { restore: () => void };

        beforeEach(() => {
          // Set fake time to 2024-01-15 12:00:00 UTC
          fakeTime = useFakeTime(new Date('2024-01-15T12:00:00Z').getTime());
        });

        afterEach(() => {
          fakeTime.restore();
        });

        it('returns "just now" within 60s', () => {
          const date = new Date('2024-01-15T11:59:30Z'); // 30 seconds ago
          const result = relativeTime(date);
          assert.strictEqual(result, 'just now');
        });

        it('returns "just now" at exactly 59 seconds', () => {
          const date = new Date('2024-01-15T11:59:01Z'); // 59 seconds ago
          const result = relativeTime(date);
          assert.strictEqual(result, 'just now');
        });

        it('returns "Xm ago" for minutes', () => {
          const date = new Date('2024-01-15T11:55:00Z'); // 5 minutes ago
          const result = relativeTime(date);
          assert.strictEqual(result, '5m ago');
        });

        it('returns "1m ago" at 60 seconds', () => {
          const date = new Date('2024-01-15T11:59:00Z'); // exactly 60 seconds ago
          const result = relativeTime(date);
          assert.strictEqual(result, '1m ago');
        });

        it('returns "59m ago" at 59 minutes', () => {
          const date = new Date('2024-01-15T11:01:00Z'); // 59 minutes ago
          const result = relativeTime(date);
          assert.strictEqual(result, '59m ago');
        });

        it('returns "Xh ago" for hours', () => {
          const date = new Date('2024-01-15T09:00:00Z'); // 3 hours ago
          const result = relativeTime(date);
          assert.strictEqual(result, '3h ago');
        });

        it('returns "1h ago" at 60 minutes', () => {
          const date = new Date('2024-01-15T11:00:00Z'); // exactly 1 hour ago
          const result = relativeTime(date);
          assert.strictEqual(result, '1h ago');
        });

        it('returns "23h ago" at 23 hours', () => {
          const date = new Date('2024-01-14T13:00:00Z'); // 23 hours ago
          const result = relativeTime(date);
          assert.strictEqual(result, '23h ago');
        });

        it('returns "Xd ago" for days', () => {
          const date = new Date('2024-01-12T12:00:00Z'); // 3 days ago
          const result = relativeTime(date);
          assert.strictEqual(result, '3d ago');
        });

        it('returns "1d ago" at 24 hours', () => {
          const date = new Date('2024-01-14T12:00:00Z'); // exactly 24 hours ago
          const result = relativeTime(date);
          assert.strictEqual(result, '1d ago');
        });

        it('handles very old dates', () => {
          const date = new Date('2023-01-15T12:00:00Z'); // 365 days ago
          const result = relativeTime(date);
          assert.strictEqual(result, '365d ago');
        });
      });

      describe('shortId', () => {
        it('returns first 8 characters', () => {
          const result = shortId('abcdefgh-ijkl-mnop-qrst-uvwxyz123456');
          assert.strictEqual(result, 'abcdefgh');
        });

        it('handles UUID format', () => {
          const result = shortId('12345678-1234-1234-1234-123456789012');
          assert.strictEqual(result, '12345678');
        });

        it('handles short input', () => {
          const result = shortId('abc');
          assert.strictEqual(result, 'abc');
        });

        it('handles exactly 8 characters', () => {
          const result = shortId('12345678');
          assert.strictEqual(result, '12345678');
        });
      });

      describe('displayWidth', () => {
        it('counts ASCII characters correctly', () => {
          assert.strictEqual(displayWidth('hello'), 5);
        });

        it('counts surrogate pairs as single visual character', () => {
          // 󰇘 is U+F0298, a surrogate pair with .length === 2 but visual width 1
          const icon = '󰇘';
          assert.strictEqual(icon.length, 2, 'surrogate pair has .length of 2');
          assert.strictEqual(displayWidth(icon), 1, 'displayWidth should count as 1');
        });

        it('handles abbreviated branch with surrogate pair icon', () => {
          const abbreviated = '󰇘/billing-error-discovery';
          // .length returns 26 (2 for icon + 24 for rest)
          // displayWidth should return 25 (1 for icon + 24 for rest)
          assert.strictEqual(abbreviated.length, 26);
          assert.strictEqual(displayWidth(abbreviated), 25);
        });

        it('handles empty string', () => {
          assert.strictEqual(displayWidth(''), 0);
        });
      });

      describe('gap marker logic', () => {
        /**
         * Replicate the gap marker algorithm from orderSessionsWithChildren
         * to test the per-child gap marker behavior in isolation.
         */
        type SessionMeta = { visibleParentId: string | null; hiddenCount: number };
        type OutputRow =
          | { type: 'session'; id: string; depth: number }
          | { type: 'gap'; count: number; depth: number };

        interface TestSession {
          id: string;
          parent_session_id?: string;
          state: 'busy' | 'archived';
          last_active_at: number; // timestamp for sorting
        }

        function computeGapMarkers(
          allSessions: TestSession[],
          visibleSessions: TestSession[]
        ): OutputRow[] {
          const allById = new Map(allSessions.map((s) => [s.id, s]));
          const visibleIds = new Set(visibleSessions.map((s) => s.id));

          // Compute metadata for each visible session
          const meta = new Map<string, SessionMeta>();

          for (const session of visibleSessions) {
            let hiddenCount = 0;
            let current: TestSession | undefined = session;

            while (current?.parent_session_id) {
              const parent = allById.get(current.parent_session_id);
              if (!parent) break;

              if (visibleIds.has(parent.id)) {
                meta.set(session.id, { visibleParentId: parent.id, hiddenCount });
                break;
              }
              hiddenCount++;
              current = parent;
            }

            if (!meta.has(session.id)) {
              meta.set(session.id, { visibleParentId: null, hiddenCount });
            }
          }

          // Group by visible parent
          const byParent = new Map<string | null, TestSession[]>();
          for (const session of visibleSessions) {
            const m = meta.get(session.id)!;
            const children = byParent.get(m.visibleParentId) || [];
            children.push(session);
            byParent.set(m.visibleParentId, children);
          }

          // Sort each group by last_active_at descending
          for (const children of byParent.values()) {
            children.sort((a, b) => b.last_active_at - a.last_active_at);
          }

          const result: OutputRow[] = [];

          function addChildren(parentId: string | null, parentDepth: number): void {
            const children = byParent.get(parentId) || [];
            if (children.length === 0) return;

            const childDepth = parentDepth + 1;

            for (const child of children) {
              // Show gap marker only for children that actually have hidden ancestors
              const childMeta = meta.get(child.id)!;
              if (childMeta.hiddenCount > 0) {
                result.push({ type: 'gap', count: childMeta.hiddenCount, depth: childDepth });
              }
              result.push({ type: 'session', id: child.id, depth: childDepth });
              addChildren(child.id, childDepth);
            }
          }

          // Start with roots
          const roots = byParent.get(null) || [];
          for (const root of roots) {
            const rootMeta = meta.get(root.id)!;
            if (rootMeta.hiddenCount > 0) {
              // Show gap marker at depth 0, but session at depth 1 (as child of hidden ancestors)
              result.push({ type: 'gap', count: rootMeta.hiddenCount, depth: 0 });
              result.push({ type: 'session', id: root.id, depth: 1 });
              addChildren(root.id, 1);
            } else {
              result.push({ type: 'session', id: root.id, depth: 0 });
              addChildren(root.id, 0);
            }
          }

          return result;
        }

        it('shows no gap for sessions without hidden ancestors', () => {
          const allSessions: TestSession[] = [
            { id: 'A', state: 'busy', last_active_at: 1 },
            { id: 'B', state: 'busy', parent_session_id: 'A', last_active_at: 2 },
          ];
          const visible = allSessions.filter((s) => s.state === 'busy');

          const result = computeGapMarkers(allSessions, visible);

          // No gaps, just sessions
          assert.deepStrictEqual(result, [
            { type: 'session', id: 'A', depth: 0 },
            { type: 'session', id: 'B', depth: 1 },
          ]);
        });

        it('shows gap for session with hidden ancestor', () => {
          const allSessions: TestSession[] = [
            { id: 'A', state: 'archived', last_active_at: 1 },
            { id: 'B', state: 'busy', parent_session_id: 'A', last_active_at: 2 },
          ];
          const visible = allSessions.filter((s) => s.state === 'busy');

          const result = computeGapMarkers(allSessions, visible);

          // Session with hidden ancestors shown at depth 1 (as child of hidden)
          assert.deepStrictEqual(result, [
            { type: 'gap', count: 1, depth: 0 },
            { type: 'session', id: 'B', depth: 1 },
          ]);
        });

        it('shows gap only for child with hidden ancestors, not siblings', () => {
          // A (visible) -> B (archived) -> C (visible)
          // A (visible) -> D (visible, direct child)
          const allSessions: TestSession[] = [
            { id: 'A', state: 'busy', last_active_at: 1 },
            { id: 'B', state: 'archived', parent_session_id: 'A', last_active_at: 2 },
            { id: 'C', state: 'busy', parent_session_id: 'B', last_active_at: 3 },
            { id: 'D', state: 'busy', parent_session_id: 'A', last_active_at: 4 },
          ];
          const visible = allSessions.filter((s) => s.state === 'busy');

          const result = computeGapMarkers(allSessions, visible);

          // D is more recent, comes first. D has no hidden ancestors.
          // C has hidden ancestor B, gets gap marker.
          assert.deepStrictEqual(result, [
            { type: 'session', id: 'A', depth: 0 },
            { type: 'session', id: 'D', depth: 1 }, // No gap before D
            { type: 'gap', count: 1, depth: 1 }, // Gap before C
            { type: 'session', id: 'C', depth: 1 },
          ]);
        });

        it('counts multiple hidden ancestors correctly', () => {
          // A (archived) -> B (archived) -> C (visible)
          const allSessions: TestSession[] = [
            { id: 'A', state: 'archived', last_active_at: 1 },
            { id: 'B', state: 'archived', parent_session_id: 'A', last_active_at: 2 },
            { id: 'C', state: 'busy', parent_session_id: 'B', last_active_at: 3 },
          ];
          const visible = allSessions.filter((s) => s.state === 'busy');

          const result = computeGapMarkers(allSessions, visible);

          // Session with hidden ancestors shown at depth 1
          assert.deepStrictEqual(result, [
            { type: 'gap', count: 2, depth: 0 },
            { type: 'session', id: 'C', depth: 1 },
          ]);
        });

        it('archived siblings with no visible children do not affect gap count', () => {
          // A (visible)
          //   -> B (archived) -> C (visible)
          //   -> D (archived, no visible children)
          const allSessions: TestSession[] = [
            { id: 'A', state: 'busy', last_active_at: 1 },
            { id: 'B', state: 'archived', parent_session_id: 'A', last_active_at: 2 },
            { id: 'C', state: 'busy', parent_session_id: 'B', last_active_at: 3 },
            { id: 'D', state: 'archived', parent_session_id: 'A', last_active_at: 4 },
          ];
          const visible = allSessions.filter((s) => s.state === 'busy');

          const result = computeGapMarkers(allSessions, visible);

          // D has no visible descendants, so it doesn't appear anywhere
          // C has 1 hidden ancestor (B)
          assert.deepStrictEqual(result, [
            { type: 'session', id: 'A', depth: 0 },
            { type: 'gap', count: 1, depth: 1 },
            { type: 'session', id: 'C', depth: 1 },
          ]);
        });

        it('handles mixed visible and hidden at multiple levels', () => {
          // A (visible)
          //   -> B (archived)
          //     -> C (visible)
          //       -> D (archived)
          //         -> E (visible)
          const allSessions: TestSession[] = [
            { id: 'A', state: 'busy', last_active_at: 1 },
            { id: 'B', state: 'archived', parent_session_id: 'A', last_active_at: 2 },
            { id: 'C', state: 'busy', parent_session_id: 'B', last_active_at: 3 },
            { id: 'D', state: 'archived', parent_session_id: 'C', last_active_at: 4 },
            { id: 'E', state: 'busy', parent_session_id: 'D', last_active_at: 5 },
          ];
          const visible = allSessions.filter((s) => s.state === 'busy');

          const result = computeGapMarkers(allSessions, visible);

          assert.deepStrictEqual(result, [
            { type: 'session', id: 'A', depth: 0 },
            { type: 'gap', count: 1, depth: 1 }, // B is hidden between A and C
            { type: 'session', id: 'C', depth: 1 },
            { type: 'gap', count: 1, depth: 2 }, // D is hidden between C and E
            { type: 'session', id: 'E', depth: 2 },
          ]);
        });
      });

      describe('getRepoName', () => {
        const originalHome = process.env.HOME;

        afterEach(() => {
          process.env.HOME = originalHome;
        });

        it('returns ~ when directory is $HOME', () => {
          process.env.HOME = '/Users/testuser';
          assert.strictEqual(getRepoName('/Users/testuser'), '~');
        });

        it('returns ~ when directory is $HOME with trailing slash', () => {
          process.env.HOME = '/Users/testuser';
          assert.strictEqual(getRepoName('/Users/testuser/'), '~');
        });

        it('returns repo name for .worktrees/ path', () => {
          const dir = '/Users/testuser/workspace/myrepo/.worktrees/feature-branch';
          assert.strictEqual(getRepoName(dir), 'myrepo');
        });

        it('returns repo name for .claude/worktrees/ path', () => {
          const dir = '/Users/testuser/workspace/myrepo/.claude/worktrees/feature-branch';
          assert.strictEqual(getRepoName(dir), 'myrepo');
        });

        it('returns basename for normal path', () => {
          assert.strictEqual(getRepoName('/Users/testuser/workspace/myproject'), 'myproject');
        });
      });

      describe('getBranchDisplay', () => {
        function makeSession(overrides: Partial<Session> = {}): Session {
          return {
            id: 'test-id',
            name: '',
            directory: '/Users/testuser/workspace/myproject',
            project_key: 'key',
            created_at: new Date(),
            last_active_at: new Date(),
            state: 'idle',
            resources: {},
            servers: {},
            tags: { values: [] },
            meta: {},
            ...overrides,
          };
        }

        it('shows worktree in cyan when worktree is set', () => {
          const session = makeSession({
            resources: { worktree: 'feature-wt', branch: 'feature-branch' },
          });
          const result = getBranchDisplay(session);
          assert.strictEqual(result.text, 'feature-wt');
          assert.strictEqual(result.color, 'cyan');
        });

        it('shows branch in magenta when no worktree', () => {
          const session = makeSession({
            resources: { branch: 'main' },
          });
          const result = getBranchDisplay(session);
          assert.strictEqual(result.text, 'main');
          assert.strictEqual(result.color, 'magenta');
        });

        it('returns empty text when no worktree or branch', () => {
          const session = makeSession({
            resources: {},
          });
          const result = getBranchDisplay(session);
          assert.strictEqual(result.text, '');
          assert.strictEqual(result.color, 'dim');
        });

        it('worktree takes priority over branch', () => {
          const session = makeSession({
            resources: { worktree: 'wt-name', branch: 'some-branch' },
          });
          const result = getBranchDisplay(session);
          assert.strictEqual(result.text, 'wt-name');
          assert.strictEqual(result.color, 'cyan');
        });
      });

      describe('formatSessionLine', () => {
        let savedLevel: typeof chalk.level;

        beforeEach(() => {
          savedLevel = chalk.level;
          chalk.level = 1 as typeof chalk.level; // force ANSI output in non-TTY test runner
        });

        afterEach(() => {
          chalk.level = savedLevel;
        });

        function makeSession(overrides: Partial<Session> = {}): Session {
          return {
            id: 'test-id-00-0000-0000-000000000000',
            name: '',
            directory: '/tmp/test',
            project_key: 'key',
            created_at: new Date(),
            last_active_at: new Date(),
            state: 'idle',
            resources: {},
            servers: {},
            tags: { values: [] },
            meta: {},
            ...overrides,
          };
        }

        const layout: ColumnLayout = {
          id: 12,
          name: 30,
          status: 8,
          repo: 0,
          branch: 0,
          resources: 0,
          time: 0,
          visible: new Set(['idName', 'status']),
          totalWidth: 50,
        };

        it('renders humanhash name as dim', () => {
          const session = makeSession();
          const line = formatSessionLine(session, layout);
          // dim = \x1b[2m, bold = \x1b[1m
          assert.ok(line.includes('\x1b[2m'), 'humanhash name should use dim escape code');
          assert.ok(!line.includes('\x1b[1m'), 'humanhash name should not use bold escape code');
        });

        it('renders explicit name as whiteBright', () => {
          const session = makeSession({ name: 'my cool session' });
          const line = formatSessionLine(session, layout);
          assert.ok(!line.includes('\x1b[1m'), 'explicit name should not use bold escape code');
          assert.ok(line.includes('\x1b[97m'), 'explicit name should use whiteBright escape code');
        });
      });

      describe('computeUniquePrefixLength', () => {
        it('needs 1 char to disambiguate a single ID', () => {
          assert.strictEqual(computeUniquePrefixLength('abcdef', ['abcdef']), 1);
        });

        it('needs 1 char for distinct IDs', () => {
          assert.strictEqual(computeUniquePrefixLength('abcdef', ['abcdef', 'xyz123']), 1);
        });

        it('needs 6 chars when 5-char prefix is shared', () => {
          assert.strictEqual(computeUniquePrefixLength('abcde1xx', ['abcde1xx', 'abcde2yy']), 6);
        });

        it('needs full length for identical IDs', () => {
          assert.strictEqual(computeUniquePrefixLength('abcdef', ['abcdef', 'abcdef']), 6);
        });

        it('handles three-way partial overlap', () => {
          const ids = ['abc111', 'abc222', 'abd333'];
          assert.strictEqual(computeUniquePrefixLength('abc111', ids), 4);
          assert.strictEqual(computeUniquePrefixLength('abc222', ids), 4);
          assert.strictEqual(computeUniquePrefixLength('abd333', ids), 3);
        });
      });

      describe('highlightId', () => {
        let savedLevel: typeof chalk.level;

        beforeEach(() => {
          savedLevel = chalk.level;
          chalk.level = 1 as typeof chalk.level;
        });

        afterEach(() => {
          chalk.level = savedLevel;
        });

        it('highlights entire ID when prefix covers full length', () => {
          const result = highlightId('abcdef', 6);
          assert.strictEqual(result, chalk.cyan('abcdef') + chalk.dim(''));
        });

        it('dims remainder after unique prefix', () => {
          const result = highlightId('abcdef', 3);
          assert.strictEqual(result, chalk.cyan('abc') + chalk.dim('def'));
        });

        it('highlights single character when sufficient', () => {
          const result = highlightId('abcdef', 1);
          assert.strictEqual(result, chalk.cyan('a') + chalk.dim('bcdef'));
        });
      });

      describe('buildPrefixMap', () => {
        function makeSession(overrides: Partial<Session> = {}): Session {
          return {
            id: overrides.id ?? 'test-id',
            name: '',
            directory: '/tmp/test',
            project_key: 'key',
            created_at: new Date(),
            last_active_at: new Date(),
            state: 'idle',
            resources: {},
            servers: {},
            tags: { values: [] },
            meta: {},
            ...overrides,
          };
        }

        it('returns one entry per session', () => {
          const sessions = [
            makeSession({ id: 'aaaa1111-0000-0000-0000-000000000000' }),
            makeSession({ id: 'bbbb2222-0000-0000-0000-000000000000' }),
          ];
          const map = buildPrefixMap(sessions);
          assert.strictEqual(map.size, 2);
        });

        it('assigns prefix length 1 for fully distinct short IDs', () => {
          const visible = [
            makeSession({ id: 'aaaa1111-0000-0000-0000-000000000000' }),
            makeSession({ id: 'bbbb2222-0000-0000-0000-000000000000' }),
          ];
          // Hidden session shares "aaaa" prefix with the first visible session
          const all = [
            ...visible,
            makeSession({ id: 'aaaa3333-0000-0000-0000-000000000000' }),
          ];
          const map = buildPrefixMap(visible, all);
          // Must disambiguate "aaaa1" vs "aaaa3" — prefix length 5
          assert.strictEqual(map.get('aaaa1111-0000-0000-0000-000000000000'), 5);
          assert.strictEqual(map.get('bbbb2222-0000-0000-0000-000000000000'), 1);
        });

        it('assigns longer prefix for overlapping short IDs', () => {
          const sessions = [
            makeSession({ id: 'abcde111-0000-0000-0000-000000000000' }),
            makeSession({ id: 'abcde222-0000-0000-0000-000000000000' }),
          ];
          const map = buildPrefixMap(sessions);
          // shortId gives 'abcde111' and 'abcde222' — diverge at char 6
          assert.strictEqual(map.get('abcde111-0000-0000-0000-000000000000'), 6);
          assert.strictEqual(map.get('abcde222-0000-0000-0000-000000000000'), 6);
        });
      });
    });
  });
});
