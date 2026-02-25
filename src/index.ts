#!/usr/bin/env node

/**
 * c - Claude Code session manager CLI
 */

import { Command } from 'commander';
import { listCommand } from './commands/list.js';
import { waitingCommand } from './commands/waiting.js';
import { showCommand } from './commands/show.js';
import { resumeCommand } from './commands/resume.js';
import { doneCommand } from './commands/done.js';
import { archiveCommand } from './commands/archive.js';
import { reopenCommand } from './commands/reopen.js';
import { linkCommand } from './commands/link.js';
import { unlinkCommand } from './commands/unlink.js';
import { tagCommand } from './commands/tag.js';
import { untagCommand } from './commands/untag.js';
import { titleCommand } from './commands/title.js';
import { metaCommand } from './commands/meta.js';
import { prsCommand } from './commands/prs.js';
import { jiraCommand } from './commands/jira.js';
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
  .option('--dir <directory>', 'Filter by directory')
  .action((options) => {
    listCommand({
      all: options.all,
      done: options.done,
      archived: options.archived,
      directory: options.dir,
    });
  });

// Waiting
program
  .command('waiting')
  .alias('w')
  .description('List sessions waiting for input')
  .action(() => {
    waitingCommand();
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

// Reopen
program
  .command('reopen <id>')
  .description('Reopen a done/archived session')
  .action((id) => {
    reopenCommand(id);
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
  .description('Add tag to session')
  .action((tag, id) => {
    tagCommand(tag, id);
  });

// Untag
program
  .command('untag <tag> [id]')
  .description('Remove tag from session')
  .action((tag, id) => {
    untagCommand(tag, id);
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

// PRs
program
  .command('prs')
  .description('List PRs across sessions')
  .action(() => {
    prsCommand();
  });

// JIRA
program
  .command('jira')
  .description('List JIRA tickets across sessions')
  .action(() => {
    jiraCommand();
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

program.parse();
