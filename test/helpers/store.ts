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
  resetIndexCache();

  return {
    tmpDir,
    cleanup: () => {
      if (savedCHome !== undefined) {
        process.env.C_HOME = savedCHome;
      } else {
        delete process.env.C_HOME;
      }
      rmSync(tmpDir, { recursive: true, force: true });
      resetIndexCache();
    },
  };
}
