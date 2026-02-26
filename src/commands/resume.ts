/**
 * c resume <id> - resume a Claude session
 */

import chalk from 'chalk';
import { getSession } from '../store/index.js';
import { getClaudeSession } from '../claude/sessions.js';
import { execReplace } from '../util/exec.js';
import { getDisplayName } from '../util/format.js';

export function resumeCommand(idOrPrefix: string): void {
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

  // Use claude -r to resume the session from the directory where the transcript exists
  // This handles worktrees where Claude may store transcripts in the main repo's project directory
  const resumeDir = claudeSession.directory;
  console.log(chalk.dim(`Resuming session ${getDisplayName(session)} in ${resumeDir}...`));
  execReplace('claude', ['-r', session.id], { cwd: resumeDir });
}
