/**
 * Tests for Claude Code settings reader
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readClaudeModelAlias } from '../../src/claude/settings.ts';

describe('c', () => {
  describe('claude', () => {
    describe('settings', () => {
      let tmpDir: string;
      let savedHome: string;

      beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'c-settings-test-'));
        savedHome = process.env.HOME!;
        process.env.HOME = tmpDir;
      });

      afterEach(() => {
        process.env.HOME = savedHome;
        rmSync(tmpDir, { recursive: true, force: true });
      });

      function writeGlobal(model: string): void {
        const dir = join(tmpDir, '.claude');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'settings.json'), JSON.stringify({ model }));
      }

      function writeProject(cwd: string, model: string): void {
        const dir = join(cwd, '.claude');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'settings.json'), JSON.stringify({ model }));
      }

      function writeLocal(cwd: string, model: string): void {
        const dir = join(cwd, '.claude');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'settings.local.json'), JSON.stringify({ model }));
      }

      describe('readClaudeModelAlias', () => {
        it('reads model from global settings', () => {
          writeGlobal('opus[1m]');
          assert.strictEqual(readClaudeModelAlias('/nonexistent'), 'opus[1m]');
        });

        it('project setting overrides global', () => {
          const cwd = join(tmpDir, 'project');
          mkdirSync(cwd, { recursive: true });
          writeGlobal('sonnet');
          writeProject(cwd, 'opus[1m]');
          assert.strictEqual(readClaudeModelAlias(cwd), 'opus[1m]');
        });

        it('local setting overrides project', () => {
          const cwd = join(tmpDir, 'project');
          mkdirSync(cwd, { recursive: true });
          writeGlobal('sonnet');
          writeProject(cwd, 'opus');
          writeLocal(cwd, 'opus[1m]');
          assert.strictEqual(readClaudeModelAlias(cwd), 'opus[1m]');
        });

        it('returns null when no model set', () => {
          assert.strictEqual(readClaudeModelAlias('/nonexistent'), null);
        });

        it('skips files with invalid JSON', () => {
          const dir = join(tmpDir, '.claude');
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, 'settings.json'), 'not json');
          assert.strictEqual(readClaudeModelAlias('/nonexistent'), null);
        });
      });
    });
  });
});
