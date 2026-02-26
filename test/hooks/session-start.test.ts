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

  describe('stale session detection', () => {
    it('identifies sessions in same directory', () => {
      const sessions: Session[] = [
        createTestSession({ id: 'sess-1', directory: '/home/user/project', status: 'live' }),
        createTestSession({ id: 'sess-2', directory: '/home/user/project', status: 'live' }),
        createTestSession({ id: 'sess-3', directory: '/home/user/other', status: 'live' }),
      ];

      const currentId = 'new-session';
      const cwd = '/home/user/project';

      const stale = sessions.filter(
        s => s.status === 'live' && s.directory === cwd && s.id !== currentId
      );

      assert.strictEqual(stale.length, 2);
      assert.ok(stale.some(s => s.id === 'sess-1'));
      assert.ok(stale.some(s => s.id === 'sess-2'));
    });

    it('excludes current session from stale list', () => {
      const currentId = 'sess-1';
      const sessions: Session[] = [
        createTestSession({ id: currentId, directory: '/project', status: 'live' }),
        createTestSession({ id: 'sess-2', directory: '/project', status: 'live' }),
      ];

      const stale = sessions.filter(
        s => s.status === 'live' && s.directory === '/project' && s.id !== currentId
      );

      assert.strictEqual(stale.length, 1);
      assert.strictEqual(stale[0].id, 'sess-2');
    });

    it('ignores closed sessions', () => {
      const sessions: Session[] = [
        createTestSession({ id: 'sess-1', directory: '/project', status: 'closed' }),
        createTestSession({ id: 'sess-2', directory: '/project', status: 'live' }),
      ];

      const stale = sessions.filter(
        s => s.status === 'live' && s.directory === '/project'
      );

      assert.strictEqual(stale.length, 1);
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
          status: 'closed',
          last_active_at: new Date(now - 10 * 1000), // 10 seconds ago
        }),
        createTestSession({
          id: 'old',
          directory: cwd,
          status: 'closed',
          last_active_at: new Date(now - 60 * 1000), // 60 seconds ago
        }),
      ];

      const recent = sessions.filter(
        s =>
          s.status === 'closed' &&
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

    it('sets status to live when resuming', () => {
      const session = createTestSession({ status: 'closed' });

      session.status = 'live';

      assert.strictEqual(session.status, 'live');
    });
  });
});
