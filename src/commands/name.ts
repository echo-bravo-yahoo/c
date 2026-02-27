/**
 * c name "..." - set session name
 */

import chalk from 'chalk';
import { updateIndex, getSession, getCurrentSession } from '../store/index.js';
import { setTmuxPaneTitle } from '../util/exec.js';

export async function nameCommand(name: string, idOrPrefix?: string): Promise<void> {
  let session;

  if (idOrPrefix) {
    session = getSession(idOrPrefix);
  } else {
    session = getCurrentSession();
  }

  if (!session) {
    const msg = idOrPrefix
      ? `Session not found: ${idOrPrefix}`
      : 'No active session in current directory';
    console.error(chalk.red(msg));
    process.exit(1);
  }

  await updateIndex((index) => {
    const s = index.sessions[session!.id];
    if (!s) return;

    s.name = name;
    s.last_active_at = new Date();
  });

  setTmuxPaneTitle(name);
  console.log(chalk.green(`✓ Set name: ${name}`));
}
