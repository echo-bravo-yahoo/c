/**
 * c clean - find and optionally prune orphaned sessions
 */

import * as fs from 'node:fs';
import chalk from 'chalk';
import { readIndex, updateIndex } from '../store/index.ts';
import { getDisplayName, shortId } from '../util/format.ts';
import { listClaudeSessions } from '../claude/sessions.ts';

export interface CleanOptions {
  prune?: boolean;
}

export async function cleanCommand(options: CleanOptions): Promise<void> {
  const index = readIndex();
  const claudeSessions = listClaudeSessions();
  const claudeIds = new Set(claudeSessions.map((s) => s.id));

  // Find sessions in index that don't exist in Claude's data
  const orphaned = Object.values(index.sessions).filter((s) => !claudeIds.has(s.id));

  // Find sessions with missing directories
  const missingDirs = Object.values(index.sessions).filter(
    (s) => !fs.existsSync(s.directory)
  );

  if (orphaned.length === 0 && missingDirs.length === 0) {
    console.log(chalk.green('No orphaned sessions found.'));
    return;
  }

  if (orphaned.length > 0) {
    console.log(chalk.bold('\nOrphaned sessions (no Claude data):'));
    for (const s of orphaned) {
      console.log(`  ${chalk.cyan(shortId(s.id))} ${getDisplayName(s)}`);
    }
  }

  if (missingDirs.length > 0) {
    console.log(chalk.bold('\nSessions with missing directories:'));
    for (const s of missingDirs) {
      console.log(`  ${chalk.cyan(shortId(s.id))} ${getDisplayName(s)} → ${s.directory}`);
    }
  }

  if (options.prune) {
    const toDelete = new Set([...orphaned.map((s) => s.id), ...missingDirs.map((s) => s.id)]);

    await updateIndex((idx) => {
      for (const id of toDelete) {
        delete idx.sessions[id];
      }
    });

    console.log(chalk.green(`\nPruned ${toDelete.size} session${toDelete.size === 1 ? '' : 's'}.`));
  } else {
    console.log(chalk.dim('\nRun with --prune to remove these sessions.'));
  }
}
