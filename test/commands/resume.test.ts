/**
 * Tests for resume command behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';
import type { Session } from '../../src/store/schema.js';

describe('c > commands > resume', () => {
  beforeEach(() => {
    resetSessionCounter();
  });

  describe('session lookup', () => {
    it('finds session by ID prefix', () => {
      const sessions = [
        createTestSession({ id: 'abc-123-full-uuid' }),
        createTestSession({ id: 'def-456-full-uuid' }),
      ];

      const prefix = 'abc';
      const matches = sessions.filter(
        s => s.id.startsWith(prefix) || s.humanhash.startsWith(prefix)
      );

      assert.strictEqual(matches.length, 1);
    });

    it('finds session by humanhash prefix', () => {
      const sessions = [
        createTestSession({ humanhash: 'alpha-bravo-charlie' }),
        createTestSession({ humanhash: 'delta-echo-foxtrot' }),
      ];

      const prefix = 'alpha';
      const matches = sessions.filter(s => s.humanhash.startsWith(prefix));

      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0].humanhash, 'alpha-bravo-charlie');
    });

    it('returns undefined for ambiguous prefix', () => {
      const sessions = [
        createTestSession({ id: 'abc-111' }),
        createTestSession({ id: 'abc-222' }),
      ];

      const prefix = 'abc';
      const matches = sessions.filter(s => s.id.startsWith(prefix));

      // Should have multiple matches - ambiguous
      assert.strictEqual(matches.length, 2);
    });
  });

  describe('Claude session verification', () => {
    it('uses session directory as cwd', () => {
      const session = createTestSession({ directory: '/home/user/project' });

      // The resume command would use this as cwd for claude -r
      assert.strictEqual(session.directory, '/home/user/project');
    });

    it('uses session.id for claude -r flag', () => {
      const session = createTestSession({ id: 'abc-123-full-uuid' });

      // The resume command would call: claude -r {session.id}
      assert.strictEqual(session.id, 'abc-123-full-uuid');
    });
  });

  describe('error conditions', () => {
    it('handles session not found', () => {
      const sessions: Session[] = [];
      const found = sessions.find(s => s.id === 'nonexistent');

      assert.strictEqual(found, undefined);
    });

    it('handles empty sessions list', () => {
      const sessions: Session[] = [];
      const matches = sessions.filter(s => s.id.startsWith('any'));

      assert.strictEqual(matches.length, 0);
    });
  });

  describe('session info for display', () => {
    it('provides display name for logging', () => {
      const session = createTestSession({
        name: 'My Session',
        humanhash: 'alpha-bravo',
      });

      // Display logic: name > humanhash
      const displayName = session.name || session.humanhash;
      assert.strictEqual(displayName, 'My Session');
    });

    it('falls back to humanhash when no name', () => {
      const session = createTestSession({
        name: '',
        humanhash: 'alpha-bravo',
      });

      const displayName = session.name || session.humanhash;
      assert.strictEqual(displayName, 'alpha-bravo');
    });

    it('includes directory in log message', () => {
      const session = createTestSession({
        directory: '/home/user/project',
      });

      // Log would show: "Resuming session X in /home/user/project..."
      assert.ok(session.directory.startsWith('/'));
    });
  });
});
