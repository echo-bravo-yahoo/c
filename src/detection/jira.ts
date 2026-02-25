/**
 * JIRA ticket extraction
 */

/**
 * Extract JIRA ticket ID from text
 * Matches patterns like MAC-1234, PROJ-567, etc.
 */
export function extractJiraTicket(text: string): string | undefined {
  const match = text.match(/\b([A-Z]{2,10}-\d+)\b/);
  return match?.[1];
}

/**
 * Extract all JIRA ticket IDs from text
 */
export function extractAllJiraTickets(text: string): string[] {
  const matches = text.matchAll(/\b([A-Z]{2,10}-\d+)\b/g);
  return [...new Set(Array.from(matches, (m) => m[1]))];
}

/**
 * Extract JIRA ticket from branch name
 * Common patterns:
 * - feature/MAC-1234-description
 * - fix/MAC-1234
 * - MAC-1234-some-work
 */
export function extractJiraFromBranch(branch: string): string | undefined {
  return extractJiraTicket(branch);
}

/**
 * Build JIRA URL from ticket ID
 */
export function buildJiraUrl(ticketId: string, baseUrl = 'https://machinify.atlassian.net'): string {
  return `${baseUrl}/browse/${ticketId}`;
}
