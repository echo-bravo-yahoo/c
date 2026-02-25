/**
 * Generate human-readable identifiers from session IDs
 */

import HumanHasher from 'humanhash';

const hasher = new HumanHasher();

/**
 * Generate a human-readable hash from a session ID (UUID)
 * Format: word-word-word-word (e.g., "victor-bacon-zulu-lima")
 */
export function generateHumanhash(sessionId: string): string {
  // Remove dashes from UUID to get hex digest
  const hexdigest = sessionId.replace(/-/g, '');
  return hasher.humanize(hexdigest, 4, '-');
}

/**
 * Generate a short hash for display (2 words)
 */
export function generateShortHash(sessionId: string): string {
  const hexdigest = sessionId.replace(/-/g, '');
  return hasher.humanize(hexdigest, 2, '-');
}
