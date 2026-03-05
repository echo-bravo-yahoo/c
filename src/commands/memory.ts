/**
 * c memory [id] - show session project's CLAUDE.md
 */

import chalk from 'chalk';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { marked, type MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { getSession, getCurrentSession } from '../store/index.js';

marked.use(markedTerminal() as MarkedExtension);

export interface MemoryOptions {
  raw?: boolean;
}

export function memoryCommand(idOrPrefix?: string, options?: MemoryOptions): void {
  const session = idOrPrefix ? getSession(idOrPrefix) : getCurrentSession();
  if (!session) {
    const msg = idOrPrefix
      ? `Session not found: ${idOrPrefix}.`
      : 'No active session.';
    console.error(chalk.red(msg));
    process.exit(1);
  }

  const claudeMd = join(session.directory, 'CLAUDE.md');
  if (!existsSync(claudeMd)) {
    console.log(chalk.dim('No CLAUDE.md found.'));
    return;
  }

  const content = readFileSync(claudeMd, 'utf-8');
  if (options?.raw) {
    process.stdout.write(content);
  } else {
    process.stdout.write(marked.parse(content) as string);
  }
}
