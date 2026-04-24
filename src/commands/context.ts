/**
 * c context [id] - show the persisted context inventory for a session
 */

import chalk from 'chalk';
import * as path from 'node:path';
import * as os from 'node:os';
import { resolveSession, getCurrentSession } from '../store/index.ts';
import { ambiguityError } from '../util/format.ts';
import type { Session, SessionContextInventory } from '../store/schema.ts';

export interface ContextOptions {
  json?: boolean;
  verbose?: boolean;
}

type Category = 'memory' | 'claude_docs' | 'claude_md' | 'project';

function categorize(absPath: string): Category {
  const home = os.homedir();
  const memoryPrefix = path.join(home, '.claude', 'projects');
  const docsPrefix = path.join(home, '.claude', 'docs') + path.sep;

  if (absPath.startsWith(memoryPrefix) && absPath.includes(`${path.sep}memory${path.sep}`)) {
    return 'memory';
  }
  if (absPath.startsWith(docsPrefix)) return 'claude_docs';
  if (path.basename(absPath) === 'CLAUDE.md') return 'claude_md';
  return 'project';
}

function displayPath(p: string): string {
  const home = os.homedir();
  if (p === home) return '~';
  if (p.startsWith(home + path.sep)) return '~' + p.slice(home.length);
  return p;
}

export function contextCommand(idOrPrefix: string | undefined, options?: ContextOptions): void {
  let session: Session | undefined;
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
      console.error(chalk.red('No active session in this directory.'));
      process.exit(1);
    }
  }

  const ctx: SessionContextInventory = session.context ?? { reads: {} };

  if (options?.json) {
    process.stdout.write(JSON.stringify(ctx, null, 2) + '\n');
    return;
  }

  const preloadedSet = new Set(ctx.claude_md_imports ?? []);

  const buckets: Record<Category, string[]> = {
    memory: [],
    claude_docs: [],
    claude_md: [],
    project: [],
  };
  for (const p of Object.keys(ctx.reads)) {
    if (preloadedSet.has(p)) continue;
    buckets[categorize(p)].push(p);
  }
  for (const list of Object.values(buckets)) list.sort();

  const titleParts: string[] = [];
  titleParts.push(chalk.bold(session.name || session.id.slice(0, 8)));
  titleParts.push(chalk.dim(`(${session.id.slice(0, 8)})`));
  if (typeof session.context_pct === 'number') {
    titleParts.push(chalk.dim(`— context ${session.context_pct.toFixed(1)}% used`));
  }
  console.log(titleParts.join(' '));
  console.log();

  console.log(chalk.bold('Preloaded at startup'));
  const mcp = ctx.mcp_servers ? Object.keys(ctx.mcp_servers).sort() : [];
  if (mcp.length) {
    console.log(`  MCP tools         : ${mcp.length} servers — ${mcp.join(', ')}`);
  }
  if (ctx.claude_md?.length) {
    console.log(`  CLAUDE.md files   : ${ctx.claude_md.length}`);
    for (const p of ctx.claude_md) console.log(`    - ${displayPath(p)}`);
  }
  if (ctx.claude_md_imports?.length) {
    console.log(`  CLAUDE.md imports : ${ctx.claude_md_imports.length} (via @-syntax, recursive)`);
    const show = options?.verbose ? ctx.claude_md_imports : ctx.claude_md_imports.slice(0, 20);
    for (const p of show) console.log(`    - ${displayPath(p)}`);
    if (!options?.verbose && ctx.claude_md_imports.length > 20) {
      console.log(chalk.dim(`    … and ${ctx.claude_md_imports.length - 20} more (--verbose to list)`));
    }
  }
  if (ctx.memory_index) {
    console.log(`  Memory index      : ${displayPath(ctx.memory_index)}`);
  }
  if (!mcp.length && !ctx.claude_md?.length && !ctx.claude_md_imports?.length && !ctx.memory_index) {
    console.log(chalk.dim('  (none captured)'));
  }

  console.log();
  console.log(chalk.bold('Read during session'));
  renderReadBucket('Memory files     ', buckets.memory, ctx);
  renderReadBucket('Claude docs      ', buckets.claude_docs, ctx, '[excludes preloaded imports]');
  renderReadBucket('CLAUDE.md re-reads', buckets.claude_md, ctx);
  renderProjectBucket(buckets.project, ctx, !!options?.verbose);
  renderSkills(ctx.skills);

  console.log();
  if (typeof session.cost_usd === 'number') {
    console.log(`Cost              : $${session.cost_usd.toFixed(4)}`);
  }
  const input = session.meta._total_input;
  const output = session.meta._total_output;
  const cacheRead = session.meta._total_cache_read;
  const cacheWrite = session.meta._total_cache_write;
  if (input || output || cacheRead || cacheWrite) {
    console.log(`Tokens            : input=${input ?? 0} output=${output ?? 0} cache_read=${cacheRead ?? 0} cache_write=${cacheWrite ?? 0}`);
  }
  if (typeof session.context_pct === 'number') {
    console.log(`Free              : ${(100 - session.context_pct).toFixed(1)}%`);
  }
}

function formatTurns(turns: number[]): string {
  const MAX = 6;
  if (turns.length <= MAX) return `[${turns.join(', ')}]`;
  const head = turns.slice(0, MAX - 1).join(', ');
  return `[${head}, … ${turns.length} total]`;
}

function renderReadBucket(
  label: string,
  paths: string[],
  ctx: SessionContextInventory,
  suffix = '',
): void {
  if (paths.length === 0) return;
  const totalAccesses = paths.reduce((n, p) => n + (ctx.reads[p]?.length ?? 0), 0);
  const suffixStr = suffix ? ` ${chalk.dim(suffix)}` : '';
  console.log(`  ${label}: ${paths.length} unique (${totalAccesses} reads)${suffixStr}`);
  for (const p of paths) {
    const turns = ctx.reads[p] ?? [];
    const via = ctx.reads_via?.[p];
    const viaNote = via && via.includes('Bash') ? chalk.dim(`  via ${uniqueSources(via).join('+')}`) : '';
    console.log(`    - ${displayPath(p)}  ${chalk.dim('turns ' + formatTurns(turns))}${viaNote}`);
  }
}

function renderProjectBucket(
  paths: string[],
  ctx: SessionContextInventory,
  verbose: boolean,
): void {
  if (paths.length === 0) return;
  const totalAccesses = paths.reduce((n, p) => n + (ctx.reads[p]?.length ?? 0), 0);
  console.log(`  Project files    : ${paths.length} unique (${totalAccesses} reads)`);
  if (verbose) {
    for (const p of paths) {
      const turns = ctx.reads[p] ?? [];
      console.log(`    - ${displayPath(p)}  ${chalk.dim('turns ' + formatTurns(turns))}`);
    }
  } else {
    console.log(chalk.dim('    (--verbose to list)'));
  }
}

function renderSkills(skills: SessionContextInventory['skills']): void {
  if (!skills) return;
  const names = Object.keys(skills);
  if (names.length === 0) return;
  const summary = names
    .map((n) => `${n} turns ${formatTurns(skills[n])}`)
    .join(', ');
  console.log(`  Skills invoked   : ${names.length} — ${summary}`);
}

function uniqueSources(via: ('Read' | 'Bash')[]): string[] {
  return Array.from(new Set(via));
}
