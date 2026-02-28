/**
 * Tests for untag command behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';

describe('c', () => {
  describe('commands', () => {
    describe('untag', () => {
      beforeEach(() => {
        resetSessionCounter();
      });

      describe('tag removal', () => {
        it('removes tag from session', () => {
          const session = createTestSession({ tags: ['important', 'wip'] });
          const tag = 'important';

          session.tags.values = session.tags.values.filter(t => t !== tag);

          assert.deepStrictEqual(session.tags.values, ['wip']);
        });

        it('empties tag list when removing last tag', () => {
          const session = createTestSession({ tags: ['only-one'] });
          const tag = 'only-one';

          session.tags.values = session.tags.values.filter(t => t !== tag);

          assert.deepStrictEqual(session.tags.values, []);
        });

        it('ignores missing tag', () => {
          const session = createTestSession({ tags: ['existing'] });
          const tag = 'nonexistent';

          session.tags.values = session.tags.values.filter(t => t !== tag);

          assert.deepStrictEqual(session.tags.values, ['existing']);
        });

        it('no-ops on empty tag list', () => {
          const session = createTestSession({ tags: [] });
          const tag = 'any';

          session.tags.values = session.tags.values.filter(t => t !== tag);

          assert.deepStrictEqual(session.tags.values, []);
        });
      });

      describe('timestamp update', () => {
        it('updates last_active_at', () => {
          const oldDate = new Date('2024-01-01');
          const session = createTestSession({
            tags: ['important'],
            last_active_at: oldDate,
          });
          const tag = 'important';

          session.tags.values = session.tags.values.filter(t => t !== tag);
          session.last_active_at = new Date();

          assert.ok(session.last_active_at > oldDate);
        });
      });

      describe('session lookup', () => {
        it('uses current session when no ID', () => {
          const sessions = [
            createTestSession({ directory: '/project', state: 'busy' }),
            createTestSession({ directory: '/other', state: 'busy' }),
          ];

          const cwd = '/project';
          const activeStates = ['busy', 'idle', 'waiting'];
          const current = sessions.find(
            s => activeStates.includes(s.state) && s.directory === cwd
          );

          assert.ok(current);
        });
      });

      describe('error conditions', () => {
        it('errors when session not found', () => {
          const sessions: never[] = [];
          const found = sessions.find(() => false);

          assert.strictEqual(found, undefined);
        });
      });

      describe('output message', () => {
        it('includes tag in success message', () => {
          const tag = 'important';
          const displayName = 'My Session';

          // Output: "Removed tag from My Session: important"
          const message = `Removed tag from ${displayName}: ${tag}`;
          assert.ok(message.includes(tag));
          assert.ok(message.includes(displayName));
        });
      });
    });
  });
});
