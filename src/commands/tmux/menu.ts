/**
 * c tmux-menu - native menu of the sessions that need you.
 *
 * "Needs you" = waiting (blocked mid-task) or idle (finished, awaiting your
 * prompt); waiting rows come first. Bound to `C-a G`, run via run-shell. Shells
 * out to tmux's built-in display-menu — a floating overlay (not fzf, not a
 * pane/window; closes on choice) — one row per pane showing `window/name —
 * reason`, each bound to select that pane. For picking by reason/bucket.
 */

import { spawnSync } from 'node:child_process';
import { getSessions, reconcileLiveState } from '../../store/index.ts';
import { getDisplayName, shortId } from '../../util/format.ts';
import { exec } from '../../util/exec.ts';
import type { Session } from '../../store/schema.ts';

export async function tmuxMenuCommand(): Promise<void> {
  await reconcileLiveState();
  const waiting = getSessions({ state: ['waiting'] });
  const idle = getSessions({ state: ['idle'] });
  const pending = [...waiting, ...idle]; // waiting first

  const reasonFor = (s: Session) =>
    s.state === 'waiting' ? (s.meta._waiting_for ?? 'input') : 'idle';

  if (!process.env.TMUX) {
    for (const s of pending) {
      console.log(`${getDisplayName(s) || shortId(s.id)} — ${reasonFor(s)}`);
    }
    return;
  }

  if (pending.length === 0) {
    exec('tmux display-message "no sessions need you"');
    return;
  }

  // pane id → "windowIndex:windowName" label, from one list-panes pass.
  const paneLabel = new Map<string, string>();
  for (const line of exec("tmux list-panes -a -F '#{pane_id}\t#{window_index}:#{window_name}'")
    .split('\n')
    .filter(Boolean)) {
    const [paneId, label] = line.split('\t');
    paneLabel.set(paneId, label);
  }

  // Build display-menu args: title, then (name, key, command) triples.
  const args = ['display-menu', '-T', 'Needs you', '-x', 'C', '-y', 'C'];
  let n = 0;
  for (const s of pending) {
    const pane = s.resources.tmux_pane;
    if (!pane || !paneLabel.has(pane)) continue; // stale pane: not jumpable
    const name = getDisplayName(s) || shortId(s.id);
    const label = `${paneLabel.get(pane)}/${name} — ${reasonFor(s)}`;
    const key = n < 9 ? String(n + 1) : '';
    args.push(label, key, `select-window -t ${pane} ; select-pane -t ${pane}`);
    n++;
  }

  if (n === 0) {
    exec('tmux display-message "sessions need you but have no live pane — use c resume"');
    return;
  }

  // run-shell has no implicit current client, so target the attached one.
  const client = exec("tmux list-clients -F '#{client_name}'").split('\n').filter(Boolean)[0];
  if (client) args.splice(1, 0, '-c', client);

  spawnSync('tmux', args, { stdio: 'ignore' });
}
