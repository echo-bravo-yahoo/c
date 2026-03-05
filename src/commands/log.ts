/**
 * c log [id] - view recent transcript activity
 */

import chalk from 'chalk';
import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import { getSession, getCurrentSession } from '../store/index.ts';
import { findTranscriptPath } from '../claude/sessions.ts';
import { spawnInteractive } from '../util/exec.ts';
import { relativeTime } from '../util/format.ts';

export interface LogOptions {
  lines?: number;
  prompts?: boolean;
  tail?: boolean;
}

interface ToolUse {
  name: string;
  summary: string;
}

interface LogBlock {
  time: Date;
  role: 'user' | 'claude';
  textLines: string[];
  tools: ToolUse[];
}

/**
 * Extract a short summary for a tool use from its name and input
 */
function summarizeTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Read':
      return shortPath(input.file_path as string | undefined);
    case 'Write':
      return shortPath(input.file_path as string | undefined);
    case 'Edit':
      return shortPath(input.file_path as string | undefined);
    case 'Bash':
      return (input.command as string | undefined)?.replace(/\n/g, ' ').trim() ?? '';
    case 'Grep':
      return formatGrep(input);
    case 'Glob':
      return (input.pattern as string | undefined) ?? '';
    case 'WebSearch':
      return (input.query as string | undefined) ?? '';
    case 'WebFetch':
      return shortUrl(input.url as string | undefined);
    case 'Task':
      return (input.description as string | undefined) ?? '';
    default:
      return '';
  }
}

function shortPath(p: string | undefined): string {
  if (!p) return '';
  // Show last 2 path components
  const parts = p.split('/');
  return parts.length > 2 ? parts.slice(-2).join('/') : p;
}

function shortUrl(url: string | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname.length > 1 ? u.pathname.slice(0, 40) : '');
  } catch {
    return truncate(url, 50);
  }
}

function formatGrep(input: Record<string, unknown>): string {
  const parts: string[] = [];
  if (input.pattern) parts.push(`"${input.pattern}"`);
  if (input.glob) parts.push(`--glob ${input.glob}`);
  if (input.path) parts.push(shortPath(input.path as string));
  return truncate(parts.join(' '), 60);
}

function truncate(s: string | undefined, max: number): string {
  if (!s) return '';
  const single = s.replace(/\n/g, ' ').trim();
  return single.length > max ? single.slice(0, max - 1) + '…' : single;
}

/**
 * Extract text content from a message's content array
 */
function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('\n');
}

/**
 * Extract tool uses from a message's content array
 */
function extractToolUses(content: unknown): ToolUse[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((b: { type: string }) => b.type === 'tool_use')
    .map((b: { name: string; input: Record<string, unknown> }) => ({
      name: b.name,
      summary: summarizeTool(b.name, b.input ?? {}),
    }));
}

/**
 * Wrap text to fit within a width, returning multiple lines
 */
function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const result: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.length === 0) continue;
    const words = paragraph.split(/\s+/);
    let line = '';
    for (const word of words) {
      if (line.length === 0) {
        line = word;
      } else if (line.length + 1 + word.length <= width) {
        line += ' ' + word;
      } else {
        result.push(line);
        line = word;
      }
    }
    if (line) result.push(line);
  }
  return result.length ? result : [''];
}

export async function logCommand(idOrPrefix?: string, options?: LogOptions): Promise<void> {
  const session = idOrPrefix ? getSession(idOrPrefix) : getCurrentSession();
  if (!session) {
    const msg = idOrPrefix
      ? `Session not found: ${idOrPrefix}.`
      : 'No active session in current directory.';
    console.error(chalk.red(msg));
    process.exit(1);
  }

  const transcript = findTranscriptPath(session.id);
  if (!transcript) {
    console.error(chalk.red('Transcript not found.'));
    process.exit(1);
  }

  // --tail: open transcript in $PAGER with follow mode
  if (options?.tail) {
    const pager = process.env.PAGER || 'less';
    const pagerBase = path.basename(pager);
    const args = pagerBase === 'less' ? ['+F', transcript] : [transcript];
    const code = await spawnInteractive(pager, args);
    process.exit(code);
  }

  const fileContent = readFileSync(transcript, 'utf-8');
  const jsonLines = fileContent.trim().split('\n');
  const limit = options?.lines ?? 10;

  // Parse all entries from the transcript
  interface RawEntry {
    time: Date;
    role: 'user' | 'claude';
    text: string;
    tools: ToolUse[];
  }

  const rawEntries: RawEntry[] = [];
  for (const line of jsonLines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'human' || entry.type === 'user') {
        // Skip tool_result messages (these are tool responses, not user prompts)
        const content = entry.message?.content;
        if (Array.isArray(content) && content.length > 0 && content[0]?.type === 'tool_result') {
          continue;
        }
        const text = extractText(content);
        if (text) {
          rawEntries.push({
            time: new Date(entry.timestamp),
            role: 'user',
            text,
            tools: [],
          });
        }
      } else if (entry.type === 'assistant') {
        const content = entry.message?.content;
        const text = extractText(content);
        const tools = extractToolUses(content);
        if (text || tools.length > 0) {
          rawEntries.push({
            time: new Date(entry.timestamp),
            role: 'claude',
            text,
            tools,
          });
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  // Collapse consecutive same-role entries into blocks
  const blocks: LogBlock[] = [];
  for (const entry of rawEntries) {
    const last = blocks[blocks.length - 1];
    if (last && last.role === entry.role) {
      // Merge into existing block
      if (entry.text) {
        last.textLines.push(...entry.text.split('\n').filter(l => l.trim()));
      }
      last.tools.push(...entry.tools);
    } else {
      blocks.push({
        time: entry.time,
        role: entry.role,
        textLines: entry.text ? entry.text.split('\n').filter(l => l.trim()) : [],
        tools: [...entry.tools],
      });
    }
  }

  // Filter to user-only if --prompts
  const filtered = options?.prompts
    ? blocks.filter(b => b.role === 'user')
    : blocks;

  // Take last N blocks
  const display = filtered.slice(-limit);

  if (display.length === 0) {
    console.log(chalk.dim('  No log entries.'));
    return;
  }

  // Layout constants
  const timeCol = 10;  // "   14m ago"
  const roleCol = 8;   // "user    " or "claude  "
  const gutter = 2;    // spaces between columns
  const prefix = timeCol + gutter + roleCol + gutter; // total prefix width
  const termWidth = process.stdout.columns || 80;
  const contentWidth = Math.max(30, termWidth - prefix - 2); // -2 for left margin

  for (let i = 0; i < display.length; i++) {
    const block = display[i];
    const timeStr = chalk.dim(relativeTime(block.time).padStart(timeCol));
    const roleStr = block.role === 'user'
      ? chalk.cyan('user'.padEnd(roleCol))
      : chalk.magenta('claude'.padEnd(roleCol));

    const indent = ' '.repeat(prefix);
    const allLines: string[] = [];

    // Add wrapped text lines
    for (const tl of block.textLines) {
      allLines.push(...wrapText(tl, contentWidth));
    }

    // Add tool use lines (dim, wrapped)
    for (const tool of block.tools) {
      const toolStr = tool.summary
        ? `${tool.name} ${tool.summary}`
        : tool.name;
      const wrapped = wrapText(toolStr, contentWidth);
      for (const wl of wrapped) {
        allLines.push('\x00TOOL\x00' + wl);
      }
    }

    // Print first line with time + role prefix
    const colorText = block.role === 'user' ? (s: string) => chalk.cyan(s) : (s: string) => s;
    if (allLines.length > 0) {
      const first = allLines[0];
      if (first.startsWith('\x00TOOL\x00')) {
        console.log(`${timeStr}  ${roleStr}  ${chalk.dim(first.slice(6))}`);
      } else {
        console.log(`${timeStr}  ${roleStr}  ${colorText(first)}`);
      }
      // Remaining lines indented
      for (let j = 1; j < allLines.length; j++) {
        const l = allLines[j];
        if (l.startsWith('\x00TOOL\x00')) {
          console.log(`${indent}  ${chalk.dim(l.slice(6))}`);
        } else {
          console.log(`${indent}  ${colorText(l)}`);
        }
      }
    } else {
      console.log(`${timeStr}  ${roleStr}`);
    }

    // Blank line between blocks
    if (i < display.length - 1) {
      console.log();
    }
  }
}
