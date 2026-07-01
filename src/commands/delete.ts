/**
 * c delete - remove sessions from c's index
 */

import chalk from 'chalk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveSession, updateIndex, getSessions } from '../store/index.ts';
import { ambiguityError, getDisplayName, shortId } from '../util/format.ts';
import { signalSession } from '../util/process.ts';
import type { Session } from '../store/schema.ts';

export interface DeleteOptions {
  orphans?: boolean;
  closed?: boolean;
  removeTranscript?: boolean;
}

export async function deleteCommand(
  idsOrPrefixes?: string[],
  options?: DeleteOptions
): Promise<void> {
  if (options?.orphans) {
    const { getClaudeSession } = await import('../claude/sessions.ts');
    return deleteBatch(s => !getClaudeSession(s.id), 'orphaned', options?.removeTranscript);
  }
  if (options?.closed) {
    return deleteBatch(s => s.state === 'closed', 'closed', options?.removeTranscript);
  }

  if (!idsOrPrefixes?.length) {
    console.error(chalk.red('Specify session IDs to delete.'));
    process.exit(1);
  }

  for (const idOrPrefix of idsOrPrefixes) {
    const result = resolveSession(idOrPrefix);
    if (!result.session) {
      console.error(chalk.red(ambiguityError(idOrPrefix, result.ambiguity)));
      continue;
    }
    const session = result.session;
    const removedTranscript = await deleteOne(session, options?.removeTranscript);
    const suffix = removedTranscript ? ' and removed transcript' : '';
    console.log(chalk.green(`Deleted "${getDisplayName(session) || shortId(session.id)}" (${shortId(session.id)})${suffix}.`));
  }
}

async function deleteOne(session: Session, removeTranscript?: boolean): Promise<boolean> {
  if (['busy', 'idle', 'waiting'].includes(session.state) && session.pid) {
    await signalSession(session.pid);
  }

  const removedTranscript = removeTranscript ? await removeClaudeTranscript(session.id) : false;

  await updateIndex((idx) => {
    // Unlink children so they become roots
    for (const s of Object.values(idx.sessions)) {
      if (s.parent_session_id === session.id) {
        delete s.parent_session_id;
      }
    }
    delete idx.sessions[session.id];
  });

  return removedTranscript;
}

async function removeClaudeTranscript(sessionId: string): Promise<boolean> {
  const { getClaudeSession } = await import('../claude/sessions.ts');
  const claudeSession = getClaudeSession(sessionId);
  if (!claudeSession) return false;

  let removed = false;
  try {
    fs.rmSync(claudeSession.transcriptPath, { force: true });
    removed = true;
  } catch {
    // silent on ENOENT
  }
  try {
    fs.rmSync(path.join(path.dirname(claudeSession.transcriptPath), sessionId), { recursive: true, force: true });
  } catch {
    // silent on ENOENT or missing parent
  }
  return removed;
}

async function deleteBatch(
  predicate: (s: Session) => boolean,
  label: string,
  removeTranscript?: boolean
): Promise<void> {
  const all = getSessions({ state: ['busy', 'idle', 'waiting', 'closed', 'archived'] });
  const targets = all.filter(predicate);
  if (targets.length === 0) {
    console.log(chalk.dim(`No ${label} sessions found.`));
    return;
  }
  let removedCount = 0;
  for (const s of targets) {
    if (await deleteOne(s, removeTranscript)) removedCount++;
  }
  const suffix = removeTranscript ? ` (${removedCount} transcript${removedCount === 1 ? '' : 's'} removed)` : '';
  console.log(chalk.green(`Deleted ${targets.length} ${label} session${targets.length === 1 ? '' : 's'}${suffix}.`));
}
