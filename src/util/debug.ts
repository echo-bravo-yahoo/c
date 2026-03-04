/**
 * Debug logging to file (avoids Claude TUI clobbering stderr)
 */

import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LOG_PATH = join(process.env.C_HOME || join(homedir(), '.c'), 'debug.log');

export function debugLog(msg: string): void {
  if (process.env.C_DEBUG) {
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`);
  }
}
