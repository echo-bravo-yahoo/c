/**
 * Schema types for the session index stored in ~/.c/index.toml
 */

export type SessionState = 'busy' | 'idle' | 'waiting' | 'closed' | 'archived';

export interface SessionResources {
  branch?: string;
  worktree?: string;
  pr?: string;
  jira?: string;
}

export interface SessionServers {
  /** Key: "pid.port", Value: command string */
  [pidPort: string]: string;
}

export interface SessionTags {
  values: string[];
}

export interface SessionMeta {
  [key: string]: string;
}

export interface Session {
  id: string;
  name: string;
  humanhash: string;
  directory: string;
  project_key: string;
  created_at: Date;
  last_active_at: Date;
  state: SessionState;
  resources: SessionResources;
  servers: SessionServers;
  tags: SessionTags;
  meta: SessionMeta;
  /** Parent session ID if this session was spawned from plan execution */
  parent_session_id?: string;
}

export interface IndexFile {
  version: number;
  machine_id: string;
  sessions: Record<string, Session>;
}

export function createDefaultIndex(machineId: string): IndexFile {
  return {
    version: 1,
    machine_id: machineId,
    sessions: {},
  };
}

export function createSession(
  id: string,
  directory: string,
  projectKey: string,
  humanhash: string,
  createdAt: Date = new Date()
): Session {
  return {
    id,
    name: '',
    humanhash,
    directory,
    project_key: projectKey,
    created_at: createdAt,
    last_active_at: createdAt,
    state: 'busy',
    resources: {},
    servers: {},
    tags: { values: [] },
    meta: {},
  };
}
