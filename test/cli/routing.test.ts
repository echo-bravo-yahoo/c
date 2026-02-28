/**
 * CLI routing integration tests
 * Spawns the CLI as a subprocess to verify Commander routing behavior.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI_PATH = join(import.meta.dirname, '..', '..', 'src', 'index.ts');

function run(...args: string[]) {
  const tmpHome = mkdtempSync(join(tmpdir(), 'c-test-'));
  return spawnSync('node', ['--import', 'tsx', CLI_PATH, ...args], {
    env: { ...process.env, HOME: tmpHome },
    timeout: 10_000,
    encoding: 'utf-8',
  });
}

describe('c', () => {
  describe('cli', () => {
    describe('routing', () => {
      it('exits 1 on unknown command', () => {
        const result = run('nonexistent');
        assert.strictEqual(result.status, 1);
        assert.match(result.stderr, /unknown command/i);
      });

      it('rejects "prune"', () => {
        const result = run('prune');
        assert.strictEqual(result.status, 1);
        assert.match(result.stderr, /unknown command/i);
      });

      it('runs list', () => {
        const result = run('list');
        assert.strictEqual(result.status, 0);
      });

      it('runs --help', () => {
        const result = run('--help');
        assert.strictEqual(result.status, 0);
      });

      it('runs --version', () => {
        const result = run('--version');
        assert.strictEqual(result.status, 0);
      });
    });
  });
});
