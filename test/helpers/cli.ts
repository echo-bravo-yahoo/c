/**
 * Shared CLI test harness — runs commands through createProgram().parseAsync()
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProgram } from '../../src/index.ts';
import { captureConsole, captureStdout, mockProcessExit, stripAnsi } from '../setup.ts';
import { updateIndex, getSession, readIndex, resetIndexCache } from '../../src/store/index.ts';
import { resetGitHubCache } from '../../src/detection/github.ts';
import { resetGitCaches } from '../../src/detection/git.ts';
import { createTestSession, resetSessionCounter } from '../fixtures/sessions.ts';
import type { SessionOverrides } from '../fixtures/sessions.ts';

export interface CLIHarness {
  tmpDir: string;
  console: { logs: string[]; errors: string[] };
  stdout: { output: string[] };
  exit: { exitCode: number | null };
  run: (...args: string[]) => Promise<void>;
  cleanup: () => void;
  seed: (...specs: SessionOverrides[]) => Promise<void>;
  session: (id: string) => ReturnType<typeof getSession>;
  index: () => ReturnType<typeof readIndex>;
}

export { stripAnsi };

export function setupCLI(): CLIHarness {
  const tmpDir = mkdtempSync(join(tmpdir(), 'c-test-'));
  const savedCHome = process.env.C_HOME;
  process.env.C_HOME = tmpDir;
  resetSessionCounter();

  // Accumulated output across all run() calls within one test
  const logs: string[] = [];
  const errors: string[] = [];
  const stdoutOutput: string[] = [];
  let lastExitCode: number | null = null;

  return {
    tmpDir,
    console: { logs, errors },
    stdout: { output: stdoutOutput },
    exit: { get exitCode() { return lastExitCode; } },

    async run(...args: string[]) {
      const program = createProgram();
      program.exitOverride();

      // Capture console/stdout/exit only during command execution to avoid
      // intercepting the test runner's own output.
      const consoleMock = captureConsole();
      const stdoutMock = captureStdout();
      const exitMock = mockProcessExit();

      // Suppress unhandled rejections from process.exit mock throws that
      // propagate through Commander's secondary error handling chain.
      const onReject = () => {};
      process.on('unhandledRejection', onReject);

      try {
        await program.parseAsync(['node', 'c', ...args]);
      } catch {
        // Commander's exitOverride throws CommanderError on unknown commands
        // and process.exit mock throws to halt execution — swallow both
        // when the exit code was already captured.
        if (exitMock.exitCode !== null) return;
      } finally {
        // Flush microtask queue so any pending rejections from Commander's
        // error handling are caught by our listener before we remove it.
        await new Promise((r) => setTimeout(r, 0));
        process.removeListener('unhandledRejection', onReject);
        consoleMock.restore();
        stdoutMock.restore();
        exitMock.restore();
        logs.push(...consoleMock.logs);
        errors.push(...consoleMock.errors);
        stdoutOutput.push(...stdoutMock.output);
        if (exitMock.exitCode !== null) lastExitCode = exitMock.exitCode;
      }
    },

    async seed(...specs: SessionOverrides[]) {
      await updateIndex((idx) => {
        for (const spec of specs) {
          const s = createTestSession(spec);
          idx.sessions[s.id] = s;
        }
      });
    },

    session(id: string) {
      return getSession(id);
    },

    index() {
      return readIndex();
    },

    cleanup() {
      process.env.C_HOME = savedCHome;
      if (savedCHome === undefined) delete process.env.C_HOME;
      rmSync(tmpDir, { recursive: true, force: true });
      resetIndexCache();
      resetGitHubCache();
      resetGitCaches();
    },
  };
}
