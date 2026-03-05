/**
 * Index file test fixtures
 */

import type { IndexFile, Session } from '../../src/store/schema.ts';
import { createTestSession, type SessionOverrides } from './sessions.ts';

/**
 * Create an empty index with defaults
 */
export function createEmptyIndex(machineId = 'test-machine'): IndexFile {
  return {
    version: 1,
    machine_id: machineId,
    sessions: {},
  };
}

/**
 * Create an index pre-populated with sessions
 */
export function createIndexWithSessions(sessions: Session[], machineId = 'test-machine'): IndexFile {
  const index: IndexFile = {
    version: 1,
    machine_id: machineId,
    sessions: {},
  };

  for (const session of sessions) {
    index.sessions[session.id] = session;
  }

  return index;
}

/**
 * Create an index from session override specs
 */
export function createIndexFromSpecs(specs: SessionOverrides[], machineId = 'test-machine'): IndexFile {
  const sessions = specs.map(spec => createTestSession(spec));
  return createIndexWithSessions(sessions, machineId);
}

/**
 * Convert index to TOML-compatible format (for testing serialization)
 */
export function indexToTOML(index: IndexFile): string {
  const lines: string[] = [];
  lines.push(`version = ${index.version}`);
  lines.push(`machine_id = "${index.machine_id}"`);
  lines.push('');

  for (const [id, session] of Object.entries(index.sessions)) {
    lines.push(`[sessions.${JSON.stringify(id)}]`);
    lines.push(`id = "${session.id}"`);
    lines.push(`name = "${session.name}"`);
    lines.push(`directory = "${session.directory}"`);
    lines.push(`project_key = "${session.project_key}"`);
    lines.push(`created_at = ${session.created_at.toISOString()}`);
    lines.push(`last_active_at = ${session.last_active_at.toISOString()}`);
    lines.push(`state = "${session.state}"`);
    lines.push('');
  }

  return lines.join('\n');
}
