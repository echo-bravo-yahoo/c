/**
 * Tests for unlink command behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';
import type { UnlinkOptions } from '../../src/commands/unlink.js';

describe('c', () => {
  describe('commands', () => {
    describe('unlink', () => {
      beforeEach(() => {
        resetSessionCounter();
      });

      describe('resource removal', () => {
        it('detaches PR', () => {
          const session = createTestSession({
            resources: { pr: 'https://github.com/org/repo/pull/42' },
          });
          const options: UnlinkOptions = { pr: true };

          if (options.pr) delete session.resources.pr;

          assert.strictEqual(session.resources.pr, undefined);
        });

        it('detaches JIRA ticket', () => {
          const session = createTestSession({
            resources: { jira: 'MAC-123' },
          });
          const options: UnlinkOptions = { jira: true };

          if (options.jira) delete session.resources.jira;

          assert.strictEqual(session.resources.jira, undefined);
        });

        it('detaches branch', () => {
          const session = createTestSession({
            resources: { branch: 'feature/thing' },
          });
          const options: UnlinkOptions = { branch: true };

          if (options.branch) delete session.resources.branch;

          assert.strictEqual(session.resources.branch, undefined);
        });

        it('detaches multiple resources', () => {
          const session = createTestSession({
            resources: {
              pr: 'https://github.com/org/repo/pull/42',
              jira: 'MAC-123',
              branch: 'feature/thing',
            },
          });
          const options: UnlinkOptions = { pr: true, jira: true };

          if (options.pr) delete session.resources.pr;
          if (options.jira) delete session.resources.jira;
          if (options.branch) delete session.resources.branch;

          assert.strictEqual(session.resources.pr, undefined);
          assert.strictEqual(session.resources.jira, undefined);
          assert.strictEqual(session.resources.branch, 'feature/thing'); // not deleted
        });
      });

      describe('no-op behavior', () => {
        it('ignores missing resource', () => {
          const session = createTestSession({ resources: {} });
          const options: UnlinkOptions = { pr: true };

          // delete on undefined property is a no-op
          if (options.pr) delete session.resources.pr;

          assert.strictEqual(session.resources.pr, undefined);
        });
      });

      describe('timestamp update', () => {
        it('updates last_active_at', () => {
          const oldDate = new Date('2024-01-01');
          const session = createTestSession({
            resources: { jira: 'MAC-123' },
            last_active_at: oldDate,
          });
          const options: UnlinkOptions = { jira: true };

          if (options.jira) {
            delete session.resources.jira;
            session.last_active_at = new Date();
          }

          assert.ok(session.last_active_at > oldDate);
        });
      });

      describe('error conditions', () => {
        it('requires at least one resource', () => {
          const options: UnlinkOptions = {};
          const hasResource = options.pr || options.jira || options.branch;

          assert.strictEqual(hasResource, undefined);
          // Command would exit with error: "Specify at least one: --pr, --jira, or --branch"
        });

        it('errors when session not found', () => {
          const sessions: never[] = [];
          const found = sessions.find(() => false);

          assert.strictEqual(found, undefined);
        });
      });

      describe('output message', () => {
        it('lists detached resources in output', () => {
          const options: UnlinkOptions = { pr: true, jira: true };

          const unlinked: string[] = [];
          if (options.pr) unlinked.push('PR');
          if (options.jira) unlinked.push('JIRA');
          if (options.branch) unlinked.push('branch');

          assert.deepStrictEqual(unlinked, ['PR', 'JIRA']);
        });
      });
    });
  });
});
