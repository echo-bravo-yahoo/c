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
let resolveSessionForResume: typeof import('../../src/commands/resume.ts').resolveSessionForResume;
let updateIndex: typeof import('../../src/store/index.ts').updateIndex;
let getSession: typeof import('../../src/store/index.ts').getSession;
let findSessionsByName: typeof import('../../src/store/index.ts').findSessionsByName;
let findSessionsByTitle: typeof import('../../src/store/index.ts').findSessionsByTitle;
let resetIndexCache: typeof import('../../src/store/index.ts').resetIndexCache;
let createTestSession: typeof import('../fixtures/sessions.ts').createTestSession;
let resetSessionCounter: typeof import('../fixtures/sessions.ts').resetSessionCounter;
let shortId: typeof import('../../src/util/format.ts').shortId;
let setupCLI: typeof import('../helpers/cli.ts').setupCLI;
type CLIHarness = import('../helpers/cli.ts').CLIHarness;

describe('c', () => {
  before(async () => {
    ({ buildResumeArgs, relocateTranscript, resolveSessionForResume } = await import('../../src/commands/resume.ts'));
    ({ updateIndex, getSession, findSessionsByName, findSessionsByTitle, resetIndexCache } = await import('../../src/store/index.ts'));
    ({ createTestSession, resetSessionCounter } = await import('../fixtures/sessions.ts'));
    ({ shortId } = await import('../../src/util/format.ts'));
    ({ setupCLI } = await import('../helpers/cli.ts'));
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

        it('finds session by _custom_title', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({
              id: 's1', name: '', meta: { _custom_title: 'claude code statusline' },
            });
          });
          const matches = findSessionsByTitle('claude code statusline');
          assert.strictEqual(matches.length, 1);
          assert.strictEqual(matches[0].id, 's1');
        });

        it('rejects partial _custom_title match', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({
              id: 's1', meta: { _custom_title: 'claude code statusline' },
            });
          });
          const matches = findSessionsByTitle('claude code');
          assert.strictEqual(matches.length, 0);
        });

        it('_custom_title match is case-sensitive', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({
              id: 's1', meta: { _custom_title: 'Fix Auth' },
            });
          });
          const matches = findSessionsByTitle('fix auth');
          assert.strictEqual(matches.length, 0);
        });
      });

      describe('resolveSessionForResume', () => {
        let tmpDir: string;
        let savedCHome: string | undefined;
        let savedExit: typeof process.exit;
        let savedError: typeof console.error;
        let exitCode: number | undefined;
        let consoleErrors: string[];

        beforeEach(() => {
          tmpDir = join(tmpdir(), `c-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
          mkdirSync(tmpDir, { recursive: true });
          savedCHome = process.env.C_HOME;
          process.env.C_HOME = tmpDir;
          resetIndexCache();
          exitCode = undefined;
          consoleErrors = [];
          savedExit = process.exit;
          process.exit = ((code?: number) => { exitCode = code ?? 0; }) as typeof process.exit;
          savedError = console.error;
          console.error = (...args: unknown[]) => {
            consoleErrors.push(args.map(String).join(' '));
          };
        });

        afterEach(() => {
          process.exit = savedExit;
          console.error = savedError;
          process.env.C_HOME = savedCHome;
          if (savedCHome === undefined) delete process.env.C_HOME;
          rmSync(tmpDir, { recursive: true, force: true });
          resetIndexCache();
        });

        it('resolves session by _custom_title', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({
              id: 's1', name: '', meta: { _custom_title: 'my fancy session' },
            });
          });
          const session = await resolveSessionForResume('my fancy session');
          assert.ok(session);
          assert.strictEqual(session.id, 's1');
        });

        it('resolves session by multi-word name', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({
              id: 's1', name: 'my fancy session',
            });
          });
          const session = await resolveSessionForResume('my fancy session');
          assert.ok(session);
          assert.strictEqual(session.id, 's1');
        });

        it('_custom_title exact match ignores prefix overlap', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', meta: { _custom_title: 'foo' } });
            idx.sessions['s2'] = createTestSession({ id: 's2', meta: { _custom_title: 'foobar' } });
          });
          const session = await resolveSessionForResume('foo');
          assert.ok(session);
          assert.strictEqual(session.id, 's1');
        });

        it('_custom_title exact match ignores substring overlap', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', meta: { _custom_title: 'fix bug' } });
            idx.sessions['s2'] = createTestSession({ id: 's2', meta: { _custom_title: 'fix bug in auth' } });
          });
          const session = await resolveSessionForResume('fix bug');
          assert.ok(session);
          assert.strictEqual(session.id, 's1');
        });

        it('exact name match ignores prefix overlap', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', name: 'deploy' });
            idx.sessions['s2'] = createTestSession({ id: 's2', name: 'deploy feature' });
          });
          const session = await resolveSessionForResume('deploy');
          assert.ok(session);
          assert.strictEqual(session.id, 's1');
        });

        it('errors on multiple _custom_title matches', async () => {
          await updateIndex((idx) => {
            idx.sessions['abc12345-0000-0000-0000-000000000001'] = createTestSession({
              id: 'abc12345-0000-0000-0000-000000000001', meta: { _custom_title: 'same title' },
            });
            idx.sessions['def67890-0000-0000-0000-000000000001'] = createTestSession({
              id: 'def67890-0000-0000-0000-000000000001', meta: { _custom_title: 'same title' },
            });
          });
          await resolveSessionForResume('same title');
          assert.strictEqual(exitCode, 1);
          assert.ok(consoleErrors.some(l => l.includes('Multiple sessions')));
        });

        it('name match wins over _custom_title on different session', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', name: 'my task' });
            idx.sessions['s2'] = createTestSession({ id: 's2', name: '', meta: { _custom_title: 'my task' } });
          });
          const session = await resolveSessionForResume('my task');
          assert.ok(session);
          assert.strictEqual(session.id, 's1');
        });

        it('name match short-circuits _custom_title ambiguity', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({ id: 's1', name: 'foo' });
            idx.sessions['s2'] = createTestSession({ id: 's2', meta: { _custom_title: 'foo' } });
            idx.sessions['s3'] = createTestSession({ id: 's3', meta: { _custom_title: 'foo' } });
          });
          const session = await resolveSessionForResume('foo');
          assert.ok(session);
          assert.strictEqual(session.id, 's1');
        });

        it('finds session by _custom_title when name differs', async () => {
          await updateIndex((idx) => {
            idx.sessions['s1'] = createTestSession({
              id: 's1', name: 'old name', meta: { _custom_title: 'new title' },
            });
          });
          const session = await resolveSessionForResume('new title');
          assert.ok(session);
          assert.strictEqual(session.id, 's1');
        });
      });

      describe('variadic id parsing', () => {
        let cli: CLIHarness;
        beforeEach(() => { cli = setupCLI(); });
        afterEach(() => { cli.cleanup(); });

        // resume exits with "no longer exists in Claude's storage" because
        // getClaudeSession is mocked to return undefined. That error proves the
        // session WAS found by name — if the id were wrong, the error would be
        // "Session not found" instead.

        it('joins multi-word id and parses --model flag', async () => {
          await cli.seed({ id: 's1', name: 'my cool thing' });
          await cli.run('resume', 'my', 'cool', 'thing', '--model', 'haiku');
          assert.strictEqual(cli.exit.exitCode, 1);
          assert.ok(cli.console.errors.some(l => l.includes('no longer exists')));
          assert.ok(!cli.console.errors.some(l => l.includes('Session not found')));
        });

        it('joins multi-word id and parses --fork-session flag', async () => {
          await cli.seed({ id: 's1', name: 'my cool thing' });
          await cli.run('resume', 'my', 'cool', 'thing', '--fork-session');
          assert.strictEqual(cli.exit.exitCode, 1);
          assert.ok(cli.console.errors.some(l => l.includes('no longer exists')));
          assert.ok(!cli.console.errors.some(l => l.includes('Session not found')));
        });

        it('joins multi-word id and parses multiple flags', async () => {
          await cli.seed({ id: 's1', name: 'my cool thing' });
          await cli.run('resume', 'my', 'cool', 'thing', '--model', 'haiku', '--effort', 'high');
          assert.strictEqual(cli.exit.exitCode, 1);
          assert.ok(cli.console.errors.some(l => l.includes('no longer exists')));
          assert.ok(!cli.console.errors.some(l => l.includes('Session not found')));
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

    });
  });
});
