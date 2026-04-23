/**
 * TOML-based session index store
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import TOML from '@iarna/toml';
import { createDefaultIndex } from './schema.ts';
import type { IndexFile, Session, SessionState } from './schema.ts';

// --- Process-level cache for readIndex ---

let _indexCache: IndexFile | null = null;

/**
 * Reset index cache (for testing)
 */
export function resetIndexCache(): void {
  _indexCache = null;
}

export function getStoreDir(): string {
  return process.env.C_HOME || path.join(os.homedir(), '.c');
}
function getIndexPath(): string {
  return path.join(getStoreDir(), 'index.toml');
}
function getLockPath(): string {
  return path.join(getStoreDir(), 'index.lock');
}

/**
 * Ensure the index directory exists
 */
function ensureDir(): void {
  if (!fs.existsSync(getStoreDir())) {
    fs.mkdirSync(getStoreDir(), { recursive: true });
  }
}

/**
 * Get a simple file lock (with timeout)
 */
async function acquireLock(timeout = 5000): Promise<() => void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      fs.writeFileSync(getLockPath(), String(process.pid), { flag: 'wx' });
      return () => {
        try {
          fs.unlinkSync(getLockPath());
        } catch {
          // Lock already released
        }
      };
    } catch {
      // Lock exists, check if stale
      try {
        const lockPid = fs.readFileSync(getLockPath(), 'utf-8').trim();
        // Check if process is still running
        try {
          process.kill(Number(lockPid), 0);
          // Process exists, wait and retry
          await new Promise((r) => setTimeout(r, 50));
        } catch {
          // Process doesn't exist, remove stale lock
          fs.unlinkSync(getLockPath());
        }
      } catch {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  }

  throw new Error('Timeout acquiring lock');
}

/**
 * Get the machine ID (hostname)
 */
function getMachineId(): string {
  return os.hostname();
}

/**
 * Parse dates from TOML (they come as Date objects or strings)
 */
function parseDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return new Date();
}

/**
 * Convert raw TOML data to typed Session
 * Handles migration from old status+waiting format to new state format
 */
function parseSession(raw: Record<string, unknown>): Session {
  // Migration: convert old status+waiting to new state
  let state: SessionState;
  if (raw.state) {
    state = raw.state as SessionState;
  } else {
    // Old format migration
    const oldStatus = raw.status as string | undefined;
    const oldWaiting = Boolean(raw.waiting);
    if (oldStatus === 'archived') {
      state = 'archived';
    } else if (oldStatus === 'closed') {
      state = 'closed';
    } else if (oldWaiting) {
      state = 'waiting';
    } else {
      state = 'busy'; // live + not waiting = busy (conservative default)
    }
  }

  const session: Session = {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    directory: String(raw.directory ?? ''),
    project_key: String(raw.project_key ?? ''),
    created_at: parseDate(raw.created_at),
    last_active_at: parseDate(raw.last_active_at),
    state,
    resources: (raw.resources as Session['resources']) ?? {},
    servers: (raw.servers as Session['servers']) ?? {},
    tags: (raw.tags as Session['tags']) ?? { values: [] },
    meta: (raw.meta as Session['meta']) ?? {},
  };

  if (typeof raw.cost_usd === 'number') {
    session.cost_usd = raw.cost_usd;
  }
  if (typeof raw.context_pct === 'number') {
    session.context_pct = raw.context_pct;
  }

  if (typeof raw.pid === 'number') {
    session.pid = raw.pid;
  }

  if (raw.parent_session_id) {
    session.parent_session_id = String(raw.parent_session_id);
  }

  return session;
}

/**
 * Read the index file
 */
export function readIndex(): IndexFile {
  if (_indexCache) return _indexCache;

  ensureDir();

  if (!fs.existsSync(getIndexPath())) {
    return createDefaultIndex(getMachineId());
  }

  try {
    const content = fs.readFileSync(getIndexPath(), 'utf-8');
    const raw = TOML.parse(content) as Record<string, unknown>;

    const sessions: Record<string, Session> = {};
    const rawSessions = (raw.sessions ?? {}) as Record<string, Record<string, unknown>>;

    for (const [id, rawSession] of Object.entries(rawSessions)) {
      sessions[id] = parseSession(rawSession);
    }

    const result: IndexFile = {
      version: Number(raw.version ?? 1),
      machine_id: String(raw.machine_id ?? getMachineId()),
      sessions,
    };
    _indexCache = result;
    return result;
  } catch (err) {
    console.error('Error reading index:', err);
    return createDefaultIndex(getMachineId());
  }
}

/**
 * Write the index file
 */
export function writeIndex(index: IndexFile): void {
  ensureDir();

  // Convert to TOML-compatible format
  const tomlData: Record<string, unknown> = {
    version: index.version,
    machine_id: index.machine_id,
    sessions: {},
  };

  const sessions = tomlData.sessions as Record<string, unknown>;

  for (const [id, session] of Object.entries(index.sessions)) {
    sessions[id] = {
      ...session,
      created_at: session.created_at,
      last_active_at: session.last_active_at,
    };
  }

  const content = TOML.stringify(tomlData as TOML.JsonMap);
  fs.writeFileSync(getIndexPath(), content);

  // Update cache to reflect what was written
  _indexCache = index;
}

/**
 * Update the index with a transaction function
 */
export async function updateIndex(fn: (index: IndexFile) => IndexFile | void): Promise<IndexFile> {
  const release = await acquireLock();

  try {
    const index = readIndex();
    const result = fn(index);
    const newIndex = result ?? index;
    writeIndex(newIndex);
    return newIndex;
  } finally {
    release();
  }
}

/**
 * Get a session by ID (supports partial ID matching)
 */
export type SessionMatch =
  | { session: Session; ambiguity?: undefined }
  | { session: undefined; ambiguity: { field: 'id' | 'name' | 'title'; matches: Session[] } }
  | { session: undefined; ambiguity?: undefined };

/**
 * Resolve a session by ID (exact/prefix), name, or _custom_title.
 * Returns the match and, on failure, any ambiguity info for error reporting.
 */
export function resolveSession(idOrPrefix: string): SessionMatch {
  const index = readIndex();

  // Exact ID match
  if (index.sessions[idOrPrefix]) {
    return { session: index.sessions[idOrPrefix] };
  }

  // ID prefix match (case-insensitive)
  const lower = idOrPrefix.toLowerCase();
  const prefixMatches = Object.values(index.sessions).filter(
    (s) => s.id.toLowerCase().startsWith(lower)
  );

  if (prefixMatches.length === 1) {
    return { session: prefixMatches[0] };
  }
  if (prefixMatches.length >= 2) {
    return { session: undefined, ambiguity: { field: 'id', matches: prefixMatches } };
  }

  // Exact name match
  const nameMatches = Object.values(index.sessions).filter(
    (s) => s.name === idOrPrefix
  );

  if (nameMatches.length === 1) {
    return { session: nameMatches[0] };
  }
  if (nameMatches.length >= 2) {
    return { session: undefined, ambiguity: { field: 'name', matches: nameMatches } };
  }

  // Cached _custom_title match (from /rename in transcripts)
  const titleMatches = Object.values(index.sessions).filter(
    (s) => s.meta._custom_title === idOrPrefix
  );

  if (titleMatches.length === 1) {
    return { session: titleMatches[0] };
  }
  if (titleMatches.length >= 2) {
    return { session: undefined, ambiguity: { field: 'title', matches: titleMatches } };
  }

  return { session: undefined };
}

export function getSession(idOrPrefix: string): Session | undefined {
  return resolveSession(idOrPrefix).session;
}

/**
 * Find all sessions with an exact name match
 */
export function findSessionsByName(name: string): Session[] {
  const index = readIndex();
  return Object.values(index.sessions).filter(s => s.name === name);
}

/**
 * Find all sessions with an exact _custom_title match
 */
export function findSessionsByTitle(title: string): Session[] {
  const index = readIndex();
  return Object.values(index.sessions).filter(s => s.meta._custom_title === title);
}

/**
 * Find all sessions matching a prefix (by ID)
 */
export function findSessions(prefix: string): Session[] {
  const index = readIndex();
  if (index.sessions[prefix]) return [index.sessions[prefix]];
  const lower = prefix.toLowerCase();
  return Object.values(index.sessions).filter(
    (s) => s.id.toLowerCase().startsWith(lower)
  );
}

/**
 * Get all sessions (unfiltered, for ancestry lookups)
 */
export function getAllSessions(): Session[] {
  const index = readIndex();
  return Object.values(index.sessions);
}

/**
 * Get all sessions matching a filter
 */
export function getSessions(filter?: {
  state?: SessionState[];
  directory?: string;
}): Session[] {
  const index = readIndex();
  let sessions = Object.values(index.sessions);

  if (filter?.state) {
    sessions = sessions.filter((s) => filter.state!.includes(s.state));
  }

  if (filter?.directory) {
    sessions = sessions.filter((s) => s.directory === filter.directory);
  }

  // Sort by last_active_at descending
  return sessions.sort((a, b) => b.last_active_at.getTime() - a.last_active_at.getTime());
}

/**
 * Get the current session for a directory (active = busy, idle, or waiting)
 */
export function getCurrentSession(directory: string = process.cwd()): Session | undefined {
  const sessions = getSessions({
    state: ['busy', 'idle', 'waiting'],
    directory,
  });

  return sessions[0];
}

/**
 * Reconcile stale sessions by closing active sessions that no longer exist in Claude's storage.
 * This handles cases where SessionEnd hook didn't fire (Ctrl-C, crash, etc).
 * Also cleans up orphaned per-session state directories for sessions no longer in the index.
 */
export async function reconcileStaleSessions(): Promise<number> {
  // Import here to avoid circular dependency
  const { listClaudeSessions } = await import('../claude/sessions.ts');
  const { listSessionStateIds, deleteSessionStateDir, migrateLegacyStateFiles } =
    await import('./session-state.ts');

  // One-shot migration from the pre-state-dir layout. Idempotent; exits
  // quickly once the legacy dirs are gone.
  migrateLegacyStateFiles();

  const index = readIndex();
  const activeSessions = Object.values(index.sessions).filter(
    (s) => s.state === 'busy' || s.state === 'idle' || s.state === 'waiting'
  );

  // Clean up orphaned per-session state dirs (from deleted sessions)
  const indexIds = new Set(Object.keys(index.sessions));
  for (const stateId of listSessionStateIds()) {
    if (!indexIds.has(stateId)) {
      deleteSessionStateDir(stateId);
    }
  }

  if (activeSessions.length === 0) return 0;

  // Single scan → Set lookup instead of N individual scans
  const claudeIds = new Set(listClaudeSessions().map(cs => cs.id));
  const staleIds = activeSessions
    .filter(s => !claudeIds.has(s.id))
    .map(s => s.id);

  if (staleIds.length > 0) {
    await updateIndex((idx) => {
      for (const id of staleIds) {
        if (idx.sessions[id]) {
          idx.sessions[id].state = 'closed';
        }
      }
    });
  }

  return staleIds.length;
}

