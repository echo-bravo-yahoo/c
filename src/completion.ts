/**
 * Shell tab completion using omelette
 */

import { createRequire } from 'node:module';
import { readIndex } from './store/index.ts';

const require = createRequire(import.meta.url);
const omelette = require('omelette');

// Subcommands that take a session ID
const SESSION_COMMANDS = [
  'show',
  'resume',
  'archive',
  'close',
  'link',
  'unlink',
  'tag',
  'rename',
  'name',
  'meta',
  'cd',
  'dir',
  'exec',
  'delete',
  'open',
  'log',
  'memory',
];

// All subcommands
const SUBCOMMANDS = [
  'list',
  'new',
  'waiting',
  'show',
  'resume',
  'archive',
  'close',
  'link',
  'unlink',
  'tag',
  'untag',
  'rename',
  'name',
  'meta',
  'find',
  'cd',
  'dir',
  'exec',
  'delete',
  'open',
  'log',
  'memory',
  'stats',
  'repair',
  'completion',
  'tmux-status',
  'tmux-pick',
];

// Flags for list command
const LIST_FLAGS = [
  '--state', '--branch', '--repo', '--tag', '--name',
  '--worktree', '--prs', '--jira', '--repos', '--dir',
  '--sort', '--flat', '--bottom-up', '--json',
  '--min-width', '--max-width',
];

// Flags per subcommand (commands with no flags are omitted)
const COMMAND_FLAGS: Record<string, string[]> = {
  new:        ['--jira', '--pr', '--branch', '--note', '--meta', '--no-worktree', '--ephemeral', '--model', '--permission-mode', '--effort', '--agent'],
  resume:     ['--model', '--permission-mode', '--effort', '--agent', '--fork-session'],
  show:       ['--json'],
  find:       ['--json'],
  close:      ['-a', '--archive'],
  link:       ['--pr', '--jira', '--branch'],
  unlink:     ['--pr', '--jira', '--branch'],
  open:       ['--pr', '--jira'],
  log:        ['-n', '--lines', '--prompts', '--tail'],
  memory:     ['--raw'],
  delete:     ['--orphans', '--closed'],
  bankruptcy: ['--skip'],
};

/**
 * Get session completions (short IDs + names)
 */
function getSessionCompletions(): string[] {
  try {
    const index = readIndex();
    const completions: string[] = [];
    for (const session of Object.values(index.sessions)) {
      completions.push(session.id.slice(0, 8));
      if (session.name) {
        completions.push(session.name);
      }
    }
    return completions;
  } catch {
    return [];
  }
}

/**
 * Get tag completions from all sessions
 */
function getTagCompletions(): string[] {
  try {
    const index = readIndex();
    const tags = new Set<string>();
    for (const session of Object.values(index.sessions)) {
      for (const tag of session.tags?.values ?? []) {
        tags.add(tag);
      }
    }
    return [...tags];
  } catch {
    return [];
  }
}

/**
 * Get directory completions from sessions
 */
function getDirCompletions(): string[] {
  try {
    const index = readIndex();
    const dirs = new Set<string>();
    for (const session of Object.values(index.sessions)) {
      dirs.add(session.directory);
    }
    return [...dirs];
  } catch {
    return [];
  }
}

/**
 * Get branch completions from all sessions
 */
function getBranchCompletions(): string[] {
  try {
    const index = readIndex();
    const branches = new Set<string>();
    for (const s of Object.values(index.sessions)) {
      if (s.resources.branch) branches.add(s.resources.branch);
    }
    return [...branches];
  } catch {
    return [];
  }
}

/**
 * Get repo name completions from all sessions
 */
function getRepoCompletions(): string[] {
  try {
    const index = readIndex();
    const repos = new Set<string>();
    for (const s of Object.values(index.sessions)) {
      repos.add(s.directory.split('/').pop() || s.directory);
    }
    return [...repos];
  } catch {
    return [];
  }
}

/**
 * Get session name completions
 */
function getNameCompletions(): string[] {
  try {
    const index = readIndex();
    const names = new Set<string>();
    for (const s of Object.values(index.sessions)) {
      if (s.name) names.add(s.name);
    }
    return [...names];
  } catch {
    return [];
  }
}

/**
 * Get worktree name completions
 */
function getWorktreeCompletions(): string[] {
  try {
    const index = readIndex();
    const worktrees = new Set<string>();
    for (const s of Object.values(index.sessions)) {
      if (s.resources.worktree) worktrees.add(s.resources.worktree);
    }
    return [...worktrees];
  } catch {
    return [];
  }
}

/**
 * Extract the subcommand from a completion line.
 * Only considers the first positional arg (skips flags and their values).
 */
function getSubcommand(line: string): string | null {
  const words = line.trim().split(/\s+/);
  // Skip "c", then find first word that isn't a flag or flag value
  const FLAGS_WITH_VALUES = [
    '--state', '--branch', '--repo', '--tag', '--name',
    '--worktree', '--dir', '--sort', '--min-width', '--max-width',
    '--jira', '--pr', '--note', '--meta', '--model',
    '--permission-mode', '--effort', '--agent', '--skip',
  ];
  let skipNext = false;
  for (let i = 1; i < words.length; i++) {
    if (skipNext) { skipNext = false; continue; }
    if (FLAGS_WITH_VALUES.includes(words[i])) { skipNext = true; continue; }
    if (words[i].startsWith('-')) continue;
    return words[i];
  }
  return null;
}

/**
 * Get the flag that expects a value at the current cursor position.
 * Checks both `before` (cursor right after flag) and the second-to-last
 * word in the line (cursor has partial input after the flag).
 */
function getActiveFlag(before: string, line: string): string | null {
  const FLAGS_WITH_VALUES = [
    '--dir', '--state', '--branch', '--repo', '--tag',
    '--name', '--worktree', '--sort',
  ];
  if (FLAGS_WITH_VALUES.includes(before)) return before;
  // Check if the word before `before` is a flag (partial value typed)
  const words = line.trim().split(/\s+/);
  if (words.length >= 2) {
    const prev = words[words.length - 2];
    if (FLAGS_WITH_VALUES.includes(prev)) return prev;
  }
  return null;
}

/**
 * Shared completion logic for any position.
 * Returns completions based on the previous word (before) and full line.
 */
export function getCompletions(before: string, line: string): string[] {
  const subcommand = getSubcommand(line);

  // Handle flag value completions (position-independent)
  const flag = getActiveFlag(before, line);
  if (flag === '--dir') return getDirCompletions();
  if (flag === '--state') return ['all', 'busy', 'idle', 'waiting', 'closed', 'archived'];
  if (flag === '--branch') return getBranchCompletions();
  if (flag === '--repo') return getRepoCompletions();
  if (flag === '--tag') return getTagCompletions();
  if (flag === '--name') return getNameCompletions();
  if (flag === '--worktree') return getWorktreeCompletions();
  if (flag === '--sort') return ['active', 'created', 'name', 'size', 'status', 'repo'];

  // Check if the user is typing a flag (current word starts with -)
  const currentWord = line.trimEnd().split(/\s+/).pop() ?? '';
  if (currentWord.startsWith('-')) {
    if (subcommand === 'list' || !subcommand) return LIST_FLAGS;
    return COMMAND_FLAGS[subcommand] ?? [];
  }

  // Positional completions below

  // Handle flags for list command (or bare flags with no subcommand = implicit list)
  if (subcommand === 'list' || !subcommand) {
    return LIST_FLAGS;
  }

  // tag/untag: first arg is tag name, second is session ID
  if (subcommand === 'tag' || subcommand === 'untag') {
    // If a tag is already typed (3+ words after "c tag/untag"), offer session IDs
    if (line.match(/^c\s+(tag|untag)\s+\S+\s/)) {
      return getSessionCompletions();
    }
    return getTagCompletions();
  }

  // Commands that take session ID as second arg
  if (subcommand && SESSION_COMMANDS.includes(subcommand)) {
    return getSessionCompletions();
  }

  return [];
}

/**
 * Initialize completion handler
 * Called on every CLI invocation - omelette checks if it's a completion request
 */
export function initCompletion(): void {
  const handler = ({ before, line }: { before: string; line: string }) => {
    const results = getCompletions(before, line);
    // Filter by partial word for shells that don't filter (zsh compadd --)
    const partial = line.trim().split(/\s+/).pop() ?? '';
    if (partial) {
      const filtered = results.filter(r => r.toLowerCase().startsWith(partial.toLowerCase()));
      if (filtered.length > 0) return filtered;
    }
    return results;
  };

  // Define enough positions to cover: c <sub> <arg> --flag <value> --flag <value>
  const completion = omelette`c ${SUBCOMMANDS} ${handler} ${handler} ${handler} ${handler} ${handler} ${handler} ${handler}`;

  completion.init();
}

/**
 * Install shell completion
 */
export function installCompletion(): void {
  const completion = omelette('c');
  completion.setupShellInitFile();

  console.log('\nTo enable \'c cd\', add to your shell profile:');
  console.log('  eval "$(c init)"');
}

/**
 * Uninstall shell completion
 */
export function uninstallCompletion(): void {
  const completion = omelette('c');
  completion.cleanupShellInitFile();
}
