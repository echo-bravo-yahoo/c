#!/usr/bin/env node

/**
 * c - Claude Code session manager CLI
 */

import { Command, Option } from 'commander';
import { initCompletion, installCompletion, uninstallCompletion } from './completion.ts';
import { listCommand } from './commands/list.ts';
import { newCommand } from './commands/new.ts';
import { showCommand } from './commands/show.ts';
import { resumeCommand } from './commands/resume.ts';
import { archiveCommand } from './commands/archive.ts';
import { bankruptcyCommand } from './commands/bankruptcy.ts';
import { closeCommand } from './commands/close.ts';
import { linkCommand } from './commands/link.ts';
import { unlinkCommand } from './commands/unlink.ts';
import { tagCommand } from './commands/tag.ts';
import { untagCommand } from './commands/untag.ts';
import { nameCommand } from './commands/name.ts';
import { metaCommand } from './commands/meta.ts';
import { findCommand } from './commands/find.ts';
import { repairCommand } from './commands/repair.ts';
import { dirCommand } from './commands/dir.ts';
import { initCommand } from './commands/init.ts';
import { execCommand } from './commands/exec.ts';
import { openCommand } from './commands/open.ts';
import { logCommand } from './commands/log.ts';
import { memoryCommand } from './commands/memory.ts';
import { statsCommand } from './commands/stats.ts';
import { tmuxStatusCommand } from './commands/tmux/status.ts';
import { tmuxPickCommand } from './commands/tmux/pick.ts';
import { handleHook } from './hooks/index.ts';
import { realpathSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Extract passthrough args (everything after '--' in raw argv).
 * Commander's command.args includes parsed positionals and unknown options,
 * so filter out the known positional (name/id) and known parsed options.
 */
function parsePassthroughArgs(): string[] {
  const dashDash = process.argv.indexOf('--');
  if (dashDash === -1) return [];
  return process.argv.slice(dashDash + 1);
}

/**
 * Register Claude Code forwarded options on a command.
 * Hidden from the default Options section; shown in a separate help block.
 */
function addClaudeOptions(
  cmd: Command,
  options: { flags: string; description: string }[]
): void {
  for (const opt of options) {
    cmd.addOption(new Option(opt.flags, opt.description).hideHelp());
  }
  const lines = options.map(({ flags, description }) =>
    `  ${flags.padEnd(30)}${description}`
  );
  cmd.addHelpText('after', '\nClaude Code options:\n' + lines.join('\n'));
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('c')
    .description('Claude Code session manager')
    .version('0.1.0')
    .showSuggestionAfterError(true);

  // List sessions
  program
    .command('list')
    .description('List sessions')
    .option('--state <states>', 'Filter by state (comma-separated: busy,idle,waiting,closed,archived,all)')
    .addOption(new Option('--status <states>', 'Alias for --state').hideHelp())
    .option('--branch <name>', 'Filter by branch (substring)')
    .option('--repo <name>', 'Filter by repo name (substring)')
    .option('--tag <tag>', 'Filter by tag (exact)')
    .option('--name <name>', 'Filter by session name (substring)')
    .option('--worktree <name>', 'Filter by worktree name (substring)')
    .option('--prs', 'Show sessions with linked PRs')
    .option('--jira', 'Show sessions with linked JIRA tickets')
    .option('--repos', 'Show sessions grouped by repository')
    .option('--dir <directory>', 'Filter by directory')
    .option('--sort <fields>', 'Sort by fields (comma-separated, prefix - for desc)')
    .option('--flat', 'Flat list without parent/child nesting')
    .option('--bottom-up', 'Show children above parents')
    .option('--json', 'Output as JSON')
    .option('--min-width <n>', 'Minimum table width', parseInt)
    .option('--max-width <n>', 'Maximum table width', parseInt)
    .action(async (options) => {
      await listCommand({
        state: options.state ?? options.status,
        branch: options.branch,
        repo: options.repo,
        tag: options.tag,
        name: options.name,
        worktree: options.worktree,
        prs: options.prs,
        jira: options.jira,
        repos: options.repos,
        directory: options.dir,
        sort: options.sort,
        flat: options.flat,
        bottomUp: options.bottomUp,
        json: options.json,
        minWidth: options.minWidth,
        maxWidth: options.maxWidth,
      });
    });

  // New session
  const newCmd = program
    .command('new [name]')
    .alias('n')
    .description('Create a new session with optional name and metadata')
    .option('--jira <ticket>', 'Link JIRA ticket')
    .option('--pr <url>', 'Link PR URL')
    .option('--branch <name>', 'Link branch name')
    .option('--note <text>', 'Add a note')
    .option('--meta <key=value...>', 'Set metadata (repeatable)')
    .option('--no-worktree', 'Skip worktree creation even when named')
    .option('--ephemeral', 'Launch without logging to session index')
    .allowUnknownOption()
    .action(async (name, options) => {
      const passthroughArgs = parsePassthroughArgs();
      await newCommand(name, {
        ...options,
        noWorktree: options.worktree === false,
        ephemeral: options.ephemeral,
        passthroughArgs: passthroughArgs.length ? passthroughArgs : undefined,
      });
    });

  addClaudeOptions(newCmd, [
    { flags: '--model <model>', description: 'Claude model to use' },
    { flags: '--permission-mode <mode>', description: 'Permission mode' },
    { flags: '--effort <level>', description: 'Effort level (low, medium, high)' },
    { flags: '--agent <agent>', description: 'Named agent' },
  ]);

  // Waiting (alias for list --waiting)
  program
    .command('waiting')
    .description('List sessions waiting for input')
    .action(async () => {
      await listCommand({ state: 'waiting' });
    });

  // Show
  program
    .command('show <id>')
    .description('Show session details')
    .option('--json', 'Output as JSON')
    .action((id, options) => {
      showCommand(id, { json: options.json });
    });

  // Resume
  const resumeCmd = program
    .command('resume <id>')
    .alias('r')
    .description('Resume a Claude session')
    .allowUnknownOption()
    .action(async (id, options) => {
      const passthroughArgs = parsePassthroughArgs();
      await resumeCommand(id, {
        model: options.model,
        permissionMode: options.permissionMode,
        effort: options.effort,
        agent: options.agent,
        forkSession: options.forkSession,
        passthroughArgs: passthroughArgs.length ? passthroughArgs : undefined,
      });
    });

  addClaudeOptions(resumeCmd, [
    { flags: '--model <model>', description: 'Claude model to use' },
    { flags: '--permission-mode <mode>', description: 'Permission mode' },
    { flags: '--effort <level>', description: 'Effort level (low, medium, high)' },
    { flags: '--agent <agent>', description: 'Named agent' },
    { flags: '--fork-session', description: 'Create a new session ID on resume' },
  ]);

  // Archive
  program
    .command('archive [ids...]')
    .description('Archive sessions')
    .action(async (ids) => {
      await archiveCommand(ids.length ? ids : undefined);
    });

  // Bankruptcy
  program
    .command('bankruptcy')
    .description('Archive all sessions')
    .option('--skip <ids...>', 'Session IDs to skip')
    .action(async (options) => {
      await bankruptcyCommand({ skip: options.skip });
    });

  // Close
  program
    .command('close [ids...]')
    .alias('e')
    .description('Close running sessions')
    .option('-a, --archive', 'Archive instead of closing')
    .action(async (ids, options) => {
      await closeCommand(ids.length ? ids : undefined, options);
    });

  // Link
  program
    .command('link [id]')
    .description('Link resources to session')
    .option('--pr <url>', 'Link PR URL')
    .option('--jira <ticket>', 'Link JIRA ticket')
    .option('--branch <name>', 'Link branch name')
    .action(async (id, options) => {
      await linkCommand(
        {
          pr: options.pr,
          jira: options.jira,
          branch: options.branch,
        },
        id
      );
    });

  // Unlink
  program
    .command('unlink [id]')
    .description('Remove resource links from session')
    .option('--pr', 'Unlink PR')
    .option('--jira', 'Unlink JIRA')
    .option('--branch', 'Unlink branch')
    .action(async (id, options) => {
      await unlinkCommand(
        {
          pr: options.pr,
          jira: options.jira,
          branch: options.branch,
        },
        id
      );
    });

  // Tag
  program
    .command('tag <tag> [id]')
    .description('Add tag to session')
    .action(async (tag, id) => {
      await tagCommand(tag, id);
    });

  // Untag
  program
    .command('untag <tag> [id]')
    .description('Remove tag from session')
    .action(async (tag, id) => {
      await untagCommand(tag, id);
    });

  // Rename (primary) / Name (alias)
  program
    .command('rename <id> <name>')
    .alias('name')
    .description('Rename a session')
    .action(async (id, name) => {
      await nameCommand(id, name);
    });

  // Meta
  program
    .command('meta <keyvalue> [id]')
    .description('Set session metadata (key=value)')
    .action(async (keyvalue, id) => {
      await metaCommand(keyvalue, id);
    });

  // Find
  program
    .command('find <query>')
    .alias('f')
    .description('Search sessions')
    .option('--json', 'Output as JSON')
    .action((query, options) => {
      findCommand(query, { json: options.json });
    });

  // Dir
  program
    .command('dir [id]')
    .description('Print session directory path')
    .action((id) => {
      dirCommand(id);
    });

  // Exec
  program
    .command('exec [id]')
    .usage('[id] -- <command...>')
    .description('Run a command in session directory')
    .allowUnknownOption()
    .action(async (id) => {
      const passthroughArgs = parsePassthroughArgs();
      await execCommand(id, passthroughArgs);
    });

  // Delete
  program
    .command('delete [ids...]')
    .alias('d')
    .description('Delete sessions from index')
    .option('--orphans', 'Delete sessions with no Claude data')
    .option('--closed', 'Delete all closed sessions')
    .action(async (ids, options) => {
      const { deleteCommand } = await import('./commands/delete.ts');
      await deleteCommand(ids.length ? ids : undefined, options);
    });

  // Open
  program
    .command('open [id]')
    .description('Open session resources in browser')
    .option('--pr', 'Open PR')
    .option('--jira', 'Open JIRA ticket')
    .action((id, options) => {
      openCommand(id, options);
    });

  // Log
  program
    .command('log [id]')
    .description('View recent transcript activity')
    .option('-n, --lines <n>', 'Number of entries to show', parseInt)
    .option('--prompts', 'Show only user prompts')
    .option('--tail', 'Follow transcript in $PAGER')
    .action(async (id, options) => {
      await logCommand(id, { lines: options.lines, prompts: options.prompts, tail: options.tail });
    });

  // Memory
  program
    .command('memory [id]')
    .description("Show session project's CLAUDE.md")
    .option('--raw', 'Output without syntax highlighting')
    .action((id, options) => {
      memoryCommand(id, { raw: options.raw });
    });

  // Stats
  program
    .command('stats')
    .description('Show session statistics')
    .action(() => {
      statsCommand();
    });

  // Repair
  program
    .command('repair [id]')
    .description('Auto-fix inconsistent session state')
    .action(async (id) => {
      await repairCommand(id);
    });

  // tmux integration
  program
    .command('tmux-status')
    .description('Output for tmux status bar')
    .action(() => {
      tmuxStatusCommand();
    });

  program
    .command('tmux-pick')
    .description('Interactive session picker (fzf)')
    .action(() => {
      tmuxPickCommand();
    });

  // Hook handler
  program
    .command('hook <event>')
    .description('Handle Claude hook events')
    .action(async (event) => {
      await handleHook(event);
    });

  // Init (shell wrapper for c cd)
  program
    .command('init')
    .description('Output shell init script (eval "$(c init)")')
    .action(() => {
      initCommand();
    });

  // Completion
  program
    .command('completion [action]')
    .description('Manage shell tab completion (install/uninstall)')
    .action((action) => {
      if (action === 'install') {
        installCompletion();
      } else if (action === 'uninstall') {
        uninstallCompletion();
      } else {
        console.log('Usage: c completion install|uninstall');
      }
    });

  return program;
}

// Only auto-run when executed directly (not imported by tests).
// Resolve symlinks so ~/bin/c → dist/index.js is detected correctly.
let isDirectRun = false;
try {
  const self = fileURLToPath(import.meta.url);
  const invoked = realpathSync(process.argv[1] ?? '');
  isDirectRun = invoked === self;
} catch {}

if (isDirectRun) {
  // Non-blocking update check
  const selfPath = fileURLToPath(import.meta.url);
  const pkgPath = join(selfPath, '..', '..', 'package.json');
  import('update-notifier').then(({ default: updateNotifier }) => {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      updateNotifier({ pkg }).notify();
    } catch {}
  }).catch(() => {});

  initCompletion();
  const args = process.argv.slice(2);
  const subcommands = createProgram().commands.flatMap(c => [c.name(), ...c.aliases()]);
  const firstPositional = args.find(a => !a.startsWith('-'));
  const wantsHelp = args.includes('--help') || args.includes('-h');
  const wantsVersion = args.includes('--version') || args.includes('-V');
  if (!wantsHelp && !wantsVersion && (!firstPositional || !subcommands.includes(firstPositional))) {
    process.argv.splice(2, 0, 'list');
  }
  createProgram().parseAsync();
}
