/**
 * c tmux-status - output for tmux status bar
 */

import { getSessions } from '../../store/index.js';

export function tmuxStatusCommand(): void {
  const liveSessions = getSessions({ status: ['live'] });
  const waitingSessions = liveSessions.filter((s) => s.waiting);

  const parts: string[] = [];

  // Show waiting count with highlight if any
  if (waitingSessions.length > 0) {
    parts.push(`#[fg=yellow,bold]⏳${waitingSessions.length}#[default]`);
  }

  // Show total live sessions
  if (liveSessions.length > 0) {
    const icon = waitingSessions.length > 0 ? '' : '🤖';
    parts.push(`${icon}${liveSessions.length}`);
  }

  if (parts.length > 0) {
    process.stdout.write(parts.join(' '));
  }
}
