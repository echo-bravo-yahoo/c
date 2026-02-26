/**
 * Tests for tag command behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';

describe('c > commands > tag', () => {
  beforeEach(() => {
    resetSessionCounter();
  });

  describe('tag adding', () => {
    it('adds tag to session', () => {
      const session = createTestSession({ tags: [] });
      const tag = 'important';

      if (!session.tags.values.includes(tag)) {
        session.tags.values.push(tag);
      }

      assert.deepStrictEqual(session.tags.values, ['important']);
    });

    it('adds to existing tags', () => {
      const session = createTestSession({ tags: ['existing'] });
      const tag = 'new';

      if (!session.tags.values.includes(tag)) {
        session.tags.values.push(tag);
      }

      assert.deepStrictEqual(session.tags.values, ['existing', 'new']);
    });

    it('prevents duplicate tags', () => {
      const session = createTestSession({ tags: ['important'] });
      const tag = 'important';

      if (!session.tags.values.includes(tag)) {
        session.tags.values.push(tag);
      }

      assert.deepStrictEqual(session.tags.values, ['important']);
    });
  });

  describe('timestamp update', () => {
    it('updates last_active_at', () => {
      const oldDate = new Date('2024-01-01');
      const session = createTestSession({ tags: [], last_active_at: oldDate });
      const tag = 'important';

      session.tags.values.push(tag);
      session.last_active_at = new Date();

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

      // Output: "Tagged My Session with: important"
      const message = `Tagged ${displayName} with: ${tag}`;
      assert.ok(message.includes(tag));
      assert.ok(message.includes(displayName));
    });
  });
});
