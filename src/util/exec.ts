/**
 * Shell execution utilities
 */

import { execSync, spawn } from 'node:child_process';

/**
 * Execute a command and return stdout
 */
export function exec(command: string, options?: { cwd?: string }): string {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      cwd: options?.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Set the tmux pane title (no-op if not in tmux)
 */
export function setTmuxPaneTitle(title: string): void {
  if (process.env.TMUX) {
    try {
      execSync(`tmux select-pane -T ${JSON.stringify(title)}`, { stdio: 'ignore' });
    } catch {
      // Ignore errors (e.g., tmux not available)
    }
  }
}

/**
 * Execute a command and replace the current process
 */
export function execReplace(command: string, args: string[], options?: { cwd?: string }): never {
  const child = spawn(command, args, {
    stdio: 'inherit',
    cwd: options?.cwd,
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });

  // Keep the process running until child exits
  // This prevents the parent from exiting before the child
  process.on('SIGINT', () => {
    child.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
  });

  // Return never type - process will exit via child.on('close')
  return undefined as never;
}
