/**
 * GitHub username detection with caching
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import TOML from '@iarna/toml';
import { exec } from '../util/exec.js';

const CACHE_PATH = path.join(os.homedir(), '.c', 'github-cache.toml');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory cache to avoid repeated file reads within a single process
let _usernameCached = false;
let _usernameValue: string | undefined;

/**
 * Reset in-memory username cache (for testing)
 */
export function resetGitHubCache(): void {
  _usernameCached = false;
  _usernameValue = undefined;
}

interface CacheData {
  username: string;
  timestamp: number;
}

/**
 * Parse username from gh auth status output
 * Example: "  ✓ Logged in to github.com account echo-bravo-yahoo (keyring)"
 */
export function parseGitHubUsername(output: string): string | undefined {
  const match = output.match(/Logged in to github\.com account ([^\s(]+)/);
  return match?.[1];
}

/**
 * Get GitHub username, using cache if valid
 */
export function getGitHubUsername(): string | undefined {
  if (_usernameCached) return _usernameValue;
  _usernameCached = true;

  // Check file cache first
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const content = fs.readFileSync(CACHE_PATH, 'utf-8');
      const cache = TOML.parse(content) as unknown as CacheData;
      if (cache.username && cache.timestamp && Date.now() - cache.timestamp < CACHE_TTL_MS) {
        _usernameValue = cache.username;
        return _usernameValue;
      }
    }
  } catch {
    // Ignore cache read errors
  }

  // Fetch from gh CLI
  const output = exec('gh auth status 2>&1');
  const username = parseGitHubUsername(output);

  // Cache result
  if (username) {
    try {
      const cacheDir = path.dirname(CACHE_PATH);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      const cache: CacheData = { username, timestamp: Date.now() };
      fs.writeFileSync(CACHE_PATH, TOML.stringify(cache as unknown as TOML.JsonMap));
    } catch {
      // Ignore cache write errors
    }
  }

  _usernameValue = username;
  return username;
}

/**
 * Remove hyphens from a string
 */
export function dehyphenate(str: string): string {
  return str.replace(/-/g, '');
}

/**
 * Check if a branch starts with a username prefix (exact or dehyphenated)
 * Requires a separator (/ or -) after the username
 */
export function matchesUsernamePrefix(
  branch: string,
  username: string
): { matches: boolean; prefix: string } {
  const lowerBranch = branch.toLowerCase();
  const lowerUsername = username.toLowerCase();
  const dehyphenatedUsername = dehyphenate(lowerUsername);

  // Check exact match with separator
  if (lowerBranch.startsWith(lowerUsername + '/') || lowerBranch.startsWith(lowerUsername + '-')) {
    return { matches: true, prefix: branch.slice(0, username.length) };
  }

  // Check dehyphenated match with separator
  if (
    lowerBranch.startsWith(dehyphenatedUsername + '/') ||
    lowerBranch.startsWith(dehyphenatedUsername + '-')
  ) {
    return { matches: true, prefix: branch.slice(0, dehyphenatedUsername.length) };
  }

  return { matches: false, prefix: '' };
}
