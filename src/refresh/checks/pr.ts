/**
 * PR health check: state, CI, reviews, comments, mergeability.
 */

import { exec } from '../../util/exec.ts';
import { getPRNumber } from '../../detection/pr.ts';
import type { PRHealth, CICheck, Finding } from '../types.ts';

interface GHCheckEntry {
  __typename?: string;
  name?: string;
  status?: string;
  conclusion?: string;
  detailsUrl?: string;
  // StatusContext entries use a flat shape with different field names
  context?: string;
  state?: string;
  targetUrl?: string;
}

interface GHPRView {
  state: string;
  statusCheckRollup?: GHCheckEntry[];
  reviewDecision?: string;
  comments?: Array<unknown>;
  mergeStateStatus?: string;
  updatedAt?: string;
}

/**
 * Extract repo slug (owner/repo) from a PR URL.
 */
function repoSlugFromUrl(prUrl: string): string | undefined {
  const match = prUrl.match(/github\.com\/([^/]+\/[^/]+)\/pull/);
  return match?.[1];
}

/**
 * Normalize a statusCheckRollup entry into a CICheck.
 */
function normalizeCheck(raw: GHCheckEntry): CICheck {
  // StatusContext entries: { __typename: "StatusContext", context: "name", state: "SUCCESS", targetUrl: "..." }
  // CheckRun entries: { __typename: "CheckRun", name: "name", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "..." }
  const isStatusContext = raw.__typename === 'StatusContext' || (typeof raw.context === 'string' && !raw.name);
  const name = isStatusContext ? (raw.context as string) : (raw.name ?? 'unknown');
  const conclusion = (isStatusContext ? (raw.state ?? '') : (raw.conclusion ?? '')).toUpperCase();
  const status = (raw.status ?? '').toUpperCase();
  const url = raw.detailsUrl ?? raw.targetUrl;

  let checkStatus: CICheck['status'];
  if (conclusion === 'SUCCESS' || conclusion === 'NEUTRAL') {
    checkStatus = conclusion as CICheck['status'];
  } else if (conclusion === 'FAILURE' || conclusion === 'TIMED_OUT' || conclusion === 'CANCELLED') {
    checkStatus = 'FAILURE';
  } else if (conclusion === 'SKIPPED') {
    checkStatus = 'SKIPPED';
  } else if (status === 'IN_PROGRESS' || status === 'QUEUED' || status === 'PENDING') {
    checkStatus = 'PENDING';
  } else if (conclusion) {
    checkStatus = 'UNKNOWN';
  } else {
    checkStatus = 'PENDING';
  }

  return { name, status: checkStatus, url };
}

/**
 * Build a human-readable CI summary: "9/11 passing, 2 failing: lint, test-e2e"
 */
function buildCISummary(checks: CICheck[]): string {
  // Skipped checks are irrelevant — exclude from all counts
  const relevant = checks.filter((c) => c.status !== 'SKIPPED');
  if (relevant.length === 0) return checks.length > 0 ? 'all skipped' : 'no checks';

  const passing = relevant.filter((c) => c.status === 'SUCCESS' || c.status === 'NEUTRAL');
  const failing = relevant.filter((c) => c.status === 'FAILURE');
  const pending = relevant.filter((c) => c.status === 'PENDING');

  const parts: string[] = [];
  parts.push(`${passing.length}/${relevant.length} passing`);
  if (failing.length > 0) {
    const names = failing.map((c) => c.name).join(', ');
    parts.push(`${failing.length} failing: ${names}`);
  }
  if (pending.length > 0) {
    parts.push(`${pending.length} pending`);
  }
  return parts.join(', ');
}

export function checkPR(prUrl: string, cwd: string): { health: PRHealth; findings: Finding[] } {
  const findings: Finding[] = [];
  const slug = repoSlugFromUrl(prUrl);
  const number = getPRNumber(prUrl);

  if (!slug || !number) {
    return {
      health: {
        url: prUrl,
        state: 'OPEN',
        ciStatus: 'UNKNOWN',
        ciChecks: [],
        ciSummary: 'unable to parse PR URL',
        reviewDecision: 'UNKNOWN',
        unresolvedComments: 0,
        mergeable: 'UNKNOWN',
        updatedAt: '',
      },
      findings: [{
        key: 'pr_unparseable',
        severity: 'warn',
        summary: `Unable to parse PR URL: ${prUrl}`,
      }],
    };
  }

  const output = exec(
    `gh pr view ${number} --repo ${slug} --json state,statusCheckRollup,reviewDecision,comments,mergeStateStatus,updatedAt 2>/dev/null`,
    { cwd },
  );

  if (!output) {
    return {
      health: {
        url: prUrl,
        state: 'OPEN',
        ciStatus: 'UNKNOWN',
        ciChecks: [],
        ciSummary: 'gh pr view failed',
        reviewDecision: 'UNKNOWN',
        unresolvedComments: 0,
        mergeable: 'UNKNOWN',
        updatedAt: '',
      },
      findings: [{
        key: 'pr_unreachable',
        severity: 'warn',
        summary: 'Unable to reach PR via gh CLI',
      }],
    };
  }

  let data: GHPRView;
  try {
    data = JSON.parse(output);
  } catch {
    return {
      health: {
        url: prUrl,
        state: 'OPEN',
        ciStatus: 'UNKNOWN',
        ciChecks: [],
        ciSummary: 'failed to parse gh output',
        reviewDecision: 'UNKNOWN',
        unresolvedComments: 0,
        mergeable: 'UNKNOWN',
        updatedAt: '',
      },
      findings: [{
        key: 'pr_parse_error',
        severity: 'warn',
        summary: 'Failed to parse PR data from gh CLI',
      }],
    };
  }

  // Normalize state
  const state = (data.state ?? 'OPEN').toUpperCase() as PRHealth['state'];

  // Process CI checks
  const ciChecks = (data.statusCheckRollup ?? []).map(normalizeCheck);
  const ciSummary = buildCISummary(ciChecks);

  const relevant = ciChecks.filter((c) => c.status !== 'SKIPPED');
  const hasFailing = relevant.some((c) => c.status === 'FAILURE');
  const hasPending = relevant.some((c) => c.status === 'PENDING');
  let ciStatus: PRHealth['ciStatus'] = 'UNKNOWN';
  if (relevant.length === 0) {
    ciStatus = 'UNKNOWN';
  } else if (hasFailing) {
    ciStatus = 'FAILURE';
  } else if (hasPending) {
    ciStatus = 'PENDING';
  } else {
    ciStatus = 'SUCCESS';
  }

  // Review decision
  const reviewDecision = (data.reviewDecision ?? 'UNKNOWN').toUpperCase() as PRHealth['reviewDecision'];

  // Comments (rough count — gh doesn't distinguish resolved/unresolved without GraphQL)
  const commentCount = data.comments?.length ?? 0;

  // Mergeability — moot for merged/closed PRs
  let mergeable: PRHealth['mergeable'] = 'UNKNOWN';
  if (state === 'MERGED' || state === 'CLOSED') {
    mergeable = 'MERGEABLE'; // already merged or closed; no conflict concern
  } else {
    const mergeState = (data.mergeStateStatus ?? 'UNKNOWN').toUpperCase();
    if (mergeState === 'CLEAN' || mergeState === 'HAS_HOOKS' || mergeState === 'UNSTABLE') {
      mergeable = 'MERGEABLE';
    } else if (mergeState === 'DIRTY' || mergeState === 'BLOCKED') {
      mergeable = 'CONFLICTING';
    }
  }

  const health: PRHealth = {
    url: prUrl,
    state,
    ciStatus,
    ciChecks,
    ciSummary,
    reviewDecision,
    unresolvedComments: commentCount,
    mergeable,
    updatedAt: data.updatedAt ?? '',
  };

  // Generate findings
  if (state === 'MERGED') {
    findings.push({ key: 'pr_merged', severity: 'info', summary: 'PR has been merged' });
  } else if (state === 'CLOSED') {
    findings.push({ key: 'pr_closed', severity: 'info', summary: 'PR was closed without merging' });
  }

  if (hasFailing) {
    const failNames = ciChecks.filter((c) => c.status === 'FAILURE').map((c) => c.name).join(', ');
    findings.push({
      key: 'ci_failing',
      severity: 'action',
      summary: `CI failing: ${failNames}`,
      detail: ciSummary,
    });
  } else if (hasPending) {
    findings.push({ key: 'ci_pending', severity: 'info', summary: 'CI checks still running' });
  }

  if (reviewDecision === 'CHANGES_REQUESTED') {
    findings.push({ key: 'changes_requested', severity: 'action', summary: 'Changes requested by reviewer' });
  } else if (reviewDecision === 'REVIEW_REQUIRED') {
    findings.push({ key: 'review_required', severity: 'warn', summary: 'PR still needs review' });
  } else if (reviewDecision === 'APPROVED') {
    findings.push({ key: 'pr_approved', severity: 'info', summary: 'PR is approved' });
  }

  if (mergeable === 'CONFLICTING') {
    findings.push({ key: 'pr_conflicts', severity: 'action', summary: 'PR has merge conflicts' });
  }

  if (commentCount > 0 && state === 'OPEN') {
    findings.push({
      key: 'unresolved_comments',
      severity: 'warn',
      summary: `${commentCount} comment${commentCount === 1 ? '' : 's'} on PR`,
    });
  }

  return { health, findings };
}
