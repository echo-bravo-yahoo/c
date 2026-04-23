/**
 * c state-dir [id] - print session state directory path, creating it if needed
 *
 * With no id, resolves the current session via process ancestry: walks PPID
 * chain from the caller up to init, intersects with active sessions in the
 * index, and returns the deepest match. This works uniformly for new and
 * resumed sessions, forks, and sub-agents — all share ancestry back to the
 * same `claude` PID.
 */

import * as child_process from 'node:child_process';
import chalk from 'chalk';
import { readIndex, resolveSession } from '../store/index.ts';
import { ensureSessionStateDir } from '../store/session-state.ts';
import { ambiguityError } from '../util/format.ts';
import type { Session } from '../store/schema.ts';

function getParentPid(pid: number): number | null {
  try {
    const out = child_process.execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const ppid = parseInt(out.trim(), 10);
    return Number.isFinite(ppid) && ppid > 0 ? ppid : null;
  } catch {
    return null;
  }
}

function collectAncestry(start: number): number[] {
  const chain: number[] = [];
  let cur: number | null = start;
  const seen = new Set<number>();
  while (cur !== null && cur > 1 && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    cur = getParentPid(cur);
  }
  return chain;
}

export function resolveSessionByAncestry(): Session | null {
  const ancestry = collectAncestry(process.pid);
  if (ancestry.length === 0) return null;

  const ancestrySet = new Set(ancestry);
  const index = readIndex();
  const matches: { session: Session; depth: number }[] = [];

  for (const session of Object.values(index.sessions)) {
    if (!session.pid) continue;
    if (session.state !== 'busy' && session.state !== 'idle' && session.state !== 'waiting') continue;
    if (!ancestrySet.has(session.pid)) continue;
    matches.push({ session, depth: ancestry.indexOf(session.pid) });
  }

  if (matches.length === 0) return null;

  // Deepest ancestry match wins (smallest index = closest to caller).
  // Break ties by most-recent last_active_at.
  matches.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    return (b.session.last_active_at?.getTime() ?? 0) - (a.session.last_active_at?.getTime() ?? 0);
  });

  return matches[0].session;
}

export function stateDirCommand(idOrPrefix?: string): void {
  let session: Session | null = null;

  if (idOrPrefix) {
    const result = resolveSession(idOrPrefix);
    if (!result.session) {
      console.error(chalk.red(ambiguityError(idOrPrefix, result.ambiguity)));
      process.exit(1);
    }
    session = result.session;
  } else {
    session = resolveSessionByAncestry();
    if (!session) {
      console.error(
        chalk.red(
          'No tracked session matched this process ancestry. ' +
            'Start the session via `c new` / `c resume`, or pass an id explicitly.'
        )
      );
      process.exit(1);
    }
  }

  const dir = ensureSessionStateDir(session.id);
  process.stdout.write(dir);
}
