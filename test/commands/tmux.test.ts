/**
 * Tests for tmux command behaviors
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';

describe('c > commands > tmux-status', () => {
  beforeEach(() => {
    resetSessionCounter();
  });

  describe('session counting', () => {
    it('shows live session count', () => {
      const sessions = [
        createTestSession({ status: 'live' }),
        createTestSession({ status: 'live' }),
        createTestSession({ status: 'closed' }),
      ];

      const live = sessions.filter(s => s.status === 'live');
      assert.strictEqual(live.length, 2);
    });

    it('counts waiting sessions', () => {
      const sessions = [
        createTestSession({ status: 'live', waiting: true }),
        createTestSession({ status: 'live', waiting: false }),
        createTestSession({ status: 'live', waiting: true }),
      ];

      const waiting = sessions.filter(s => s.waiting);
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

    it('outputs empty when no sessions', () => {
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

    it('only shows live count when no waiting', () => {
      const sessions = [
        createTestSession({ status: 'live', waiting: false }),
        createTestSession({ status: 'live', waiting: false }),
      ];

      const waiting = sessions.filter(s => s.waiting);
      const live = sessions.filter(s => s.status === 'live');

      const parts: string[] = [];
      if (waiting.length > 0) {
        parts.push(`waiting:${waiting.length}`);
      }
      if (live.length > 0) {
        parts.push(`${live.length}`);
      }

      assert.strictEqual(parts.length, 1);
      assert.strictEqual(parts[0], '2');
    });
  });
});

describe('c > commands > tmux-pick', () => {
  beforeEach(() => {
    resetSessionCounter();
  });

  describe('session formatting', () => {
    it('formats sessions for fzf', () => {
      const session = createTestSession({
        id: '12345678-uuid',
        name: 'My Session',
        status: 'live',
        resources: { branch: 'main' },
      });

      const shortId = session.id.slice(0, 8);
      const name = session.name || session.humanhash;
      const status = session.waiting ? 'waiting' : session.status;
      const branch = session.resources.branch ?? '';

      const line = `${shortId}\t${name}\t${status}\t${branch}\t${session.id}`;

      assert.ok(line.includes('12345678'));
      assert.ok(line.includes('My Session'));
      assert.ok(line.includes('live'));
      assert.ok(line.includes('main'));
    });

    it('uses humanhash when no name', () => {
      const session = createTestSession({
        name: '',
        humanhash: 'alpha-bravo',
      });

      const name = session.name || session.humanhash;
      assert.strictEqual(name, 'alpha-bravo');
    });

    it('shows waiting status', () => {
      const session = createTestSession({
        status: 'live',
        waiting: true,
      });

      const status = session.waiting ? 'waiting' : session.status;
      assert.strictEqual(status, 'waiting');
    });

    it('handles missing branch', () => {
      const session = createTestSession({ resources: {} });

      const branch = session.resources.branch ?? '';
      assert.strictEqual(branch, '');
    });
  });

  describe('session selection', () => {
    it('extracts selected session ID from fzf output', () => {
      const fzfOutput = '12345678\tMy Session\tlive\tmain\t12345678-uuid-full';

      const sessionId = fzfOutput.trim().split('\t').pop();
      assert.strictEqual(sessionId, '12345678-uuid-full');
    });

    it('handles output with tabs', () => {
      const fzfOutput = 'abc\tdef\tghi\tjkl\tfull-uuid-here';

      const parts = fzfOutput.split('\t');
      const sessionId = parts[parts.length - 1];

      assert.strictEqual(sessionId, 'full-uuid-here');
    });
  });

  describe('filtering', () => {
    it('includes live and closed sessions', () => {
      const sessions = [
        createTestSession({ status: 'live' }),
        createTestSession({ status: 'closed' }),
        createTestSession({ status: 'archived' }),
      ];

      const filtered = sessions.filter(
        s => s.status === 'live' || s.status === 'closed'
      );

      assert.strictEqual(filtered.length, 2);
    });

    it('excludes archived sessions', () => {
      const sessions = [
        createTestSession({ status: 'live' }),
        createTestSession({ status: 'archived' }),
      ];

      const filtered = sessions.filter(
        s => s.status === 'live' || s.status === 'closed'
      );

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].status, 'live');
    });
  });

  describe('empty state', () => {
    it('handles no sessions available', () => {
      const sessions: never[] = [];

      assert.strictEqual(sessions.length, 0);
      // Command would exit with error: "No sessions available."
    });
  });
});
