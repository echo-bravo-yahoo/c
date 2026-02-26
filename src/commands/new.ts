/**
 * Create a new Claude session with optional name and metadata
 */

import { randomUUID } from 'node:crypto';
import chalk from 'chalk';
import { updateIndex } from '../store/index.js';
import { createSession } from '../store/schema.js';
import { encodeProjectKey } from '../claude/sessions.js';
import { generateHumanhash } from '../util/humanhash.js';
import { execReplace, setTmuxPaneTitle } from '../util/exec.js';

export interface NewOptions {
  jira?: string;
  pr?: string;
  branch?: string;
  note?: string;
  meta?: string[];
}

export async function newCommand(name: string | undefined, options: NewOptions): Promise<never> {
  const sessionId = randomUUID();
  const cwd = process.cwd();
  const projectKey = encodeProjectKey(cwd);
  const humanhash = generateHumanhash(sessionId);

  const session = createSession(sessionId, cwd, projectKey, humanhash);
  if (name) session.name = name;

  // Populate resources
  if (options.jira) session.resources.jira = options.jira;
  if (options.pr) session.resources.pr = options.pr;
  if (options.branch) session.resources.branch = options.branch;
  if (name) session.resources.worktree = name;

  // Populate meta
  if (options.note) session.meta.note = options.note;
  if (options.meta) {
    for (const kv of options.meta) {
      const eq = kv.indexOf('=');
      if (eq !== -1) {
        session.meta[kv.slice(0, eq)] = kv.slice(eq + 1);
      }
    }
  }

  // Save to c's index
  await updateIndex((index) => {
    index.sessions[sessionId] = session;
  });

  const displayName = name || humanhash;
  console.log(chalk.dim(`Starting session: ${displayName}`));
  setTmuxPaneTitle(displayName);

  const args = ['--session-id', sessionId];
  if (name) {
    args.push('--worktree', name);
  }
  execReplace('claude', args, { cwd });
}
