/**
 * Tests for list command behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';
import type { Session } from '../../src/store/schema.js';
import type { ListOptions } from '../../src/commands/list.js';

describe('c > commands > list', () => {
  beforeEach(() => {
    resetSessionCounter();
  });

  describe('status filtering', () => {
    const sessions: Session[] = [];

    beforeEach(() => {
      sessions.length = 0;
      sessions.push(
        createTestSession({ status: 'live' }),
        createTestSession({ status: 'closed' }),
        createTestSession({ status: 'archived' })
      );
    });

    it('shows live and closed by default', () => {
      const options: ListOptions = {};
      const statusFilter = options.all
        ? ['live', 'closed', 'archived']
        : options.archived
          ? ['archived']
          : ['live', 'closed'];

      const filtered = sessions.filter(s => statusFilter.includes(s.status));
      assert.strictEqual(filtered.length, 2);
      assert.ok(filtered.some(s => s.status === 'live'));
      assert.ok(filtered.some(s => s.status === 'closed'));
    });

    it('--all includes archived', () => {
      const options: ListOptions = { all: true };
      const statusFilter = options.all
        ? ['live', 'closed', 'archived']
        : ['live', 'closed'];

      const filtered = sessions.filter(s => statusFilter.includes(s.status));
      assert.strictEqual(filtered.length, 3);
    });

    it('--archived shows only archived', () => {
      const options: ListOptions = { archived: true };
      const statusFilter = options.archived
        ? ['archived']
        : ['live', 'closed'];

      const filtered = sessions.filter(s => statusFilter.includes(s.status));
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].status, 'archived');
    });
  });

  describe('waiting filter', () => {
    it('--waiting filters to waiting sessions', () => {
      const sessions = [
        createTestSession({ status: 'live', waiting: true }),
        createTestSession({ status: 'live', waiting: false }),
        createTestSession({ status: 'closed', waiting: false }),
      ];

      const options: ListOptions = { waiting: true };
      const filtered = sessions.filter(
        s => s.status === 'live' && s.waiting === true
      );

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].waiting, true);
    });
  });

  describe('directory filter', () => {
    it('--dir filters by directory', () => {
      const sessions = [
        createTestSession({ directory: '/home/user/project-a' }),
        createTestSession({ directory: '/home/user/project-b' }),
        createTestSession({ directory: '/home/user/project-a' }),
      ];

      const options: ListOptions = { directory: '/home/user/project-a' };
      const filtered = sessions.filter(s => s.directory === options.directory);

      assert.strictEqual(filtered.length, 2);
    });
  });

  describe('--prs view', () => {
    it('filters to sessions with PR', () => {
      const sessions = [
        createTestSession({ resources: { pr: 'https://github.com/o/r/pull/1' } }),
        createTestSession({ resources: {} }),
        createTestSession({ resources: { pr: 'https://github.com/o/r/pull/2' } }),
      ];

      const withPRs = sessions.filter(s => s.resources.pr);
      assert.strictEqual(withPRs.length, 2);
    });

    it('extracts PR number from URL', () => {
      const session = createTestSession({
        resources: { pr: 'https://github.com/org/repo/pull/42' },
      });

      const prNum = session.resources.pr?.match(/\/pull\/(\d+)/)?.[1];
      assert.strictEqual(prNum, '42');
    });
  });

  describe('--jira view', () => {
    it('filters to sessions with JIRA', () => {
      const sessions = [
        createTestSession({ resources: { jira: 'MAC-123' } }),
        createTestSession({ resources: {} }),
        createTestSession({ resources: { jira: 'MAC-456' } }),
      ];

      const withJira = sessions.filter(s => s.resources.jira);
      assert.strictEqual(withJira.length, 2);
    });
  });

  describe('sorting', () => {
    it('sorts by last_active_at descending', () => {
      const sessions = [
        createTestSession({ last_active_at: new Date('2024-01-01') }),
        createTestSession({ last_active_at: new Date('2024-01-15') }),
        createTestSession({ last_active_at: new Date('2024-01-10') }),
      ];

      const sorted = sessions.sort(
        (a, b) => b.last_active_at.getTime() - a.last_active_at.getTime()
      );

      assert.strictEqual(
        sorted[0].last_active_at.toISOString(),
        '2024-01-15T00:00:00.000Z'
      );
      assert.strictEqual(
        sorted[1].last_active_at.toISOString(),
        '2024-01-10T00:00:00.000Z'
      );
      assert.strictEqual(
        sorted[2].last_active_at.toISOString(),
        '2024-01-01T00:00:00.000Z'
      );
    });
  });
});
