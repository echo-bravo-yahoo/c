/**
 * Jira ticket health check via acli CLI.
 */

import { exec } from '../../util/exec.ts';
import type { JiraHealth, Finding } from '../types.ts';

/**
 * Extract ticket ID from a Jira URL or bare ticket ID.
 */
function normalizeTicketId(jiraRef: string): string {
  // Could be a URL (https://machinify.atlassian.net/browse/MAC-123) or bare ID (MAC-123)
  const match = jiraRef.match(/([A-Z]{2,10}-\d+)/);
  return match?.[1] ?? jiraRef;
}

export function checkJira(jiraRef: string): { health: JiraHealth; findings: Finding[] } {
  const findings: Finding[] = [];
  const ticketId = normalizeTicketId(jiraRef);
  const url = jiraRef.startsWith('http') ? jiraRef : `https://machinify.atlassian.net/browse/${ticketId}`;

  // Try acli for status
  const output = exec(
    `acli jira workitem view ${ticketId} --json 2>/dev/null`,
  );

  let status: string | undefined;
  let assignee: string | undefined;

  if (output) {
    try {
      const data = JSON.parse(output);
      // acli JSON structure varies; common fields paths
      status = data.fields?.status?.name ?? data.status?.name ?? data.status;
      assignee = data.fields?.assignee?.displayName
        ?? data.fields?.assignee?.emailAddress
        ?? data.assignee?.displayName
        ?? data.assignee;
    } catch {
      // acli output wasn't JSON — try plain text parsing
      const statusMatch = output.match(/Status:\s*(.+)/i);
      if (statusMatch) status = statusMatch[1].trim();
      const assigneeMatch = output.match(/Assignee:\s*(.+)/i);
      if (assigneeMatch) assignee = assigneeMatch[1].trim();
    }
  }

  const health: JiraHealth = { ticketId, url, status, assignee };

  if (status) {
    const lower = status.toLowerCase();
    if (lower === 'done' || lower === 'closed' || lower === 'resolved') {
      findings.push({
        key: 'jira_closed',
        severity: 'info',
        summary: `Jira ticket ${ticketId} is ${status}`,
      });
    }
  }

  return { health, findings };
}
