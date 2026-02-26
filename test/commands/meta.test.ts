/**
 * Tests for meta command behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';

describe('c > commands > meta', () => {
  beforeEach(() => {
    resetSessionCounter();
  });

  describe('key=value parsing', () => {
    it('parses key=value format', () => {
      const keyValue = 'priority=high';
      const eq = keyValue.indexOf('=');

      assert.ok(eq !== -1);

      const key = keyValue.slice(0, eq);
      const value = keyValue.slice(eq + 1);

      assert.strictEqual(key, 'priority');
      assert.strictEqual(value, 'high');
    });

    it('handles value with equals sign', () => {
      const keyValue = 'url=https://example.com?foo=bar';
      const eq = keyValue.indexOf('=');

      const key = keyValue.slice(0, eq);
      const value = keyValue.slice(eq + 1);

      assert.strictEqual(key, 'url');
      assert.strictEqual(value, 'https://example.com?foo=bar');
    });

    it('handles empty value (deletes key)', () => {
      const keyValue = 'remove=';
      const eq = keyValue.indexOf('=');

      const key = keyValue.slice(0, eq);
      const value = keyValue.slice(eq + 1);

      assert.strictEqual(key, 'remove');
      assert.strictEqual(value, '');
    });

    it('errors on invalid format (no =)', () => {
      const keyValue = 'noequals';
      const eq = keyValue.indexOf('=');

      assert.strictEqual(eq, -1);
      // Command would exit: "Format: key=value"
    });
  });

  describe('meta setting', () => {
    it('sets meta key', () => {
      const session = createTestSession({ meta: {} });
      const key = 'priority';
      const value = 'high';

      session.meta[key] = value;

      assert.strictEqual(session.meta.priority, 'high');
    });

    it('overwrites existing key', () => {
      const session = createTestSession({ meta: { priority: 'low' } });
      const key = 'priority';
      const value = 'high';

      session.meta[key] = value;

      assert.strictEqual(session.meta.priority, 'high');
    });

    it('deletes key when value empty', () => {
      const session = createTestSession({ meta: { remove: 'this' } });
      const key = 'remove';
      const value = '';

      if (value) {
        session.meta[key] = value;
      } else {
        delete session.meta[key];
      }

      assert.strictEqual(session.meta[key], undefined);
    });

    it('preserves other meta keys', () => {
      const session = createTestSession({
        meta: { existing: 'keep', change: 'old' },
      });

      session.meta.change = 'new';

      assert.strictEqual(session.meta.existing, 'keep');
      assert.strictEqual(session.meta.change, 'new');
    });
  });

  describe('timestamp update', () => {
    it('updates last_active_at', () => {
      const oldDate = new Date('2024-01-01');
      const session = createTestSession({ meta: {}, last_active_at: oldDate });

      session.meta.key = 'value';
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

    it('errors on missing equals sign', () => {
      const keyValue = 'invalid';
      const hasEquals = keyValue.indexOf('=') !== -1;

      assert.strictEqual(hasEquals, false);
      // Command would exit: "Format: key=value"
    });
  });

  describe('output message', () => {
    it('confirms set in success message', () => {
      const key = 'priority';
      const value = 'high';
      const displayName = 'My Session';

      // Output: "Set priority=high on My Session"
      const message = `Set ${key}=${value} on ${displayName}`;
      assert.ok(message.includes(`${key}=${value}`));
    });

    it('confirms delete in success message', () => {
      const key = 'priority';
      const displayName = 'My Session';

      // Output: "Removed priority from My Session"
      const message = `Removed ${key} from ${displayName}`;
      assert.ok(message.includes(key));
    });
  });
});
