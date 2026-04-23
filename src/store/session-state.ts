/**
 * Per-session state directory
 *
 * Every tracked session gets one directory at ${C_HOME:-~/.c}/state/<session-id>/.
 * `c` itself parks `status` (sourceable) and `refresh.json` here; external
 * consumers (e.g. cc-cred) park their own files under namespace-style
 * subdirectories. Lifecycle is owned by `c`: the directory is created lazily
 * on first use and removed during SessionEnd and reconcileStaleSessions.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function getStoreDir(): string {
  return process.env.C_HOME || path.join(os.homedir(), '.c');
}

function getStateRoot(): string {
  return path.join(getStoreDir(), 'state');
}

export function getSessionStateDir(sessionId: string): string {
  return path.join(getStateRoot(), sessionId);
}

export function ensureSessionStateDir(sessionId: string): string {
  const dir = getSessionStateDir(sessionId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(getStateRoot(), 0o700);
    fs.chmodSync(dir, 0o700);
  } catch {
    // best effort
  }
  return dir;
}

export function deleteSessionStateDir(sessionId: string): void {
  try {
    fs.rmSync(getSessionStateDir(sessionId), { recursive: true, force: true });
  } catch {
    // silent on ENOENT or missing parent
  }
}

export function listSessionStateIds(): string[] {
  try {
    return fs.readdirSync(getStateRoot()).filter((f) => !f.startsWith('.'));
  } catch {
    return [];
  }
}

/**
 * One-shot migration from the pre-state-dir layout.
 *
 * Older `c` stored per-session data at ~/.c/status/<id> (sourceable statusline
 * cache) and ~/.c/refresh/<id>.json. After the state-dir refactor, both live
 * under ~/.c/state/<id>/. This function moves any remaining legacy files to
 * their new homes so the upgrade is transparent — existing statuslines keep
 * working without waiting for the next post-bash hook to rewrite the cache.
 *
 * Idempotent: safe to call on every session start. Returns the number of files
 * migrated (useful for tests and debug logging).
 */
export function migrateLegacyStateFiles(): number {
  let moved = 0;
  const store = getStoreDir();

  const migrateDir = (legacyName: string, destFilename: string, toId: (name: string) => string | null) => {
    const legacyDir = path.join(store, legacyName);
    if (!fs.existsSync(legacyDir)) return;
    let entries: string[];
    try {
      entries = fs.readdirSync(legacyDir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith('.')) continue;
      const id = toId(name);
      if (id === null) continue;
      const src = path.join(legacyDir, name);
      try {
        if (!fs.statSync(src).isFile()) continue;
      } catch {
        continue;
      }
      const destDir = ensureSessionStateDir(id);
      const dest = path.join(destDir, destFilename);
      try {
        if (fs.existsSync(dest)) {
          // Newer write already occurred under the state dir; discard legacy copy.
          fs.unlinkSync(src);
        } else {
          fs.renameSync(src, dest);
        }
        moved++;
      } catch {
        // Skip files we can't migrate — next call will retry.
      }
    }
    try {
      fs.rmdirSync(legacyDir);
    } catch {
      // Non-empty or permission issue — leave it; won't re-migrate its files next time.
    }
  };

  migrateDir('status', 'status', (name) => name);
  migrateDir('refresh', 'refresh.json', (name) => name.endsWith('.json') ? name.slice(0, -'.json'.length) : null);

  return moved;
}
