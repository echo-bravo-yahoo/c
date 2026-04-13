/**
 * Relevance analysis via Claude -p.
 * Only runs with --deep flag.
 */

import { execSync } from 'node:child_process';
import { exec } from '../../util/exec.ts';
import { debugLog } from '../../util/debug.ts';
import type { Session } from '../../store/schema.ts';
import type { RefreshReport, RelevanceAnalysis, Finding } from '../types.ts';

const MAX_DIFF_CHARS = 8000;

/**
 * Gather context for relevance analysis.
 */
function gatherContext(session: Session, report: Partial<RefreshReport>): {
  diffStat: string;
  diff: string;
  recentMainCommits: string;
  touchedFiles: string[];
  prTitle?: string;
} {
  const branch = session.resources.branch!;
  const cwd = session.directory;

  // Use local ref if available, else remote
  const localExists = !!exec(`git rev-parse --verify refs/heads/${branch} 2>/dev/null`, { cwd });
  const ref = localExists ? branch : `origin/${branch}`;

  const diffStat = exec(`git diff --stat origin/main...${ref} 2>/dev/null`, { cwd });

  let diff = exec(`git diff origin/main...${ref} 2>/dev/null`, { cwd });
  if (diff.length > MAX_DIFF_CHARS) {
    diff = diff.slice(0, MAX_DIFF_CHARS) + '\n... (truncated)';
  }

  const touchedFiles = report.branch?.touchedFiles ?? [];

  // Recent main commits touching the same files (since branch fork point)
  let recentMainCommits = '';
  if (touchedFiles.length > 0 && touchedFiles.length <= 50) {
    const mergeBase = exec(`git merge-base origin/main ${ref} 2>/dev/null`, { cwd });
    if (mergeBase) {
      const files = touchedFiles.join(' ');
      recentMainCommits = exec(
        `git log --oneline ${mergeBase}..origin/main -- ${files} 2>/dev/null`,
        { cwd },
      );
    }
  }

  // PR title if available
  let prTitle: string | undefined;
  if (report.pr?.url) {
    const prData = exec(
      `gh pr view ${report.pr.url} --json title --jq .title 2>/dev/null`,
      { cwd },
    );
    if (prData) prTitle = prData;
  }

  return { diffStat, diff, recentMainCommits, touchedFiles, prTitle };
}

function buildPrompt(
  session: Session,
  report: Partial<RefreshReport>,
  ctx: ReturnType<typeof gatherContext>,
): string {
  return `You are analyzing whether a closed development session's work is still relevant.

Session: ${report.sessionName ?? session.name}
Branch: ${session.resources.branch}
${ctx.prTitle ? `PR: ${ctx.prTitle}` : ''}

Files touched by this branch (${ctx.touchedFiles.length}):
${ctx.touchedFiles.slice(0, 30).join('\n')}
${ctx.touchedFiles.length > 30 ? `... and ${ctx.touchedFiles.length - 30} more` : ''}

Diff summary:
${ctx.diffStat}

Full diff (may be truncated):
${ctx.diff}

Recent commits on main that touch the same files:
${ctx.recentMainCommits || '(none)'}

Answer as JSON only, no markdown fences:
{
  "codeAreaChanged": <boolean — have the files touched by this branch been significantly modified on main since the branch diverged?>,
  "possiblySuperseded": <boolean — has the original concern likely been addressed by other work on main?>,
  "explanation": "<2-3 sentence explanation>"
}`;
}

export async function checkRelevance(
  session: Session,
  report: Partial<RefreshReport>,
  options: { model?: string },
): Promise<{ analysis: RelevanceAnalysis; findings: Finding[] }> {
  const findings: Finding[] = [];
  const model = options.model ?? 'sonnet';

  const ctx = gatherContext(session, report);

  if (!ctx.diff && !ctx.diffStat) {
    return {
      analysis: {
        codeAreaChanged: false,
        possiblySuperseded: false,
        explanation: 'No diff available — branch may have been deleted or fully merged.',
        model,
      },
      findings: [{
        key: 'relevance_no_diff',
        severity: 'info',
        summary: 'No diff available for relevance analysis',
      }],
    };
  }

  const prompt = buildPrompt(session, report, ctx);
  debugLog(`[refresh:relevance] launching claude -p with model ${model}`);

  let output: string;
  try {
    output = execSync(
      `C_EPHEMERAL=1 claude -p --model ${model} --output-format json --dangerously-skip-permissions`,
      {
        input: prompt,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        cwd: session.directory,
        timeout: 120_000,
      },
    ).trim();
  } catch (err) {
    debugLog(`[refresh:relevance] claude -p failed: ${err}`);
    return {
      analysis: {
        codeAreaChanged: false,
        possiblySuperseded: false,
        explanation: 'Relevance analysis failed — claude -p returned an error.',
        model,
      },
      findings: [{
        key: 'relevance_error',
        severity: 'warn',
        summary: 'Deep relevance analysis failed',
      }],
    };
  }

  // Parse Claude's JSON response
  let parsed: { codeAreaChanged?: boolean; possiblySuperseded?: boolean; explanation?: string };
  try {
    // --output-format json wraps the response; extract the result text
    const envelope = JSON.parse(output);
    const text = typeof envelope === 'string'
      ? envelope
      : envelope.result ?? envelope.content ?? JSON.stringify(envelope);

    // The model may return the JSON directly or wrapped in text
    const jsonMatch = typeof text === 'string' ? text.match(/\{[\s\S]*\}/) : null;
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : (typeof text === 'object' ? text : {});
  } catch {
    // Try parsing output directly as JSON
    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      parsed = {};
    }
  }

  const analysis: RelevanceAnalysis = {
    codeAreaChanged: parsed.codeAreaChanged ?? false,
    possiblySuperseded: parsed.possiblySuperseded ?? false,
    explanation: parsed.explanation ?? 'Unable to parse analysis result.',
    model,
  };

  if (analysis.codeAreaChanged) {
    findings.push({
      key: 'code_area_changed',
      severity: 'warn',
      summary: 'Files touched by this branch have been significantly modified on main',
      detail: analysis.explanation,
    });
  }

  if (analysis.possiblySuperseded) {
    findings.push({
      key: 'possibly_superseded',
      severity: 'action',
      summary: 'This work may have been superseded by recent changes on main',
      detail: analysis.explanation,
    });
  }

  if (!analysis.codeAreaChanged && !analysis.possiblySuperseded) {
    findings.push({
      key: 'still_relevant',
      severity: 'info',
      summary: 'Branch work appears still relevant',
      detail: analysis.explanation,
    });
  }

  return { analysis, findings };
}
