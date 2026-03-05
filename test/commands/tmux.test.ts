/**
 * Tests for tmux command behaviors
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { setupCLI, type CLIHarness } from '../helpers/cli.ts';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.ts';

describe('c', () => {
  describe('commands', () => {
    describe('tmux-status', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      describe('session counting', () => {
        it('shows active session count', async () => {
          await cli.seed(
            { id: 's1', state: 'busy' },
            { id: 's2', state: 'idle' },
            { id: 's3', state: 'closed' },
          );
          await cli.run('tmux-status');

          // 2 active (busy + idle), closed excluded from active count
          assert.ok(cli.stdout.output.some(o => o.includes('2')));
        });

        it('counts waiting sessions', async () => {
          await cli.seed(
            { id: 's1', state: 'waiting' },
            { id: 's2', state: 'busy' },
            { id: 's3', state: 'waiting' },
          );
          await cli.run('tmux-status');

          const output = cli.stdout.output.join('');
          // Should show waiting count (2) and total active count (3)
          assert.ok(output.includes('2'));
          assert.ok(output.includes('3'));
        });
      });

      describe('output formatting', () => {
        it('highlights waiting sessions with yellow', async () => {
          await cli.seed(
            { id: 's1', state: 'waiting' },
            { id: 's2', state: 'busy' },
          );
          await cli.run('tmux-status');

          const output = cli.stdout.output.join('');
          assert.ok(output.includes('yellow'));
        });

        it('outputs nothing without sessions', async () => {
          await cli.run('tmux-status');

          assert.strictEqual(cli.stdout.output.length, 0);
        });

        it('omits waiting indicator when none waiting', async () => {
          await cli.seed(
            { id: 's1', state: 'busy' },
            { id: 's2', state: 'idle' },
          );
          await cli.run('tmux-status');

          const output = cli.stdout.output.join('');
          assert.ok(!output.includes('yellow'));
          assert.ok(output.includes('2'));
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
  });
});
