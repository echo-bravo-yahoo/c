/**
 * c find <query> - search sessions
 */

import { getSessions, getAllSessions } from '../store/index.js';
import { printSessionTable, getDisplayName } from '../util/format.js';
import type { Session } from '../store/schema.js';

export interface FindOptions {
  json?: boolean;
}

export function findCommand(query: string, options?: FindOptions): void {
  const allSessions = getSessions();
  const q = query.toLowerCase();

  const matches = allSessions.filter((s) => matchSession(s, q));

  if (options?.json) {
    const output = matches.map(s => ({
      ...s,
      created_at: s.created_at.toISOString(),
      last_active_at: s.last_active_at.toISOString(),
    }));
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    return;
  }

  printSessionTable(matches, undefined, getAllSessions());
}

function matchSession(session: Session, query: string): boolean {
  // Match against various fields
  const fields = [
    session.id,
    session.name,
    getDisplayName(session),
    session.directory,
    session.state,
    session.resources.branch,
    session.resources.worktree,
    session.resources.pr,
    session.resources.jira,
    ...session.tags.values,
    ...Object.keys(session.meta),
    ...Object.values(session.meta),
  ];

  return fields.some((f) => f?.toLowerCase().includes(query));
}
