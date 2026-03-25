/**
 * Tests for getDisplayName() priority order
 *
 * Requires --experimental-test-module-mocks because we mock src/claude/sessions.ts.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mock } from 'node:test';
import { resolve } from 'node:path';

let mockTitles: { customTitle: string | null; summary: string | null } = {
  customTitle: null,
  summary: null,
};

mock.module(resolve('src/claude/sessions.ts'), {
  namedExports: {
    resetSessionCaches: () => {},
    listClaudeSessions: () => [],
    getClaudeSession: () => null,
    getClaudeSessionsForDirectory: () => [],
    findTranscriptPath: () => null,
    encodeProjectKey: (dir: string) => dir.replace(/\//g, '-'),
    decodeProjectKey: (key: string) => key.replace(/-/g, '/'),
    readClaudeSessionIndex: () => null,
    getClaudeSessionTitles: () => mockTitles,
    findClaudeSessionIdsByTitle: () => [],
    getPlanExecutionInfo: () => null,
    getCustomTitleFromTranscriptTail: () => null,
    CLAUDE_DIR: '/tmp/mock-claude',
    PROJECTS_DIR: '/tmp/mock-claude/projects',
    PLANS_DIR: '/tmp/mock-claude/plans',
    extractPlanTitle: () => null,
  },
});

const { getDisplayName } = await import('../../src/util/format.ts');
const { createTestSession } = await import('../fixtures/sessions.ts');

beforeEach(() => {
  mockTitles = { customTitle: null, summary: null };
});

describe('getDisplayName priority', () => {
  it('returns customTitle from Claude index (highest priority)', () => {
    mockTitles = { customTitle: 'Index Title', summary: 'Summary' };
    const session = createTestSession({
      name: 'c-name',
      meta: { _custom_title: 'Cached Title' },
    });
    assert.strictEqual(getDisplayName(session), 'Index Title');
  });

  it('returns _custom_title when index has no customTitle', () => {
    mockTitles = { customTitle: null, summary: 'Summary' };
    const session = createTestSession({
      name: 'c-name',
      meta: { _custom_title: 'Cached Title' },
    });
    assert.strictEqual(getDisplayName(session), 'Cached Title');
  });

  it('returns session.name when no custom titles exist', () => {
    mockTitles = { customTitle: null, summary: 'Summary' };
    const session = createTestSession({ name: 'c-name' });
    assert.strictEqual(getDisplayName(session), 'c-name');
  });

  it('returns summary as last resort', () => {
    mockTitles = { customTitle: null, summary: 'Summary' };
    const session = createTestSession();
    assert.strictEqual(getDisplayName(session), 'Summary');
  });

  it('returns empty string when nothing is available', () => {
    mockTitles = { customTitle: null, summary: null };
    const session = createTestSession();
    assert.strictEqual(getDisplayName(session), '');
  });

  it('_custom_title fills gap when skipTranscript is true', () => {
    // With skipTranscript=true, getClaudeSessionTitles returns whatever the mock says.
    // The mock returns null for customTitle, simulating a session not in Claude's index.
    mockTitles = { customTitle: null, summary: null };
    const session = createTestSession({
      meta: { _custom_title: 'Cached Title' },
    });
    assert.strictEqual(getDisplayName(session, true), 'Cached Title');
  });
});
