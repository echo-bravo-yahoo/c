/**
 * Capture the portion of session context that Claude Code injects at startup —
 * stuff that never appears as tool calls in the transcript, so we must read it
 * directly from disk at session-start time.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { canonicalizePath } from './context-inventory.ts';
import type { SessionContextInventory } from '../store/schema.ts';

/**
 * Walk from `cwd` upward to the filesystem root collecting every CLAUDE.md found,
 * then append the user-global `~/.claude/CLAUDE.md` if it exists.
 * Returns absolute paths in discovery order (project-closest first, user-global last).
 */
export function walkClaudeMdHierarchy(cwd: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  let dir = path.resolve(cwd);

  while (true) {
    const candidate = path.join(dir, 'CLAUDE.md');
    if (existsSync(candidate) && !seen.has(candidate)) {
      found.push(candidate);
      seen.add(candidate);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const userGlobal = path.join(os.homedir(), '.claude', 'CLAUDE.md');
  if (existsSync(userGlobal) && !seen.has(userGlobal)) {
    found.push(userGlobal);
  }

  return found;
}

/**
 * Match `@path` references inside a CLAUDE.md-style file. Only counts a match as
 * an import when the resolved path exists — filters out false positives like
 * `@mention`, email addresses, etc.
 */
function extractImports(content: string, baseDir: string): string[] {
  const out: string[] = [];
  const re = /(?:^|[\s(])@([^\s),]+)/g;
  for (const match of content.matchAll(re)) {
    const raw = match[1];
    const resolved = canonicalizePath(raw, baseDir);
    if (!resolved) continue;
    try {
      if (statSync(resolved).isFile()) out.push(resolved);
    } catch {
      // not a regular file; skip
    }
  }
  return out;
}

/**
 * Recursively resolve `@`-import closure starting from the given CLAUDE.md files.
 * Returns deduped absolute paths in first-seen order. Seed files themselves are
 * excluded (those already go into `claude_md`).
 */
export function resolveClaudeMdImports(claudeMdFiles: string[]): string[] {
  const seen = new Set<string>(claudeMdFiles);
  const result: string[] = [];
  const stack = [...claudeMdFiles];

  while (stack.length > 0) {
    const file = stack.pop()!;
    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    for (const imp of extractImports(content, path.dirname(file))) {
      if (seen.has(imp)) continue;
      seen.add(imp);
      result.push(imp);
      stack.push(imp);
    }
  }

  return result;
}

/**
 * Locate the auto-memory index file for a project.
 */
export function findMemoryIndex(projectKey: string): string | undefined {
  const p = path.join(os.homedir(), '.claude', 'projects', projectKey, 'memory', 'MEMORY.md');
  return existsSync(p) ? p : undefined;
}

/**
 * Read MCP server config from the Claude Code settings cascade. Later files override
 * earlier ones, which matches Claude Code's own precedence (global → project → local).
 * Returns a map of server name → tool count. Tool counts are 0 when not derivable
 * without running the server — presence is the signal.
 */
export function readMcpServers(cwd: string): Record<string, number> {
  const paths = [
    path.join(os.homedir(), '.claude', 'settings.json'),
    path.join(cwd, '.claude', 'settings.json'),
    path.join(cwd, '.claude', 'settings.local.json'),
  ];

  const servers: Record<string, number> = {};
  for (const p of paths) {
    try {
      const data = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
      const mcp = data.mcpServers;
      if (mcp && typeof mcp === 'object') {
        for (const name of Object.keys(mcp)) {
          servers[name] = 0;
        }
      }
    } catch {
      // missing or malformed — skip
    }
  }
  return servers;
}

/**
 * Assemble the static portion of the context inventory that Claude Code loads at
 * session start. Intended to be called once per session.
 */
export function capturePreloadedContext(
  cwd: string,
  projectKey: string,
): Partial<SessionContextInventory> {
  const claudeMd = walkClaudeMdHierarchy(cwd);
  const imports = resolveClaudeMdImports(claudeMd);
  const memoryIndex = findMemoryIndex(projectKey);
  const mcpServers = readMcpServers(cwd);

  const result: Partial<SessionContextInventory> = {};
  if (claudeMd.length) result.claude_md = claudeMd;
  if (imports.length) result.claude_md_imports = imports;
  if (memoryIndex) result.memory_index = memoryIndex;
  if (Object.keys(mcpServers).length) result.mcp_servers = mcpServers;
  return result;
}
