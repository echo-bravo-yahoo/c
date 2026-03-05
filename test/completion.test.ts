/**
 * Tests for tab completion logic
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { updateIndex } from '../src/store/index.ts';
import { createTestSession, resetSessionCounter } from './fixtures/sessions.ts';
import { getCompletions } from '../src/completion.ts';

describe('completion', () => {
  let tmpDir: string;
  let savedCHome: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'c-comp-test-'));
    savedCHome = process.env.C_HOME;
    process.env.C_HOME = tmpDir;
    resetSessionCounter();
  });

  afterEach(() => {
    process.env.C_HOME = savedCHome;
    if (savedCHome === undefined) delete process.env.C_HOME;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('--sort completions', () => {
    it('returns sort fields', () => {
      const results = getCompletions('--sort', 'c list --sort ');
      assert.ok(results.includes('active'));
      assert.ok(results.includes('created'));
      assert.ok(results.includes('name'));
      assert.ok(results.includes('status'));
    });
  });

  describe('--state completions', () => {
    it('returns state values including all', () => {
      const results = getCompletions('--state', 'c list --state ');
      assert.ok(results.includes('all'));
      assert.ok(results.includes('busy'));
      assert.ok(results.includes('idle'));
      assert.ok(results.includes('waiting'));
      assert.ok(results.includes('closed'));
      assert.ok(results.includes('archived'));
    });
  });

  describe('--name completions', () => {
    it('returns session names', async () => {
      await updateIndex((idx) => {
        idx.sessions['s1'] = createTestSession({ id: 's1', name: 'Auth Bug' });
        idx.sessions['s2'] = createTestSession({ id: 's2', name: 'Dashboard' });
      });

      const results = getCompletions('--name', 'c list --name ');
      assert.ok(results.includes('Auth Bug'));
      assert.ok(results.includes('Dashboard'));
    });
  });

  describe('--worktree completions', () => {
    it('returns worktree names', async () => {
      await updateIndex((idx) => {
        idx.sessions['s1'] = createTestSession({ id: 's1', resources: { worktree: 'bugfix-123' } });
        idx.sessions['s2'] = createTestSession({ id: 's2', resources: { worktree: 'feature-x' } });
      });

      const results = getCompletions('--worktree', 'c list --worktree ');
      assert.ok(results.includes('bugfix-123'));
      assert.ok(results.includes('feature-x'));
    });
  });

  describe('--tag completions', () => {
    it('returns tags from sessions', async () => {
      await updateIndex((idx) => {
        idx.sessions['s1'] = createTestSession({ id: 's1', tags: ['wip'] });
        idx.sessions['s2'] = createTestSession({ id: 's2', tags: ['done'] });
        idx.sessions['s3'] = createTestSession({ id: 's3', tags: ['blocked'] });
      });

      const results = getCompletions('--tag', 'c list --tag ');
      assert.ok(results.includes('wip'));
      assert.ok(results.includes('done'));
      assert.ok(results.includes('blocked'));
    });

    it('deduplicates tags across sessions', async () => {
      await updateIndex((idx) => {
        idx.sessions['s1'] = createTestSession({ id: 's1', tags: ['wip'] });
        idx.sessions['s2'] = createTestSession({ id: 's2', tags: ['wip'] });
      });

      const results = getCompletions('--tag', 'c list --tag ');
      assert.strictEqual(results.filter(r => r === 'wip').length, 1, 'should not duplicate tags');
    });
  });

  describe('--repo completions', () => {
    it('returns repo names from session directories', async () => {
      await updateIndex((idx) => {
        idx.sessions['s1'] = createTestSession({ id: 's1', directory: '/home/u/api' });
        idx.sessions['s2'] = createTestSession({ id: 's2', directory: '/home/u/web' });
      });

      const results = getCompletions('--repo', 'c list --repo ');
      assert.ok(results.includes('api'));
      assert.ok(results.includes('web'));
    });
  });

  describe('--directory completions', () => {
    it('returns directories from sessions', async () => {
      await updateIndex((idx) => {
        idx.sessions['s1'] = createTestSession({ id: 's1', directory: '/home/u/project-a' });
        idx.sessions['s2'] = createTestSession({ id: 's2', directory: '/home/u/project-b' });
      });

      const results = getCompletions('--dir', 'c list --dir ');
      assert.ok(results.includes('/home/u/project-a'));
      assert.ok(results.includes('/home/u/project-b'));
    });
  });

  describe('--branch completions', () => {
    it('returns branch names from sessions', async () => {
      await updateIndex((idx) => {
        idx.sessions['s1'] = createTestSession({ id: 's1', resources: { branch: 'main' } });
        idx.sessions['s2'] = createTestSession({ id: 's2', resources: { branch: 'feature/login' } });
      });

      const results = getCompletions('--branch', 'c list --branch ');
      assert.ok(results.includes('main'));
      assert.ok(results.includes('feature/login'));
    });

    it('skips sessions without branches', async () => {
      await updateIndex((idx) => {
        idx.sessions['s1'] = createTestSession({ id: 's1', resources: { branch: 'main' } });
        idx.sessions['s2'] = createTestSession({ id: 's2' }); // no branch
      });

      const results = getCompletions('--branch', 'c list --branch ');
      assert.strictEqual(results.length, 1);
      assert.ok(results.includes('main'));
    });
  });

  describe('subcommand flag completions', () => {
    it('returns list flags for list subcommand', () => {
      const results = getCompletions('--', 'c list --');
      assert.ok(results.includes('--state'));
      assert.ok(results.includes('--branch'));
      assert.ok(results.includes('--sort'));
      assert.ok(results.includes('--json'));
    });

    it('returns list flags for bare c (implicit list)', () => {
      const results = getCompletions('--', 'c --');
      assert.ok(results.includes('--state'));
      assert.ok(results.includes('--branch'));
    });
  });

  describe('session ID completions', () => {
    it('returns session IDs for show command', async () => {
      await updateIndex((idx) => {
        idx.sessions['abcd1234-full-uuid'] = createTestSession({ id: 'abcd1234-full-uuid', name: 'My Session' });
      });

      const results = getCompletions('a', 'c show a');
      assert.ok(results.includes('abcd1234'), 'should include short ID');
      assert.ok(results.includes('My Session'), 'should include session name');
    });

    it('returns session IDs for log command', async () => {
      await updateIndex((idx) => {
        idx.sessions['sess-001'] = createTestSession({ id: 'sess-001' });
      });

      const results = getCompletions('s', 'c log s');
      assert.ok(results.some(r => r.startsWith('sess')), 'should return session IDs for log command');
    });
  });

  describe('position-independent flag values', () => {
    it('handles flag values after other flags', () => {
      // Simulates: c list --sort name --branch <cursor>
      const results = getCompletions('--branch', 'c list --sort name --branch ');
      // Should return branch completions (empty set since no sessions seeded), not flags
      // The key assertion is that it doesn't return LIST_FLAGS
      assert.ok(!results.includes('--state'), 'should not return list flags when completing --branch value');
    });

    it('handles partial value after flag', async () => {
      await updateIndex((idx) => {
        idx.sessions['s1'] = createTestSession({ id: 's1', resources: { branch: 'feature/login' } });
        idx.sessions['s2'] = createTestSession({ id: 's2', resources: { branch: 'main' } });
      });

      // Simulates: c list --branch fea (partial typed)
      const results = getCompletions('fea', 'c list --branch fea');
      assert.ok(results.includes('feature/login'));
    });
  });
});
