/**
 * c tmux-pick - fzf picker for sessions
 */

import { spawn } from 'node:child_process';
import { getSessions } from '../../store/index.js';
import { getDisplayName, shortId } from '../../util/format.js';

export function tmuxPickCommand(): void {
  const sessions = getSessions({ state: ['busy', 'idle', 'waiting', 'closed'] });

  if (sessions.length === 0) {
    console.error('No sessions available.');
    process.exit(1);
  }

  // Format sessions for fzf
  const lines = sessions.map((s) => {
    const name = getDisplayName(s);
    const status = s.state;
    const branch = s.resources.branch ?? '';
    return `${shortId(s.id)}\t${name}\t${status}\t${branch}\t${s.id}`;
  });

  // Pipe to fzf
  const fzf = spawn('fzf', ['--delimiter=\t', '--with-nth=1,2,3,4', '--preview=c show {5}'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  fzf.stdin.write(lines.join('\n'));
  fzf.stdin.end();

  let selected = '';
  fzf.stdout.on('data', (data: Buffer) => {
    selected += data.toString();
  });

  fzf.on('close', (code) => {
    if (code === 0 && selected) {
      const sessionId = selected.trim().split('\t').pop();
      if (sessionId) {
        // Output the session ID for use in scripts
        console.log(sessionId);
      }
    }
    process.exit(code ?? 0);
  });
}
