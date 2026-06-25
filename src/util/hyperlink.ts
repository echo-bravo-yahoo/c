/**
 * OSC 8 terminal hyperlink support.
 *
 * Thin wrapper over the library's `hyperlink`, injecting the TTY check so call
 * sites keep the two-argument form. Escapes are emitted only when stdout is a TTY.
 */

import { hyperlink as libHyperlink } from '@echobravoyahoo/tables';

export function hyperlink(url: string, text: string): string {
  return libHyperlink(url, text, { force: !!process.stdout.isTTY });
}
