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
 * Execute a command, forwarding stdio, and return the exit code.
 * Callers should follow up with process.exit(code).
 *
 * Uses the same Promise-based pattern as spawnInteractive to avoid
 * hanging when signal listeners keep the event loop alive.
 */
export function execReplace(
  command: string,
  args: string[],
  options?: { cwd?: string }
): Promise<number> {
  const debug = !!process.env.C_DEBUG;

  return new Promise((resolve, reject) => {
    if (debug) console.error(`[c:debug] spawn ${command} ${args.join(' ')}`);

    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: options?.cwd,
    });

    child.on('error', (err) => {
      if (debug) console.error(`[c:debug] child error: ${err.message}`);
      reject(err);
    });

    child.on('close', (code) => {
      if (debug) console.error(`[c:debug] child close: code=${code}`);
      resolve(code ?? 1);
    });

    const onSigint = () => child.kill('SIGINT');
    const onSigterm = () => child.kill('SIGTERM');
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
  });
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
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: options?.cwd,
    });

    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));

    const onSigint = () => child.kill('SIGINT');
    const onSigterm = () => child.kill('SIGTERM');
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
  });
}
