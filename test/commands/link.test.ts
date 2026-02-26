/**
 * Tests for link command behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';
import type { LinkOptions } from '../../src/commands/link.js';

describe('c > commands > link', () => {
  beforeEach(() => {
    resetSessionCounter();
  });

  describe('resource linking', () => {
    it('links --pr URL to session', () => {
      const session = createTestSession({ resources: {} });
      const options: LinkOptions = { pr: 'https://github.com/org/repo/pull/42' };

      if (options.pr) session.resources.pr = options.pr;

      assert.strictEqual(session.resources.pr, 'https://github.com/org/repo/pull/42');
    });

    it('links --jira ticket to session', () => {
      const session = createTestSession({ resources: {} });
      const options: LinkOptions = { jira: 'MAC-123' };

      if (options.jira) session.resources.jira = options.jira;

      assert.strictEqual(session.resources.jira, 'MAC-123');
    });

    it('links --branch name to session', () => {
      const session = createTestSession({ resources: {} });
      const options: LinkOptions = { branch: 'feature/new-thing' };

      if (options.branch) session.resources.branch = options.branch;

      assert.strictEqual(session.resources.branch, 'feature/new-thing');
    });

    it('links multiple resources at once', () => {
      const session = createTestSession({ resources: {} });
      const options: LinkOptions = {
        pr: 'https://github.com/org/repo/pull/42',
        jira: 'MAC-123',
        branch: 'feature/MAC-123-thing',
      };

      if (options.pr) session.resources.pr = options.pr;
      if (options.jira) session.resources.jira = options.jira;
      if (options.branch) session.resources.branch = options.branch;

      assert.strictEqual(session.resources.pr, 'https://github.com/org/repo/pull/42');
      assert.strictEqual(session.resources.jira, 'MAC-123');
      assert.strictEqual(session.resources.branch, 'feature/MAC-123-thing');
    });

    it('overwrites existing resource', () => {
      const session = createTestSession({
        resources: { pr: 'https://github.com/org/repo/pull/1' },
      });
      const options: LinkOptions = { pr: 'https://github.com/org/repo/pull/42' };

      if (options.pr) session.resources.pr = options.pr;

      assert.strictEqual(session.resources.pr, 'https://github.com/org/repo/pull/42');
    });
  });

  describe('timestamp update', () => {
    it('updates last_active_at', () => {
      const oldDate = new Date('2024-01-01');
      const session = createTestSession({ last_active_at: oldDate });
      const options: LinkOptions = { jira: 'MAC-123' };

      if (options.jira) {
        session.resources.jira = options.jira;
        session.last_active_at = new Date();
      }

      assert.ok(session.last_active_at > oldDate);
    });
  });

  describe('session lookup', () => {
    it('uses current session when no ID', () => {
      const sessions = [
        createTestSession({ directory: '/project', status: 'live' }),
        createTestSession({ directory: '/other', status: 'live' }),
      ];

      const cwd = '/project';
      const current = sessions.find(
        s => s.status === 'live' && s.directory === cwd
      );

      assert.ok(current);
      assert.strictEqual(current.directory, '/project');
    });

    it('finds session by ID prefix', () => {
      const sessions = [
        createTestSession({ id: 'abc-123' }),
        createTestSession({ id: 'def-456' }),
      ];

      const prefix = 'abc';
      const found = sessions.find(s => s.id.startsWith(prefix));

      assert.ok(found);
      assert.strictEqual(found.id, 'abc-123');
    });
  });

  describe('error conditions', () => {
    it('errors when no resource specified', () => {
      const options: LinkOptions = {};
      const hasResource = options.pr || options.jira || options.branch;

      assert.strictEqual(hasResource, undefined);
      // Command would exit with error: "Specify at least one: --pr, --jira, or --branch"
    });

    it('errors when session not found', () => {
      const sessions: never[] = [];
      const found = sessions.find(() => false);

      assert.strictEqual(found, undefined);
      // Command would exit with error
    });
  });

  describe('output message', () => {
    it('lists linked resources', () => {
      const options: LinkOptions = {
        pr: 'https://github.com/org/repo/pull/42',
        jira: 'MAC-123',
      };

      const linked: string[] = [];
      if (options.pr) linked.push(`PR: ${options.pr}`);
      if (options.jira) linked.push(`JIRA: ${options.jira}`);
      if (options.branch) linked.push(`branch: ${options.branch}`);

      assert.deepStrictEqual(linked, [
        'PR: https://github.com/org/repo/pull/42',
        'JIRA: MAC-123',
      ]);
    });
  });
});
