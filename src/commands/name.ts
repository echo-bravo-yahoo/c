/**
 * c name "..." - set session name
 */

import chalk from 'chalk';
import { updateIndex, getSession, getCurrentSession } from '../store/index.js';
import { findTranscriptPath, getCustomTitleFromTranscriptTail } from '../claude/sessions.js';
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

    // Sync _custom_title from transcript so the stop hook won't revert
    // the pane title to an older /rename value
    const transcriptPath = findTranscriptPath(session!.id);
    const current = transcriptPath
      ? getCustomTitleFromTranscriptTail(transcriptPath)
      : null;
    if (current) s.meta._custom_title = current;
  });

  if (!idOrPrefix) {
    setTmuxPaneTitle(name, session?.resources.tmux_pane);
  }
  console.log(chalk.green(`Set name: ${name}.`));
}
