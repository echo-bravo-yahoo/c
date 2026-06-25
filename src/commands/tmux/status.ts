/**
 * c tmux-status - refresh blocked-session indicators + status-bar roll-up
 *
 * Run by tmux's status-right every status-interval (~5s). It is the single
 * driver of the ambient blocked-session signal:
 *   - projects live state (Gap 3) so the index mirrors Claude Code's truth,
 *   - stamps each session's pane with @c_state (waiting|busy|idle) so a waiting
 *     pane's number flips red (pane-border-format),
 *   - stamps each window with @c_wait = number of waiting panes so the bucket
 *     name gains a dim ·N count (window-status-format),
 *   - prints `wait:N` for status-right — a roll-up for buckets off-screen or in
 *     another tmux session.
 * No per-event hook, no emoji.
 */

import { getSessions, reconcileLiveState } from '../../store/index.ts';
import { exec } from '../../util/exec.ts';

export async function tmuxStatusCommand(): Promise<void> {
  // Project state from Claude Code's live files before reading the index.
  await reconcileLiveState();

  const active = getSessions({ state: ['busy', 'idle', 'waiting'] });

  // Map pane → projected state for sessions that live in a tmux pane.
  const paneState = new Map<string, string>();
  for (const s of active) {
    if (s.resources.tmux_pane) paneState.set(s.resources.tmux_pane, s.state);
  }

  if (process.env.TMUX) {
    stampPanesAndWindows(paneState);
  }

  // Roll-up for status-right: sessions that need you, pane-visible or not.
  // waiting (frozen mid-task) is the urgent red count; idle (finished, awaiting
  // your prompt) is the quieter yellow count — both are "respond or close".
  const waitingCount = active.filter((s) => s.state === 'waiting').length;
  const idleCount = active.filter((s) => s.state === 'idle').length;
  const parts: string[] = [];
  if (waitingCount > 0) parts.push(`#[fg=red,bold]wait:${waitingCount}#[default]`);
  if (idleCount > 0) parts.push(`#[fg=yellow,bold]idle:${idleCount}#[default]`);
  if (parts.length) process.stdout.write(parts.join(' '));
}

/**
 * Stamp tmux vars, writing only on change (diff against the value tmux already
 * holds) to keep the 5s refresh cheap and avoid needless redraws. Self-correcting:
 * a pane/window whose state changed (or whose session is gone) is updated/cleared.
 *
 * Per pane:  @c_state = waiting | idle | busy  → drives the pane-number color
 *            (red / yellow / plain).
 * Per window: @c_wait = count of waiting panes (urgent; drives set-titles "(!)")
 *             @c_attn = count of waiting + idle panes (the bucket "·N" count).
 */
function stampPanesAndWindows(paneState: Map<string, string>): void {
  // "<pane_id>\t<window_id>\t<@c_state>" — one line per pane, server-wide.
  const paneLines = exec("tmux list-panes -a -F '#{pane_id}\t#{window_id}\t#{@c_state}'")
    .split('\n')
    .filter(Boolean);

  const waitPerWindow = new Map<string, number>(); // waiting only
  const attnPerWindow = new Map<string, number>(); // waiting + idle
  for (const line of paneLines) {
    const [paneId, windowId, current = ''] = line.split('\t');
    const desired = paneState.get(paneId) ?? '';
    if (desired !== current) {
      if (desired) exec(`tmux set -p -t ${paneId} @c_state ${desired}`);
      else exec(`tmux set -p -u -t ${paneId} @c_state`);
    }
    if (desired === 'waiting') {
      waitPerWindow.set(windowId, (waitPerWindow.get(windowId) ?? 0) + 1);
      attnPerWindow.set(windowId, (attnPerWindow.get(windowId) ?? 0) + 1);
    } else if (desired === 'idle') {
      attnPerWindow.set(windowId, (attnPerWindow.get(windowId) ?? 0) + 1);
    }
  }

  // "<window_id>\t<@c_wait>\t<@c_attn>" — set both counts on every window.
  const winLines = exec("tmux list-windows -a -F '#{window_id}\t#{@c_wait}\t#{@c_attn}'")
    .split('\n')
    .filter(Boolean);

  for (const line of winLines) {
    const [windowId, curWait = '', curAttn = ''] = line.split('\t');
    const wait = waitPerWindow.get(windowId) ?? 0;
    const attn = attnPerWindow.get(windowId) ?? 0;
    const desiredWait = wait > 0 ? String(wait) : '';
    const desiredAttn = attn > 0 ? String(attn) : '';
    if (desiredWait !== curWait) {
      if (desiredWait) exec(`tmux set -w -t ${windowId} @c_wait ${desiredWait}`);
      else exec(`tmux set -w -u -t ${windowId} @c_wait`);
    }
    if (desiredAttn !== curAttn) {
      if (desiredAttn) exec(`tmux set -w -t ${windowId} @c_attn ${desiredAttn}`);
      else exec(`tmux set -w -u -t ${windowId} @c_attn`);
    }
  }
}
