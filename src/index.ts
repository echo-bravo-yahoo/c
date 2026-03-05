#!/usr/bin/env node

/**
 * c - Claude Code session manager CLI
 */

import { Command } from 'commander';
import { initCompletion, installCompletion, uninstallCompletion } from './completion.js';
import { listCommand } from './commands/list.js';
import { newCommand } from './commands/new.js';
import { showCommand } from './commands/show.js';
import { resumeCommand } from './commands/resume.js';
import { archiveCommand } from './commands/archive.js';
import { bankruptcyCommand } from './commands/bankruptcy.js';
import { closeCommand } from './commands/close.js';
import { linkCommand } from './commands/link.js';
import { unlinkCommand } from './commands/unlink.js';
import { tagCommand } from './commands/tag.js';
import { untagCommand } from './commands/untag.js';
import { nameCommand } from './commands/name.js';
import { metaCommand } from './commands/meta.js';
import { findCommand } from './commands/find.js';
import { cleanCommand } from './commands/clean.js';
import { dirCommand } from './commands/dir.js';
import { execCommand } from './commands/exec.js';
import { openCommand } from './commands/open.js';
import { logCommand } from './commands/log.js';
import { memoryCommand } from './commands/memory.js';
import { statsCommand } from './commands/stats.js';
import { tmuxStatusCommand } from './commands/tmux/status.js';
import { tmuxPickCommand } from './commands/tmux/pick.js';
import { handleHook } from './hooks/index.js';
import { realpathSync } from 'node:fs';
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
    .option('--branch <name>', 'Filter by branch (substring)')
    .option('--repo <name>', 'Filter by repo name (substring)')
    .option('--tag <tag>', 'Filter by tag (exact)')
    .option('--name <name>', 'Filter by session name (substring)')
    .option('--worktree <name>', 'Filter by worktree name (substring)')
    .option('--prs', 'Show sessions with linked PRs')
    .option('--jira', 'Show sessions with linked JIRA tickets')
    .option('--dir <directory>', 'Filter by directory')
    .option('--sort <fields>', 'Sort by fields (comma-separated, prefix - for desc)')
    .option('--flat', 'Flat list without parent/child nesting')
    .option('--bottom-up', 'Show children above parents')
    .option('--json', 'Output as JSON')
    .option('--min-width <n>', 'Minimum table width', parseInt)
    .option('--max-width <n>', 'Maximum table width', parseInt)
    .action(async (options) => {
      await listCommand({
        state: options.state,
        branch: options.branch,
        repo: options.repo,
        tag: options.tag,
        name: options.name,
        worktree: options.worktree,
        prs: options.prs,
        jira: options.jira,
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
  program
    .command('new [name]')
    .alias('n')
    .description('Create a new session with optional name and metadata')
    .option('--jira <ticket>', 'Link JIRA ticket')
    .option('--pr <url>', 'Link PR URL')
    .option('--branch <name>', 'Link branch name')
    .option('--note <text>', 'Add a note')
    .option('--meta <key=value...>', 'Set metadata (repeatable)')
    .option('--no-worktree', 'Skip worktree creation even when named')
    .option('--model <model>', 'Claude model to use')
    .option('--permission-mode <mode>', 'Permission mode')
    .option('--effort <level>', 'Effort level (low, medium, high)')
    .option('--agent <agent>', 'Named agent')
    .allowUnknownOption()
    .action(async (name, options) => {
      const passthroughArgs = parsePassthroughArgs();
      await newCommand(name, {
        ...options,
        noWorktree: options.worktree === false,
        passthroughArgs: passthroughArgs.length ? passthroughArgs : undefined,
      });
    });

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
  program
    .command('resume <id>')
    .alias('r')
    .description('Resume a Claude session')
    .option('--model <model>', 'Claude model to use')
    .option('--permission-mode <mode>', 'Permission mode')
    .option('--effort <level>', 'Effort level (low, medium, high)')
    .option('--agent <agent>', 'Named agent')
    .option('--fork-session', 'Create a new session ID on resume')
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

  // Name
  program
    .command('name <name> [id]')
    .description('Set session name')
    .action(async (name, id) => {
      await nameCommand(name, id);
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
      const { deleteCommand } = await import('./commands/delete.js');
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
    .action((id, options) => {
      logCommand(id, { lines: options.lines, prompts: options.prompts });
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

  // Clean
  program
    .command('clean')
    .description('Find orphaned sessions')
    .option('--prune', 'Delete orphaned sessions')
    .action(async (options) => {
      await cleanCommand({ prune: options.prune });
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
  initCompletion();
  const args = process.argv.slice(2);
  if (args.length === 0 || args.every(a => a.startsWith('-'))) {
    process.argv.splice(2, 0, 'list');
  }
  createProgram().parseAsync();
}
