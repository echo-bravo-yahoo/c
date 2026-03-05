/**
 * Claude session test fixtures
 */

import type { ClaudeSessionIndexEntry, ClaudeSessionIndex } from '../../src/claude/sessions.ts';

/**
 * Create a Claude session index entry
 */
export function createClaudeIndexEntry(overrides: Partial<ClaudeSessionIndexEntry> = {}): ClaudeSessionIndexEntry {
  const sessionId = overrides.sessionId ?? 'test-session-uuid';
  const projectPath = overrides.projectPath ?? '/home/test/project';

  return {
    sessionId,
    fullPath: overrides.fullPath ?? `/home/test/.claude/projects/-home-test-project/${sessionId}.jsonl`,
    fileMtime: overrides.fileMtime ?? Date.now(),
    firstPrompt: overrides.firstPrompt ?? 'Test prompt',
    customTitle: overrides.customTitle,
    summary: overrides.summary,
    messageCount: overrides.messageCount ?? 10,
    created: overrides.created ?? new Date().toISOString(),
    modified: overrides.modified ?? new Date().toISOString(),
    gitBranch: overrides.gitBranch,
    projectPath,
    isSidechain: overrides.isSidechain ?? false,
  };
}

/**
 * Create a Claude session index
 */
export function createClaudeSessionIndex(entries: ClaudeSessionIndexEntry[], projectPath = '/home/test/project'): ClaudeSessionIndex {
  return {
    version: 1,
    entries,
    originalPath: projectPath,
  };
}

/**
 * Create a transcript JSONL content
 */
export function createTranscriptContent(entries: Array<{
  type: string;
  [key: string]: unknown;
}>): string {
  return entries.map(e => JSON.stringify(e)).join('\n');
}

/**
 * Create a transcript with a custom-title entry
 */
export function createTranscriptWithTitle(title: string): string {
  return createTranscriptContent([
    { type: 'user', message: 'Hello' },
    { type: 'assistant', message: 'Hi there' },
    { type: 'custom-title', customTitle: title },
  ]);
}

/**
 * Create a transcript with ExitPlanMode
 */
export function createTranscriptWithPlanExecution(slug?: string): string {
  return createTranscriptContent([
    { type: 'user', message: 'Plan the task' },
    {
      type: 'assistant',
      slug: slug ?? 'plan-slug',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'ExitPlanMode',
            input: {},
          },
        ],
      },
    },
  ]);
}
