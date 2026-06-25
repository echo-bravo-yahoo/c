/**
 * c tmux-jump - hop pane-precise to the next session that needs you.
 *
 * "Needs you" = waiting (blocked mid-task) or idle (finished, awaiting your
 * prompt) — both are "respond or close". Waiting is hopped first (urgent), then
 * idle, each in tmux pane order; repeats cycle through all of them.
 *
 * Bound to `C-a g`, run via run-shell (no TTY, no popup, no extra pane). Lands on
 * the exact pane, across windows. Nothing pending → a transient message. A
 * session whose pane was closed → a `c resume` hint (the pane id is never
 * cleared, so the session is still recoverable).
 */

import { getSessions, reconcileLiveState } from '../../store/index.ts';
import { getDisplayName, shortId } from '../../util/format.ts';
import { exec } from '../../util/exec.ts';
import type { Session } from '../../store/schema.ts';

export async function tmuxJumpCommand(): Promise<void> {
  await reconcileLiveState();
  const waiting = getSessions({ state: ['waiting'] });
  const idle = getSessions({ state: ['idle'] });

  const notify = (msg: string) => {
    if (process.env.TMUX) exec(`tmux display-message ${JSON.stringify(msg)}`);
    else console.log(msg);
  };

  if (waiting.length + idle.length === 0) {
    notify('no sessions need you');
    return;
  }

  // Live panes in tmux's server order, for a stable "next" selection.
  const orderedPanes = exec("tmux list-panes -a -F '#{pane_id}'").split('\n').filter(Boolean);
  const livePanes = new Set(orderedPanes);

  const livePaneSet = (sessions: Session[]) =>
    new Set(
      sessions
        .map((s) => s.resources.tmux_pane)
        .filter((p): p is string => !!p && livePanes.has(p))
    );
  const waitingPanes = livePaneSet(waiting);
  const idlePanes = livePaneSet(idle);

  // Waiting block first, then idle; each in tmux pane order.
  const jumpPanes = [
    ...orderedPanes.filter((p) => waitingPanes.has(p)),
    ...orderedPanes.filter((p) => idlePanes.has(p)),
  ];

  if (jumpPanes.length === 0) {
    // Pending, but no live pane — offer resume instead of a dead jump.
    const s = [...waiting, ...idle][0];
    notify(`${getDisplayName(s) || shortId(s.id)} has no live pane — c resume ${shortId(s.id)}`);
    return;
  }

  const current = process.env.TMUX_PANE;
  const curIdx = current ? jumpPanes.indexOf(current) : -1;
  const target = jumpPanes[(curIdx + 1) % jumpPanes.length];

  // Pane ids (e.g. %5) carry no shell metacharacters.
  exec(`tmux select-window -t ${target}`);
  exec(`tmux select-pane -t ${target}`);
}
