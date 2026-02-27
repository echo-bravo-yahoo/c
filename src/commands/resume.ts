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

  // Verify session exists in Claude's storage
  const claudeSession = getClaudeSession(session.id);
  if (!claudeSession) {
    console.error(chalk.red(`Session ${session.humanhash} no longer exists in Claude's storage`));
    process.exit(1);
  }

  // Store PID before exec replaces this process
  await updateIndex((index) => {
    if (index.sessions[session!.id]) {
      index.sessions[session!.id].pid = process.pid;
    }
  });

  // Use session.directory from c's index - it stores the actual path correctly
  // (claudeSession.directory may be wrong due to lossy project key encoding)
  const displayName = getDisplayName(session);
  console.log(chalk.dim(`Resuming session ${displayName} in ${session.directory}...`));
  setTmuxPaneTitle(displayName);
  execReplace('claude', ['-r', session.id], { cwd: session.directory });
}
