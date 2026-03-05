/**
 * Tests for post-bash hook logic
 *
 * PR extraction tests call the real extractPRFromOutput function.
 * PR linking tests call the real handlePostBash handler against a temp store.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { extractPRFromOutput } from '../../src/detection/pr.ts';
import { handlePostBash } from '../../src/hooks/post-bash.ts';
import { updateIndex, getSession } from '../../src/store/index.ts';
import { createTestSession } from '../fixtures/sessions.ts';
import { setupTempStore, type TempStore } from '../helpers/store.ts';

describe('c', () => {
  describe('hooks', () => {
    describe('post-bash', () => {
      describe('PR extraction from output', () => {
        it('detects PR from gh output', () => {
          const output = `Creating pull request for feature-branch into main...
https://github.com/org/repo/pull/42
✓ Created pull request`;

          const prUrl = extractPRFromOutput(output);
          assert.strictEqual(prUrl, 'https://github.com/org/repo/pull/42');
        });

        it('ignores non-PR output', () => {
          const output = 'npm install completed successfully';
          const prUrl = extractPRFromOutput(output);
          assert.strictEqual(prUrl, undefined);
        });
      });

      describe('PR linking via handler', () => {
        let store: TempStore;

        beforeEach(() => { store = setupTempStore(); });
        afterEach(() => { store.cleanup(); });

        it('links detected PR to session', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy', resources: {} });
          });

          await handlePostBash('s1', '/tmp', {
            tool_output: 'https://github.com/org/repo/pull/42\n✓ Created pull request',
          } as any);

          const s = getSession('s1');
          assert.ok(s);
          assert.strictEqual(s.resources.pr, 'https://github.com/org/repo/pull/42');
        });

        it('preserves existing PR', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({
              id: 's1',
              state: 'busy',
              resources: { pr: 'https://github.com/org/repo/pull/1' },
            });
          });

          await handlePostBash('s1', '/tmp', {
            tool_output: 'https://github.com/org/repo/pull/42\n✓ Created pull request',
          } as any);

          const s = getSession('s1');
          assert.ok(s);
          assert.strictEqual(s.resources.pr, 'https://github.com/org/repo/pull/1');
        });

        it('no-op when output has no PR', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy', resources: {} });
          });

          await handlePostBash('s1', '/tmp', {
            tool_output: 'npm install completed',
          } as any);

          const s = getSession('s1');
          assert.ok(s);
          assert.strictEqual(s.resources.pr, undefined);
        });

        it('updates last_active_at on PR detection', async () => {
          const oldDate = new Date('2024-01-01');
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({
              id: 's1',
              state: 'busy',
              last_active_at: oldDate,
              resources: {},
            });
          });

          await handlePostBash('s1', '/tmp', {
            tool_output: 'https://github.com/org/repo/pull/42',
          } as any);

          const s = getSession('s1');
          assert.ok(s);
          assert.ok(s.last_active_at.getTime() > oldDate.getTime());
        });
      });
    });
  });
});
