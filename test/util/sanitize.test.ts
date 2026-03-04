/**
 * Tests for worktree name sanitization
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeWorktreeName } from '../../src/util/sanitize.js';

describe('c', () => {
  describe('util', () => {
    describe('sanitizeWorktreeName', () => {
      it('replaces spaces with hyphens', () => {
        assert.strictEqual(sanitizeWorktreeName('my cool feature'), 'my-cool-feature');
      });

      it('replaces colons with hyphens', () => {
        assert.strictEqual(sanitizeWorktreeName('fix: the bug'), 'fix-the-bug');
      });

      it('replaces multiple illegal chars with single hyphen', () => {
        assert.strictEqual(sanitizeWorktreeName('a~^:b'), 'a-b');
      });

      it('collapses double dots', () => {
        assert.strictEqual(sanitizeWorktreeName('a..b'), 'a.b');
      });

      it('strips leading and trailing dots', () => {
        assert.strictEqual(sanitizeWorktreeName('.foo.'), 'foo');
      });

      it('removes trailing .lock', () => {
        assert.strictEqual(sanitizeWorktreeName('test.lock'), 'test');
      });

      it('passes through valid names unchanged', () => {
        assert.strictEqual(sanitizeWorktreeName('feature/MAC-123-thing'), 'feature/MAC-123-thing');
      });

      it('returns empty string for all-illegal input', () => {
        assert.strictEqual(sanitizeWorktreeName('***'), '');
      });

      it('replaces backslashes with hyphens', () => {
        assert.strictEqual(sanitizeWorktreeName('path\\to\\thing'), 'path-to-thing');
      });

      it('replaces @{ sequence', () => {
        assert.strictEqual(sanitizeWorktreeName('foo@{bar}'), 'foo-bar');
      });

      it('collapses consecutive hyphens from multiple replacements', () => {
        assert.strictEqual(sanitizeWorktreeName('a - - b'), 'a-b');
      });

      it('collapses consecutive slashes', () => {
        assert.strictEqual(sanitizeWorktreeName('a//b'), 'a/b');
      });

      it('strips leading hyphens and slashes', () => {
        assert.strictEqual(sanitizeWorktreeName('--foo'), 'foo');
      });

      it('strips trailing hyphens', () => {
        assert.strictEqual(sanitizeWorktreeName('foo--'), 'foo');
      });

      it('handles question marks and asterisks', () => {
        assert.strictEqual(sanitizeWorktreeName('what?no*way'), 'what-no-way');
      });

      it('handles square brackets', () => {
        assert.strictEqual(sanitizeWorktreeName('test[0]'), 'test-0');
      });

      it('preserves simple alphanumeric names', () => {
        assert.strictEqual(sanitizeWorktreeName('bugfix'), 'bugfix');
      });

      it('preserves names with hyphens and numbers', () => {
        assert.strictEqual(sanitizeWorktreeName('MAC-123-fix-bug'), 'MAC-123-fix-bug');
      });
    });
  });
});
