/**
 * Golden-output byte-identity harness for the session table.
 *
 * Renders a fixture matrix across many terminal widths with ANSI + OSC 8
 * enabled, and compares the raw output against a committed golden file. This
 * locks `printSessionTable`'s exact bytes so the table-rendering extraction
 * into `@echobravoyahoo/tables` stays behavior-preserving.
 *
 * Regenerate the golden file after an intentional change:
 *   UPDATE_GOLDEN=1 node --experimental-strip-types --experimental-test-module-mocks \
 *     --test test/util/golden-table.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mock } from 'node:test';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { useFakeTime } from '../setup.ts';

// --- Mock the environment seams so output is host-independent ---

// Repo slugs keyed by directory (drives repo/branch hyperlinks).
const SLUGS: Record<string, string> = {
  '/home/test/myapp': 'test/myapp',
  '/home/test/payments': 'test/payments',
};

function dehyphenate(str: string): string {
  return str.replace(/-/g, '');
}

mock.module(resolve('src/detection/github.ts'), {
  namedExports: {
    resetGitHubCache: () => {},
    parseGitHubUsername: () => undefined,
    getGitHubUsername: () => 'testuser',
    dehyphenate,
    matchesUsernamePrefix: (branch: string, username: string) => {
      const lowerBranch = branch.toLowerCase();
      const lowerUsername = username.toLowerCase();
      const dh = dehyphenate(lowerUsername);
      if (lowerBranch.startsWith(lowerUsername + '/') || lowerBranch.startsWith(lowerUsername + '-')) {
        return { matches: true, prefix: branch.slice(0, username.length) };
      }
      if (lowerBranch.startsWith(dh + '/') || lowerBranch.startsWith(dh + '-')) {
        return { matches: true, prefix: branch.slice(0, dh.length) };
      }
      return { matches: false, prefix: '' };
    },
  },
});

mock.module(resolve('src/detection/git.ts'), {
  namedExports: {
    resetGitCaches: () => {},
    getCurrentBranch: () => undefined,
    hasCommits: () => false,
    getGitRoot: () => undefined,
    isWorktree: () => false,
    getWorktreeInfo: () => undefined,
    extractRepoRoot: () => null,
    getRepoSlug: (dir: string) => SLUGS[dir],
    listWorktrees: () => [],
  },
});

// Fixed file sizes (drives the Size column) keyed by session id.
const SIZES: Record<string, number> = {
  'aaaa1111-0000-0000-0000-000000000000': 1536,
  'aaaa2222-0000-0000-0000-000000000000': 2621440,
};

mock.module(resolve('src/claude/sessions.ts'), {
  namedExports: {
    resetSessionCaches: () => {},
    listClaudeSessions: () => Object.entries(SIZES).map(([id, fileSize]) => ({ id, fileSize })),
    getClaudeSession: () => null,
    getClaudeSessionsForDirectory: () => [],
    findTranscriptPath: () => null,
    encodeProjectKey: (dir: string) => dir.replace(/\//g, '-'),
    decodeProjectKey: (key: string) => key.replace(/-/g, '/'),
    readClaudeSessionIndex: () => null,
    getClaudeSessionTitles: () => ({}),
    findClaudeSessionIdsByTitle: () => [],
    getPlanExecutionInfo: () => null,
    getPlanContinuationInfo: () => null,
    getCustomTitleFromTranscriptTail: () => null,
    getCwdFromTranscriptHead: () => null,
    CLAUDE_DIR: '/tmp/mock-claude',
    PROJECTS_DIR: '/tmp/mock-claude/projects',
    PLANS_DIR: '/tmp/mock-claude/plans',
    extractPlanTitle: () => null,
  },
});

const { printSessionTable } = await import('../../src/util/format.ts');
const { updateIndex, getAllSessions, resetIndexCache } = await import('../../src/store/index.ts');
const { createTestSession } = await import('../fixtures/sessions.ts');
import type { SessionOverrides } from '../fixtures/sessions.ts';
import type { Session } from '../../src/store/schema.ts';

const WIDTHS = [29, 35, 41, 47, 52, 60, 80, 100, 120, 150, 200];

const FAKE_NOW = new Date('2024-06-15T12:00:00Z').getTime();

// --- Fixtures: full set is seeded into the store; visible subset is rendered ---

function t(iso: string): Date {
  return new Date(iso);
}

// Group A: flat roots covering branch/worktree/pr/jira/tag/cost/usage/long names/icon.
const fixtures: SessionOverrides[] = [
  {
    id: 'aaaa1111-0000-0000-0000-000000000000',
    name: 'auth-refactor', state: 'busy', directory: '/home/test/myapp',
    resources: { branch: 'feat/auth' },
    cost_usd: 1.23, context_pct: 42,
    last_active_at: t('2024-06-15T11:55:00Z'),
  },
  {
    id: 'aaaa2222-0000-0000-0000-000000000000',
    name: 'billing-fix', state: 'closed', directory: '/home/test/payments',
    resources: { branch: 'fix/billing', pr: 'https://github.com/o/r/pull/42', jira: 'PROJ-7' },
    tags: ['urgent'],
    last_active_at: t('2024-06-14T12:00:00Z'),
  },
  {
    id: 'bbbb0000-0000-0000-0000-000000000000',
    name: '', state: 'idle', directory: '/home/test/web',
    resources: { worktree: 'wt-feature', branch: 'some-branch' },
    context_pct: 5,
    last_active_at: t('2024-06-15T11:00:00Z'),
  },
  {
    id: 'cccc0000-0000-0000-0000-000000000000',
    name: 'a-very-long-session-name-that-exceeds-the-column-width-by-a-large-margin',
    state: 'waiting', directory: '/home/test/infra',
    resources: { jira: 'INF-100' },
    cost_usd: 0.004, context_pct: 75,
    last_active_at: t('2024-06-15T09:00:00Z'),
  },
  {
    id: 'dddd0000-0000-0000-0000-000000000000',
    name: 'icon-branch', state: 'busy', directory: '/home/test/repo',
    resources: { branch: 'testuser/cool-feature' },
    last_active_at: t('2024-06-15T11:59:30Z'),
  },
];

// Group B: ancestry + depth nesting (some ancestors archived = hidden).
const parentP1: SessionOverrides = {
  id: 'e1110000-0000-0000-0000-000000000000',
  name: 'parent-root', state: 'busy', directory: '/home/test/myapp',
  resources: { branch: 'main' }, last_active_at: t('2024-06-15T10:00:00Z'),
};
const childC1: SessionOverrides = {
  id: 'e2220000-0000-0000-0000-000000000000',
  name: 'child-one', state: 'busy', directory: '/home/test/myapp',
  resources: { branch: 'feat/child' }, parent_session_id: parentP1.id,
  last_active_at: t('2024-06-15T10:05:00Z'),
};
const grandG1: SessionOverrides = {
  id: 'e3330000-0000-0000-0000-000000000000',
  name: 'grandchild', state: 'busy', directory: '/home/test/myapp',
  resources: { branch: 'feat/grand' }, parent_session_id: childC1.id,
  last_active_at: t('2024-06-15T10:10:00Z'),
};

const archRoot: SessionOverrides = {
  id: 'f1110000-0000-0000-0000-000000000000',
  name: 'archived-root', state: 'archived', directory: '/home/test/myapp',
  last_active_at: t('2024-06-13T10:00:00Z'),
};
const archMid: SessionOverrides = {
  id: 'f2220000-0000-0000-0000-000000000000',
  name: 'archived-mid', state: 'archived', directory: '/home/test/myapp',
  parent_session_id: archRoot.id, last_active_at: t('2024-06-13T11:00:00Z'),
};
const deepVisible: SessionOverrides = {
  id: 'f3330000-0000-0000-0000-000000000000',
  name: 'deep-visible', state: 'busy', directory: '/home/test/myapp',
  resources: { branch: 'feat/deep' }, parent_session_id: archMid.id,
  last_active_at: t('2024-06-15T08:00:00Z'),
};

const ancestryFixtures = [parentP1, childC1, grandG1, archRoot, archMid, deepVisible];

const allFixtureSpecs = [...fixtures, ...ancestryFixtures];

function isVisible(s: Session): boolean {
  return s.state !== 'archived';
}

function renderMatrix(): string {
  const out: string[] = [];
  const captured: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => { captured.push(args.map(String).join(' ')); };

  const savedTTY = process.stdout.isTTY;
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

  try {
    const all = getAllSessions();
    const visible = all.filter(isVisible);

    for (const width of WIDTHS) {
      captured.length = 0;
      printSessionTable(visible, width, all, { skipTranscript: true });
      out.push(`=== width ${width} (top-down) ===`);
      out.push(...captured);
      out.push('');
    }

    // Bottom-up at one representative width to cover the ┌ connector.
    captured.length = 0;
    printSessionTable(visible, 120, all, { skipTranscript: true, bottomUp: true });
    out.push('=== width 120 (bottom-up) ===');
    out.push(...captured);
    out.push('');

    // Flat at one width to cover the no-nesting path.
    captured.length = 0;
    printSessionTable(visible, 120, all, { skipTranscript: true, flat: true });
    out.push('=== width 120 (flat) ===');
    out.push(...captured);
    out.push('');
  } finally {
    console.log = originalLog;
    Object.defineProperty(process.stdout, 'isTTY', { value: savedTTY, configurable: true });
  }

  return out.join('\n');
}

describe('c', () => {
  describe('util', () => {
    describe('golden table', () => {
      it('matches the committed golden output across the width matrix', async () => {
        const chalk = (await import('chalk')).default;
        const savedLevel = chalk.level;
        chalk.level = 1 as typeof chalk.level;

        const tmpHome = mkdtempSync(join(tmpdir(), 'c-golden-'));
        const savedCHome = process.env.C_HOME;
        process.env.C_HOME = tmpHome;
        resetIndexCache();

        const fake = useFakeTime(FAKE_NOW);

        let actual: string;
        try {
          await updateIndex((idx) => {
            for (const spec of allFixtureSpecs) {
              const s = createTestSession(spec);
              idx.sessions[s.id] = s;
            }
          });
          actual = renderMatrix();
        } finally {
          fake.restore();
          chalk.level = savedLevel;
          process.env.C_HOME = savedCHome;
          if (savedCHome === undefined) delete process.env.C_HOME;
          resetIndexCache();
          rmSync(tmpHome, { recursive: true, force: true });
        }

        const __dirname = dirname(fileURLToPath(import.meta.url));
        const goldenPath = join(__dirname, '..', 'fixtures', 'golden-table.txt');

        if (process.env.UPDATE_GOLDEN || !existsSync(goldenPath)) {
          writeFileSync(goldenPath, actual);
          return;
        }

        const expected = readFileSync(goldenPath, 'utf8');
        assert.strictEqual(actual, expected);
      });
    });
  });
});
