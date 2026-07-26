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
let mockUnskippedTitles: { customTitle: string | null; summary: string | null } = {
  customTitle: null,
  summary: null,
};
let mockSizes = new Map<string, number>();
let lastSkipTranscript: boolean | undefined;

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
    getClaudeSessionTitles: (_id: string, _pk: string, skipTranscript?: boolean) => {
      lastSkipTranscript = skipTranscript;
      return skipTranscript ? mockTitles : mockUnskippedTitles;
    },
    findClaudeSessionIdsByTitle: () => [],
    getPlanExecutionInfo: () => null,
    getPlanExecutionInfoBefore: () => null,
    getPlanContinuationInfo: () => null,
    getCustomTitleFromTranscriptTail: () => null,
    getCwdFromTranscriptHead: () => null,
    CLAUDE_DIR: '/tmp/mock-claude',
    PROJECTS_DIR: '/tmp/mock-claude/projects',
    PLANS_DIR: '/tmp/mock-claude/plans',
    extractPlanTitle: () => null,
    listClaudeSessionSizes: () => mockSizes,
  },
});

const { getDisplayName } = await import('../../src/util/format.ts');
const { createTestSession } = await import('../fixtures/sessions.ts');

beforeEach(() => {
  mockTitles = { customTitle: null, summary: null };
  mockUnskippedTitles = { customTitle: null, summary: null };
  mockSizes = new Map();
  lastSkipTranscript = undefined;
});

describe('getDisplayName priority', () => {
  it('returns customTitle from Claude index (highest priority)', () => {
    mockUnskippedTitles = { customTitle: 'Index Title', summary: 'Summary' };
    const session = createTestSession({
      name: 'c-name',
      meta: { _custom_title: 'Cached Title' },
    });
    assert.strictEqual(getDisplayName(session), 'Index Title');
  });

  it('returns _custom_title when index has no customTitle', () => {
    mockUnskippedTitles = { customTitle: null, summary: 'Summary' };
    const session = createTestSession({
      name: 'c-name',
      meta: { _custom_title: 'Cached Title' },
    });
    assert.strictEqual(getDisplayName(session), 'Cached Title');
  });

  it('returns session.name when no custom titles exist', () => {
    mockUnskippedTitles = { customTitle: null, summary: 'Summary' };
    const session = createTestSession({ name: 'c-name' });
    assert.strictEqual(getDisplayName(session), 'c-name');
  });

  it('returns summary as last resort', () => {
    mockUnskippedTitles = { customTitle: null, summary: 'Summary' };
    const session = createTestSession();
    assert.strictEqual(getDisplayName(session), 'Summary');
  });

  it('returns empty string when nothing is available', () => {
    mockUnskippedTitles = { customTitle: null, summary: null };
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

  it('a matching _title_checked_size forces the skip regardless of the caller\'s own flag', () => {
    mockTitles = { customTitle: null, summary: null };
    mockUnskippedTitles = { customTitle: 'Found By Scanning', summary: null };
    mockSizes = new Map([['sess1', 500]]);
    const session = createTestSession({
      id: 'sess1',
      meta: { _title_checked_size: '500' },
    });
    assert.strictEqual(getDisplayName(session), '');
    assert.strictEqual(lastSkipTranscript, true);
  });

  it('a grown transcript invalidates the negative-cache sentinel', () => {
    mockTitles = { customTitle: null, summary: null };
    mockUnskippedTitles = { customTitle: 'Found By Scanning', summary: null };
    mockSizes = new Map([['sess1', 800]]);
    const session = createTestSession({
      id: 'sess1',
      meta: { _title_checked_size: '500' },
    });
    assert.strictEqual(getDisplayName(session), 'Found By Scanning');
    assert.strictEqual(lastSkipTranscript, false);
  });
});
