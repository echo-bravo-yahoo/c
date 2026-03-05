/**
 * Tests for post-bash hook logic
 *
 * PR extraction tests call the real extractPRFromOutput function.
 * PR linking tests call the real handlePostBash handler against a temp store.
 * Server detection tests verify the regex patterns used in the handler.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractPRFromOutput } from '../../src/detection/pr.ts';
import { handlePostBash } from '../../src/hooks/post-bash.ts';
import { updateIndex, getSession, resetIndexCache } from '../../src/store/index.ts';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.ts';

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
        let tmpDir: string;
        let savedCHome: string | undefined;

        beforeEach(() => {
          resetSessionCounter();
          tmpDir = mkdtempSync(join(tmpdir(), 'c-test-'));
          savedCHome = process.env.C_HOME;
          process.env.C_HOME = tmpDir;
          resetIndexCache();
        });

        afterEach(() => {
          process.env.C_HOME = savedCHome;
          if (savedCHome === undefined) delete process.env.C_HOME;
          rmSync(tmpDir, { recursive: true, force: true });
          resetIndexCache();
        });

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

        it('ignores npm install', () => {
          assert.strictEqual(isServerStart('npm install'), false);
        });

        it('ignores npm test', () => {
          assert.strictEqual(isServerStart('npm test'), false);
        });

        it('ignores npm build', () => {
          assert.strictEqual(isServerStart('npm run build'), false);
        });

        it('ignores git commands', () => {
          assert.strictEqual(isServerStart('git commit -m "message"'), false);
        });
      });
    });
  });
});
