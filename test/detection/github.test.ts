/**
 * Tests for GitHub username detection
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  parseGitHubUsername,
  dehyphenate,
  matchesUsernamePrefix,
} from '../../src/detection/github.js';

describe('c', () => {
  describe('detection', () => {
    describe('github', () => {
      describe('parseGitHubUsername', () => {
        it('identifies gh username', () => {
          const output = '  ✓ Logged in to github.com account echo-bravo-yahoo (keyring)';
          assert.strictEqual(parseGitHubUsername(output), 'echo-bravo-yahoo');
        });

        it('returns undefined without login line', () => {
          assert.strictEqual(parseGitHubUsername('not logged in'), undefined);
        });

        it('finds username in multiline output', () => {
          const output = `github.com
  ✓ Logged in to github.com account myuser (keyring)
  ✓ Git operations protocol: https`;
          assert.strictEqual(parseGitHubUsername(output), 'myuser');
        });

        it('finds username regardless of auth method', () => {
          const output = '  ✓ Logged in to github.com account testuser (oauth_token)';
          assert.strictEqual(parseGitHubUsername(output), 'testuser');
        });
      });

      describe('dehyphenate', () => {
        it('removes hyphens from string', () => {
          assert.strictEqual(dehyphenate('echo-bravo-yahoo'), 'echobravoyahoo');
        });

        it('passes through unhyphenated strings', () => {
          assert.strictEqual(dehyphenate('username'), 'username');
        });

        it('handles empty string', () => {
          assert.strictEqual(dehyphenate(''), '');
        });

        it('handles multiple consecutive hyphens', () => {
          assert.strictEqual(dehyphenate('a--b---c'), 'abc');
        });
      });

      describe('matchesUsernamePrefix', () => {
        it('matches exact username with slash separator', () => {
          const result = matchesUsernamePrefix('echo-bravo-yahoo/feature', 'echo-bravo-yahoo');
          assert.deepStrictEqual(result, { matches: true, prefix: 'echo-bravo-yahoo' });
        });

        it('matches dehyphenated username with slash', () => {
          const result = matchesUsernamePrefix('echobravoyahoo/feature', 'echo-bravo-yahoo');
          assert.deepStrictEqual(result, { matches: true, prefix: 'echobravoyahoo' });
        });

        it('matches case insensitively', () => {
          const result = matchesUsernamePrefix('Echo-Bravo-Yahoo/feature', 'echo-bravo-yahoo');
          assert.deepStrictEqual(result, { matches: true, prefix: 'Echo-Bravo-Yahoo' });
        });

        it('matches with hyphen separator after username', () => {
          const result = matchesUsernamePrefix('echo-bravo-yahoo-feature', 'echo-bravo-yahoo');
          assert.deepStrictEqual(result, { matches: true, prefix: 'echo-bravo-yahoo' });
        });

        it('does not match partial username', () => {
          const result = matchesUsernamePrefix('echo-bravo/feature', 'echo-bravo-yahoo');
          assert.deepStrictEqual(result, { matches: false, prefix: '' });
        });

        it('does not match without separator', () => {
          const result = matchesUsernamePrefix('echo-bravo-yahoofeature', 'echo-bravo-yahoo');
          assert.deepStrictEqual(result, { matches: false, prefix: '' });
        });

        it('matches dehyphenated with hyphen separator', () => {
          const result = matchesUsernamePrefix('echobravoyahoo-feature', 'echo-bravo-yahoo');
          assert.deepStrictEqual(result, { matches: true, prefix: 'echobravoyahoo' });
        });

        it('does not match when username is substring of branch name', () => {
          const result = matchesUsernamePrefix('myusername/feature', 'user');
          assert.deepStrictEqual(result, { matches: false, prefix: '' });
        });
      });
    });
  });
});
