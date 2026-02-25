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
import { doneCommand } from './commands/done.js';
import { archiveCommand } from './commands/archive.js';
import { linkCommand } from './commands/link.js';
import { unlinkCommand } from './commands/unlink.js';
import { tagCommand } from './commands/tag.js';
import { titleCommand } from './commands/title.js';
import { metaCommand } from './commands/meta.js';
import { findCommand } from './commands/find.js';
import { cleanCommand } from './commands/clean.js';
import { tmuxStatusCommand } from './commands/tmux/status.js';
import { tmuxPickCommand } from './commands/tmux/pick.js';
import { handleHook } from './hooks/index.js';

const program = new Command();

program
  .name('c')
  .description('Claude Code session manager')
  .version('0.1.0');

// Default command: list
program
  .command('list', { isDefault: true })
  .description('List sessions')
  .option('-a, --all', 'Show all sessions including done/archived')
  .option('-d, --done', 'Show only done sessions')
  .option('--archived', 'Show only archived sessions')
  .option('-w, --waiting', 'Show only sessions waiting for input')
  .option('--prs', 'Show sessions with linked PRs')
  .option('--jira', 'Show sessions with linked JIRA tickets')
  .option('--dir <directory>', 'Filter by directory')
  .action(async (options) => {
    await listCommand({
      all: options.all,
      done: options.done,
      archived: options.archived,
      waiting: options.waiting,
      prs: options.prs,
      jira: options.jira,
      directory: options.dir,
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
  .action(async (name, options) => {
    await newCommand(name, options);
  });

// Waiting (alias for list --waiting)
program
  .command('waiting')
  .description('List sessions waiting for input')
  .action(async () => {
    await listCommand({ waiting: true });
  });

// Show
program
  .command('show <id>')
  .description('Show session details')
  .action((id) => {
    showCommand(id);
  });

// Resume
program
  .command('resume <id>')
  .alias('r')
  .description('Resume a Claude session')
  .action((id) => {
    resumeCommand(id);
  });

// Done
program
  .command('done [id]')
  .description('Mark session as done')
  .action((id) => {
    doneCommand(id);
  });

// Archive
program
  .command('archive [id]')
  .description('Mark session as archived')
  .action((id) => {
    archiveCommand(id);
  });

// Link
program
  .command('link [id]')
  .description('Link resources to session')
  .option('--pr <url>', 'Link PR URL')
  .option('--jira <ticket>', 'Link JIRA ticket')
  .option('--branch <name>', 'Link branch name')
  .action((id, options) => {
    linkCommand(
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
  .action((id, options) => {
    unlinkCommand(
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
  .description('Add or remove tag from session')
  .option('-d, --remove', 'Remove the tag instead of adding')
  .action((tag, id, options) => {
    tagCommand(tag, id, { remove: options.remove });
  });

// Title
program
  .command('title <title> [id]')
  .description('Set session title')
  .action((title, id) => {
    titleCommand(title, id);
  });

// Meta
program
  .command('meta <keyvalue> [id]')
  .description('Set session metadata (key=value)')
  .action((keyvalue, id) => {
    metaCommand(keyvalue, id);
  });

// Find
program
  .command('find <query>')
  .alias('f')
  .description('Search sessions')
  .action((query) => {
    findCommand(query);
  });

// Clean
program
  .command('clean')
  .description('Find orphaned sessions')
  .option('--prune', 'Delete orphaned sessions')
  .action((options) => {
    cleanCommand({ prune: options.prune });
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

// Initialize completion (handles --compgen flags from shell)
initCompletion();

program.parse();
