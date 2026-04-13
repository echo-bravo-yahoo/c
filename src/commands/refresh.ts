/**
 * c refresh <id> — check session health from external sources.
 */

import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { getSession, resolveSession, updateIndex } from '../store/index.ts';
import { ambiguityError, getDisplayName, shortId } from '../util/format.ts';
import { scoutLinks } from '../refresh/scout.ts';
import { checkPR } from '../refresh/checks/pr.ts';
import { checkBranch } from '../refresh/checks/branch.ts';
import { checkJira } from '../refresh/checks/jira.ts';
import { checkRelevance } from '../refresh/checks/relevance.ts';
import { formatReport, storeReport } from '../refresh/report.ts';
import { actOnReport } from '../refresh/act.ts';
import type { RefreshReport } from '../refresh/types.ts';

export interface RefreshOptions {
  deep?: boolean;
  model?: string;
  act?: boolean;
  json?: boolean;
  quiet?: boolean;
}

export async function refreshCommand(idOrPrefix: string, options: RefreshOptions = {}): Promise<void> {
  const result = resolveSession(idOrPrefix);
  if (!result.session) {
    console.error(chalk.red(ambiguityError(idOrPrefix, result.ambiguity)));
    process.exit(1);
  }
  const session = result.session;

  const dirExists = existsSync(session.directory);
  if (!dirExists && !options.quiet) {
    console.error(chalk.yellow(`Warning: session directory does not exist: ${session.directory}`));
  }

  // Scout phase
  if (!options.quiet) {
    console.error(chalk.dim(`Refreshing ${getDisplayName(session)} (${shortId(session.id)})...`));
  }
  const scouted = await scoutLinks(session);

  // Re-read session after scout modifications
  const refreshed = getSession(session.id)!;

  // Initialize report
  const report: RefreshReport = {
    sessionId: session.id,
    sessionName: getDisplayName(session),
    timestamp: new Date().toISOString(),
    tier: options.deep ? 'deep' : 'mechanical',
    scouted,
    findings: [],
  };

  // PR check
  if (refreshed.resources.pr) {
    const { health, findings } = checkPR(refreshed.resources.pr, refreshed.directory);
    report.pr = health;
    report.findings.push(...findings);
  }

  // Branch check
  if (refreshed.resources.branch && dirExists) {
    const { health, findings } = checkBranch(refreshed.resources.branch, refreshed.directory);
    report.branch = health;
    report.findings.push(...findings);
  }

  // Jira check
  if (refreshed.resources.jira) {
    const { health, findings } = checkJira(refreshed.resources.jira);
    report.jira = health;
    report.findings.push(...findings);
  }

  // Deep relevance analysis — skip if PR already merged (work landed)
  const prMerged = report.pr?.state === 'MERGED';
  if (options.deep && refreshed.resources.branch && dirExists && !prMerged) {
    const { analysis, findings } = await checkRelevance(refreshed, report, {
      model: options.model,
    });
    report.relevance = analysis;
    report.findings.push(...findings);
  } else if (options.deep && prMerged) {
    report.relevance = {
      codeAreaChanged: false,
      possiblySuperseded: false,
      explanation: 'PR was merged — work landed successfully. Relevance analysis skipped.',
      model: options.model ?? 'sonnet',
    };
    report.findings.push({
      key: 'work_landed',
      severity: 'info',
      summary: 'Work landed via merged PR — no relevance concerns',
    });
  }

  // Derive recommendation from highest-severity finding
  const actionFindings = report.findings.filter((f) => f.severity === 'action');
  const warnFindings = report.findings.filter((f) => f.severity === 'warn');
  if (actionFindings.length > 0) {
    report.recommendation = actionFindings[0].summary;
  } else if (warnFindings.length > 0) {
    report.recommendation = warnFindings[0].summary;
  }

  // Store report
  storeReport(report);

  // Update session meta
  await updateIndex((index) => {
    const s = index.sessions[session.id];
    if (!s) return;
    s.meta._last_refresh = report.timestamp;
    s.meta._refresh_status = actionFindings.length > 0
      ? 'needs_action'
      : warnFindings.length > 0
        ? 'attention'
        : 'ok';
  });

  // Output
  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else if (!options.quiet) {
    console.log('');
    console.log(formatReport(report));
  }

  // Act phase — resume session with report as prompt
  if (options.act) {
    await actOnReport(report, refreshed, { model: options.model });
  }
}
