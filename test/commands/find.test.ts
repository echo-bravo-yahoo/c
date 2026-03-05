/**
 * Tests for find command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { setupCLI, type CLIHarness } from '../helpers/cli.js';

describe('c', () => {
  describe('commands', () => {
    describe('find', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); });
      afterEach(() => { cli.cleanup(); });

      describe('search fields', () => {
        it('matches session ID', async () => {
          await cli.seed({ id: 'abc-123-uuid' });
          await cli.run('find', 'abc');

          assert.ok(cli.console.logs.some(l => l.includes('abc')));
        });

        it('matches name', async () => {
          await cli.seed({ id: 'sess1', name: 'My Important Session' });
          await cli.run('find', 'important');

          assert.ok(cli.console.logs.some(l => l.includes('Important')));
        });

        it('matches directory', async () => {
          await cli.seed({ id: 'sess1', directory: '/home/user/myproject' });
          await cli.run('find', 'myproject');

          assert.ok(cli.console.logs.some(l => l.includes('myproject')));
        });

        it('matches branch', async () => {
          await cli.seed({ id: 'sess1', resources: { branch: 'feature/awesome-thing' } });
          await cli.run('find', 'awesome');

          assert.ok(cli.console.logs.some(l => l.includes('awesome')));
        });

        it('matches PR URL', async () => {
          await cli.seed({ id: 'sess1', resources: { pr: 'https://github.com/org/repo/pull/42' } });
          await cli.run('find', 'pull/42');

          assert.ok(cli.console.logs.length > 0);
        });

        it('matches JIRA ticket', async () => {
          await cli.seed({ id: 'sess1', resources: { jira: 'MAC-123' } });
          await cli.run('find', 'mac-123');

          assert.ok(cli.console.logs.length > 0);
        });

        it('matches tags', async () => {
          await cli.seed({ id: 'sess1', tags: ['important', 'wip'] });
          await cli.run('find', 'important');

          assert.ok(cli.console.logs.length > 0);
        });

        it('matches meta keys', async () => {
          await cli.seed({ id: 'sess1', meta: { priority: 'high' } });
          await cli.run('find', 'priority');

          assert.ok(cli.console.logs.length > 0);
        });

        it('matches meta values', async () => {
          await cli.seed({ id: 'sess1', meta: { status: 'in-review' } });
          await cli.run('find', 'review');

          assert.ok(cli.console.logs.length > 0);
        });
      });

      describe('case sensitivity', () => {
        it('ignores case', async () => {
          await cli.seed({ id: 'sess1', name: 'My Important Session' });

          await cli.run('find', 'IMPORTANT');
          assert.ok(cli.console.logs.length > 0);
        });
      });

      describe('partial matching', () => {
        it('matches partial strings', async () => {
          await cli.seed({ id: 'sess1', name: 'authentication-feature' });
          await cli.run('find', 'auth');

          assert.ok(cli.console.logs.length > 0);
        });
      });

      describe('no matches', () => {
        it('returns nothing when query misses', async () => {
          await cli.seed({ id: 'sess1', name: 'Session A' });
          await cli.seed({ id: 'sess2', name: 'Session B' });
          await cli.run('find', 'nonexistent');

          // When no matches, printSessionTable outputs "No sessions" or empty
          const output = cli.console.logs.join('\n');
          assert.ok(!output.includes('Session A'));
          assert.ok(!output.includes('Session B'));
        });
      });

      describe('multiple matches', () => {
        it('returns all matching sessions', async () => {
          await cli.seed({ id: 'sess1', name: 'Auth Feature' });
          await cli.seed({ id: 'sess2', name: 'Authentication Bug' });
          await cli.seed({ id: 'sess3', name: 'User Profile' });
          await cli.run('find', 'auth');

          const output = cli.console.logs.join('\n');
          assert.ok(output.includes('Auth'));
          assert.ok(!output.includes('Profile'));
        });
      });

      describe('--json output', () => {
        it('outputs matching sessions as JSON array', async () => {
          await cli.seed({ id: 'sess1', name: 'Auth Feature' });
          await cli.seed({ id: 'sess2', name: 'Dashboard' });
          await cli.run('find', 'auth', '--json');

          const raw = cli.stdout.output.join('');
          const arr = JSON.parse(raw) as { id: string }[];
          assert.ok(Array.isArray(arr));
          assert.strictEqual(arr.length, 1);
          assert.strictEqual(arr[0].id, 'sess1');
        });
      });

      describe('optional fields', () => {
        it('tolerates missing resources', async () => {
          await cli.seed({ id: 'sess1', resources: {} });
          await cli.run('find', 'branch');

          // Should not crash
          assert.strictEqual(cli.exit.exitCode, null);
        });

        it('tolerates empty meta', async () => {
          await cli.seed({ id: 'sess1', meta: {} });
          await cli.run('find', 'meta');

          assert.strictEqual(cli.exit.exitCode, null);
        });

        it('tolerates empty tags', async () => {
          await cli.seed({ id: 'sess1', tags: [] });
          await cli.run('find', 'tag');

          assert.strictEqual(cli.exit.exitCode, null);
        });
      });
    });
  });
});
