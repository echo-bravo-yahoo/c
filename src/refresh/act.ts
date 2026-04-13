/**
 * Action phase: resume the session with the refresh report as the initial prompt.
 */

import chalk from 'chalk';
import { updateIndex } from '../store/index.ts';
import { spawnInteractive } from '../util/exec.ts';
import { shortId } from '../util/format.ts';
import { formatReportPlain } from './report.ts';
import type { Session } from '../store/schema.ts';
import type { RefreshReport } from './types.ts';

function buildPrompt(report: RefreshReport): string {
  const plain = formatReportPlain(report);
  const hasIssues = report.findings.some((f) => f.severity === 'action' || f.severity === 'warn');

  if (hasIssues) {
    return `Your session has unresolved issues.\nAddress these findings:\n\n${plain}`;
  }
  return `Session refresh found no issues.\nHere is the current state for context:\n\n${plain}`;
}

export interface ActOptions {
  model?: string;
}

export async function actOnReport(report: RefreshReport, session: Session, options: ActOptions = {}): Promise<void> {
  const prompt = buildPrompt(report);
  const prevState = session.state;

  // Set session to idle so claude can resume it
  await updateIndex((index) => {
    const s = index.sessions[session.id];
    if (!s) return;
    s.state = 'idle';
    s.pid = process.pid;
    if (process.env.TMUX_PANE) {
      s.resources.tmux_pane = process.env.TMUX_PANE;
    }
  });

  console.error(chalk.dim(`Resuming session ${shortId(session.id)} with refresh report...`));

  const args = ['-r', session.id, prompt];
  if (options.model) args.push('--model', options.model);

  let exitCode: number;
  try {
    exitCode = await spawnInteractive('claude', args, { cwd: session.directory });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Failed to launch Claude: ${msg}`));
    exitCode = 1;
  }

  // Restore previous state
  await updateIndex((index) => {
    const s = index.sessions[session.id];
    if (s) {
      s.state = prevState;
    }
  });

  process.exit(exitCode);
}
