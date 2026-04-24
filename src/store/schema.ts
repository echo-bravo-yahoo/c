/**
 * Schema types for the session index stored in ~/.c/index.toml
 */

export type SessionState = 'busy' | 'idle' | 'waiting' | 'closed' | 'archived';

export interface SessionResources {
  branch?: string;
  worktree?: string;
  pr?: string;
  jira?: string;
  tmux_pane?: string;
  plan?: string;
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

export interface SessionContextInventory {
  /**
   * File paths pulled into the session, keyed by canonical absolute path.
   * Value is the list of turn numbers in which the file was accessed; duplicates
   * allowed when a path is accessed multiple times within a single turn.
   */
  reads: Record<string, number[]>;
  /**
   * Parallel attribution of reads to the source tool, aligned position-for-position
   * with `reads[path]`. Only present when at least one Bash-derived read exists.
   */
  reads_via?: Record<string, ('Read' | 'Bash')[]>;
  /** CLAUDE.md files auto-loaded at session start (hierarchy walk, absolute paths). */
  claude_md?: string[];
  /** Files pulled in via @-import syntax from CLAUDE.md (recursive closure, absolute paths). */
  claude_md_imports?: string[];
  /** MEMORY.md index path if present at session start. */
  memory_index?: string;
  /** MCP servers registered at session start (server name → tool count, 0 if unknown). */
  mcp_servers?: Record<string, number>;
  /** Skills invoked during the session (name → turn numbers). */
  skills?: Record<string, number[]>;
}

export interface Session {
  id: string;
  name: string;
  directory: string;
  project_key: string;
  created_at: Date;
  last_active_at: Date;
  state: SessionState;
  resources: SessionResources;
  servers: SessionServers;
  tags: SessionTags;
  meta: SessionMeta;
  /** Cumulative API cost in USD */
  cost_usd?: number;
  /** Current context window usage as percentage (0-100), only meaningful for active sessions */
  context_pct?: number;
  /** PID of the wrapper process that launched this session */
  pid?: number;
  /** Parent session ID if this session was spawned from plan execution */
  parent_session_id?: string;
  /** Per-session context inventory — what files/memories/docs/skills were pulled in */
  context?: SessionContextInventory;
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
  createdAt: Date = new Date()
): Session {
  return {
    id,
    name: '',
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
