/**
 * Debug logging to file (avoids Claude TUI clobbering stderr)
 */

import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { loadConfig } from '../config.ts';

const DEFAULT_LOG_PATH = join(process.env.C_HOME || join(homedir(), '.c'), 'debug.log');

function getLogPath(): string | null {
  if (process.env.C_DEBUG) return DEFAULT_LOG_PATH;
  try {
    const config = loadConfig();
    if (config.debug) return config.debug.replace(/^~/, homedir());
  } catch { /* never break hooks */ }
  return null;
}

export function debugLog(msg: string): void {
  const logPath = getLogPath();
  if (logPath) {
    appendFileSync(logPath, `${new Date().toISOString()} ${msg}\n`);
  }
}
