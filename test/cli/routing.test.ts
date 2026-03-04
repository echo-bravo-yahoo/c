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
      it('routes unknown positional to implicit list', () => {
        const result = run('nonexistent');
        assert.strictEqual(result.status, 0);
      });

      it('routes "prune" to implicit list', () => {
        const result = run('prune');
        assert.strictEqual(result.status, 0);
      });

      it('runs list', () => {
        const result = run('list');
        assert.strictEqual(result.status, 0);
      });

      it('runs --help', () => {
        const result = run('--help');
        assert.strictEqual(result.status, 0);
      });

      it('shows Claude Code options section in new --help', () => {
        const result = run('new', '--help');
        assert.strictEqual(result.status, 0);
        const output = result.stdout;
        assert.ok(output.includes('Claude Code options:'));
        assert.ok(output.includes('--model'));
        assert.ok(output.includes('--permission-mode'));
        // --model should appear after the Claude Code heading, not in default Options
        const [defaultSection] = output.split('Claude Code options:');
        assert.ok(!defaultSection.includes('--model'));
      });

      it('shows Claude Code options section in resume --help', () => {
        const result = run('resume', '--help');
        assert.strictEqual(result.status, 0);
        const output = result.stdout;
        assert.ok(output.includes('Claude Code options:'));
        assert.ok(output.includes('--fork-session'));
        assert.ok(output.includes('--model'));
      });

      it('runs --version', () => {
        const result = run('--version');
        assert.strictEqual(result.status, 0);
      });
    });
  });
});
