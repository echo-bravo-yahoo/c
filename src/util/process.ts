/**
 * Process signaling utilities for session management
 */

import chalk from 'chalk';

/**
 * Wait for a process to exit by polling kill(pid, 0).
 * Returns true if the process exited, false on timeout.
 */
async function waitForExit(pid: number, timeoutMs = 5000, intervalMs = 100): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      process.kill(pid, 0);
      await new Promise((r) => setTimeout(r, intervalMs));
    } catch {
      return true;
    }
  }
  return false;
}

/**
 * Send SIGINT to a session process and wait for exit.
 * No-ops when pid is undefined. Handles ESRCH (already dead).
 */
export async function signalSession(pid: number | undefined): Promise<void> {
  if (!pid) return;
  try {
    process.kill(pid, 'SIGINT');
    const exited = await waitForExit(pid);
    if (!exited) {
      console.log(chalk.yellow(`Process ${pid} did not exit within timeout`));
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err;
  }
}
