/**
 * Tests for tmux command behaviors
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { resolve } from 'node:path';

// reconcileLiveState() (called by tmux-status) reads real live session files;
// mirror the index so seeded sessions keep their state instead of being closed.
let readIndexFn: (() => { sessions: Record<string, unknown> }) | null = null;
const { makeProcessMock } = await import('../helpers/live-mock.ts');
mock.module(resolve('src/util/process.ts'), {
  namedExports: makeProcessMock(
    () => readIndexFn!() as { sessions: Record<string, { state: string }> }
  ),
});

type CLIHarness = import('../helpers/cli.ts').CLIHarness;
const { setupCLI } = await import('../helpers/cli.ts');
const { createTestSession, resetSessionCounter } = await import('../fixtures/sessions.ts');
const { readIndex, getSessionByPane } = await import('../../src/store/index.ts');
readIndexFn = readIndex;

describe('c', () => {
  describe('commands', () => {
    describe('tmux-status', () => {
      let cli: CLIHarness;
      let savedTmux: string | undefined;
      beforeEach(() => {
        cli = setupCLI();
        // Skip the tmux pane/window stamping side-effects in tests.
        savedTmux = process.env.TMUX;
        delete process.env.TMUX;
      });
      afterEach(() => {
        cli.cleanup();
        if (savedTmux !== undefined) process.env.TMUX = savedTmux;
      });

      describe('roll-up output', () => {
        it('prints wait:N (red) for waiting sessions', async () => {
          await cli.seed(
            { id: 's1', state: 'waiting' },
            { id: 's2', state: 'busy' },
            { id: 's3', state: 'waiting' },
          );
          await cli.run('tmux-status');

          const output = cli.stdout.output.join('');
          assert.ok(output.includes('wait:2'));
          assert.ok(output.includes('red'));
        });

        it('prints idle:N (yellow) for idle sessions', async () => {
          await cli.seed(
            { id: 's1', state: 'idle' },
            { id: 's2', state: 'busy' },
            { id: 's3', state: 'idle' },
          );
          await cli.run('tmux-status');

          const output = cli.stdout.output.join('');
          assert.ok(output.includes('idle:2'));
          assert.ok(output.includes('yellow'));
        });

        it('shows both segments when waiting and idle coexist', async () => {
          await cli.seed(
            { id: 's1', state: 'waiting' },
            { id: 's2', state: 'idle' },
          );
          await cli.run('tmux-status');

          const output = cli.stdout.output.join('');
          assert.ok(output.includes('wait:1'));
          assert.ok(output.includes('idle:1'));
        });
      });

      describe('quiet when nothing needs you', () => {
        it('outputs nothing without sessions', async () => {
          await cli.run('tmux-status');

          assert.strictEqual(cli.stdout.output.length, 0);
        });

        it('outputs nothing when only busy', async () => {
          await cli.seed(
            { id: 's1', state: 'busy' },
            { id: 's2', state: 'busy' },
          );
          await cli.run('tmux-status');

          assert.strictEqual(cli.stdout.output.join(''), '');
        });
      });
    });

    describe('tmux-pick', () => {
      beforeEach(() => {
        resetSessionCounter();
      });

      describe('session formatting', () => {
        it('formats sessions for fzf', () => {
          const session = createTestSession({
            id: '12345678-uuid',
            name: 'My Session',
            state: 'busy',
            resources: { branch: 'main' },
          });

          const shortId = session.id.slice(0, 8);
          const name = session.name || '';
          const status = session.state;
          const branch = session.resources.branch ?? '';

          const line = `${shortId}\t${name}\t${status}\t${branch}\t${session.id}`;

          assert.ok(line.includes('12345678'));
          assert.ok(line.includes('My Session'));
          assert.ok(line.includes('busy'));
          assert.ok(line.includes('main'));
        });

        it('returns empty string when no name', () => {
          const session = createTestSession({
            name: '',
          });

          const name = session.name || '';
          assert.strictEqual(name, '');
        });

        it('shows waiting state', () => {
          const session = createTestSession({
            state: 'waiting',
          });

          const status = session.state;
          assert.strictEqual(status, 'waiting');
        });

        it('omits branch when unset', () => {
          const session = createTestSession({ resources: {} });

          const branch = session.resources.branch ?? '';
          assert.strictEqual(branch, '');
        });
      });

      describe('session selection', () => {
        it('extracts session ID from fzf selection', () => {
          const fzfOutput = '12345678\tMy Session\tlive\tmain\t12345678-uuid-full';

          const sessionId = fzfOutput.trim().split('\t').pop();
          assert.strictEqual(sessionId, '12345678-uuid-full');
        });

        it('parses tab-delimited fzf output', () => {
          const fzfOutput = 'abc\tdef\tghi\tjkl\tfull-uuid-here';

          const parts = fzfOutput.split('\t');
          const sessionId = parts[parts.length - 1];

          assert.strictEqual(sessionId, 'full-uuid-here');
        });
      });

      describe('filtering', () => {
        it('includes active and closed sessions', () => {
          const sessions = [
            createTestSession({ state: 'busy' }),
            createTestSession({ state: 'closed' }),
            createTestSession({ state: 'archived' }),
          ];

          const pickStates = ['busy', 'idle', 'waiting', 'closed'];
          const filtered = sessions.filter(s => pickStates.includes(s.state));

          assert.strictEqual(filtered.length, 2);
        });

        it('excludes archived sessions', () => {
          const sessions = [
            createTestSession({ state: 'busy' }),
            createTestSession({ state: 'archived' }),
          ];

          const pickStates = ['busy', 'idle', 'waiting', 'closed'];
          const filtered = sessions.filter(s => pickStates.includes(s.state));

          assert.strictEqual(filtered.length, 1);
          assert.strictEqual(filtered[0].state, 'busy');
        });
      });

      describe('empty state', () => {
        it('handles empty session list', () => {
          const sessions: never[] = [];

          assert.strictEqual(sessions.length, 0);
        });
      });
    });

    describe('tmux-shell (getSessionByPane)', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      it('resolves a reused pane id to the active session, skipping the closed one', async () => {
        await cli.seed(
          { id: 's1', state: 'closed', resources: { tmux_pane: '%5' } },
          { id: 's2', state: 'idle', resources: { tmux_pane: '%5' } },
          { id: 's3', state: 'idle', resources: { tmux_pane: '%7' } },
        );

        assert.strictEqual(getSessionByPane('%5')?.id, 's2');
      });

      it('returns the most-recently-active session when two are live on one pane', async () => {
        const older = new Date('2024-01-01T00:00:00Z');
        const newer = new Date('2024-06-01T00:00:00Z');
        await cli.seed(
          { id: 'old', state: 'idle', last_active_at: older, resources: { tmux_pane: '%5' } },
          { id: 'new', state: 'busy', last_active_at: newer, resources: { tmux_pane: '%5' } },
        );

        assert.strictEqual(getSessionByPane('%5')?.id, 'new');
      });

      it('returns undefined for a pane no active session occupies', async () => {
        await cli.seed({ id: 's1', state: 'idle', resources: { tmux_pane: '%5' } });

        assert.strictEqual(getSessionByPane('%99'), undefined);
      });
    });
  });
});
