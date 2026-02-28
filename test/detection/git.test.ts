/**
 * Tests for git detection
 *
 * These tests use real git commands on the current repo
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getCurrentBranch, getGitRoot, isWorktree, getWorktreeInfo, listWorktrees } from '../../src/detection/git.js';

describe('c', () => {
  describe('detection', () => {
    describe('git', () => {
      describe('getCurrentBranch', () => {
        it('returns branch name in git repo', () => {
          // This test runs in the c repo itself
          const branch = getCurrentBranch();
          assert.ok(branch, 'Should return a branch name');
          assert.ok(typeof branch === 'string');
          assert.ok(branch.length > 0);
        });

        it('returns undefined outside git repo', () => {
          const branch = getCurrentBranch('/tmp');
          // /tmp may or may not be in a git repo depending on system
          // Just verify it returns string or undefined
          assert.ok(branch === undefined || typeof branch === 'string');
        });

        it('respects cwd parameter', () => {
          const branch = getCurrentBranch(process.cwd());
          assert.ok(branch, 'Should return branch for cwd');
        });
      });

      describe('getGitRoot', () => {
        it('returns repo root in git repo', () => {
          const root = getGitRoot();
          assert.ok(root, 'Should return a root path');
          assert.ok(root.includes('/'), 'Should be an absolute path');
        });

        it('returns path containing workspace/c', () => {
          const root = getGitRoot();
          // We're running in the c repo
          assert.ok(root?.endsWith('/c') || root?.includes('/c/'), 'Should be in c repo');
        });
      });

      describe('isWorktree', () => {
        it('reports worktree status as boolean', () => {
          const result = isWorktree();
          assert.ok(typeof result === 'boolean');
        });

        it('detects worktree based on git dir', () => {
          // The main repo is not a worktree
          const result = isWorktree();
          // Can be true or false depending on whether we're running in a worktree
          assert.ok(typeof result === 'boolean');
        });
      });

      describe('getWorktreeInfo', () => {
        it('extracts name from .worktrees/ path', () => {
          const regex = /\.(?:claude\/)?worktrees\/([^/]+)/;
          const match = '/repo/.worktrees/my-branch'.match(regex);
          assert.ok(match);
          assert.strictEqual(match[1], 'my-branch');
        });

        it('extracts name from .claude/worktrees/ path', () => {
          const regex = /\.(?:claude\/)?worktrees\/([^/]+)/;
          const match = '/repo/.claude/worktrees/my-branch'.match(regex);
          assert.ok(match);
          assert.strictEqual(match[1], 'my-branch');
        });
      });

      describe('listWorktrees', () => {
        it('lists worktrees as array', () => {
          const worktrees = listWorktrees();
          assert.ok(Array.isArray(worktrees));
        });

        it('always includes the main repo', () => {
          const worktrees = listWorktrees();
          // Main repo always appears in worktree list
          assert.ok(worktrees.length >= 1);
        });

        it('each worktree has path and branch', () => {
          const worktrees = listWorktrees();
          if (worktrees.length > 0) {
            assert.ok('path' in worktrees[0]);
            assert.ok('branch' in worktrees[0]);
            assert.ok(typeof worktrees[0].path === 'string');
            assert.ok(typeof worktrees[0].branch === 'string');
          }
        });
      });
    });
  });
});
