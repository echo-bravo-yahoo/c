/**
 * c resume <id> - resume a Claude session
 */

import chalk from 'chalk';
import { getSession, updateIndex } from '../store/index.js';
import { getClaudeSession } from '../claude/sessions.js';
import { execReplace, setTmuxPaneTitle } from '../util/exec.js';
import { getDisplayName } from '../util/format.js';

export async function resumeCommand(idOrPrefix: string): Promise<void> {
  const session = getSession(idOrPrefix);

  if (!session) {
    console.error(chalk.red(`Session not found: ${idOrPrefix}`));
    process.exit(1);
  }

  const displayName = getDisplayName(session);

  // Verify session exists in Claude's storage
  const claudeSession = getClaudeSession(session.id);
  if (!claudeSession) {
    await updateIndex((index) => {
      if (index.sessions[session!.id]) {
        index.sessions[session!.id].state = 'archived';
        index.sessions[session!.id].last_active_at = new Date();
        delete index.sessions[session!.id].pid;
      }
    });
    console.error(chalk.red(`Session ${displayName} no longer exists in Claude's storage`));
    console.error(chalk.dim(`Archived stale session. Run ${chalk.cyan('c new')} to start fresh.`));
    process.exit(1);
  }

  // Store PID before exec replaces this process
  await updateIndex((index) => {
    if (index.sessions[session!.id]) {
      index.sessions[session!.id].pid = process.pid;
    }
  });
  console.log(chalk.dim(`Resuming session ${displayName} in ${session.directory}...`));
  setTmuxPaneTitle(displayName);
  execReplace('claude', ['-r', session.id], { cwd: session.directory });
}
