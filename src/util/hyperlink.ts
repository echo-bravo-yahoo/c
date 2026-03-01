/**
 * OSC 8 terminal hyperlink support
 */

export function hyperlink(url: string, text: string): string {
  if (!process.stdout.isTTY) return text;
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}
