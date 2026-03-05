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
