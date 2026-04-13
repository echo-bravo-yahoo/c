/**
 * c memory [id] - show session project's CLAUDE.md
 */

import chalk from 'chalk';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { marked, type MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { resolveSession, getCurrentSession } from '../store/index.ts';
import { ambiguityError } from '../util/format.ts';

marked.use(markedTerminal() as MarkedExtension);

export interface MemoryOptions {
  raw?: boolean;
}

export function memoryCommand(idOrPrefix?: string, options?: MemoryOptions): void {
  let session;
  if (idOrPrefix) {
    const result = resolveSession(idOrPrefix);
    if (!result.session) {
      console.error(chalk.red(ambiguityError(idOrPrefix, result.ambiguity)));
      process.exit(1);
    }
    session = result.session;
  } else {
    session = getCurrentSession();
    if (!session) {
      console.error(chalk.red('No active session.'));
      process.exit(1);
    }
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
