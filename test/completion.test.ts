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
      assert.ok(results.includes('--repos'));
    });

    it('returns list flags for bare c (implicit list)', () => {
      const results = getCompletions('--', 'c --');
      assert.ok(results.includes('--state'));
      assert.ok(results.includes('--branch'));
    });

    it('returns new flags for new subcommand', () => {
      const results = getCompletions('--', 'c new --');
      assert.ok(results.includes('--jira'));
      assert.ok(results.includes('--pr'));
      assert.ok(results.includes('--branch'));
      assert.ok(results.includes('--note'));
      assert.ok(results.includes('--meta'));
      assert.ok(results.includes('--no-worktree'));
      assert.ok(results.includes('--ephemeral'));
      assert.ok(results.includes('--model'));
      assert.ok(results.includes('--permission-mode'));
      assert.ok(results.includes('--effort'));
      assert.ok(results.includes('--agent'));
      assert.ok(!results.includes('--json'), 'must not leak flags from other commands');
      assert.ok(!results.includes('--sort'), 'must not leak list flags');
      assert.ok(!results.includes('--fork-session'), 'must not leak resume flags');
    });

    it('returns resume flags for resume subcommand', () => {
      const results = getCompletions('--', 'c resume --');
      assert.ok(results.includes('--model'));
      assert.ok(results.includes('--permission-mode'));
      assert.ok(results.includes('--effort'));
      assert.ok(results.includes('--agent'));
      assert.ok(results.includes('--fork-session'));
      assert.ok(!results.includes('--jira'), 'must not include new-only flags');
      assert.ok(!results.includes('--json'), 'must not include show-only flags');
    });

    it('returns show flags for show subcommand', () => {
      const results = getCompletions('--', 'c show --');
      assert.ok(results.includes('--json'));
      assert.strictEqual(results.length, 1, 'show has exactly one flag');
    });

    it('returns find flags for find subcommand', () => {
      const results = getCompletions('--', 'c find --');
      assert.ok(results.includes('--json'));
    });

    it('returns close flags for close subcommand', () => {
      const results = getCompletions('--', 'c close --');
      assert.ok(results.includes('--archive'));
      assert.ok(results.includes('-a'));
    });

    it('returns link flags for link subcommand', () => {
      const results = getCompletions('--', 'c link --');
      assert.ok(results.includes('--pr'));
      assert.ok(results.includes('--jira'));
      assert.ok(results.includes('--branch'));
    });

    it('returns unlink flags for unlink subcommand', () => {
      const results = getCompletions('--', 'c unlink --');
      assert.ok(results.includes('--pr'));
      assert.ok(results.includes('--jira'));
      assert.ok(results.includes('--branch'));
    });

    it('returns open flags for open subcommand', () => {
      const results = getCompletions('--', 'c open --');
      assert.ok(results.includes('--pr'));
      assert.ok(results.includes('--jira'));
    });

    it('returns log flags for log subcommand', () => {
      const results = getCompletions('--', 'c log --');
      assert.ok(results.includes('--lines'));
      assert.ok(results.includes('-n'));
      assert.ok(results.includes('--prompts'));
      assert.ok(results.includes('--tail'));
    });

    it('returns memory flags for memory subcommand', () => {
      const results = getCompletions('--', 'c memory --');
      assert.ok(results.includes('--raw'));
    });

    it('returns delete flags for delete subcommand', () => {
      const results = getCompletions('--', 'c delete --');
      assert.ok(results.includes('--orphans'));
      assert.ok(results.includes('--closed'));
    });

    it('returns bankruptcy flags for bankruptcy subcommand', () => {
      const results = getCompletions('--', 'c bankruptcy --');
      assert.ok(results.includes('--skip'));
    });

    it('returns empty for commands with no flags', () => {
      for (const cmd of ['archive', 'tag', 'untag', 'rename', 'name', 'meta', 'dir', 'repair', 'stats']) {
        const results = getCompletions('--', `c ${cmd} --`);
        assert.strictEqual(results.length, 0, `${cmd} should have no flag completions`);
      }
    });
  });

  describe('single dash triggers flag completions', () => {
    it('returns flags when typing single dash', () => {
      const results = getCompletions('-', 'c new -');
      assert.ok(results.includes('--jira'), 'single dash should trigger flag completions');
      assert.ok(results.includes('--no-worktree'));
    });

    it('returns list flags for bare c with single dash', () => {
      const results = getCompletions('-', 'c -');
      assert.ok(results.includes('--state'));
      assert.ok(results.includes('--sort'));
    });
  });

  describe('flag completion after prior flags (position-independent)', () => {
    it('returns flags after a prior flag-value pair', () => {
      const results = getCompletions('--', 'c new --jira PROJ-123 --');
      assert.ok(results.includes('--pr'), 'should still offer remaining flags');
      assert.ok(results.includes('--model'));
    });

    it('returns list flags after prior flag-value pair', () => {
      const results = getCompletions('--', 'c list --state busy --');
      assert.ok(results.includes('--sort'));
      assert.ok(results.includes('--branch'));
    });
  });

  describe('positional completions not broken by flag detection', () => {
    it('returns session IDs when not typing a flag on session command', async () => {
      await updateIndex((idx) => {
        idx.sessions['abcd1234-uuid'] = createTestSession({ id: 'abcd1234-uuid', name: 'Test' });
      });

      const results = getCompletions('s', 'c show s');
      assert.ok(!results.includes('--json'), 'must not return flags for positional args');
      assert.ok(results.includes('abcd1234') || results.includes('Test'), 'should return session completions');
    });

    it('returns subcommand completions for bare c with no dash', () => {
      const results = getCompletions('c', 'c ');
      assert.ok(results.includes('--state'), 'bare c positional should return list flags');
    });

    it('tag positional completions still work', async () => {
      await updateIndex((idx) => {
        idx.sessions['s1'] = createTestSession({ id: 's1', tags: ['wip'] });
      });

      const results = getCompletions('w', 'c tag w');
      assert.ok(results.includes('wip'), 'should return tag completions for positional');
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

  describe('flag value completions still work', () => {
    it('returns state values for --state', () => {
      const results = getCompletions('--state', 'c list --state ');
      assert.ok(results.includes('busy'));
      assert.ok(!results.includes('--sort'), 'must not return flag names');
    });

    it('returns sort values mid-line', () => {
      const results = getCompletions('--sort', 'c list --branch main --sort ');
      assert.ok(results.includes('active'));
      assert.ok(results.includes('created'));
    });

    it('handles partial value after flag', async () => {
      await updateIndex((idx) => {
        idx.sessions['s1'] = createTestSession({ id: 's1', resources: { branch: 'feature/login' } });
        idx.sessions['s2'] = createTestSession({ id: 's2', resources: { branch: 'main' } });
      });

      const results = getCompletions('fea', 'c list --branch fea');
      assert.ok(results.includes('feature/login'));
    });
  });
});
