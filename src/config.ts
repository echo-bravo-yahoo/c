/**
 * User configuration via cosmiconfig
 *
 * Searches: ~/.config/c/config.yaml, ~/.config/c/config.json, ~/.crc.yaml, ~/.crc, package.json#c
 */

import { cosmiconfigSync } from 'cosmiconfig';

export interface CConfig {
  debug?: string;
  list?: Record<string, unknown>;
  new?: Record<string, unknown>;
  resume?: Record<string, unknown>;
}

let cached: CConfig | null | undefined;

export function loadConfig(): CConfig {
  if (cached !== undefined) return cached ?? {};
  const explorer = cosmiconfigSync('c');
  const result = explorer.search();
  cached = (result?.config as CConfig) ?? null;
  return cached ?? {};
}

/**
 * Merge config defaults with CLI options. CLI wins for any defined key.
 */
export function mergeOptions<T>(
  defaults: Record<string, unknown> | undefined,
  cli: T
): T {
  if (!defaults) return cli;
  const merged = { ...defaults } as Record<string, unknown>;
  for (const [key, value] of Object.entries(cli as Record<string, unknown>)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged as T;
}

/**
 * Reset cached config (for testing)
 */
export function resetConfig(): void {
  cached = undefined;
}
