/**
 * Tests for post-bash hook logic
 *
 * These tests verify the behavior of PR detection and session updates
 * without calling the actual hook.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.js';
import { extractPRFromOutput } from '../../src/detection/pr.js';

describe('c > hooks > post-bash', () => {
  beforeEach(() => {
    resetSessionCounter();
  });

  describe('PR extraction from output', () => {
    it('extracts PR URL from gh pr create output', () => {
      const output = `Creating pull request for feature-branch into main...
https://github.com/org/repo/pull/42
✓ Created pull request`;

      const prUrl = extractPRFromOutput(output);
      assert.strictEqual(prUrl, 'https://github.com/org/repo/pull/42');
    });

    it('returns undefined when no PR URL', () => {
      const output = 'npm install completed successfully';
      const prUrl = extractPRFromOutput(output);
      assert.strictEqual(prUrl, undefined);
    });
  });

  describe('PR linking behavior', () => {
    it('sets PR when not already present', () => {
      const session = createTestSession({ resources: {} });
      const prUrl = 'https://github.com/org/repo/pull/42';

      if (!session.resources.pr) {
        session.resources.pr = prUrl;
      }

      assert.strictEqual(session.resources.pr, prUrl);
    });

    it('does not overwrite existing PR', () => {
      const session = createTestSession({
        resources: { pr: 'https://github.com/org/repo/pull/1' },
      });
      const newPrUrl = 'https://github.com/org/repo/pull/42';

      if (!session.resources.pr) {
        session.resources.pr = newPrUrl;
      }

      assert.strictEqual(session.resources.pr, 'https://github.com/org/repo/pull/1');
    });
  });

  describe('last_active_at update', () => {
    it('updates timestamp on PR detection', () => {
      const oldDate = new Date('2024-01-01');
      const session = createTestSession({ last_active_at: oldDate });
      const prUrl = 'https://github.com/org/repo/pull/42';

      // Simulate hook behavior
      if (prUrl) {
        session.last_active_at = new Date();
        if (!session.resources.pr) {
          session.resources.pr = prUrl;
        }
      }

      assert.ok(session.last_active_at > oldDate);
    });
  });

  describe('server detection patterns', () => {
    const serverPatterns = [
      /npm (?:run )?start/,
      /npm run dev/,
      /yarn (?:run )?start/,
      /yarn dev/,
      /webpack.*serve/,
      /vite/,
      /next dev/,
    ];

    function isServerStart(command: string): boolean {
      return serverPatterns.some(p => p.test(command));
    }

    it('detects npm start', () => {
      assert.strictEqual(isServerStart('npm start'), true);
    });

    it('detects npm run start', () => {
      assert.strictEqual(isServerStart('npm run start'), true);
    });

    it('detects npm run dev', () => {
      assert.strictEqual(isServerStart('npm run dev'), true);
    });

    it('detects yarn start', () => {
      assert.strictEqual(isServerStart('yarn start'), true);
    });

    it('detects yarn run start', () => {
      assert.strictEqual(isServerStart('yarn run start'), true);
    });

    it('detects yarn dev', () => {
      assert.strictEqual(isServerStart('yarn dev'), true);
    });

    it('detects webpack serve', () => {
      assert.strictEqual(isServerStart('webpack serve --mode development'), true);
    });

    it('detects vite', () => {
      assert.strictEqual(isServerStart('vite'), true);
    });

    it('detects next dev', () => {
      assert.strictEqual(isServerStart('next dev'), true);
    });

    it('does not match npm install', () => {
      assert.strictEqual(isServerStart('npm install'), false);
    });

    it('does not match npm test', () => {
      assert.strictEqual(isServerStart('npm test'), false);
    });

    it('does not match npm build', () => {
      assert.strictEqual(isServerStart('npm run build'), false);
    });

    it('does not match git commands', () => {
      assert.strictEqual(isServerStart('git commit -m "message"'), false);
    });
  });

  describe('current session lookup', () => {
    it('finds active session for directory', () => {
      const sessions = [
        createTestSession({ directory: '/project', state: 'busy' }),
        createTestSession({ directory: '/project', state: 'closed' }),
        createTestSession({ directory: '/other', state: 'busy' }),
      ];

      const cwd = '/project';
      const activeStates = ['busy', 'idle', 'waiting'];
      const current = sessions.find(
        s => activeStates.includes(s.state) && s.directory === cwd
      );

      assert.ok(current);
      assert.strictEqual(current.directory, '/project');
      assert.strictEqual(current.state, 'busy');
    });

    it('returns undefined when no active session', () => {
      const sessions = [
        createTestSession({ directory: '/project', state: 'closed' }),
        createTestSession({ directory: '/project', state: 'archived' }),
      ];

      const cwd = '/project';
      const activeStates = ['busy', 'idle', 'waiting'];
      const current = sessions.find(
        s => activeStates.includes(s.state) && s.directory === cwd
      );

      assert.strictEqual(current, undefined);
    });
  });
});
