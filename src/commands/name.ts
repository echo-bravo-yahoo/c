/**
 * c rename <id> <name> - set session name
 */

import chalk from 'chalk';
import { resolveSession, updateIndex } from '../store/index.ts';
import { ambiguityError } from '../util/format.ts';
import { findTranscriptPath, getCustomTitleFromTranscriptTail } from '../claude/sessions.ts';
import { setTmuxPaneTitle } from '../util/exec.ts';

export async function nameCommand(idOrPrefix: string, name: string): Promise<void> {
  const result = resolveSession(idOrPrefix);

  if (!result.session) {
    console.error(chalk.red(ambiguityError(idOrPrefix, result.ambiguity)));
    process.exit(1);
  }
  const session = result.session;

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

  if (session.resources.tmux_pane) {
    setTmuxPaneTitle(name, session.resources.tmux_pane);
  }
  console.log(chalk.green(`Set name: ${name}.`));
}
