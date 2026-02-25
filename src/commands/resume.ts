/**
 * c resume <id> - resume a Claude session
 */

import chalk from 'chalk';
import { getSession } from '../store/index.js';
import { getClaudeSession } from '../claude/sessions.js';
import { execReplace } from '../util/exec.js';

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

  // Use claude -r to resume the session from its original directory
  console.log(chalk.dim(`Resuming session ${session.humanhash} in ${session.directory}...`));
  execReplace('claude', ['-r', session.id], { cwd: session.directory });
}
