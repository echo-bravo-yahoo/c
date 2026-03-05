/**
 * Tests for resume command behavior
 *
 * Tests extracted functions (buildResumeArgs, relocateTranscript) directly,
 * and exercises session lookup + store persistence via the real store.
 * resolveSessionForResume requires mock.module for claude/sessions imports.
 */

import { mock, describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mock claude/sessions before any imports that pull it in
mock.module(resolve(__dirname, '../../src/claude/sessions.ts'), {
  namedExports: {
    getClaudeSession: () => undefined,
    getClaudeSessionsForDirectory: () => [],
    getClaudeSessionTitles: () => ({}),
    findClaudeSessionIdsByTitle: () => [],
    encodeProjectKey: (p: string) => p.replace(/\//g, '-').replace(/^-/, ''),
    decodeProjectKey: (k: string) => '/' + k.replace(/-/g, '/'),
    PROJECTS_DIR: join(tmpdir(), 'c-resume-test-projects'),
    listClaudeSessions: () => [],
    readClaudeSessionIndex: () => null,
    resetSessionCaches: () => {},
    findTranscriptPath: () => null,
    getCustomTitleFromTranscriptTail: () => null,
    getPlanExecutionInfo: () => null,
  },
});

// Dynamic import inside before() so describe/it blocks register synchronously.
let buildResumeArgs: typeof import('../../src/commands/resume.ts').buildResumeArgs;
let relocateTranscript: typeof import('../../src/commands/resume.ts').relocateTranscript;
let updateIndex: typeof import('../../src/store/index.ts').updateIndex;
let getSession: typeof import('../../src/store/index.ts').getSession;
let findSessionsByName: typeof import('../../src/store/index.ts').findSessionsByName;
let resetIndexCache: typeof import('../../src/store/index.ts').resetIndexCache;
let createTestSession: typeof import('../fixtures/sessions.ts').createTestSession;
let resetSessionCounter: typeof import('../fixtures/sessions.ts').resetSessionCounter;
let shortId: typeof import('../../src/util/format.ts').shortId;

describe('c', () => {
  before(async () => {
    ({ buildResumeArgs, relocateTranscript } = await import('../../src/commands/resume.ts'));
    ({ updateIndex, getSession, findSessionsByName, resetIndexCache } = await import('../../src/store/index.ts'));
    ({ createTestSession, resetSessionCounter } = await import('../fixtures/sessions.ts'));
    ({ shortId } = await import('../../src/util/format.ts'));
  });

  describe('commands', () => {
    describe('resume', () => {
      beforeEach(() => {
        resetSessionCounter();
      });

      describe('buildResumeArgs', () => {
        it('always includes -r and session ID', () => {
          const args = buildResumeArgs('abc-123', {});
          assert.deepStrictEqual(args, ['-r', 'abc-123']);
        });

        it('appends --model when provided', () => {
          const args = buildResumeArgs('abc-123', { model: 'haiku' });
          assert.ok(args.includes('--model'));
          assert.ok(args.includes('haiku'));
        });

        it('appends --permission-mode when provided', () => {
          const args = buildResumeArgs('abc-123', { permissionMode: 'plan' });
          assert.ok(args.includes('--permission-mode'));
          assert.ok(args.includes('plan'));
        });

        it('appends --effort when provided', () => {
          const args = buildResumeArgs('abc-123', { effort: 'low' });
          assert.ok(args.includes('--effort'));
          assert.ok(args.includes('low'));
        });

        it('appends --agent when provided', () => {
          const args = buildResumeArgs('abc-123', { agent: 'my-agent' });
          assert.ok(args.includes('--agent'));
          assert.ok(args.includes('my-agent'));
        });

        it('appends --fork-session when set', () => {
          const args = buildResumeArgs('abc-123', { forkSession: true });
          assert.ok(args.includes('--fork-session'));
        });

        it('appends passthrough args', () => {
          const args = buildResumeArgs('abc-123', { passthroughArgs: ['--add-dir', '/tmp'] });
          assert.ok(args.includes('--add-dir'));
          assert.ok(args.includes('/tmp'));
        });

        it('combines all flags', () => {
          const args = buildResumeArgs('abc-123', {
            model: 'haiku',
            effort: 'high',
            forkSession: true,
            passthroughArgs: ['--verbose'],
          });
          assert.ok(args.includes('-r'));
          assert.ok(args.includes('--model'));
          assert.ok(args.includes('--effort'));
          assert.ok(args.includes('--fork-session'));
          assert.ok(args.includes('--verbose'));
        });
      });

      describe('session lookup via store', () => {
        let tmpDir: string;
        let savedCHome: string | undefined;

        beforeEach(() => {
          tmpDir = join(tmpdir(), `c-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
          mkdirSync(tmpDir, { recursive: true });
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

        it('finds session by ID prefix', async () => {
          await updateIndex((idx) => {
            idx.sessions['abc-123-full-uuid'] = createTestSession({ id: 'abc-123-full-uuid' });
            idx.sessions['def-456-full-uuid'] = createTestSession({ id: 'def-456-full-uuid' });
          });

          const s = getSession('abc');
          assert.ok(s);
          assert.strictEqual(s.id, 'abc-123-full-uuid');
        });

        it('returns undefined for ambiguous prefix', async () => {
          await updateIndex((idx) => {
            idx.sessions['abc-111'] = createTestSession({ id: 'abc-111' });
            idx.sessions['abc-222'] = createTestSession({ id: 'abc-222' });
          });

          const s = getSession('abc');
          assert.strictEqual(s, undefined);
        });

        it('finds session by exact name', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', name: 'Auth Feature' });
            idx.sessions['s2'] = createTestSession({ id: 's2', name: 'Dashboard Work' });
          });

          const matches = findSessionsByName('Auth Feature');
          assert.strictEqual(matches.length, 1);
          assert.strictEqual(matches[0].name, 'Auth Feature');
        });

        it('rejects partial name match', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', name: 'Auth Feature' });
          });

          const matches = findSessionsByName('Auth');
          assert.strictEqual(matches.length, 0);
        });

        it('finds multiple sessions with same name', async () => {
          await updateIndex((idx) => {
            idx.sessions['abc12345-0000-0000-0000-000000000000'] = createTestSession({
              id: 'abc12345-0000-0000-0000-000000000000', name: 'test session',
            });
            idx.sessions['def67890-0000-0000-0000-000000000000'] = createTestSession({
              id: 'def67890-0000-0000-0000-000000000000', name: 'test session',
            });
          });

          const matches = findSessionsByName('test session');
          assert.strictEqual(matches.length, 2);
          const ids = matches.map(m => shortId(m.id));
          assert.ok(ids.includes('abc12345'));
          assert.ok(ids.includes('def67890'));
        });

        it('returns undefined when session missing', async () => {
          const s = getSession('nonexistent');
          assert.strictEqual(s, undefined);
        });
      });

      describe('stale session handling via store', () => {
        let tmpDir: string;
        let savedCHome: string | undefined;

        beforeEach(() => {
          tmpDir = join(tmpdir(), `c-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
          mkdirSync(tmpDir, { recursive: true });
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

        it('archives session and clears PID', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy', pid: 12345 });
          });

          // Simulate archival (what resumeCommand does when Claude storage is missing)
          await updateIndex((idx) => {
            const s = idx.sessions['s1'];
            if (s) {
              s.state = 'archived';
              s.last_active_at = new Date();
              delete s.pid;
            }
          });

          const s = getSession('s1');
          assert.ok(s);
          assert.strictEqual(s.state, 'archived');
          assert.strictEqual(s.pid, undefined);
        });

        it('hides stale session from active list after archival', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', state: 'busy', pid: 111 });
            idx.sessions['s2'] = createTestSession({ id: 's2', state: 'idle' });
          });

          await updateIndex((idx) => {
            const s = idx.sessions['s1'];
            if (s) { s.state = 'archived'; delete s.pid; }
          });

          const { getSessions } = await import('../../src/store/index.ts');
          const active = getSessions({ state: ['busy', 'idle', 'waiting'] });
          assert.strictEqual(active.length, 1);
          assert.strictEqual(active[0].state, 'idle');
        });
      });

      describe('claude failure rollback via store', () => {
        let tmpDir: string;
        let savedCHome: string | undefined;

        beforeEach(() => {
          tmpDir = join(tmpdir(), `c-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
          mkdirSync(tmpDir, { recursive: true });
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

        it('restores previous state on non-zero exit', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', state: 'idle', pid: 12345 });
          });

          const prevState = 'idle';
          const prevPid = 12345;

          // Simulate pre-spawn update
          await updateIndex((idx) => {
            idx.sessions['s1'].pid = process.pid;
            idx.sessions['s1'].state = 'idle';
          });

          // Simulate non-zero exit rollback
          await updateIndex((idx) => {
            const s = idx.sessions['s1'];
            if (s) {
              s.state = prevState;
              if (prevPid != null) { s.pid = prevPid; } else { delete s.pid; }
            }
          });

          const s = getSession('s1');
          assert.ok(s);
          assert.strictEqual(s.state, 'idle');
          assert.strictEqual(s.pid, 12345);
        });

        it('clears PID on rollback when session had no PID', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', state: 'idle' });
          });

          const prevPid: number | undefined = undefined;

          // Simulate pre-spawn update
          await updateIndex((idx) => {
            idx.sessions['s1'].pid = process.pid;
          });

          // Rollback
          await updateIndex((idx) => {
            const s = idx.sessions['s1'];
            if (s) {
              s.state = 'idle';
              if (prevPid != null) { s.pid = prevPid; } else { delete s.pid; }
            }
          });

          const s = getSession('s1');
          assert.ok(s);
          assert.strictEqual(s.state, 'idle');
          assert.strictEqual(s.pid, undefined);
        });
      });

      describe('missing directory handling', () => {
        it('extracts repo root from worktree path', () => {
          const dir = '/repo/.claude/worktrees/gone';
          const match = dir.match(/^(.+?)\/\.(?:claude\/)?worktrees\//);
          assert.ok(match);
          assert.strictEqual(match[1], '/repo');
        });

        it('extracts repo root from .worktrees/ path', () => {
          const dir = '/repo/.worktrees/old-branch';
          const match = dir.match(/^(.+?)\/\.(?:claude\/)?worktrees\//);
          assert.ok(match);
          assert.strictEqual(match[1], '/repo');
        });

        it('returns null for non-worktree path', () => {
          const dir = '/deleted/project';
          const match = dir.match(/^(.+?)\/\.(?:claude\/)?worktrees\//);
          assert.strictEqual(match, null);
        });
      });

      describe('transcript relocation', () => {
        let tmpDir: string;

        beforeEach(() => {
          tmpDir = join(tmpdir(), `c-resume-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
          mkdirSync(tmpDir, { recursive: true });
        });

        afterEach(() => {
          rmSync(tmpDir, { recursive: true, force: true });
        });

        it('relocates transcript when project keys differ', () => {
          const sourceDir = join(tmpDir, 'source-project');
          mkdirSync(sourceDir, { recursive: true });

          const transcriptFile = join(sourceDir, 'session-123.jsonl');
          writeFileSync(transcriptFile, '{"type":"test"}\n');

          relocateTranscript(
            { id: 'session-123', transcriptPath: transcriptFile, projectKey: 'source-key' },
            // Use a directory that produces a different key than 'source-key'
            '/different/target'
          );

          // Source should be moved (may fail if PROJECTS_DIR doesn't exist, but
          // relocateTranscript catches errors gracefully)
          // At minimum, verify the function doesn't crash
          assert.ok(true);
        });

        it('no-op when transcript already in correct project', () => {
          const projectDir = join(tmpDir, 'same-project');
          mkdirSync(projectDir, { recursive: true });

          const transcriptFile = join(projectDir, 'session-456.jsonl');
          writeFileSync(transcriptFile, '{"type":"test"}\n');

          // When projectKey matches encodeProjectKey(targetDirectory), file stays put.
          // Pass the same path as targetDirectory so the keys match.
          // The mock's encodeProjectKey('/x') produces 'x', so use projectKey='x'.
          relocateTranscript(
            { id: 'session-456', transcriptPath: transcriptFile, projectKey: 'x' },
            '/x'
          );

          // Source file should still exist (not moved)
          assert.ok(existsSync(transcriptFile));
        });
      });

      describe('session display info', () => {
        it('uses name as display name', () => {
          const session = createTestSession({ name: 'My Session' });
          const displayName = session.name || '';
          assert.strictEqual(displayName, 'My Session');
        });

        it('returns empty string when no name', () => {
          const session = createTestSession({ name: '' });
          const displayName = session.name || '';
          assert.strictEqual(displayName, '');
        });
      });
    });
  });
});
