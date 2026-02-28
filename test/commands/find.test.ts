/**
 * Tests for find command behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';
import type { Session } from '../../src/store/schema.js';

// Match logic from find command
function matchSession(session: Session, query: string): boolean {
  const q = query.toLowerCase();
  const fields = [
    session.id,
    session.name,
    session.humanhash,
    session.directory,
    session.resources.branch,
    session.resources.pr,
    session.resources.jira,
    ...session.tags.values,
    ...Object.keys(session.meta),
    ...Object.values(session.meta),
  ];

  return fields.some(f => f?.toLowerCase().includes(q));
}

describe('c', () => {
  describe('commands', () => {
    describe('find', () => {
      beforeEach(() => {
        resetSessionCounter();
      });

      describe('search fields', () => {
        it('matches session ID', () => {
          const session = createTestSession({ id: 'abc-123-uuid' });
          const query = 'abc';

          assert.strictEqual(matchSession(session, query), true);
        });

        it('matches name', () => {
          const session = createTestSession({ name: 'My Important Session' });
          const query = 'important';

          assert.strictEqual(matchSession(session, query), true);
        });

        it('matches humanhash', () => {
          const session = createTestSession({ humanhash: 'alpha-bravo-charlie' });
          const query = 'bravo';

          assert.strictEqual(matchSession(session, query), true);
        });

        it('matches directory', () => {
          const session = createTestSession({ directory: '/home/user/myproject' });
          const query = 'myproject';

          assert.strictEqual(matchSession(session, query), true);
        });

        it('matches branch', () => {
          const session = createTestSession({
            resources: { branch: 'feature/awesome-thing' },
          });
          const query = 'awesome';

          assert.strictEqual(matchSession(session, query), true);
        });

        it('matches PR URL', () => {
          const session = createTestSession({
            resources: { pr: 'https://github.com/org/repo/pull/42' },
          });
          const query = 'pull/42';

          assert.strictEqual(matchSession(session, query), true);
        });

        it('matches JIRA ticket', () => {
          const session = createTestSession({
            resources: { jira: 'MAC-123' },
          });
          const query = 'mac-123';

          assert.strictEqual(matchSession(session, query), true);
        });

        it('matches tags', () => {
          const session = createTestSession({ tags: ['important', 'wip'] });
          const query = 'important';

          assert.strictEqual(matchSession(session, query), true);
        });

        it('matches meta keys', () => {
          const session = createTestSession({ meta: { priority: 'high' } });
          const query = 'priority';

          assert.strictEqual(matchSession(session, query), true);
        });

        it('matches meta values', () => {
          const session = createTestSession({ meta: { status: 'in-review' } });
          const query = 'review';

          assert.strictEqual(matchSession(session, query), true);
        });
      });

      describe('case sensitivity', () => {
        it('ignores case', () => {
          const session = createTestSession({ name: 'My Important Session' });

          assert.strictEqual(matchSession(session, 'IMPORTANT'), true);
          assert.strictEqual(matchSession(session, 'Important'), true);
          assert.strictEqual(matchSession(session, 'important'), true);
        });

        it('matches regardless of case', () => {
          const session = createTestSession({
            resources: { jira: 'MAC-123' },
          });

          assert.strictEqual(matchSession(session, 'Mac'), true);
          assert.strictEqual(matchSession(session, 'MAC'), true);
          assert.strictEqual(matchSession(session, 'mac'), true);
        });
      });

      describe('partial matching', () => {
        it('matches partial strings', () => {
          const session = createTestSession({ name: 'authentication-feature' });

          assert.strictEqual(matchSession(session, 'auth'), true);
          assert.strictEqual(matchSession(session, 'feature'), true);
          assert.strictEqual(matchSession(session, 'tion-feat'), true);
        });
      });

      describe('no matches', () => {
        it('returns nothing when query misses', () => {
          const sessions = [
            createTestSession({ name: 'Session A' }),
            createTestSession({ name: 'Session B' }),
          ];

          const query = 'nonexistent';
          const matches = sessions.filter(s => matchSession(s, query));

          assert.strictEqual(matches.length, 0);
        });

        it('matches everything with empty query', () => {
          const session = createTestSession({ name: 'Test' });
          const query = '';

          // Empty string matches everything (substring check)
          assert.strictEqual(matchSession(session, query), true);
        });
      });

      describe('multiple matches', () => {
        it('returns all matching sessions', () => {
          const sessions = [
            createTestSession({ name: 'Auth Feature' }),
            createTestSession({ name: 'Authentication Bug' }),
            createTestSession({ name: 'User Profile' }),
          ];

          const query = 'auth';
          const matches = sessions.filter(s => matchSession(s, query));

          assert.strictEqual(matches.length, 2);
        });
      });

      describe('optional fields', () => {
        it('tolerates missing branch', () => {
          const session = createTestSession({ resources: {} });
          const query = 'branch';

          // Should not crash on undefined
          assert.strictEqual(matchSession(session, query), false);
        });

        it('tolerates missing PR', () => {
          const session = createTestSession({ resources: {} });
          const query = 'pull';

          assert.strictEqual(matchSession(session, query), false);
        });

        it('tolerates empty meta', () => {
          const session = createTestSession({ meta: {} });
          const query = 'meta';

          assert.strictEqual(matchSession(session, query), false);
        });

        it('tolerates empty tags', () => {
          const session = createTestSession({ tags: [] });
          const query = 'tag';

          assert.strictEqual(matchSession(session, query), false);
        });
      });
    });
  });
});
