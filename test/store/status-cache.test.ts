/**
 * Tests for status cache read/write/delete
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

let testDir: string;
let origCHome: string | undefined;

describe('c', () => {
  describe('store', () => {
    describe('status-cache', () => {
      beforeEach(() => {
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c-cache-test-'));
        origCHome = process.env.C_HOME;
        process.env.C_HOME = testDir;
      });

      afterEach(() => {
        if (origCHome === undefined) {
          delete process.env.C_HOME;
        } else {
          process.env.C_HOME = origCHome;
        }
        if (testDir && fs.existsSync(testDir)) {
          fs.rmSync(testDir, { recursive: true, force: true });
        }
      });

      describe('writeStatusCache', () => {
        it('creates status/ subdirectory if missing', async () => {
          const { writeStatusCache } = await import('../../src/store/status-cache.js');
          writeStatusCache('test-session', { branch: 'main' });
          assert.ok(fs.existsSync(path.join(testDir, 'status')));
        });

        it('writes cache file at {C_HOME}/status/{sessionId}', async () => {
          const { writeStatusCache } = await import('../../src/store/status-cache.js');
          writeStatusCache('test-session', { branch: 'main' });
          const cachePath = path.join(testDir, 'status', 'test-session');
          assert.ok(fs.existsSync(cachePath));
        });

        it('includes BRANCH line when resources.branch is set', async () => {
          const { writeStatusCache } = await import('../../src/store/status-cache.js');
          writeStatusCache('test-session', { branch: 'feature/auth' });
          const content = fs.readFileSync(path.join(testDir, 'status', 'test-session'), 'utf-8');
          assert.ok(content.includes('BRANCH=feature/auth'));
        });

        it('includes REPO line when repo is set', async () => {
          const { writeStatusCache } = await import('../../src/store/status-cache.js');
          writeStatusCache('test-session', { repo: 'org/repo' });
          const content = fs.readFileSync(path.join(testDir, 'status', 'test-session'), 'utf-8');
          assert.ok(content.includes('REPO=org/repo'));
        });

        it('includes JIRA and JIRA_BASE lines when resources.jira is set', async () => {
          const { writeStatusCache } = await import('../../src/store/status-cache.js');
          writeStatusCache('test-session', {
            jira: 'PROJ-123',
            jira_base: 'https://machinify.atlassian.net',
          });
          const content = fs.readFileSync(path.join(testDir, 'status', 'test-session'), 'utf-8');
          assert.ok(content.includes('JIRA=PROJ-123'));
          assert.ok(content.includes('JIRA_BASE=https://machinify.atlassian.net'));
        });

        it('includes PR line when resources.pr is set', async () => {
          const { writeStatusCache } = await import('../../src/store/status-cache.js');
          writeStatusCache('test-session', { pr: 'https://github.com/org/repo/pull/42' });
          const content = fs.readFileSync(path.join(testDir, 'status', 'test-session'), 'utf-8');
          assert.ok(content.includes('PR=https://github.com/org/repo/pull/42'));
        });

        it('includes WORKTREE and WORKTREE_PATH lines when set', async () => {
          const { writeStatusCache } = await import('../../src/store/status-cache.js');
          writeStatusCache('test-session', {
            worktree: 'my-worktree',
            worktree_path: '/Users/user/repo/.claude/worktrees/my-worktree',
          });
          const content = fs.readFileSync(path.join(testDir, 'status', 'test-session'), 'utf-8');
          assert.ok(content.includes('WORKTREE=my-worktree'));
          assert.ok(content.includes('WORKTREE_PATH=/Users/user/repo/.claude/worktrees/my-worktree'));
        });

        it('omits lines for empty/undefined fields', async () => {
          const { writeStatusCache } = await import('../../src/store/status-cache.js');
          writeStatusCache('test-session', { branch: 'main' });
          const content = fs.readFileSync(path.join(testDir, 'status', 'test-session'), 'utf-8');
          assert.ok(!content.includes('REPO='));
          assert.ok(!content.includes('JIRA='));
          assert.ok(!content.includes('PR='));
          assert.ok(!content.includes('WORKTREE='));
        });

        it('overwrites existing cache file on re-write', async () => {
          const { writeStatusCache } = await import('../../src/store/status-cache.js');
          writeStatusCache('test-session', { branch: 'old-branch' });
          writeStatusCache('test-session', { branch: 'new-branch' });
          const content = fs.readFileSync(path.join(testDir, 'status', 'test-session'), 'utf-8');
          assert.ok(content.includes('BRANCH=new-branch'));
          assert.ok(!content.includes('old-branch'));
        });

        it('file is sourceable by bash (no special chars unescaped)', async () => {
          const { writeStatusCache } = await import('../../src/store/status-cache.js');
          writeStatusCache('test-session', {
            branch: "feature/it's-a-test",
            repo: 'org/repo',
            jira: 'PROJ-123',
          });
          const cachePath = path.join(testDir, 'status', 'test-session');
          // Source the file in bash and echo a variable to verify it's valid
          const result = execSync(`source "${cachePath}" && echo "$BRANCH"`, {
            encoding: 'utf-8',
            shell: '/bin/bash',
          }).trim();
          assert.strictEqual(result, "feature/it's-a-test");
        });
      });

      describe('deleteStatusCache', () => {
        it('deletes existing cache file', async () => {
          const { writeStatusCache, deleteStatusCache } = await import('../../src/store/status-cache.js');
          writeStatusCache('test-session', { branch: 'main' });
          const cachePath = path.join(testDir, 'status', 'test-session');
          assert.ok(fs.existsSync(cachePath));

          deleteStatusCache('test-session');
          assert.ok(!fs.existsSync(cachePath));
        });

        it('no-ops silently when file does not exist', async () => {
          const { writeStatusCache, deleteStatusCache } = await import('../../src/store/status-cache.js');
          // Create status dir but not the file
          writeStatusCache('other-session', { branch: 'main' });
          assert.doesNotThrow(() => deleteStatusCache('nonexistent-session'));
        });

        it('no-ops silently when status/ directory does not exist', async () => {
          const { deleteStatusCache } = await import('../../src/store/status-cache.js');
          // testDir exists but has no status/ subdir
          assert.doesNotThrow(() => deleteStatusCache('nonexistent-session'));
        });
      });
    });
  });
});
