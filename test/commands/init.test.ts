/**
 * Tests for init command
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { initCommand } from '../../src/commands/init.js';

describe('c', () => {
  describe('commands', () => {
    describe('init', () => {
      it('outputs a c() shell function', () => {
        const chunks: string[] = [];
        const origWrite = process.stdout.write;
        process.stdout.write = ((chunk: string) => {
          chunks.push(chunk);
          return true;
        }) as typeof process.stdout.write;

        try {
          initCommand();
        } finally {
          process.stdout.write = origWrite;
        }

        const output = chunks.join('');
        assert.ok(output.includes('c()') || output.includes('function c'));
      });

      it('delegates cd to c dir', () => {
        const chunks: string[] = [];
        const origWrite = process.stdout.write;
        process.stdout.write = ((chunk: string) => {
          chunks.push(chunk);
          return true;
        }) as typeof process.stdout.write;

        try {
          initCommand();
        } finally {
          process.stdout.write = origWrite;
        }

        const output = chunks.join('');
        assert.ok(output.includes('command c dir'));
        assert.ok(output.includes('builtin cd'));
      });

      it('passes non-cd commands through', () => {
        const chunks: string[] = [];
        const origWrite = process.stdout.write;
        process.stdout.write = ((chunk: string) => {
          chunks.push(chunk);
          return true;
        }) as typeof process.stdout.write;

        try {
          initCommand();
        } finally {
          process.stdout.write = origWrite;
        }

        const output = chunks.join('');
        assert.ok(output.includes('command c "$@"') || output.includes('command c $argv'));
      });
    });
  });
});
