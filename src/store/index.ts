/**
 * TOML-based session index store
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import TOML from '@iarna/toml';
import { IndexFile, Session, createDefaultIndex } from './schema.js';

const INDEX_DIR = path.join(os.homedir(), '.c');
const INDEX_PATH = path.join(INDEX_DIR, 'index.toml');
const LOCK_PATH = path.join(INDEX_DIR, 'index.lock');

/**
 * Ensure the index directory exists
 */
function ensureDir(): void {
  if (!fs.existsSync(INDEX_DIR)) {
    fs.mkdirSync(INDEX_DIR, { recursive: true });
  }
}

/**
 * Get a simple file lock (with timeout)
 */
async function acquireLock(timeout = 5000): Promise<() => void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      fs.writeFileSync(LOCK_PATH, String(process.pid), { flag: 'wx' });
      return () => {
        try {
          fs.unlinkSync(LOCK_PATH);
        } catch {
          // Lock already released
        }
      };
    } catch {
      // Lock exists, check if stale
      try {
        const lockPid = fs.readFileSync(LOCK_PATH, 'utf-8').trim();
        // Check if process is still running
        try {
          process.kill(Number(lockPid), 0);
          // Process exists, wait and retry
          await new Promise((r) => setTimeout(r, 50));
        } catch {
          // Process doesn't exist, remove stale lock
          fs.unlinkSync(LOCK_PATH);
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
 */
function parseSession(raw: Record<string, unknown>): Session {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    humanhash: String(raw.humanhash ?? ''),
    directory: String(raw.directory ?? ''),
    project_key: String(raw.project_key ?? ''),
    created_at: parseDate(raw.created_at),
    last_active_at: parseDate(raw.last_active_at),
    status: (raw.status as Session['status']) ?? 'live',
    waiting: Boolean(raw.waiting),
    resources: (raw.resources as Session['resources']) ?? {},
    servers: (raw.servers as Session['servers']) ?? {},
    tags: (raw.tags as Session['tags']) ?? { values: [] },
    meta: (raw.meta as Session['meta']) ?? {},
  };
}

/**
 * Read the index file
 */
export function readIndex(): IndexFile {
  ensureDir();

  if (!fs.existsSync(INDEX_PATH)) {
    return createDefaultIndex(getMachineId());
  }

  try {
    const content = fs.readFileSync(INDEX_PATH, 'utf-8');
    const raw = TOML.parse(content) as Record<string, unknown>;

    const sessions: Record<string, Session> = {};
    const rawSessions = (raw.sessions ?? {}) as Record<string, Record<string, unknown>>;

    for (const [id, rawSession] of Object.entries(rawSessions)) {
      sessions[id] = parseSession(rawSession);
    }

    return {
      version: Number(raw.version ?? 1),
      machine_id: String(raw.machine_id ?? getMachineId()),
      sessions,
    };
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
  fs.writeFileSync(INDEX_PATH, content);
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
export function getSession(idOrPrefix: string): Session | undefined {
  const index = readIndex();

  // Exact match first
  if (index.sessions[idOrPrefix]) {
    return index.sessions[idOrPrefix];
  }

  // Prefix match
  const matches = Object.values(index.sessions).filter(
    (s) => s.id.startsWith(idOrPrefix) || s.humanhash.startsWith(idOrPrefix)
  );

  if (matches.length === 1) {
    return matches[0];
  }

  return undefined;
}

/**
 * Get all sessions matching a filter
 */
export function getSessions(filter?: {
  status?: Session['status'][];
  waiting?: boolean;
  directory?: string;
}): Session[] {
  const index = readIndex();
  let sessions = Object.values(index.sessions);

  if (filter?.status) {
    sessions = sessions.filter((s) => filter.status!.includes(s.status));
  }

  if (filter?.waiting !== undefined) {
    sessions = sessions.filter((s) => s.waiting === filter.waiting);
  }

  if (filter?.directory) {
    sessions = sessions.filter((s) => s.directory === filter.directory);
  }

  // Sort by last_active_at descending
  return sessions.sort((a, b) => b.last_active_at.getTime() - a.last_active_at.getTime());
}

/**
 * Get the current session for a directory
 */
export function getCurrentSession(directory: string = process.cwd()): Session | undefined {
  const sessions = getSessions({
    status: ['live'],
    directory,
  });

  return sessions[0];
}

export { INDEX_DIR, INDEX_PATH };
