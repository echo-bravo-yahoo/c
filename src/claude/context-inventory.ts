/**
 * Incremental transcript reader for the session context inventory.
 * Extracts Read/Bash file accesses and Skill invocations, keyed by turn number.
 */

import { openSync, readSync, fstatSync, closeSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SessionContextInventory } from '../store/schema.ts';

export type ReadSource = 'Read' | 'Bash';

export interface InventoryDelta {
  reads: { path: string; turn: number; via: ReadSource }[];
  skills: { name: string; turn: number }[];
  new_offset: number;
  new_turn: number;
}

/**
 * Canonicalize a file path reference into an absolute, normalized path.
 * - Expands a leading `~/` via os.homedir()
 * - Resolves relative paths against `entryCwd` (the transcript entry's cwd at that moment)
 * - Calls path.normalize; deliberately does NOT realpath (brittle across symlinks and machines)
 * - Returns null for paths containing shell globs or substitutions
 */
export function canonicalizePath(raw: string, entryCwd: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/[*?]|\$\(/.test(trimmed)) return null;

  let p = trimmed;
  if (p === '~') p = os.homedir();
  else if (p.startsWith('~/')) p = path.join(os.homedir(), p.slice(2));

  if (!path.isAbsolute(p)) {
    if (!entryCwd) return null;
    p = path.resolve(entryCwd, p);
  }
  return path.normalize(p);
}

const BASH_READERS = new Set([
  'cat', 'head', 'tail', 'less', 'more',
  'sed', 'awk', 'grep', 'rg', 'ag',
  'jq', 'yq', 'wc', 'file', 'stat',
  'md5', 'md5sum', 'sha256sum', 'xxd', 'hexdump',
]);

/**
 * Flags for common readers that take an argument (so we skip the next token).
 * Conservative: missing entries just mean the token gets treated as a path candidate,
 * which canonicalizePath or the caller can still reject.
 */
const FLAGS_WITH_ARG: Record<string, Set<string>> = {
  sed: new Set(['-e', '-f', '-i']),
  awk: new Set(['-f', '-F', '-v']),
  grep: new Set(['-e', '-f', '--include', '--exclude']),
  rg: new Set(['-e', '-g', '-t', '-T', '--type', '--type-not', '--glob']),
  ag: new Set(['-G', '--ignore']),
  head: new Set(['-n', '-c']),
  tail: new Set(['-n', '-c']),
  jq: new Set(['-f', '--arg', '--argjson', '--slurpfile', '--rawfile']),
  yq: new Set(['-f']),
};

/**
 * Split a bash command into pipeline segments on `|`, `&&`, `||`, `;`.
 * Respects single/double quotes; does NOT attempt full shell parsing.
 */
function splitSegments(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      current += c;
      if (c === quote && command[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      current += c;
      continue;
    }
    const two = command.slice(i, i + 2);
    if (c === '|' || c === ';' || two === '&&' || two === '||') {
      if (current.trim()) segments.push(current.trim());
      current = '';
      if (two === '&&' || two === '||') i++;
      continue;
    }
    current += c;
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

/**
 * Tokenize a single command segment preserving quoted strings as single tokens
 * (with quotes stripped). Very small — does not handle backtick or $() substitution.
 */
function tokenize(segment: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (quote) {
      if (c === quote && segment[i - 1] !== '\\') quote = null;
      else current += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === ' ' || c === '\t') {
      if (current) tokens.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  if (current) tokens.push(current);
  return tokens;
}

const PATTERN_FIRST = new Set(['grep', 'rg', 'ag', 'sed', 'awk', 'jq', 'yq']);

/**
 * Best-effort extraction of file paths read by a bash command.
 * Returns canonicalized absolute paths. Conservative: only extracts arguments of
 * allowlisted readers and `< path` redirects. Ignores unknown commands.
 */
export function extractBashReadPaths(command: string, cwd: string): string[] {
  const out: string[] = [];
  for (const segment of splitSegments(command)) {
    const tokens = tokenize(segment);
    if (tokens.length === 0) continue;

    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i] === '<') {
        const p = canonicalizePath(tokens[i + 1], cwd);
        if (p) out.push(p);
      }
    }

    const cmd = path.basename(tokens[0]);
    if (!BASH_READERS.has(cmd)) continue;

    const flagsWithArg = FLAGS_WITH_ARG[cmd] ?? new Set<string>();
    const positionals: string[] = [];
    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === '<' || t === '>' || t === '>>' || t === '2>' || t === '&>') {
        i++;
        continue;
      }
      if (t.startsWith('-')) {
        const eq = t.indexOf('=');
        const flagName = eq >= 0 ? t.slice(0, eq) : t;
        if (eq < 0 && flagsWithArg.has(flagName)) i++;
        continue;
      }
      positionals.push(t);
    }

    const files = PATTERN_FIRST.has(cmd) ? positionals.slice(1) : positionals;
    for (const t of files) {
      const p = canonicalizePath(t, cwd);
      if (p) out.push(p);
    }
  }
  return out;
}

interface TranscriptEntry {
  type?: string;
  cwd?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
}

/**
 * Read the transcript JSONL from `fromOffset`, walk new entries, and emit an inventory delta.
 * Tracks a running turn counter: each `user`-role entry increments the turn, and subsequent
 * tool_uses are attributed to that turn. `startTurn` is the counter value carried over from
 * the previous invocation (0 on first call).
 */
export function readTranscriptInventory(
  transcriptPath: string,
  fromOffset: number,
  startTurn: number,
  sessionCwd?: string,
): InventoryDelta | null {
  let fd: number;
  try {
    fd = openSync(transcriptPath, 'r');
  } catch {
    return null;
  }

  try {
    const stat = fstatSync(fd);
    if (fromOffset >= stat.size) return null;

    const buf = Buffer.alloc(stat.size - fromOffset);
    const bytesRead = readSync(fd, buf, 0, buf.length, fromOffset);
    if (bytesRead === 0) return null;

    const chunk = buf.toString('utf-8', 0, bytesRead);
    const lines = chunk.split('\n').filter(Boolean);

    const reads: InventoryDelta['reads'] = [];
    const skills: InventoryDelta['skills'] = [];
    let turn = startTurn;

    for (const line of lines) {
      let entry: TranscriptEntry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      const role = entry.message?.role ?? entry.type;
      if (role === 'user' || entry.type === 'user') {
        turn += 1;
        continue;
      }

      if (entry.type !== 'assistant') continue;
      const content = entry.message?.content;
      if (!Array.isArray(content)) continue;

      const entryCwd = entry.cwd ?? sessionCwd ?? '';

      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        const b = block as Record<string, unknown>;
        if (b.type !== 'tool_use') continue;

        const name = b.name as string | undefined;
        const input = (b.input as Record<string, unknown>) ?? {};

        if (name === 'Read') {
          const fp = input.file_path;
          if (typeof fp === 'string') {
            const p = canonicalizePath(fp, entryCwd);
            if (p) reads.push({ path: p, turn, via: 'Read' });
          }
        } else if (name === 'Bash') {
          const cmd = input.command;
          if (typeof cmd === 'string') {
            for (const p of extractBashReadPaths(cmd, entryCwd)) {
              reads.push({ path: p, turn, via: 'Bash' });
            }
          }
        } else if (name === 'Skill') {
          const skill = input.skill;
          if (typeof skill === 'string') {
            skills.push({ name: skill, turn });
          }
        }
      }
    }

    return {
      reads,
      skills,
      new_offset: fromOffset + bytesRead,
      new_turn: turn,
    };
  } finally {
    closeSync(fd);
  }
}

/**
 * Merge an InventoryDelta into a SessionContextInventory in place, maintaining the
 * reads / reads_via parallel-array invariant: reads_via[path] — when present — has
 * the same length and order as reads[path]. Created lazily on first Bash read.
 */
export function applyInventoryDelta(
  inv: SessionContextInventory,
  delta: InventoryDelta,
): void {
  for (const r of delta.reads) {
    const turns = (inv.reads[r.path] ??= []);
    turns.push(r.turn);

    const hasViaMap = !!inv.reads_via?.[r.path];
    if (r.via === 'Bash') {
      inv.reads_via ??= {};
      const existing = inv.reads_via[r.path];
      if (existing) {
        existing.push('Bash');
      } else {
        // Backfill: all prior entries were Read (since reads_via[path] was absent).
        inv.reads_via[r.path] = [
          ...Array<ReadSource>(turns.length - 1).fill('Read'),
          'Bash',
        ];
      }
    } else if (hasViaMap) {
      inv.reads_via![r.path].push('Read');
    }
  }

  for (const sk of delta.skills) {
    inv.skills ??= {};
    (inv.skills[sk.name] ??= []).push(sk.turn);
  }
}
