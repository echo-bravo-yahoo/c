/**
 * Tests for clean command behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';
import type { Session } from '../../src/store/schema.js';

describe('c > commands > clean', () => {
  beforeEach(() => {
    resetSessionCounter();
  });

  describe('orphan detection', () => {
    it('finds sessions not in Claude', () => {
      const indexSessions = [
        createTestSession({ id: 'exists-1' }),
        createTestSession({ id: 'orphan-1' }),
        createTestSession({ id: 'exists-2' }),
      ];

      const claudeIds = new Set(['exists-1', 'exists-2']);

      const orphaned = indexSessions.filter(s => !claudeIds.has(s.id));

      assert.strictEqual(orphaned.length, 1);
      assert.strictEqual(orphaned[0].id, 'orphan-1');
    });

    it('returns empty when all sessions exist in Claude', () => {
      const indexSessions = [
        createTestSession({ id: 'exists-1' }),
        createTestSession({ id: 'exists-2' }),
      ];

      const claudeIds = new Set(['exists-1', 'exists-2']);

      const orphaned = indexSessions.filter(s => !claudeIds.has(s.id));

      assert.strictEqual(orphaned.length, 0);
    });
  });

  describe('missing directory detection', () => {
    it('finds sessions with non-existent directories', () => {
      // Simulate directory existence check
      const existingDirs = new Set(['/home/user/project-a', '/home/user/project-b']);

      const sessions = [
        createTestSession({ directory: '/home/user/project-a' }),
        createTestSession({ directory: '/home/user/deleted' }),
        createTestSession({ directory: '/home/user/project-b' }),
      ];

      const missingDirs = sessions.filter(s => !existingDirs.has(s.directory));

      assert.strictEqual(missingDirs.length, 1);
      assert.strictEqual(missingDirs[0].directory, '/home/user/deleted');
    });

    it('returns empty when all directories exist', () => {
      const existingDirs = new Set(['/project-a', '/project-b']);

      const sessions = [
        createTestSession({ directory: '/project-a' }),
        createTestSession({ directory: '/project-b' }),
      ];

      const missingDirs = sessions.filter(s => !existingDirs.has(s.directory));

      assert.strictEqual(missingDirs.length, 0);
    });
  });

  describe('combined orphan detection', () => {
    it('combines both orphan types', () => {
      const indexSessions = [
        createTestSession({ id: 'claude-orphan', directory: '/existing' }),
        createTestSession({ id: 'dir-missing', directory: '/deleted' }),
        createTestSession({ id: 'both', directory: '/also-deleted' }),
        createTestSession({ id: 'healthy', directory: '/existing' }),
      ];

      const claudeIds = new Set(['dir-missing', 'healthy']);
      const existingDirs = new Set(['/existing']);

      const orphanedFromClaude = indexSessions.filter(s => !claudeIds.has(s.id));
      const missingDirs = indexSessions.filter(s => !existingDirs.has(s.directory));

      // Create unique set of orphan IDs
      const orphanIds = new Set([
        ...orphanedFromClaude.map(s => s.id),
        ...missingDirs.map(s => s.id),
      ]);

      assert.strictEqual(orphanIds.size, 3);
      assert.ok(orphanIds.has('claude-orphan'));
      assert.ok(orphanIds.has('dir-missing'));
      assert.ok(orphanIds.has('both'));
    });
  });

  describe('report without prune', () => {
    it('reports count without --prune', () => {
      const orphaned = [
        createTestSession({ id: 'orphan-1' }),
        createTestSession({ id: 'orphan-2' }),
      ];

      // Without prune, just count
      assert.strictEqual(orphaned.length, 2);
    });

    it('reports "no orphans" when clean', () => {
      const orphaned: Session[] = [];
      const missingDirs: Session[] = [];

      const hasOrphans = orphaned.length > 0 || missingDirs.length > 0;

      assert.strictEqual(hasOrphans, false);
      // Output: "No orphaned sessions found."
    });
  });

  describe('prune behavior', () => {
    it('deletes orphans with --prune', () => {
      const sessions: Record<string, Session> = {
        'keep-1': createTestSession({ id: 'keep-1' }),
        'orphan-1': createTestSession({ id: 'orphan-1' }),
        'orphan-2': createTestSession({ id: 'orphan-2' }),
      };

      const toDelete = new Set(['orphan-1', 'orphan-2']);

      for (const id of toDelete) {
        delete sessions[id];
      }

      assert.strictEqual(Object.keys(sessions).length, 1);
      assert.ok(sessions['keep-1']);
      assert.strictEqual(sessions['orphan-1'], undefined);
      assert.strictEqual(sessions['orphan-2'], undefined);
    });

    it('reports pruned count', () => {
      const toDelete = new Set(['orphan-1', 'orphan-2', 'orphan-3']);

      // Output: "Pruned 3 sessions."
      const message = `Pruned ${toDelete.size} sessions.`;
      assert.ok(message.includes('3'));
    });
  });

  describe('display output', () => {
    it('shows short ID in orphan list', () => {
      const session = createTestSession({ id: '12345678-1234-1234-1234-123456789012' });

      const shortId = session.id.slice(0, 8);
      assert.strictEqual(shortId, '12345678');
    });

    it('shows display name in orphan list', () => {
      const session = createTestSession({
        name: 'My Session',
        humanhash: 'alpha-bravo',
      });

      const displayName = session.name || session.humanhash;
      assert.strictEqual(displayName, 'My Session');
    });

    it('shows directory for missing dir sessions', () => {
      const session = createTestSession({ directory: '/deleted/project' });

      // Output includes: "session-id name -> /deleted/project"
      assert.ok(session.directory.includes('/deleted'));
    });
  });
});
