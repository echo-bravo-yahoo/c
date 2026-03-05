/**
 * Tests for init command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { captureStdout } from '../setup.ts';
import { initCommand } from '../../src/commands/init.ts';

describe('c', () => {
  describe('commands', () => {
    describe('init', () => {
      let stdout: ReturnType<typeof captureStdout>;

      beforeEach(() => {
        stdout = captureStdout();
      });

      afterEach(() => {
        stdout.restore();
      });

      it('outputs a c() shell function', () => {
        initCommand();
        const output = stdout.output.join('');
        assert.ok(output.includes('c()') || output.includes('function c'));
      });

      it('delegates cd to c dir', () => {
        initCommand();
        const output = stdout.output.join('');
        assert.ok(output.includes('command c dir'));
        assert.ok(output.includes('builtin cd'));
      });

      it('passes non-cd commands through', () => {
        initCommand();
        const output = stdout.output.join('');
        assert.ok(output.includes('command c "$@"') || output.includes('command c $argv'));
      });
    });
  });
});
