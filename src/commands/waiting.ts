/**
 * c waiting - list sessions waiting for input
 */

import { getSessions } from '../store/index.js';
import { printSessionTable } from '../util/format.js';

export function waitingCommand(): void {
  const sessions = getSessions({
    status: ['live'],
    waiting: true,
  });

  printSessionTable(sessions);
}
