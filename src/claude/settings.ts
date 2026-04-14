/**
 * Read model configuration from Claude Code settings files.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Read the configured model alias from the Claude Code settings cascade.
 * Checks global → project → local, with later files overriding earlier ones.
 * Returns the raw alias string (e.g. "opus[1m]") or null if not set.
 */
export function readClaudeModelAlias(cwd: string): string | null {
  const paths = [
    join(homedir(), '.claude', 'settings.json'),
    join(cwd, '.claude', 'settings.json'),
    join(cwd, '.claude', 'settings.local.json'),
  ];

  let model: string | null = null;

  for (const p of paths) {
    try {
      const data = JSON.parse(readFileSync(p, 'utf-8'));
      if (typeof data.model === 'string') {
        model = data.model;
      }
    } catch {
      // File doesn't exist or isn't valid JSON — skip
    }
  }

  return model;
}
