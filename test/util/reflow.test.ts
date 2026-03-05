/**
 * Stress tests for table reflow behavior.
 *
 * Tests formatSessionLine + computeColumnLayout pipeline at various
 * terminal widths, comparing stripped output against known-good text.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { useFakeTime } from '../setup.ts';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.ts';
import {
  formatSessionLine,
  measureColumns,
  fixedWidth,
  displayWidth,
} from '../../src/util/format.ts';
import { computeColumnLayout, COLUMN_SPECS, GUTTER } from '../../src/util/layout.ts';
import type { Session } from '../../src/store/schema.ts';

/** Strip ANSI escape codes */
function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Build a layout from sessions at a given terminal width */
function layoutAt(sessions: Session[], width: number) {
  return computeColumnLayout(measureColumns(sessions), width);
}

/** Format a single session line, stripped of ANSI, at a given width */
function renderLine(session: Session, sessions: Session[], width: number, depth = 0): string {
  const layout = layoutAt(sessions, width);
  return strip(formatSessionLine(session, layout, depth));
}

const ALL_MIN = COLUMN_SPECS.reduce((sum, col) => sum + col.min, 0);

describe('c', () => {
  describe('util', () => {
    describe('reflow', () => {
      let fakeTime: { restore: () => void };

      beforeEach(() => {
        resetSessionCounter();
        // Fix time so relativeTime output is deterministic
        fakeTime = useFakeTime(new Date('2024-06-15T12:00:00Z').getTime());
      });

      afterEach(() => {
        fakeTime.restore();
      });

      /** Standard test session set */
      function makeSessions(): Session[] {
        return [
          createTestSession({
            name: 'auth-refactor',
            state: 'busy',
            directory: '/home/test/myapp',
            resources: { branch: 'feat/auth' },
            last_active_at: new Date('2024-06-15T11:55:00Z'),
          }),
          createTestSession({
            name: 'billing-fix',
            state: 'closed',
            directory: '/home/test/payments',
            resources: { branch: 'fix/billing', pr: 'https://github.com/o/r/pull/42' },
            tags: ['urgent'],
            last_active_at: new Date('2024-06-14T12:00:00Z'),
          }),
        ];
      }

      describe('column visibility at various widths', () => {
        it('shows all 7 columns at 200 width', () => {
          const sessions = makeSessions();
          const layout = layoutAt(sessions, 200);

          assert.strictEqual(layout.visible.size, 7);
          const line = renderLine(sessions[0], sessions, 200);
          // Should contain all parts: ID, name, status, repo, branch, size, time
          assert.ok(line.includes('test-uui'), 'has ID');
          assert.ok(line.includes('auth-refactor'), 'has name');
          assert.ok(line.includes('busy'), 'has status');
          assert.ok(line.includes('myapp'), 'has repo');
          assert.ok(line.includes('feat/auth'), 'has branch');
          assert.ok(line.includes('5m ago'), 'has time');
        });

        it('drops resources first at narrower width', () => {
          const sessions = makeSessions();
          // Just below the point where all 7 columns fit at minimums
          const narrow = ALL_MIN + GUTTER - 1;
          const layout = layoutAt(sessions, narrow);

          assert.ok(!layout.visible.has('resources'), 'resources dropped');
          assert.strictEqual(layout.visible.size, 6);
        });

        it('drops time and resources at very narrow width', () => {
          const sessions = makeSessions();
          // status(7) + idName(20) + repo(6) + branch(6) = 39 + gutter(2) = 41
          const layout = layoutAt(sessions, 41);

          assert.ok(layout.visible.has('status'));
          assert.ok(layout.visible.has('idName'));
          assert.ok(layout.visible.has('repo'));
          assert.ok(layout.visible.has('branch'));
          assert.ok(!layout.visible.has('time'), 'time dropped');
          assert.ok(!layout.visible.has('size'), 'size dropped');
          assert.ok(!layout.visible.has('resources'), 'resources dropped');
        });

        it('only status + idName at extreme narrow', () => {
          const sessions = makeSessions();
          const layout = layoutAt(sessions, 29);

          assert.strictEqual(layout.visible.size, 2);
          assert.ok(layout.visible.has('status'));
          assert.ok(layout.visible.has('idName'));
        });
      });

      describe('single-line snapshots', () => {
        it('gives columns breathing room at wide terminal', () => {
          const sessions = [
            createTestSession({
              name: 'my-session',
              state: 'busy',
              directory: '/home/test/proj',
              resources: { branch: 'main' },
              last_active_at: new Date('2024-06-15T11:00:00Z'),
            }),
          ];

          const line = renderLine(sessions[0], sessions, 150);
          assert.ok(line.includes('test-uui'), 'has ID');
          assert.ok(line.includes('my-session'), 'has name');
          assert.ok(line.includes('busy'), 'has status');
          assert.ok(line.includes('proj'), 'has repo');
          assert.ok(line.includes('main'), 'has branch');
        });

        it('truncates content at minimum width', () => {
          const sessions = [
            createTestSession({
              name: 'a-very-long-session-name-that-exceeds-column-width',
              state: 'busy',
              directory: '/home/test/proj',
              resources: { branch: 'main' },
              last_active_at: new Date('2024-06-15T11:00:00Z'),
            }),
          ];

          const line = renderLine(sessions[0], sessions, ALL_MIN + GUTTER);
          // Name should be truncated (contains ellipsis)
          assert.ok(line.includes('\u2026'), 'long name truncated with ellipsis');
        });

        it('omits dropped columns from output', () => {
          const sessions = [
            createTestSession({
              name: 'hello',
              state: 'idle',
              directory: '/home/test/proj',
              resources: { branch: 'dev', pr: 'https://github.com/o/r/pull/99' },
              tags: ['wip'],
              last_active_at: new Date('2024-06-15T11:30:00Z'),
            }),
          ];

          // At 41: status(7) + idName(20) + repo(6) + branch(6) + gutter(2) = 41
          // time and resources are dropped
          const layout = computeColumnLayout(measureColumns(sessions), 41);
          const line = strip(formatSessionLine(sessions[0], layout));

          assert.ok(!line.includes('#99'), 'PR number absent when resources dropped');
          assert.ok(!line.includes('wip'), 'tag absent when resources dropped');
          assert.ok(!line.includes('ago'), 'time absent when time dropped');
          // branch is visible (short enough to fit in min 6)
          assert.ok(line.includes('dev'), 'branch still visible');
        });
      });

      describe('status column sizing', () => {
        it('sizes status column to longest state', () => {
          const sessions = [
            createTestSession({ name: 'a', state: 'busy', last_active_at: new Date('2024-06-15T11:00:00Z') }),
            createTestSession({ name: 'b', state: 'closed', last_active_at: new Date('2024-06-15T11:00:00Z') }),
          ];

          const layout = layoutAt(sessions, 120);
          // "closed" is 6 chars; +1 for spacing = 7 content width
          // status should be 7 (at min) or up to 7 if content measured as 7
          assert.ok(layout.status <= 9, 'status not excessively wide');
          assert.ok(layout.status >= 7, 'status at least min');

          // Verify: exactly 1 space between "closed" and next column
          const line = renderLine(sessions[1], sessions, 120);
          const closedIdx = line.indexOf('closed');
          assert.ok(closedIdx > -1);
          const afterClosed = line.slice(closedIdx + 'closed'.length);
          // First non-space char should be at position 1 (one space)
          const nextCharIdx = afterClosed.search(/\S/);
          assert.strictEqual(nextCharIdx, 1, 'exactly 1 space after "closed"');
        });

        it('accommodates "archived" in status column', () => {
          const sessions = [
            createTestSession({ name: 'a', state: 'archived', last_active_at: new Date('2024-06-15T11:00:00Z') }),
          ];

          const layout = layoutAt(sessions, 120);
          // "archived" is 8 chars + 1 spacing = 9
          assert.strictEqual(layout.status, 9);
        });
      });

      describe('idName column', () => {
        it('allocates 12 chars for ID', () => {
          const sessions = [
            createTestSession({
              name: 'x',
              state: 'busy',
              last_active_at: new Date('2024-06-15T11:00:00Z'),
            }),
          ];

          const line = renderLine(sessions[0], sessions, 200);
          // Line starts with 2-space indent + 8-char ID + 2-space gap = 12 chars for ID portion
          const idPart = line.slice(0, 12);
          assert.ok(idPart.trim().startsWith('test-uui'), 'ID in first 12 chars');
        });

        it('displays short names fully', () => {
          const sessions = [
            createTestSession({
              name: 'tiny',
              state: 'busy',
              last_active_at: new Date('2024-06-15T11:00:00Z'),
            }),
          ];

          const line = renderLine(sessions[0], sessions, 200);
          assert.ok(line.includes('tiny'), 'short name fully visible');
          assert.ok(!line.includes('\u2026'), 'no truncation');
        });

        it('expands name to fit content', () => {
          const sessions = [
            createTestSession({
              name: 'short',
              state: 'busy',
              directory: '/home/test/p',
              last_active_at: new Date('2024-06-15T11:00:00Z'),
            }),
          ];

          // Wide terminal with small content: idName expands to fit content (at least min)
          const layout = layoutAt(sessions, 200);
          const contentWidths = measureColumns(sessions);
          const content = contentWidths.get('idName') ?? 0;
          const idNameMin = COLUMN_SPECS.find(c => c.key === 'idName')!.min;
          const expected = Math.max(content, idNameMin);
          assert.strictEqual(layout.id + layout.name, expected, 'idName fits content or min');
        });
      });

      describe('branch column with empty fallback', () => {
        it('leaves branch column empty when unset', () => {
          const sessions = [
            createTestSession({
              name: 'home-session',
              state: 'busy',
              directory: '/home/test',
              resources: {},
              last_active_at: new Date('2024-06-15T11:00:00Z'),
            }),
          ];

          const line = renderLine(sessions[0], sessions, 120);

          // The branch column should just be whitespace
          // Repo "test" should appear, and after it: blank branch, then resources/time
          assert.ok(line.includes('test'), 'repo name present');
          // No directory basename "test" appearing twice as both repo and branch
          const firstTest = line.indexOf('test');
          const restAfterFirst = line.slice(firstTest + 'test'.length);
          // The branch area should not contain "test" again
          // (repo appears once; branch is empty)
          assert.ok(!restAfterFirst.trimStart().startsWith('test'), 'branch is not dir basename');
        });
      });

      describe('resource column', () => {
        it('renders PR, JIRA, and tags together', () => {
          const sessions = [
            createTestSession({
              name: 'full',
              state: 'busy',
              directory: '/home/test/repo',
              resources: {
                branch: 'main',
                pr: 'https://github.com/o/r/pull/123',
                jira: 'PROJ-456',
              },
              tags: ['deploy'],
              last_active_at: new Date('2024-06-15T11:00:00Z'),
            }),
          ];

          const line = renderLine(sessions[0], sessions, 200);
          assert.ok(line.includes('#123'), 'PR number');
          assert.ok(line.includes('PROJ-456'), 'JIRA ticket');
          assert.ok(line.includes('deploy'), 'tag');
        });

        it('long resources truncate with ellipsis', () => {
          const sessions = [
            createTestSession({
              name: 'x',
              state: 'busy',
              directory: '/home/test/repo',
              resources: {
                branch: 'main',
                pr: 'https://github.com/o/r/pull/123',
                jira: 'VERYLONGPROJECT-99999',
              },
              tags: ['a-very-long-tag-name'],
              last_active_at: new Date('2024-06-15T11:00:00Z'),
            }),
          ];

          // At tight width, resource column is small → truncation
          const layout = layoutAt(sessions, ALL_MIN + GUTTER);
          const line = strip(formatSessionLine(sessions[0], layout));
          // Resources column is only 4 chars at minimum → will truncate
          assert.ok(
            line.includes('\u2026') || !line.includes('VERYLONGPROJECT'),
            'long resources truncated or absent'
          );
        });
      });

      describe('consistency across rows', () => {
        it('aligns all rows to same width', () => {
          const sessions = [
            createTestSession({
              name: 'alpha-session',
              state: 'busy',
              directory: '/home/test/frontend',
              resources: { branch: 'feat/alpha' },
              last_active_at: new Date('2024-06-15T11:50:00Z'),
            }),
            createTestSession({
              name: 'beta',
              state: 'closed',
              directory: '/home/test/api',
              resources: { branch: 'main' },
              last_active_at: new Date('2024-06-14T12:00:00Z'),
            }),
            createTestSession({
              name: 'gamma-very-long-name-here',
              state: 'waiting',
              directory: '/home/test/infrastructure',
              resources: { branch: 'fix/gamma-branch-name', jira: 'INF-100' },
              last_active_at: new Date('2024-06-13T12:00:00Z'),
            }),
          ];

          for (const width of [80, 100, 120, 60, ALL_MIN + GUTTER]) {
            const layout = layoutAt(sessions, width);
            const lines = sessions.map(s => strip(formatSessionLine(s, layout)));

            // All lines should have the same displayWidth (columns are fixed-width)
            // The last column (time) is variable-width, so trim trailing space and
            // check that everything up to the last column aligns.
            // Instead, verify that the non-time portion has consistent width.
            const widths = lines.map(l => displayWidth(l));

            // Lines may differ slightly due to time column not being fixed-width,
            // but the difference should be small (just the time text length variance)
            const maxWidth = Math.max(...widths);
            const minWidth = Math.min(...widths);
            // Time text varies: "10m ago" vs "1d ago" vs "2d ago" — at most a few chars
            assert.ok(
              maxWidth - minWidth <= 4,
              `width variance too large at terminal ${width}: min=${minWidth} max=${maxWidth}`
            );
          }
        });
      });

      describe('fixedWidth alignment', () => {
        it('pads short text to exact width', () => {
          assert.strictEqual(fixedWidth('hi', 10), 'hi        ');
          assert.strictEqual(displayWidth(fixedWidth('hi', 10)), 10);
        });

        it('truncates long text with ellipsis', () => {
          const result = fixedWidth('a-very-long-string', 10);
          assert.ok(result.endsWith('\u2026 '), 'ends with ellipsis+space');
          assert.strictEqual(displayWidth(result), 10);
        });

        it('truncates at exact width boundary', () => {
          const result = fixedWidth('1234567890', 10);
          // fixedWidth truncates when visualWidth >= width
          assert.ok(result.endsWith('\u2026 '), 'ends with ellipsis+space');
          assert.strictEqual(displayWidth(result), 10);
        });
      });

      describe('depth indentation', () => {
        it('child sessions indent without breaking column alignment', () => {
          const parent = createTestSession({
            name: 'parent-session',
            state: 'busy',
            directory: '/home/test/repo',
            resources: { branch: 'main' },
            last_active_at: new Date('2024-06-15T11:00:00Z'),
          });
          const child = createTestSession({
            name: 'child-session',
            state: 'busy',
            directory: '/home/test/repo',
            resources: { branch: 'main' },
            parent_session_id: parent.id,
            last_active_at: new Date('2024-06-15T11:00:00Z'),
          });

          const sessions = [parent, child];
          const layout = layoutAt(sessions, 120);

          const parentLine = strip(formatSessionLine(parent, layout, 0));
          const childLine = strip(formatSessionLine(child, layout, 1));

          // Child line should have tree prefix
          assert.ok(childLine.includes('\u2514'), 'child has tree prefix');

          // Both lines should have similar total width (child trades name space for indent)
          const diff = Math.abs(displayWidth(parentLine) - displayWidth(childLine));
          assert.ok(diff <= 4, `parent/child width diff ${diff} should be small`);
        });
      });
    });
  });
});
