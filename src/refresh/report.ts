/**
 * Report formatting, storage, and retrieval.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { ensureSessionStateDir, getSessionStateDir } from '../store/session-state.ts';
import type { RefreshReport, Finding, Severity } from './types.ts';

function getReportPath(sessionId: string, ensure = false): string {
  const dir = ensure ? ensureSessionStateDir(sessionId) : getSessionStateDir(sessionId);
  return path.join(dir, 'refresh.json');
}

// --- Storage ---

export function storeReport(report: RefreshReport): void {
  fs.writeFileSync(getReportPath(report.sessionId, true), JSON.stringify(report, null, 2));
}

export function loadReport(sessionId: string): RefreshReport | null {
  const p = getReportPath(sessionId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

// --- Formatting ---

const SEVERITY_ICON: Record<Severity, string> = {
  action: '!',
  warn: '~',
  info: 'i',
};

const SEVERITY_COLOR: Record<Severity, (s: string) => string> = {
  action: chalk.red,
  warn: chalk.yellow,
  info: chalk.dim,
};

function formatFinding(f: Finding): string {
  const icon = SEVERITY_ICON[f.severity];
  const color = SEVERITY_COLOR[f.severity];
  return color(`  ${icon} ${f.summary}`);
}

export function formatReport(report: RefreshReport): string {
  const lines: string[] = [];

  lines.push(chalk.bold(`Refresh: ${report.sessionName}`) + chalk.dim(` (${report.sessionId.slice(0, 8)})`));
  lines.push(chalk.dim(`  Tier: ${report.tier} | ${report.timestamp}`));
  lines.push('');

  // Scouted links
  if (report.scouted.pr || report.scouted.jira) {
    lines.push(chalk.underline('Scouted:'));
    if (report.scouted.pr) lines.push(`  Discovered PR: ${chalk.green(report.scouted.pr)}`);
    if (report.scouted.jira) lines.push(`  Discovered Jira: ${chalk.yellow(report.scouted.jira)}`);
    lines.push('');
  }

  // PR health
  if (report.pr) {
    lines.push(chalk.underline('PR Health:'));
    const stateColor = report.pr.state === 'MERGED' ? chalk.green
      : report.pr.state === 'CLOSED' ? chalk.red
      : chalk.white;
    lines.push(`  State: ${stateColor(report.pr.state)}`);

    const ciColor = report.pr.ciStatus === 'SUCCESS' ? chalk.green
      : report.pr.ciStatus === 'FAILURE' ? chalk.red
      : report.pr.ciStatus === 'PENDING' ? chalk.yellow
      : chalk.dim;
    lines.push(`  CI: ${ciColor(report.pr.ciSummary)}`);

    const reviewColor = report.pr.reviewDecision === 'APPROVED' ? chalk.green
      : report.pr.reviewDecision === 'CHANGES_REQUESTED' ? chalk.red
      : chalk.yellow;
    lines.push(`  Review: ${reviewColor(report.pr.reviewDecision)}`);

    if (report.pr.unresolvedComments > 0) {
      lines.push(`  Comments: ${chalk.yellow(String(report.pr.unresolvedComments))}`);
    }
    lines.push(`  Mergeable: ${report.pr.mergeable === 'MERGEABLE' ? chalk.green(report.pr.mergeable) : chalk.red(report.pr.mergeable)}`);
    lines.push('');
  }

  // Branch health
  if (report.branch) {
    lines.push(chalk.underline('Branch Health:'));
    if (!report.branch.exists) {
      lines.push(chalk.red('  Branch has been deleted'));
    } else {
      lines.push(`  Ahead: ${report.branch.ahead} | Behind: ${report.branch.behind}`);
      if (report.branch.hasConflict) {
        lines.push(chalk.red('  Conflicts: Yes'));
        if (report.branch.conflictFiles?.length) {
          lines.push(chalk.dim(`    ${report.branch.conflictFiles.join(', ')}`));
        }
      }
      lines.push(chalk.dim(`  Files touched: ${report.branch.touchedFiles.length}`));
    }
    lines.push('');
  }

  // Jira health
  if (report.jira) {
    lines.push(chalk.underline('Jira:'));
    lines.push(`  ${report.jira.ticketId}: ${report.jira.status ?? 'status unknown'}`);
    if (report.jira.assignee) lines.push(`  Assignee: ${report.jira.assignee}`);
    lines.push('');
  }

  // Relevance
  if (report.relevance) {
    lines.push(chalk.underline('Relevance:'));
    lines.push(`  ${report.relevance.explanation}`);
    lines.push(chalk.dim(`  (model: ${report.relevance.model})`));
    lines.push('');
  }

  // Findings
  if (report.findings.length > 0) {
    lines.push(chalk.underline('Findings:'));
    for (const f of report.findings) {
      lines.push(formatFinding(f));
    }
    lines.push('');
  }

  // Recommendation
  if (report.recommendation) {
    lines.push(chalk.bold('Recommendation: ') + report.recommendation);
  }

  return lines.join('\n');
}

/**
 * Plain-text report (no chalk) for use as a prompt body.
 */
export function formatReportPlain(report: RefreshReport): string {
  const lines: string[] = [];

  lines.push(`Refresh: ${report.sessionName} (${report.sessionId.slice(0, 8)})`);
  lines.push(`  Tier: ${report.tier} | ${report.timestamp}`);
  lines.push('');

  if (report.scouted.pr || report.scouted.jira) {
    lines.push('Scouted:');
    if (report.scouted.pr) lines.push(`  Discovered PR: ${report.scouted.pr}`);
    if (report.scouted.jira) lines.push(`  Discovered Jira: ${report.scouted.jira}`);
    lines.push('');
  }

  if (report.pr) {
    lines.push('PR Health:');
    lines.push(`  State: ${report.pr.state}`);
    lines.push(`  CI: ${report.pr.ciSummary}`);
    lines.push(`  Review: ${report.pr.reviewDecision}`);
    if (report.pr.unresolvedComments > 0) lines.push(`  Comments: ${report.pr.unresolvedComments}`);
    lines.push(`  Mergeable: ${report.pr.mergeable}`);
    lines.push('');
  }

  if (report.branch) {
    lines.push('Branch Health:');
    if (!report.branch.exists) {
      lines.push('  Branch has been deleted');
    } else {
      lines.push(`  Ahead: ${report.branch.ahead} | Behind: ${report.branch.behind}`);
      if (report.branch.hasConflict) {
        lines.push('  Conflicts: Yes');
        if (report.branch.conflictFiles?.length) lines.push(`    ${report.branch.conflictFiles.join(', ')}`);
      }
      lines.push(`  Files touched: ${report.branch.touchedFiles.length}`);
    }
    lines.push('');
  }

  if (report.jira) {
    lines.push('Jira:');
    lines.push(`  ${report.jira.ticketId}: ${report.jira.status ?? 'status unknown'}`);
    if (report.jira.assignee) lines.push(`  Assignee: ${report.jira.assignee}`);
    lines.push('');
  }

  if (report.relevance) {
    lines.push('Relevance:');
    lines.push(`  ${report.relevance.explanation}`);
    lines.push('');
  }

  if (report.findings.length > 0) {
    lines.push('Findings:');
    for (const f of report.findings) {
      lines.push(`  ${SEVERITY_ICON[f.severity]} ${f.summary}`);
    }
    lines.push('');
  }

  if (report.recommendation) {
    lines.push(`Recommendation: ${report.recommendation}`);
  }

  return lines.join('\n');
}
