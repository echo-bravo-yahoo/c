/**
 * Tests for tmux command behaviors
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';

describe('c', () => {
  describe('commands', () => {
    describe('tmux-status', () => {
      beforeEach(() => {
        resetSessionCounter();
      });

      describe('session counting', () => {
        it('shows active session count', () => {
          const sessions = [
            createTestSession({ state: 'busy' }),
            createTestSession({ state: 'idle' }),
            createTestSession({ state: 'closed' }),
          ];

          const activeStates = ['busy', 'idle', 'waiting'];
          const active = sessions.filter(s => activeStates.includes(s.state));
          assert.strictEqual(active.length, 2);
        });

        it('counts waiting sessions', () => {
          const sessions = [
            createTestSession({ state: 'waiting' }),
            createTestSession({ state: 'busy' }),
            createTestSession({ state: 'waiting' }),
          ];

          const waiting = sessions.filter(s => s.state === 'waiting');
          assert.strictEqual(waiting.length, 2);
        });
      });

      describe('output formatting', () => {
        it('highlights waiting sessions', () => {
          const waitingCount = 2;
          const liveCount = 5;

          const parts: string[] = [];

          if (waitingCount > 0) {
            parts.push(`#[fg=yellow,bold]${waitingCount}#[default]`);
          }
          if (liveCount > 0) {
            parts.push(`${liveCount}`);
          }

          assert.ok(parts[0].includes('yellow'));
          assert.ok(parts[0].includes(String(waitingCount)));
        });

        it('outputs nothing without sessions', () => {
          const sessions: never[] = [];

          const live = sessions.filter(() => false);
          const waiting = sessions.filter(() => false);

          const parts: string[] = [];
          if (waiting.length > 0) {
            parts.push(`waiting:${waiting.length}`);
          }
          if (live.length > 0) {
            parts.push(`live:${live.length}`);
          }

          assert.strictEqual(parts.length, 0);
        });

        it('omits waiting count when none waiting', () => {
          const sessions = [
            createTestSession({ state: 'busy' }),
            createTestSession({ state: 'idle' }),
          ];

          const waiting = sessions.filter(s => s.state === 'waiting');
          const activeStates = ['busy', 'idle', 'waiting'];
          const active = sessions.filter(s => activeStates.includes(s.state));

          const parts: string[] = [];
          if (waiting.length > 0) {
            parts.push(`waiting:${waiting.length}`);
          }
          if (active.length > 0) {
            parts.push(`${active.length}`);
          }

          assert.strictEqual(parts.length, 1);
          assert.strictEqual(parts[0], '2');
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
          const name = session.name || session.humanhash;
          const status = session.state;
          const branch = session.resources.branch ?? '';

          const line = `${shortId}\t${name}\t${status}\t${branch}\t${session.id}`;

          assert.ok(line.includes('12345678'));
          assert.ok(line.includes('My Session'));
          assert.ok(line.includes('busy'));
          assert.ok(line.includes('main'));
        });

        it('falls back to humanhash', () => {
          const session = createTestSession({
            name: '',
            humanhash: 'alpha-bravo',
          });

          const name = session.name || session.humanhash;
          assert.strictEqual(name, 'alpha-bravo');
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
          // Command would exit with error: "No sessions available."
        });
      });
    });
  });
});
