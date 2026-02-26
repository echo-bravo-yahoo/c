/**
 * Tests for exec utilities
 *
 * Note: exec and execReplace are tested indirectly through detection/git tests
 * since they wrap child_process which is hard to mock in ESM
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { exec } from '../../src/util/exec.js';

describe('c > util > exec > exec', () => {
  it('returns trimmed stdout', () => {
    const result = exec('echo "hello world"');
    assert.strictEqual(result, 'hello world');
  });

  it('trims leading whitespace', () => {
    const result = exec('echo "  leading"');
    assert.strictEqual(result, 'leading');
  });

  it('trims trailing whitespace', () => {
    const result = exec('echo "trailing  "');
    assert.strictEqual(result, 'trailing');
  });

  it('returns empty string on failure', () => {
    const result = exec('nonexistent_command_xyz 2>/dev/null');
    assert.strictEqual(result, '');
  });

  it('returns empty string on error exit code', () => {
    const result = exec('exit 1');
    assert.strictEqual(result, '');
  });

  it('respects cwd option', () => {
    const result = exec('pwd', { cwd: '/tmp' });
    assert.ok(result.includes('tmp') || result.includes('private/tmp')); // macOS uses /private/tmp
  });

  it('handles multiline output', () => {
    const result = exec('printf "line1\\nline2"');
    assert.strictEqual(result, 'line1\nline2');
  });
});
