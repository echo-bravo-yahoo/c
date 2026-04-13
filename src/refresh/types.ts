/**
 * Types for session refresh reports.
 */

export type Severity = 'info' | 'warn' | 'action';

export interface Finding {
  /** Machine-readable key, e.g. "pr_merged", "ci_failing", "branch_conflict" */
  key: string;
  severity: Severity;
  /** Human-readable one-liner */
  summary: string;
  /** Optional detail (e.g., list of failing checks) */
  detail?: string;
}

export interface CICheck {
  name: string;
  status: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'NEUTRAL' | 'SKIPPED' | 'UNKNOWN';
  /** Optional URL to the check run */
  url?: string;
}

export interface PRHealth {
  url: string;
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  /** Worst-case rollup across all checks */
  ciStatus: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'UNKNOWN';
  /** Per-check breakdown */
  ciChecks: CICheck[];
  /** Human summary: "9/11 passing, 2 failing: lint, test-e2e" */
  ciSummary: string;
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | 'UNKNOWN';
  unresolvedComments: number;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  updatedAt: string;
}

export interface BranchHealth {
  exists: boolean;
  /** Only meaningful if exists */
  ahead: number;
  behind: number;
  hasConflict: boolean;
  conflictFiles?: string[];
  /** Files the branch modifies relative to main */
  touchedFiles: string[];
}

export interface JiraHealth {
  ticketId: string;
  url: string;
  status?: string;
  assignee?: string;
}

export interface RelevanceAnalysis {
  /** Has the code area changed significantly on main? */
  codeAreaChanged: boolean;
  /** Has the concern been addressed by other work? */
  possiblySuperseded: boolean;
  /** Free-form explanation from Claude */
  explanation: string;
  /** Model used for analysis */
  model: string;
}

export interface RefreshReport {
  sessionId: string;
  sessionName: string;
  timestamp: string;
  tier: 'mechanical' | 'deep';

  /** Links discovered during scout phase */
  scouted: {
    pr?: string;
    jira?: string;
  };

  pr?: PRHealth;
  branch?: BranchHealth;
  jira?: JiraHealth;
  /** Only present with --deep */
  relevance?: RelevanceAnalysis;

  findings: Finding[];

  /** Derived from highest-severity finding */
  recommendation?: string;
}
