/**
 * Shared temp-store setup for hook and command tests that need
 * an isolated C_HOME directory with a fresh index.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resetIndexCache } from '../../src/store/index.ts';
import { resetSessionCounter } from '../fixtures/sessions.ts';

export interface TempStore {
  tmpDir: string;
  cleanup: () => void;
}

/**
 * Create a temporary C_HOME directory and wire it into process.env.
 * Call cleanup() in afterEach to restore the original environment.
 */
export function setupTempStore(): TempStore {
  resetSessionCounter();
  const tmpDir = mkdtempSync(join(tmpdir(), 'c-test-'));
  const savedCHome = process.env.C_HOME;
  process.env.C_HOME = tmpDir;

  // Neutralize ambient session-suppression vars so the test environment is
  // hermetic. Claude Code sessions export C_EPHEMERAL=1 (and may set C_SKIP),
  // which make registerNewSession a no-op and short-circuit hooks — that would
  // break any test that creates a session and asserts it was registered.
  // Tests that exercise these vars set them explicitly after setup and restore
  // them in their own afterEach, so clearing the ambient baseline here is safe.
  const savedEphemeral = process.env.C_EPHEMERAL;
  const savedSkip = process.env.C_SKIP;
  delete process.env.C_EPHEMERAL;
  delete process.env.C_SKIP;

  resetIndexCache();

  return {
    tmpDir,
    cleanup: () => {
      if (savedCHome !== undefined) {
        process.env.C_HOME = savedCHome;
      } else {
        delete process.env.C_HOME;
      }
      if (savedEphemeral !== undefined) {
        process.env.C_EPHEMERAL = savedEphemeral;
      } else {
        delete process.env.C_EPHEMERAL;
      }
      if (savedSkip !== undefined) {
        process.env.C_SKIP = savedSkip;
      } else {
        delete process.env.C_SKIP;
      }
      rmSync(tmpDir, { recursive: true, force: true });
      resetIndexCache();
    },
  };
}
