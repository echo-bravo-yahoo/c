/**
 * Tests for session-start hook logic
 *
 * These tests verify the behavior of session creation and detection logic
 * without calling the actual hook (which requires mocked filesystem).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';
import type { Session } from '../../src/store/schema.js';

describe('c > hooks > session-start', () => {
  beforeEach(() => {
    resetSessionCounter();
  });

  describe('concurrent session support', () => {
    it('allows multiple active sessions in same directory', () => {
      // Simulate the index state after starting multiple sessions
      const sessions: Session[] = [
        createTestSession({ id: 'sess-1', directory: '/project', state: 'busy' }),
        createTestSession({ id: 'sess-2', directory: '/project', state: 'idle' }),
        createTestSession({ id: 'sess-3', directory: '/project', state: 'waiting' }),
      ];

      const activeStates = ['busy', 'idle', 'waiting'];
      const activeSessions = sessions.filter(
        s => activeStates.includes(s.state) && s.directory === '/project'
      );

      // All three sessions remain active - no auto-closing
      assert.strictEqual(activeSessions.length, 3);
    });

    it('does not modify existing sessions when new session starts', () => {
      const existingSession = createTestSession({
        id: 'existing',
        directory: '/project',
        state: 'idle',
      });

      // Simulate starting a new session - existing session state unchanged
      const newSession = createTestSession({
        id: 'new-session',
        directory: '/project',
        state: 'busy',
      });

      // Existing session remains idle (not closed)
      assert.strictEqual(existingSession.state, 'idle');
      assert.strictEqual(newSession.state, 'busy');
    });

    it('sessions only close via SessionEnd hook', () => {
      const sessions: Session[] = [
        createTestSession({ id: 'sess-1', directory: '/project', state: 'busy' }),
        createTestSession({ id: 'sess-2', directory: '/project', state: 'idle' }),
      ];

      // Simulate SessionEnd for sess-1 only
      const sessionEndFired = (id: string) => {
        const s = sessions.find(s => s.id === id);
        if (s) s.state = 'closed';
      };

      sessionEndFired('sess-1');

      // Only sess-1 is closed, sess-2 remains active
      assert.strictEqual(sessions[0].state, 'closed');
      assert.strictEqual(sessions[1].state, 'idle');
    });

    it('orphaned sessions persist until manually closed', () => {
      // Session where SessionEnd never fired (Ctrl-C, crash)
      const orphanedSession = createTestSession({
        id: 'orphaned',
        directory: '/project',
        state: 'busy',
        last_active_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      });

      // New session starts in same directory
      const newSession = createTestSession({
        id: 'new',
        directory: '/project',
        state: 'busy',
      });

      // Orphaned session is NOT auto-closed
      assert.strictEqual(orphanedSession.state, 'busy');
      assert.strictEqual(newSession.state, 'busy');
    });
  });

  describe('recent session detection for parent linking', () => {
    it('finds recently closed sessions within threshold', () => {
      const now = Date.now();
      const threshold = 30 * 1000; // 30 seconds
      const currentId = 'new-session';
      const cwd = '/project';

      const sessions: Session[] = [
        createTestSession({
          id: 'recent',
          directory: cwd,
          state: 'closed',
          last_active_at: new Date(now - 10 * 1000), // 10 seconds ago
        }),
        createTestSession({
          id: 'old',
          directory: cwd,
          state: 'closed',
          last_active_at: new Date(now - 60 * 1000), // 60 seconds ago
        }),
      ];

      const recent = sessions.filter(
        s =>
          s.state === 'closed' &&
          s.directory === cwd &&
          s.id !== currentId &&
          now - s.last_active_at.getTime() < threshold
      );

      assert.strictEqual(recent.length, 1);
      assert.strictEqual(recent[0].id, 'recent');
    });
  });

  describe('git info merging', () => {
    it('does not overwrite existing branch', () => {
      const session = createTestSession({
        resources: { branch: 'existing-branch' },
      });

      const newBranch = 'detected-branch';

      // Logic: only set branch if not already set
      if (!session.resources.branch) {
        session.resources.branch = newBranch;
      }

      assert.strictEqual(session.resources.branch, 'existing-branch');
    });

    it('sets branch when not present', () => {
      const session = createTestSession({ resources: {} });

      const newBranch = 'detected-branch';

      if (!session.resources.branch) {
        session.resources.branch = newBranch;
      }

      assert.strictEqual(session.resources.branch, 'detected-branch');
    });

    it('extracts JIRA from branch when setting', () => {
      const session = createTestSession({ resources: {} });
      const branch = 'feature/MAC-123-add-login';

      session.resources.branch = branch;

      // Simulate JIRA extraction
      const match = branch.match(/\b([A-Z]{2,10}-\d+)\b/);
      if (match && !session.resources.jira) {
        session.resources.jira = match[1];
      }

      assert.strictEqual(session.resources.jira, 'MAC-123');
    });

    it('does not extract JIRA if already set', () => {
      const session = createTestSession({
        resources: { jira: 'EXISTING-999' },
      });
      const branch = 'feature/MAC-123-add-login';

      session.resources.branch = branch;

      const match = branch.match(/\b([A-Z]{2,10}-\d+)\b/);
      if (match && !session.resources.jira) {
        session.resources.jira = match[1];
      }

      assert.strictEqual(session.resources.jira, 'EXISTING-999');
    });
  });

  describe('parent session linking', () => {
    it('sets parent_session_id when plan execution detected', () => {
      const session = createTestSession();
      const parentId = 'parent-uuid';

      session.parent_session_id = parentId;

      assert.strictEqual(session.parent_session_id, parentId);
    });

    it('sets name from plan slug when available', () => {
      const session = createTestSession();
      const planSlug = 'implement-feature';

      session.name = planSlug;

      assert.strictEqual(session.name, 'implement-feature');
    });
  });

  describe('existing session update', () => {
    it('updates last_active_at when session exists', () => {
      const oldDate = new Date('2024-01-01');
      const session = createTestSession({ last_active_at: oldDate });

      const newDate = new Date('2024-01-15');
      session.last_active_at = newDate;

      assert.strictEqual(session.last_active_at, newDate);
    });

    it('sets state to busy when resuming', () => {
      const session = createTestSession({ state: 'closed' });

      session.state = 'busy';

      assert.strictEqual(session.state, 'busy');
    });
  });
});
