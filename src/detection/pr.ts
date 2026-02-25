/**
 * GitHub PR detection
 */

import { exec } from '../util/exec.js';

export interface PullRequest {
  url: string;
  number: number;
  title: string;
  state: string;
  branch: string;
}

/**
 * Get PR for current branch using gh CLI
 */
export function getCurrentPR(cwd?: string): PullRequest | undefined {
  const output = exec(
    'gh pr view --json url,number,title,state,headRefName 2>/dev/null',
    { cwd }
  );

  if (!output) return undefined;

  try {
    const data = JSON.parse(output);
    return {
      url: data.url,
      number: data.number,
      title: data.title,
      state: data.state,
      branch: data.headRefName,
    };
  } catch {
    return undefined;
  }
}

/**
 * Extract PR URL from gh pr create output
 */
export function extractPRFromOutput(output: string): string | undefined {
  const match = output.match(/https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/);
  return match?.[0];
}

/**
 * Get PR number from URL
 */
export function getPRNumber(url: string): number | undefined {
  const match = url.match(/\/pull\/(\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * List all open PRs for the repository
 */
export function listOpenPRs(cwd?: string): PullRequest[] {
  const output = exec(
    'gh pr list --json url,number,title,state,headRefName 2>/dev/null',
    { cwd }
  );

  if (!output) return [];

  try {
    const data = JSON.parse(output) as Array<{
      url: string;
      number: number;
      title: string;
      state: string;
      headRefName: string;
    }>;

    return data.map((pr) => ({
      url: pr.url,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      branch: pr.headRefName,
    }));
  } catch {
    return [];
  }
}
