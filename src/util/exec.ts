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
 * @param title - The title to set
 * @param execFn - Optional executor for testing (defaults to execSync)
 */
export function setTmuxPaneTitle(
  title: string,
  pane?: string,
  execFn: (cmd: string) => void = (cmd) => execSync(cmd, { stdio: 'ignore' })
): void {
  if (process.env.TMUX) {
    try {
      const escaped = JSON.stringify(title);
      const target = pane || process.env.TMUX_PANE;
      const flag = target ? ` -t ${target}` : '';
      execFn(`tmux select-pane${flag} -T ${escaped}`);
      execFn(`tmux set${flag} -p allow-set-title off`);
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

/**
 * Spawn an interactive child process and return its exit code.
 * Unlike execReplace, this returns control to the caller after the child exits.
 */
export function spawnInteractive(
  command: string,
  args: string[],
  options?: { cwd?: string }
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: options?.cwd,
    });

    child.on('close', (code) => resolve(code ?? 1));

    const onSigint = () => child.kill('SIGINT');
    const onSigterm = () => child.kill('SIGTERM');
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
  });
}
