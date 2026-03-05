/**
 * Tests for PR detection - pure functions only
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractPRFromOutput, getPRNumber } from '../../src/detection/pr.ts';

describe('c', () => {
  describe('detection', () => {
    describe('pr', () => {
      describe('extractPRFromOutput', () => {
        it('extracts GitHub PR URL from output', () => {
          const output = 'Creating pull request...\nhttps://github.com/user/repo/pull/123\nDone!';
          const result = extractPRFromOutput(output);
          assert.strictEqual(result, 'https://github.com/user/repo/pull/123');
        });

        it('extracts PR URL with large number', () => {
          const output = 'PR: https://github.com/org/project/pull/99999';
          const result = extractPRFromOutput(output);
          assert.strictEqual(result, 'https://github.com/org/project/pull/99999');
        });

        it('returns undefined when no PR URL', () => {
          const output = 'Command completed successfully';
          const result = extractPRFromOutput(output);
          assert.strictEqual(result, undefined);
        });

        it('returns undefined for empty output', () => {
          const result = extractPRFromOutput('');
          assert.strictEqual(result, undefined);
        });

        it('finds URL mid-text', () => {
          const output = 'Check https://github.com/foo/bar/pull/42 for details';
          const result = extractPRFromOutput(output);
          assert.strictEqual(result, 'https://github.com/foo/bar/pull/42');
        });

        it('returns first URL when multiple present', () => {
          const output = 'https://github.com/a/b/pull/1\nhttps://github.com/c/d/pull/2';
          const result = extractPRFromOutput(output);
          assert.strictEqual(result, 'https://github.com/a/b/pull/1');
        });

        it('ignores issue URLs', () => {
          const output = 'See https://github.com/user/repo/issues/123';
          const result = extractPRFromOutput(output);
          assert.strictEqual(result, undefined);
        });
      });

      describe('getPRNumber', () => {
        it('extracts number from PR URL', () => {
          const result = getPRNumber('https://github.com/user/repo/pull/123');
          assert.strictEqual(result, 123);
        });

        it('extracts large PR number', () => {
          const result = getPRNumber('https://github.com/org/project/pull/99999');
          assert.strictEqual(result, 99999);
        });

        it('returns undefined for invalid URL', () => {
          const result = getPRNumber('https://github.com/user/repo');
          assert.strictEqual(result, undefined);
        });

        it('returns undefined for issue URL', () => {
          const result = getPRNumber('https://github.com/user/repo/issues/123');
          assert.strictEqual(result, undefined);
        });

        it('returns undefined for malformed URL', () => {
          const result = getPRNumber('not a url');
          assert.strictEqual(result, undefined);
        });

        it('returns undefined for empty string', () => {
          const result = getPRNumber('');
          assert.strictEqual(result, undefined);
        });

        it('ignores trailing path segments', () => {
          const result = getPRNumber('https://github.com/user/repo/pull/456/files');
          assert.strictEqual(result, 456);
        });
      });
    });
  });
});
