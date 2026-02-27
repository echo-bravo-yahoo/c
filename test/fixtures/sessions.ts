/**
 * Session test fixtures
 */

import type { Session, SessionResources, SessionMeta } from '../../src/store/schema.js';

export interface SessionOverrides {
  id?: string;
  name?: string;
  humanhash?: string;
  directory?: string;
  project_key?: string;
  created_at?: Date;
  last_active_at?: Date;
  state?: Session['state'];
  resources?: Partial<SessionResources>;
  tags?: string[];
  meta?: SessionMeta;
  pid?: number;
  parent_session_id?: string;
}

let sessionCounter = 0;

/**
 * Create a test session with sensible defaults
 */
export function createTestSession(overrides: SessionOverrides = {}): Session {
  const id = overrides.id ?? `test-uuid-${++sessionCounter}-0000-0000-000000000000`;
  const now = new Date();

  return {
    id,
    name: overrides.name ?? '',
    humanhash: overrides.humanhash ?? `word-word-word-${sessionCounter}`,
    directory: overrides.directory ?? '/home/test/project',
    project_key: overrides.project_key ?? '-home-test-project',
    created_at: overrides.created_at ?? now,
    last_active_at: overrides.last_active_at ?? now,
    state: overrides.state ?? 'busy',
    resources: {
      branch: overrides.resources?.branch,
      worktree: overrides.resources?.worktree,
      pr: overrides.resources?.pr,
      jira: overrides.resources?.jira,
    },
    servers: {},
    tags: { values: overrides.tags ?? [] },
    meta: overrides.meta ?? {},
    ...(overrides.pid != null && { pid: overrides.pid }),
    ...(overrides.parent_session_id && { parent_session_id: overrides.parent_session_id }),
  };
}

/**
 * Create a session with busy state
 */
export function createBusySession(overrides: SessionOverrides = {}): Session {
  return createTestSession({ ...overrides, state: 'busy' });
}

/**
 * Create a session with idle state
 */
export function createIdleSession(overrides: SessionOverrides = {}): Session {
  return createTestSession({ ...overrides, state: 'idle' });
}

/**
 * Create a session with closed state
 */
export function createClosedSession(overrides: SessionOverrides = {}): Session {
  return createTestSession({ ...overrides, state: 'closed' });
}

/**
 * Create a session with archived state
 */
export function createArchivedSession(overrides: SessionOverrides = {}): Session {
  return createTestSession({ ...overrides, state: 'archived' });
}

/**
 * Create a session in waiting state
 */
export function createWaitingSession(overrides: SessionOverrides = {}): Session {
  return createTestSession({ ...overrides, state: 'waiting' });
}

/**
 * Create a child session with parent reference
 */
export function createChildSession(parentId: string, overrides: SessionOverrides = {}): Session {
  return createTestSession({ ...overrides, parent_session_id: parentId });
}

/**
 * Create a session with resources
 */
export function createSessionWithResources(resources: Partial<SessionResources>, overrides: SessionOverrides = {}): Session {
  return createTestSession({ ...overrides, resources });
}

/**
 * Reset session counter (call between tests if needed)
 */
export function resetSessionCounter(): void {
  sessionCounter = 0;
}
