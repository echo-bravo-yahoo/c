/**
 * c plan [id] - show session's plan document
 */

import chalk from 'chalk';
import { existsSync, readFileSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { marked, type MarkedExtension } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { resolveSession, getCurrentSession } from '../store/index.ts';
import { ambiguityError } from '../util/format.ts';
import { PLANS_DIR } from '../claude/sessions.ts';
import { exec } from '../util/exec.ts';

marked.use(markedTerminal() as MarkedExtension);

export interface PlanOptions {
  raw?: boolean;
  copy?: boolean;
  open?: boolean;
  edit?: boolean;
  path?: boolean;
}

export function planCommand(idOrPrefix?: string, options?: PlanOptions): void {
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

  const slug = session.resources.plan;
  if (!slug) {
    console.log(chalk.dim('No plan linked.'));
    return;
  }

  const planPath = join(PLANS_DIR, `${slug}.md`);
  if (!existsSync(planPath)) {
    console.error(chalk.red(`Plan file not found: ${planPath}`));
    process.exit(1);
  }

  if (options?.path) {
    process.stdout.write(planPath + '\n');
    return;
  }

  if (options?.edit) {
    spawnSync(process.env.EDITOR || 'vi', [planPath], { stdio: 'inherit' });
    return;
  }

  if (options?.open) {
    exec(`open "${planPath}"`);
    return;
  }

  if (options?.copy) {
    const content = readFileSync(planPath, 'utf-8');
    execSync('pbcopy', { input: content, stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(chalk.dim('Plan copied to clipboard.'));
    return;
  }

  const content = readFileSync(planPath, 'utf-8');
  if (options?.raw) {
    process.stdout.write(content);
  } else {
    process.stdout.write(marked.parse(content) as string);
  }
}
