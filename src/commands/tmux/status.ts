/**
 * c tmux-status - output for tmux status bar
 */

import { getSessions } from '../../store/index.js';

export function tmuxStatusCommand(): void {
  const activeSessions = getSessions({ state: ['busy', 'idle', 'waiting'] });
  const waitingSessions = activeSessions.filter((s) => s.state === 'waiting');

  const parts: string[] = [];

  // Show waiting count with highlight if any
  if (waitingSessions.length > 0) {
    parts.push(`#[fg=yellow,bold]⏳${waitingSessions.length}#[default]`);
  }

  // Show total active sessions
  if (activeSessions.length > 0) {
    const icon = waitingSessions.length > 0 ? '' : '🤖';
    parts.push(`${icon}${activeSessions.length}`);
  }

  if (parts.length > 0) {
    process.stdout.write(parts.join(' '));
  }
}
