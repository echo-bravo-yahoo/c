/**
 * c list - list sessions
 */

import { getSessions } from '../store/index.js';
import { printSessionTable } from '../util/format.js';
import type { Session } from '../store/schema.js';

export interface ListOptions {
  all?: boolean;
  done?: boolean;
  archived?: boolean;
  directory?: string;
}

export function listCommand(options: ListOptions): void {
  let statusFilter: Session['status'][] = ['live', 'closed'];

  if (options.all) {
    statusFilter = ['live', 'closed', 'done', 'archived'];
  } else if (options.done) {
    statusFilter = ['done'];
  } else if (options.archived) {
    statusFilter = ['archived'];
  }

  const sessions = getSessions({
    status: statusFilter,
    directory: options.directory,
  });

  printSessionTable(sessions);
}
