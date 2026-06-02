/**
 * c dir [id] - print session working directory (or, with --state, its state dir)
 */

import { join } from 'node:path';
import chalk from 'chalk';
import {
  resolveSession,
  getSession,
  getCurrentSession,
  getStoreDir,
} from '../store/index.ts';
import { ambiguityError } from '../util/format.ts';
import type { Session } from '../store/schema.ts';

export function dirCommand(idOrPrefix?: string, opts: { state?: boolean } = {}): void {
  // Resolve the target session id (and its record when tracked).
  let session: Session | undefined;
  let id: string | undefined;

  if (idOrPrefix) {
    const result = resolveSession(idOrPrefix);
    if (!result.session) {
      console.error(chalk.red(ambiguityError(idOrPrefix, result.ambiguity)));
      process.exit(1);
    }
    session = result.session;
    id = session.id;
  } else {
    // No explicit id: prefer the canonical current-session id Claude Code sets,
    // then fall back to the session tracked for the current directory.
    id = process.env.CLAUDE_CODE_SESSION_ID || undefined;
    session = (id ? getSession(id) : undefined) ?? getCurrentSession();
    id = id ?? session?.id;
  }

  if (opts.state) {
    if (!id) {
      console.error(chalk.red('No active session in current directory.'));
      process.exit(1);
    }
    // <C_HOME>/state/<id> — the session-scoped state dir (e.g. cc-cred creds).
    process.stdout.write(join(getStoreDir(), 'state', id));
    return;
  }

  if (!session) {
    console.error(chalk.red('No active session in current directory.'));
    process.exit(1);
  }

  process.stdout.write(session.directory);
}
