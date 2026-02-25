/**
 * c find <query> - search sessions
 */

import { getSessions } from '../store/index.js';
import { printSessionTable } from '../util/format.js';
import type { Session } from '../store/schema.js';

export function findCommand(query: string): void {
  const allSessions = getSessions();
  const q = query.toLowerCase();

  const matches = allSessions.filter((s) => matchSession(s, q));

  printSessionTable(matches);
}

function matchSession(session: Session, query: string): boolean {
  // Match against various fields
  const fields = [
    session.id,
    session.name,
    session.humanhash,
    session.directory,
    session.resources.branch,
    session.resources.pr,
    session.resources.jira,
    ...session.tags.values,
    ...Object.keys(session.meta),
    ...Object.values(session.meta),
  ];

  return fields.some((f) => f?.toLowerCase().includes(query));
}
