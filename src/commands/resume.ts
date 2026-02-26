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

  // Use session.directory from c's index - it stores the actual path correctly
  // (claudeSession.directory may be wrong due to lossy project key encoding)
  console.log(chalk.dim(`Resuming session ${getDisplayName(session)} in ${session.directory}...`));
  execReplace('claude', ['-r', session.id], { cwd: session.directory });
}
