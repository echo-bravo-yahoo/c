/**
 * Tests for per-session state directory
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let testDir: string;
let origCHome: string | undefined;

describe('c', () => {
  describe('store', () => {
    describe('session-state', () => {
      beforeEach(() => {
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c-state-test-'));
        origCHome = process.env.C_HOME;
        process.env.C_HOME = testDir;
      });

      afterEach(() => {
        if (origCHome === undefined) {
          delete process.env.C_HOME;
        } else {
          process.env.C_HOME = origCHome;
        }
        if (testDir && fs.existsSync(testDir)) {
          fs.rmSync(testDir, { recursive: true, force: true });
        }
      });

      describe('getSessionStateDir', () => {
        it('returns {C_HOME}/state/{sessionId}', async () => {
          const { getSessionStateDir } = await import('../../src/store/session-state.ts');
          assert.strictEqual(getSessionStateDir('sess-1'), path.join(testDir, 'state', 'sess-1'));
        });
      });

      describe('ensureSessionStateDir', () => {
        it('creates the state dir and parent with mode 0700', async () => {
          const { ensureSessionStateDir } = await import('../../src/store/session-state.ts');
          const dir = ensureSessionStateDir('sess-1');
          assert.ok(fs.existsSync(dir));
          assert.strictEqual(fs.statSync(dir).mode & 0o777, 0o700);
          assert.strictEqual(fs.statSync(path.join(testDir, 'state')).mode & 0o777, 0o700);
        });

        it('is idempotent', async () => {
          const { ensureSessionStateDir } = await import('../../src/store/session-state.ts');
          const first = ensureSessionStateDir('sess-1');
          const second = ensureSessionStateDir('sess-1');
          assert.strictEqual(first, second);
          assert.ok(fs.existsSync(first));
        });
      });

      describe('deleteSessionStateDir', () => {
        it('removes the state dir and all contents', async () => {
          const { ensureSessionStateDir, deleteSessionStateDir } = await import('../../src/store/session-state.ts');
          const dir = ensureSessionStateDir('sess-1');
          fs.writeFileSync(path.join(dir, 'status'), 'BRANCH=main\n');
          fs.mkdirSync(path.join(dir, 'creds'), { mode: 0o700 });
          fs.writeFileSync(path.join(dir, 'creds', 'TOKEN'), 'secret', { mode: 0o600 });

          deleteSessionStateDir('sess-1');
          assert.ok(!fs.existsSync(dir));
        });

        it('no-ops silently when state dir is missing', async () => {
          const { deleteSessionStateDir } = await import('../../src/store/session-state.ts');
          assert.doesNotThrow(() => deleteSessionStateDir('nonexistent'));
        });

        it('does not remove sibling session dirs', async () => {
          const { ensureSessionStateDir, deleteSessionStateDir } = await import('../../src/store/session-state.ts');
          const a = ensureSessionStateDir('sess-a');
          const b = ensureSessionStateDir('sess-b');
          deleteSessionStateDir('sess-a');
          assert.ok(!fs.existsSync(a));
          assert.ok(fs.existsSync(b));
        });
      });

      describe('migrateLegacyStateFiles', () => {
        it('moves ~/.c/status/<id> → ~/.c/state/<id>/status', async () => {
          const { migrateLegacyStateFiles } = await import('../../src/store/session-state.ts');
          const legacyStatus = path.join(testDir, 'status');
          fs.mkdirSync(legacyStatus, { recursive: true });
          fs.writeFileSync(path.join(legacyStatus, 'sess-a'), 'BRANCH=main\n');

          const moved = migrateLegacyStateFiles();
          assert.strictEqual(moved, 1);

          const dest = path.join(testDir, 'state', 'sess-a', 'status');
          assert.ok(fs.existsSync(dest));
          assert.strictEqual(fs.readFileSync(dest, 'utf-8'), 'BRANCH=main\n');
          assert.ok(!fs.existsSync(path.join(legacyStatus, 'sess-a')));
          assert.ok(!fs.existsSync(legacyStatus), 'legacy status dir is removed once empty');
        });

        it('moves ~/.c/refresh/<id>.json → ~/.c/state/<id>/refresh.json', async () => {
          const { migrateLegacyStateFiles } = await import('../../src/store/session-state.ts');
          const legacyRefresh = path.join(testDir, 'refresh');
          fs.mkdirSync(legacyRefresh, { recursive: true });
          fs.writeFileSync(path.join(legacyRefresh, 'sess-b.json'), '{"sessionId":"sess-b"}');

          const moved = migrateLegacyStateFiles();
          assert.strictEqual(moved, 1);

          const dest = path.join(testDir, 'state', 'sess-b', 'refresh.json');
          assert.ok(fs.existsSync(dest));
          assert.strictEqual(fs.readFileSync(dest, 'utf-8'), '{"sessionId":"sess-b"}');
          assert.ok(!fs.existsSync(legacyRefresh), 'legacy refresh dir is removed once empty');
        });

        it('is idempotent — second call migrates nothing', async () => {
          const { migrateLegacyStateFiles } = await import('../../src/store/session-state.ts');
          const legacyStatus = path.join(testDir, 'status');
          fs.mkdirSync(legacyStatus, { recursive: true });
          fs.writeFileSync(path.join(legacyStatus, 'sess-a'), 'BRANCH=main\n');

          assert.strictEqual(migrateLegacyStateFiles(), 1);
          assert.strictEqual(migrateLegacyStateFiles(), 0);
        });

        it('discards legacy copy when newer write already occurred under state dir', async () => {
          const { migrateLegacyStateFiles, ensureSessionStateDir } = await import('../../src/store/session-state.ts');
          const legacyStatus = path.join(testDir, 'status');
          fs.mkdirSync(legacyStatus, { recursive: true });
          fs.writeFileSync(path.join(legacyStatus, 'sess-a'), 'BRANCH=old\n');
          const newDir = ensureSessionStateDir('sess-a');
          fs.writeFileSync(path.join(newDir, 'status'), 'BRANCH=new\n');

          const moved = migrateLegacyStateFiles();
          assert.strictEqual(moved, 1);

          assert.strictEqual(fs.readFileSync(path.join(newDir, 'status'), 'utf-8'), 'BRANCH=new\n', 'new value preserved');
          assert.ok(!fs.existsSync(path.join(legacyStatus, 'sess-a')), 'legacy copy removed');
        });

        it('no-ops when legacy dirs do not exist', async () => {
          const { migrateLegacyStateFiles } = await import('../../src/store/session-state.ts');
          assert.strictEqual(migrateLegacyStateFiles(), 0);
        });

        it('skips non-.json files in refresh/', async () => {
          const { migrateLegacyStateFiles } = await import('../../src/store/session-state.ts');
          const legacyRefresh = path.join(testDir, 'refresh');
          fs.mkdirSync(legacyRefresh, { recursive: true });
          fs.writeFileSync(path.join(legacyRefresh, '.DS_Store'), '');
          fs.writeFileSync(path.join(legacyRefresh, 'notajson'), 'x');

          const moved = migrateLegacyStateFiles();
          assert.strictEqual(moved, 0);
          assert.ok(fs.existsSync(path.join(legacyRefresh, 'notajson')), 'non-json kept — dir not empty so not rmdir’d');
        });
      });

      describe('listSessionStateIds', () => {
        it('lists all session ids with a state dir', async () => {
          const { ensureSessionStateDir, listSessionStateIds } = await import('../../src/store/session-state.ts');
          ensureSessionStateDir('sess-a');
          ensureSessionStateDir('sess-b');
          ensureSessionStateDir('sess-c');

          const ids = listSessionStateIds();
          assert.strictEqual(ids.length, 3);
          assert.ok(ids.includes('sess-a'));
          assert.ok(ids.includes('sess-b'));
          assert.ok(ids.includes('sess-c'));
        });

        it('returns empty array when state root is missing', async () => {
          const { listSessionStateIds } = await import('../../src/store/session-state.ts');
          assert.deepStrictEqual(listSessionStateIds(), []);
        });

        it('excludes dotfiles', async () => {
          const { ensureSessionStateDir, listSessionStateIds } = await import('../../src/store/session-state.ts');
          ensureSessionStateDir('real-session');
          fs.writeFileSync(path.join(testDir, 'state', '.DS_Store'), '');

          const ids = listSessionStateIds();
          assert.strictEqual(ids.length, 1);
          assert.ok(ids.includes('real-session'));
          assert.ok(!ids.includes('.DS_Store'));
        });
      });
    });
  });
});
