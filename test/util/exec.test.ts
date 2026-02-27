/**
 * Tests for exec utilities
 *
 * Note: exec and execReplace are tested indirectly through detection/git tests
 * since they wrap child_process which is hard to mock in ESM
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { exec, setTmuxPaneTitle } from '../../src/util/exec.js';

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

describe('c > util > exec > setTmuxPaneTitle', () => {
  let originalTmux: string | undefined;

  beforeEach(() => {
    originalTmux = process.env.TMUX;
  });

  afterEach(() => {
    if (originalTmux === undefined) {
      delete process.env.TMUX;
    } else {
      process.env.TMUX = originalTmux;
    }
  });

  it('sets title and locks it when TMUX is set', () => {
    process.env.TMUX = '/tmp/tmux-1000/default,12345,0';
    const commands: string[] = [];
    const mockExec = (cmd: string) => { commands.push(cmd); };

    setTmuxPaneTitle('My Session', mockExec);

    assert.strictEqual(commands.length, 2);
    assert.strictEqual(commands[0], 'tmux select-pane -T "My Session"');
    assert.strictEqual(commands[1], 'tmux set -p allow-set-title off');
  });

  it('does not call tmux when TMUX is not set', () => {
    delete process.env.TMUX;
    const commands: string[] = [];
    const mockExec = (cmd: string) => { commands.push(cmd); };

    setTmuxPaneTitle('My Session', mockExec);

    assert.strictEqual(commands.length, 0);
  });

  it('escapes special characters in title', () => {
    process.env.TMUX = '/tmp/tmux-1000/default,12345,0';
    const commands: string[] = [];
    const mockExec = (cmd: string) => { commands.push(cmd); };

    setTmuxPaneTitle('Session "with" quotes', mockExec);

    assert.strictEqual(commands[0], 'tmux select-pane -T "Session \\"with\\" quotes"');
  });

  it('does not throw when tmux command fails', () => {
    process.env.TMUX = '/tmp/tmux-1000/default,12345,0';
    const mockExec = () => { throw new Error('tmux not found'); };

    // Should not throw
    assert.doesNotThrow(() => {
      setTmuxPaneTitle('My Session', mockExec);
    });
  });
});
