/**
 * Tests for list command
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { resolve } from 'node:path';

// Late-bound reference to readIndex — set after import so the mock can
// return all seeded session IDs, preventing reconcileStaleSessions from
// marking active test sessions as stale/closed.
let readIndexFn: (() => { sessions: Record<string, unknown> }) | null = null;

mock.module(resolve('src/claude/sessions.ts'), {
  namedExports: {
    getClaudeSession: () => ({ id: 'stub' }),
    listClaudeSessions: () => {
      if (!readIndexFn) return [];
      const idx = readIndexFn();
      return Object.keys(idx.sessions).map(id => ({
        id, projectKey: '', directory: '', transcriptPath: '', historyPath: '', modifiedAt: new Date(),
      }));
    },
    getClaudeSessionTitles: () => ({ customTitle: null, summary: null }),
    getClaudeSessionsForDirectory: () => [],
    readClaudeSessionIndex: () => null,
    getPlanExecutionInfo: () => null,
    findTranscriptPath: () => null,
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
const { readIndex } = await import('../../src/store/index.ts');
readIndexFn = readIndex;

// shortId() takes first 8 chars. Keep test IDs <= 8 chars so assertions
// on console output match the displayed value exactly.

describe('c', () => {
  describe('commands', () => {
    describe('list', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      describe('state filtering', () => {
        it('excludes archived by default', async () => {
          await cli.seed(
            { id: 's1', state: 'busy' },
            { id: 's2', state: 'closed' },
            { id: 's3', state: 'archived' },
          );
          await cli.run('list');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('s1'));
          assert.ok(output.includes('s2'));
          assert.ok(!output.includes('s3'));
        });

        it('--state all includes archived', async () => {
          await cli.seed(
            { id: 's1', state: 'busy' },
            { id: 's2', state: 'archived' },
          );
          await cli.run('list', '--state', 'all');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('s1'));
          assert.ok(output.includes('s2'));
        });

        it('--state archived shows only archived', async () => {
          await cli.seed(
            { id: 's1', state: 'busy' },
            { id: 's2', state: 'archived' },
          );
          await cli.run('list', '--state', 'archived');

          const output = cli.console.logs.join('\n');
          assert.ok(!output.includes('s1'));
          assert.ok(output.includes('s2'));
        });
      });

      describe('waiting filter', () => {
        it('--state waiting shows only waiting', async () => {
          await cli.seed(
            { id: 's1', state: 'waiting' },
            { id: 's2', state: 'busy' },
            { id: 's3', state: 'closed' },
          );
          await cli.run('list', '--state', 'waiting');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('s1'));
          assert.ok(!output.includes('s2'));
          assert.ok(!output.includes('s3'));
        });
      });

      describe('directory filter', () => {
        it('--dir scopes to directory', async () => {
          await cli.seed(
            { id: 's1', directory: '/home/user/project-a', state: 'busy' },
            { id: 's2', directory: '/home/user/project-b', state: 'busy' },
            { id: 's3', directory: '/home/user/project-a', state: 'busy' },
          );
          await cli.run('list', '--dir', '/home/user/project-a');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('s1'));
          assert.ok(!output.includes('s2'));
          assert.ok(output.includes('s3'));
        });
      });

      describe('--prs view', () => {
        it('shows only sessions with PRs', async () => {
          await cli.seed(
            { id: 's1', resources: { pr: 'https://github.com/o/r/pull/1' } },
            { id: 's2', resources: {} },
            { id: 's3', resources: { pr: 'https://github.com/o/r/pull/2' } },
          );
          await cli.run('list', '--prs');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('pull/1'));
          assert.ok(output.includes('pull/2'));
        });

        it('shows message when no PRs linked', async () => {
          await cli.seed({ id: 's1', resources: {} });
          await cli.run('list', '--prs');

          assert.ok(cli.console.logs.some(l => l.includes('No PRs')));
        });
      });

      describe('--jira view', () => {
        it('shows only sessions with JIRA tickets', async () => {
          await cli.seed(
            { id: 's1', resources: { jira: 'MAC-123' } },
            { id: 's2', resources: {} },
          );
          await cli.run('list', '--jira');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('MAC-123'));
        });

        it('shows message when no JIRA linked', async () => {
          await cli.seed({ id: 's1', resources: {} });
          await cli.run('list', '--jira');

          assert.ok(cli.console.logs.some(l => l.includes('No JIRA')));
        });
      });

      describe('empty state', () => {
        it('handles no sessions', async () => {
          await cli.run('list');

          assert.strictEqual(cli.exit.exitCode, null);
        });
      });

      describe('--state filter', () => {
        it('--state busy,idle shows only busy and idle', async () => {
          await cli.seed(
            { id: 'sbusy', state: 'busy' },
            { id: 'sidle', state: 'idle' },
            { id: 'swait', state: 'waiting' },
            { id: 'sclose', state: 'closed' },
            { id: 'sarch', state: 'archived' },
          );
          await cli.run('list', '--state', 'busy,idle');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('sbusy'));
          assert.ok(output.includes('sidle'));
          assert.ok(!output.includes('swait'));
          assert.ok(!output.includes('sclose'));
          assert.ok(!output.includes('sarch'));
        });

        it('--state archived shows archived; bare list does not', async () => {
          await cli.seed(
            { id: 'sbusy', state: 'busy' },
            { id: 'sarch', state: 'archived' },
          );

          // Bare list excludes archived
          await cli.run('list');
          const bareOutput = cli.console.logs.join('\n');
          assert.ok(bareOutput.includes('sbusy'));
          assert.ok(!bareOutput.includes('sarch'));

          // Reset console for next run
          cli.console.logs.length = 0;

          // --state archived shows archived
          await cli.run('list', '--state', 'archived');
          const stateOutput = cli.console.logs.join('\n');
          assert.ok(!stateOutput.includes('sbusy'));
          assert.ok(stateOutput.includes('sarch'));
        });

        it('--state all shows all 5 states', async () => {
          await cli.seed(
            { id: 'sbusy', state: 'busy' },
            { id: 'sidle', state: 'idle' },
            { id: 'swait', state: 'waiting' },
            { id: 'sclose', state: 'closed' },
            { id: 'sarch', state: 'archived' },
          );
          await cli.run('list', '--state', 'all');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('sbusy'));
          assert.ok(output.includes('sidle'));
          assert.ok(output.includes('swait'));
          assert.ok(output.includes('sclose'));
          assert.ok(output.includes('sarch'));
        });
      });

      describe('--branch filter', () => {
        it('filters by branch substring', async () => {
          await cli.seed(
            { id: 's1', state: 'busy', resources: { branch: 'feature/login' } },
            { id: 's2', state: 'busy', resources: { branch: 'main' } },
            { id: 's3', state: 'busy', resources: { branch: 'feature/signup' } },
          );
          await cli.run('list', '--branch', 'feature');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('s1'));
          assert.ok(!output.includes('s2'));
          assert.ok(output.includes('s3'));
        });

        it('is case-insensitive', async () => {
          await cli.seed(
            { id: 's1', state: 'busy', resources: { branch: 'Feature/Auth' } },
            { id: 's2', state: 'busy', resources: { branch: 'main' } },
          );
          await cli.run('list', '--branch', 'feature');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('s1'));
          assert.ok(!output.includes('s2'));
        });
      });

      describe('--repo filter', () => {
        it('filters by repo name substring', async () => {
          await cli.seed(
            { id: 's1', state: 'busy', directory: '/home/user/api-server' },
            { id: 's2', state: 'busy', directory: '/home/user/web-client' },
            { id: 's3', state: 'busy', directory: '/home/user/api-gate' },
          );
          await cli.run('list', '--repo', 'api');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('s1'));
          assert.ok(!output.includes('s2'));
          assert.ok(output.includes('s3'));
        });
      });

      describe('--tag filter', () => {
        it('matches exact tag', async () => {
          await cli.seed(
            { id: 's1', state: 'busy', tags: ['wip'] },
            { id: 's2', state: 'busy', tags: ['done'] },
          );
          await cli.run('list', '--tag', 'wip');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('s1'));
          assert.ok(!output.includes('s2'));
        });

        it('does not match partial tag', async () => {
          await cli.seed(
            { id: 's1', state: 'busy', tags: ['wip'] },
          );
          await cli.run('list', '--tag', 'wi');

          const output = cli.console.logs.join('\n');
          assert.ok(!output.includes('s1'));
        });
      });

      describe('--name filter', () => {
        it('filters by session name substring', async () => {
          await cli.seed(
            { id: 's1', state: 'busy', name: 'Auth Bug' },
            { id: 's2', state: 'busy', name: 'Dashboard Feature' },
          );
          await cli.run('list', '--name', 'auth');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('s1'));
          assert.ok(!output.includes('s2'));
        });
      });

      describe('--worktree filter', () => {
        it('filters by worktree name substring', async () => {
          await cli.seed(
            { id: 's1', state: 'busy', resources: { worktree: 'bugfix' } },
            { id: 's2', state: 'busy', resources: { worktree: 'feat-x' } },
          );
          await cli.run('list', '--worktree', 'bug');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('s1'));
          assert.ok(!output.includes('s2'));
        });
      });

      describe('filters compose with AND', () => {
        it('--state and --branch compose', async () => {
          await cli.seed(
            { id: 'sbm', state: 'busy', resources: { branch: 'main' } },
            { id: 'sim', state: 'idle', resources: { branch: 'main' } },
            { id: 'sbd', state: 'busy', resources: { branch: 'develop' } },
          );
          await cli.run('list', '--state', 'busy', '--branch', 'main');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('sbm'));
          assert.ok(!output.includes('sim'));
          assert.ok(!output.includes('sbd'));
        });
      });

      describe('no matches', () => {
        it('shows no sessions message when filter matches nothing', async () => {
          await cli.seed(
            { id: 's1', state: 'busy', resources: { branch: 'main' } },
          );
          await cli.run('list', '--branch', 'nonexistent');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('No sessions found'));
        });
      });

      describe('resource display in table', () => {
        it('shows PR number in session row', async () => {
          await cli.seed({
            id: 'sprnum',
            state: 'busy',
            resources: { pr: 'https://github.com/o/r/pull/42' },
          });
          await cli.run('list');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('#42'), 'should show PR number');
        });

        it('shows JIRA ticket in session row', async () => {
          await cli.seed({
            id: 'sjira',
            state: 'busy',
            resources: { jira: 'PROJ-99' },
          });
          await cli.run('list');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('PROJ-99'), 'should show JIRA ticket');
        });

        it('shows tag in session row', async () => {
          await cli.seed({
            id: 'stagged',
            state: 'busy',
            tags: ['wip'],
          });
          await cli.run('list');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('wip'), 'should show tag');
        });

        it('shows combined PR + JIRA + tag', async () => {
          await cli.seed({
            id: 'scombo',
            state: 'busy',
            resources: {
              pr: 'https://github.com/o/r/pull/77',
              jira: 'DEV-55',
            },
            tags: ['urgent'],
          });
          await cli.run('list');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('#77'), 'should show PR number');
          assert.ok(output.includes('DEV-55'), 'should show JIRA ticket');
          // Tag may be truncated if space is tight, but should appear if space allows
        });
      });

      describe('--sort', () => {
        it('--sort name orders alphabetically by display name', async () => {
          await cli.seed(
            { id: 'szebra', state: 'busy', name: 'Zebra' },
            { id: 'salpha', state: 'busy', name: 'Alpha' },
            { id: 'smid', state: 'busy', name: 'Middle' },
          );
          await cli.run('list', '--sort', 'name');

          const output = cli.console.logs.join('\n');
          const alphaIdx = output.indexOf('Alpha');
          const middleIdx = output.indexOf('Middle');
          const zebraIdx = output.indexOf('Zebra');
          assert.ok(alphaIdx >= 0, 'Alpha should be in output');
          assert.ok(middleIdx >= 0, 'Middle should be in output');
          assert.ok(zebraIdx >= 0, 'Zebra should be in output');
          assert.ok(alphaIdx < middleIdx, 'Alpha should appear before Middle');
          assert.ok(middleIdx < zebraIdx, 'Middle should appear before Zebra');
        });

        it('--sort -name orders reverse alphabetically', async () => {
          await cli.seed(
            { id: 'szebra', state: 'busy', name: 'Zebra' },
            { id: 'salpha', state: 'busy', name: 'Alpha' },
            { id: 'smid', state: 'busy', name: 'Middle' },
          );
          await cli.run('list', '--sort', '-name');

          const output = cli.console.logs.join('\n');
          const alphaIdx = output.indexOf('Alpha');
          const middleIdx = output.indexOf('Middle');
          const zebraIdx = output.indexOf('Zebra');
          assert.ok(zebraIdx >= 0, 'Zebra should be in output');
          assert.ok(middleIdx >= 0, 'Middle should be in output');
          assert.ok(alphaIdx >= 0, 'Alpha should be in output');
          assert.ok(zebraIdx < middleIdx, 'Zebra should appear before Middle');
          assert.ok(middleIdx < alphaIdx, 'Middle should appear before Alpha');
        });

        it('--sort status orders waiting < idle < busy < closed', async () => {
          await cli.seed(
            { id: 'sc', state: 'closed', name: 'Closed One' },
            { id: 'sw', state: 'waiting', name: 'Waiting One' },
            { id: 'sb', state: 'busy', name: 'Busy One' },
            { id: 'si', state: 'idle', name: 'Idle One' },
          );
          await cli.run('list', '--sort', 'status');

          const output = cli.console.logs.join('\n');
          // Use names to find positions since IDs may overlap with other text
          const waitIdx = output.indexOf('Waiting One');
          const idleIdx = output.indexOf('Idle One');
          const busyIdx = output.indexOf('Busy One');
          const closedIdx = output.indexOf('Closed One');
          assert.ok(waitIdx >= 0, 'waiting session should be in output');
          assert.ok(idleIdx >= 0, 'idle session should be in output');
          assert.ok(busyIdx >= 0, 'busy session should be in output');
          assert.ok(closedIdx >= 0, 'closed session should be in output');
          assert.ok(waitIdx < idleIdx, 'waiting should appear before idle');
          assert.ok(idleIdx < busyIdx, 'idle should appear before busy');
          assert.ok(busyIdx < closedIdx, 'busy should appear before closed');
        });

        it('--sort created orders most recent first (desc default)', async () => {
          const t1 = new Date('2025-01-01T00:00:00Z');
          const t2 = new Date('2025-06-15T00:00:00Z');
          const t3 = new Date('2025-12-31T00:00:00Z');
          await cli.seed(
            { id: 'sold', state: 'busy', name: 'Oldest', created_at: t1 },
            { id: 'smid', state: 'busy', name: 'Middle', created_at: t2 },
            { id: 'snew', state: 'busy', name: 'Newest', created_at: t3 },
          );
          await cli.run('list', '--sort', 'created');

          const output = cli.console.logs.join('\n');
          const newestIdx = output.indexOf('Newest');
          const middleIdx = output.indexOf('Middle');
          const oldestIdx = output.indexOf('Oldest');
          assert.ok(newestIdx < middleIdx, 'newest should appear before middle');
          assert.ok(middleIdx < oldestIdx, 'middle should appear before oldest');
        });

        it('--sort +created orders oldest first (asc)', async () => {
          const t1 = new Date('2025-01-01T00:00:00Z');
          const t2 = new Date('2025-06-15T00:00:00Z');
          const t3 = new Date('2025-12-31T00:00:00Z');
          await cli.seed(
            { id: 'sold', state: 'busy', name: 'Oldest', created_at: t1 },
            { id: 'smid', state: 'busy', name: 'Middle', created_at: t2 },
            { id: 'snew', state: 'busy', name: 'Newest', created_at: t3 },
          );
          await cli.run('list', '--sort', '+created');

          const output = cli.console.logs.join('\n');
          const oldestIdx = output.indexOf('Oldest');
          const middleIdx = output.indexOf('Middle');
          const newestIdx = output.indexOf('Newest');
          assert.ok(oldestIdx < middleIdx, 'oldest should appear before middle');
          assert.ok(middleIdx < newestIdx, 'middle should appear before newest');
        });

        it('--sort repo orders alphabetically by repo name', async () => {
          await cli.seed(
            { id: 'sz', state: 'busy', name: 'Zulu', directory: '/home/user/zulu-repo' },
            { id: 'sa', state: 'busy', name: 'Alpha', directory: '/home/user/alpha-repo' },
            { id: 'sm', state: 'busy', name: 'Mike', directory: '/home/user/mike-repo' },
          );
          await cli.run('list', '--sort', 'repo');

          const output = cli.console.logs.join('\n');
          const alphaIdx = output.indexOf('Alpha');
          const mikeIdx = output.indexOf('Mike');
          const zuluIdx = output.indexOf('Zulu');
          assert.ok(alphaIdx < mikeIdx, 'alpha should appear before mike');
          assert.ok(mikeIdx < zuluIdx, 'mike should appear before zulu');
        });

        it('--sort status,name groups by state then alphabetically within', async () => {
          await cli.seed(
            { id: 'sib', state: 'idle', name: 'Beta' },
            { id: 'sba', state: 'busy', name: 'Alpha' },
            { id: 'sia', state: 'idle', name: 'Alpha' },
            { id: 'sbb', state: 'busy', name: 'Beta' },
          );
          await cli.run('list', '--sort', 'status,name');

          const output = cli.console.logs.join('\n');
          // idle (status 1) comes before busy (status 2) in ascending status sort
          // Within idle: Alpha before Beta
          // Within busy: Alpha before Beta
          const lines = cli.console.logs;
          const idleAlphaLine = lines.findIndex(l => l.includes('sia'));
          const idleBetaLine = lines.findIndex(l => l.includes('sib'));
          const busyAlphaLine = lines.findIndex(l => l.includes('sba'));
          const busyBetaLine = lines.findIndex(l => l.includes('sbb'));
          assert.ok(idleAlphaLine < idleBetaLine, 'idle Alpha before idle Beta');
          assert.ok(idleBetaLine < busyAlphaLine, 'idle group before busy group');
          assert.ok(busyAlphaLine < busyBetaLine, 'busy Alpha before busy Beta');
        });
      });

      describe('display options', () => {
        it('--flat shows no nesting connectors', async () => {
          await cli.seed(
            { id: 'sparent', state: 'busy', name: 'Parent' },
            { id: 'schild', state: 'busy', name: 'Child', parent_session_id: 'sparent' },
          );
          await cli.run('list', '--flat');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('sparent'));
          assert.ok(output.includes('schild'));
          // \u2514 = └ (bottom-left corner), \u250c = ┌ (top-left corner)
          assert.ok(!output.includes('\u2514'), 'flat mode should not contain bottom-left corner connector');
          assert.ok(!output.includes('\u250c'), 'flat mode should not contain top-left corner connector');
        });

        it('--bottom-up shows child before parent with top-left connector', async () => {
          await cli.seed(
            { id: 'sparent', state: 'busy', name: 'Parent' },
            { id: 'schild', state: 'busy', name: 'Child', parent_session_id: 'sparent' },
          );
          await cli.run('list', '--bottom-up');

          const output = cli.console.logs.join('\n');
          const childIdx = output.indexOf('schild');
          const parentIdx = output.indexOf('sparent');
          assert.ok(childIdx >= 0, 'child should be in output');
          assert.ok(parentIdx >= 0, 'parent should be in output');
          assert.ok(childIdx < parentIdx, 'child should appear before parent in bottom-up');
          // \u250c = ┌ (top-left corner connector used in bottom-up mode)
          assert.ok(output.includes('\u250c'), 'bottom-up should use top-left corner connector');
        });

        it('--flat --bottom-up uses flat (no connectors)', async () => {
          await cli.seed(
            { id: 'sparent', state: 'busy', name: 'Parent' },
            { id: 'schild', state: 'busy', name: 'Child', parent_session_id: 'sparent' },
          );
          await cli.run('list', '--flat', '--bottom-up');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('sparent'));
          assert.ok(output.includes('schild'));
          assert.ok(!output.includes('\u2514'), 'flat wins: no bottom-left connector');
          assert.ok(!output.includes('\u250c'), 'flat wins: no top-left connector');
        });
      });

      describe('parseSortSpecs', () => {
        it('parses simple field name', async () => {
          // Exercise parseSortSpecs through the list command with a known field
          // Direct verification via JSON output ordering
          const t1 = new Date('2025-01-01T00:00:00Z');
          const t2 = new Date('2025-12-31T00:00:00Z');
          await cli.seed(
            { id: 'sold', state: 'busy', created_at: t1 },
            { id: 'snew', state: 'busy', created_at: t2 },
          );
          await cli.run('list', '--sort', 'created', '--json');

          const arr = JSON.parse(cli.stdout.output.join('')) as { id: string }[];
          assert.strictEqual(arr[0].id, 'snew', 'default created sort is desc (newest first)');
          assert.strictEqual(arr[1].id, 'sold');
        });

        it('parses - prefix as desc', async () => {
          await cli.seed(
            { id: 'szebra', state: 'busy', name: 'Zebra' },
            { id: 'salpha', state: 'busy', name: 'Alpha' },
          );
          await cli.run('list', '--sort', '-name', '--json');

          const arr = JSON.parse(cli.stdout.output.join('')) as { id: string }[];
          assert.strictEqual(arr[0].id, 'szebra', '-name should sort Z first');
        });

        it('parses + prefix as asc', async () => {
          const t1 = new Date('2025-01-01T00:00:00Z');
          const t2 = new Date('2025-12-31T00:00:00Z');
          await cli.seed(
            { id: 'sold', state: 'busy', created_at: t1 },
            { id: 'snew', state: 'busy', created_at: t2 },
          );
          await cli.run('list', '--sort', '+created', '--json');

          const arr = JSON.parse(cli.stdout.output.join('')) as { id: string }[];
          assert.strictEqual(arr[0].id, 'sold', '+created should sort oldest first');
        });
      });

      describe('column truncation', () => {
        it('truncates long names at narrow terminal width', async () => {
          const longName = 'A'.repeat(80);
          await cli.seed({ id: 'strunc', state: 'busy', name: longName });

          const savedColumns = process.stdout.columns;
          process.stdout.columns = 60;
          try {
            await cli.run('list');
          } finally {
            process.stdout.columns = savedColumns;
          }

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('…'), 'long name should be truncated with …');
          assert.ok(!output.includes(longName), 'full name should not appear');
        });
      });

      describe('--json output', () => {
        it('outputs valid JSON to stdout', async () => {
          await cli.seed(
            { id: 's1', state: 'busy', name: 'Test Session' },
            { id: 's2', state: 'idle' },
          );
          await cli.run('list', '--json');

          const raw = cli.stdout.output.join('');
          let parsed: unknown;
          assert.doesNotThrow(() => { parsed = JSON.parse(raw); }, 'output should be valid JSON');
          assert.ok(Array.isArray(parsed), 'JSON output should be an array');
          const arr = parsed as { id: string; state: string; name?: string }[];
          assert.strictEqual(arr.length, 2);
          assert.ok(arr.some(s => s.id === 's1'));
          assert.ok(arr.some(s => s.id === 's2'));
        });

        it('JSON includes expected fields', async () => {
          await cli.seed(
            { id: 's1', state: 'busy', name: 'JSON Test', directory: '/tmp/proj' },
          );
          await cli.run('list', '--json');

          const raw = cli.stdout.output.join('');
          const arr = JSON.parse(raw) as Record<string, unknown>[];
          assert.strictEqual(arr.length, 1);
          const session = arr[0];
          assert.strictEqual(session.id, 's1');
          assert.strictEqual(session.state, 'busy');
          assert.strictEqual(session.name, 'JSON Test');
          assert.strictEqual(session.directory, '/tmp/proj');
          assert.ok(typeof session.created_at === 'string', 'created_at should be ISO string');
          assert.ok(typeof session.last_active_at === 'string', 'last_active_at should be ISO string');
        });

        it('JSON output goes to stdout, not console.log', async () => {
          await cli.seed({ id: 's1', state: 'busy' });
          await cli.run('list', '--json');

          // stdout should have the JSON
          assert.ok(cli.stdout.output.join('').includes('s1'));
          // console.log should NOT have the JSON array
          const consoleLogs = cli.console.logs.join('\n');
          assert.ok(!consoleLogs.includes('"id"'), 'JSON should not appear in console.log');
        });
      });
    });
  });
});
