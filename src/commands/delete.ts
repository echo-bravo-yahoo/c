/**
 * c delete - remove sessions from c's index
 */

import chalk from 'chalk';
import { updateIndex, getSession, getSessions } from '../store/index.ts';
import { getDisplayName, shortId } from '../util/format.ts';
import { signalSession } from '../util/process.ts';
import type { Session } from '../store/schema.ts';

export interface DeleteOptions {
  orphans?: boolean;
  closed?: boolean;
}

export async function deleteCommand(
  idsOrPrefixes?: string[],
  options?: DeleteOptions
): Promise<void> {
  if (options?.orphans) {
    const { getClaudeSession } = await import('../claude/sessions.ts');
    return deleteBatch(s => !getClaudeSession(s.id), 'orphaned');
  }
  if (options?.closed) {
    return deleteBatch(s => s.state === 'closed', 'closed');
  }

  if (!idsOrPrefixes?.length) {
    console.error(chalk.red('Specify session IDs to delete.'));
    process.exit(1);
  }

  for (const idOrPrefix of idsOrPrefixes) {
    const session = getSession(idOrPrefix);
    if (!session) {
      console.error(chalk.red(`Session not found: ${idOrPrefix}.`));
      continue;
    }
    await deleteOne(session);
    console.log(chalk.green(`Deleted "${getDisplayName(session) || shortId(session.id)}" (${shortId(session.id)}).`));
  }
}

async function deleteOne(session: Session): Promise<void> {
  if (['busy', 'idle', 'waiting'].includes(session.state) && session.pid) {
    await signalSession(session.pid);
  }
  await updateIndex((idx) => {
    // Unlink children so they become roots
    for (const s of Object.values(idx.sessions)) {
      if (s.parent_session_id === session.id) {
        delete s.parent_session_id;
      }
    }
    delete idx.sessions[session.id];
  });
}

async function deleteBatch(
  predicate: (s: Session) => boolean,
  label: string
): Promise<void> {
  const all = getSessions({ state: ['busy', 'idle', 'waiting', 'closed', 'archived'] });
  const targets = all.filter(predicate);
  if (targets.length === 0) {
    console.log(chalk.dim(`No ${label} sessions found.`));
    return;
  }
  for (const s of targets) await deleteOne(s);
  console.log(chalk.green(`Deleted ${targets.length} ${label} session${targets.length === 1 ? '' : 's'}.`));
}
