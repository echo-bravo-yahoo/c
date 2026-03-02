/**
 * Seed a temporary C_HOME with realistic demo sessions and render output.
 * Bypasses reconcileStaleSessions() since demo sessions have no Claude session files.
 *
 * Usage:
 *   C_HOME=/tmp/c-demo npx tsx scripts/demo-seed.ts list
 *   C_HOME=/tmp/c-demo npx tsx scripts/demo-seed.ts list-all
 *   C_HOME=/tmp/c-demo npx tsx scripts/demo-seed.ts show
 */

import chalk from 'chalk';
import { writeIndex } from '../src/store/index.js';
import { getSessions, getAllSessions } from '../src/store/index.js';
import { printSessionTable, formatSessionDetails } from '../src/util/format.js';
import type { Session, SessionState } from '../src/store/schema.js';

const now = Date.now();
const min = 60_000;
const hour = 60 * min;
const day = 24 * hour;

function session(overrides: Partial<Session> & { id: string }): Session {
  return {
    name: '',
    directory: '/Users/demo/workspace/acme',
    project_key: '-Users-demo-workspace-acme',
    created_at: new Date(now - 7 * day),
    last_active_at: new Date(now),
    state: 'busy',
    resources: {},
    servers: {},
    tags: { values: [] },
    meta: {},
    ...overrides,
  };
}

const sessions: Record<string, Session> = {};

const defs: (Partial<Session> & { id: string })[] = [
  {
    id: '9a3f1b2c-4d5e-6f7a-8b9c-0d1e2f3a4b5c',
    name: 'Fix authentication bug',
    state: 'busy',
    resources: { branch: 'feature/fix-auth', pr: 'https://github.com/acme/app/pull/47' },
    last_active_at: new Date(now - 5 * min),
  },
  {
    id: 'b7e2d4a1-8c3f-9e0d-1a2b-3c4d5e6f7a8b',
    name: 'Add dark mode',
    state: 'idle',
    resources: { branch: 'feature/dark-mode', jira: 'PROJ-234' },
    tags: { values: ['frontend'] },
    last_active_at: new Date(now - 2 * hour),
  },
  {
    id: 'c5f8a3d2-1e4b-7c9a-0d6e-2f5a8b1c3d4e',
    name: 'Refactor API layer',
    state: 'waiting',
    resources: { branch: 'refactor/api' },
    last_active_at: new Date(now - 30 * min),
  },
  {
    id: 'd1a9c4e7-3b6f-8d2a-5e0c-7f1b4d8a2e6c',
    name: 'Update dependencies',
    state: 'closed',
    resources: { branch: 'main' },
    last_active_at: new Date(now - 1 * day),
  },
  {
    id: 'e8b2f5a1-6c9d-3e7a-4b0f-1d8c5a2e9b3f',
    name: 'Database migration',
    state: 'archived',
    resources: { branch: 'feature/db-migrate' },
    last_active_at: new Date(now - 3 * day),
  },
  {
    id: 'f4c7d9e3-2a5b-8f1c-6d0e-9a3b7c4f2e8d',
    name: 'Initial setup',
    state: 'archived',
    last_active_at: new Date(now - 7 * day),
  },
];

for (const def of defs) {
  const s = session(def);
  sessions[s.id] = s;
}

writeIndex({
  version: 1,
  machine_id: 'demo',
  sessions,
});

// Render based on subcommand
const cmd = process.argv[2] || 'list';

if (cmd === 'list') {
  const stateFilter: SessionState[] = ['busy', 'idle', 'waiting', 'closed'];
  const filtered = getSessions({ state: stateFilter });
  printSessionTable(filtered, 100, getAllSessions());
} else if (cmd === 'list-all') {
  const stateFilter: SessionState[] = ['busy', 'idle', 'waiting', 'closed', 'archived'];
  const filtered = getSessions({ state: stateFilter });
  printSessionTable(filtered, 100, getAllSessions());
} else if (cmd === 'show') {
  const target = Object.values(sessions).find(s => s.name === 'Fix authentication bug');
  if (target) {
    console.log(formatSessionDetails(target));
  }
} else if (cmd === 'new') {
  console.log(chalk.dim('Starting session: bugfixes.'));
} else if (cmd === 'resume') {
  console.log(chalk.dim('Resuming session Fix authentication bug in /Users/demo/workspace/acme...'));
} else if (cmd === 'archive') {
  console.log(chalk.green('Archived session "Update dependencies" (d1a9c4e7).'));
}
