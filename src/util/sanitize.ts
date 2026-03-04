/**
 * Sanitize a human-readable name into a valid git ref component.
 *
 * Rules (from git-check-ref-format):
 * - No ASCII control chars, space, ~, ^, :, ?, *, [, \
 * - No ..
 * - Can't begin or end with .
 * - Can't end with .lock
 * - No @{
 * - No consecutive slashes
 */
export function sanitizeWorktreeName(name: string): string {
  let result = name
    // Replace spaces and illegal chars with hyphens
    .replace(/[\s~^:?*[\]\\@{}<>]+/g, '-')
    // Collapse consecutive dots
    .replace(/\.{2,}/g, '.')
    // Collapse consecutive slashes
    .replace(/\/{2,}/g, '/')
    // Collapse consecutive hyphens
    .replace(/-{2,}/g, '-')
    // Strip leading/trailing dots, hyphens, slashes
    .replace(/^[.\-/]+/, '')
    .replace(/[.\-/]+$/, '');

  // Remove trailing .lock
  if (result.endsWith('.lock')) {
    result = result.slice(0, -5);
  }

  // Final trim of trailing dots/hyphens (from .lock removal)
  result = result.replace(/[.\-/]+$/, '');

  return result;
}
