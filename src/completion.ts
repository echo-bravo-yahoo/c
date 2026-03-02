/**
 * Shell tab completion using omelette
 */

import { createRequire } from 'node:module';
import { readIndex } from './store/index.js';

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
  'name',
  'meta',
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
  'name',
  'meta',
  'find',
  'clean',
  'completion',
  'tmux-status',
  'tmux-pick',
];

// Flags for list command
const LIST_FLAGS = ['--all', '--done', '--archived', '--dir', '--min-width', '--max-width'];

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
 * Extract the subcommand from a completion line
 * e.g., "c show a" -> "show", "c list --all" -> "list"
 */
function getSubcommand(line: string): string | null {
  const words = line.trim().split(/\s+/);
  return words.length >= 2 ? words[1] : null;
}

/**
 * Initialize completion handler
 * Called on every CLI invocation - omelette checks if it's a completion request
 */
export function initCompletion(): void {
  const completion = omelette`c ${SUBCOMMANDS} ${({
    before,
    line,
  }: {
    before: string;
    line: string;
  }) => {
    const subcommand = getSubcommand(line);

    // Handle --dir flag value
    if (before === '--dir') {
      return getDirCompletions();
    }

    // Handle flags for list command
    if (subcommand === 'list') {
      return LIST_FLAGS;
    }

    // Commands that take session ID as second arg
    if (subcommand && SESSION_COMMANDS.includes(subcommand)) {
      return getSessionCompletions();
    }

    // tag/untag take tag name first
    if (subcommand === 'tag' || subcommand === 'untag') {
      return getTagCompletions();
    }

    return [];
  }} ${({ line }: { line: string }) => {
    // Third position: tag/untag commands take session ID
    if (line.match(/^c\s+(tag|untag)\s+\S+\s/)) {
      return getSessionCompletions();
    }
    return [];
  }}`;

  completion.init();
}

/**
 * Install shell completion
 */
export function installCompletion(): void {
  const completion = omelette('c');
  completion.setupShellInitFile();
}

/**
 * Uninstall shell completion
 */
export function uninstallCompletion(): void {
  const completion = omelette('c');
  completion.cleanupShellInitFile();
}
