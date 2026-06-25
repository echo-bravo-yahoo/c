/**
 * c tmux-shell - split the current pane and open a shell in the directory the
 * pane's Claude session is rooted in. Bound to `C-a e` via run-shell.
 *
 * Uses the session's authoritative `directory` (worktree-resolved + self-healed):
 * for a worktree session `#{pane_current_path}` is the repo root, not the
 * worktree (c new --worktree runs claude from the repo root, src/commands/new.ts:86).
 * Falls back to the pane's cwd when no tracked session occupies the pane.
 *
 * Split direction follows pane shape (cells are ~2:1): wider than ~2× tall →
 * side-by-side (-h), else stacked (-v), so neither pane is cramped.
 */

import { getSessionByPane } from '../../store/index.ts';
import { exec } from '../../util/exec.ts';

export function tmuxShellCommand(): void {
  const pane = process.env.TMUX_PANE;
  if (!pane) return;

  const session = getSessionByPane(pane);
  const dir =
    session?.directory ||
    exec(`tmux display -p -t ${pane} '#{pane_current_path}'`) ||
    process.env.HOME ||
    '.';

  const [w = '0', h = '0'] = exec(`tmux display -p -t ${pane} '#{pane_width} #{pane_height}'`).split(' ');
  const dirFlag = Number(w) > Number(h) * 2 ? '-h' : '-v';

  // pane id carries no shell metacharacters; dir may contain spaces → quote it.
  exec(`tmux split-window ${dirFlag} -t ${pane} -c ${JSON.stringify(dir)}`);
}
