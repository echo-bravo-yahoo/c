/**
 * Session table column definitions.
 *
 * Each column pairs a plain `value` (used by the renderer for width measurement
 * and truncation) with a `style` hook that colours and links the already-fitted
 * cell. The session formatters live in `format.ts`; the columns call them. This
 * is the c-side shape layer over the generic `@echobravoyahoo/tables` renderer —
 * the seam configurable reports will reuse.
 */

import chalk from 'chalk';
import type { Column } from '@echobravoyahoo/tables';
import { fixedWidth, displayWidth } from '@echobravoyahoo/tables';
import type { Session } from '../store/schema.ts';
import { buildJiraUrl } from '../detection/jira.ts';
import { hyperlink } from './hyperlink.ts';
import {
  shortId,
  highlightId,
  getDisplayName,
  formatStatus,
  getRepoName,
  getBranchDisplay,
  buildResourceText,
  formatCost,
  formatFileSize,
  relativeTime,
} from './format.ts';

/**
 * A session paired with the per-render context the column hooks need, so the
 * hooks stay pure (no store/git/transcript access during rendering).
 */
export interface SessionRow {
  session: Session;
  /** Unique-prefix length for ID highlighting (from buildPrefixMap). */
  prefixLen: number;
  /** Cached repo slug for the session directory (from getRepoSlug). */
  repoSlug?: string;
  /** Transcript file size in bytes, when known (from listClaudeSessions). */
  size?: number;
  /** Bottom-up tree rendering (affects the tree connector, handled by the caller). */
  bottomUp: boolean;
  /** Skip transcript reads when resolving the display name. */
  skipTranscript: boolean;
}

const usagePresent = (s: Session): boolean =>
  s.context_pct != null && ['busy', 'idle', 'waiting'].includes(s.state);

const costPresent = (s: Session): boolean => s.cost_usd != null && s.cost_usd >= 0.005;

const id: Column<SessionRow> = {
  key: 'id',
  label: 'ID',
  priority: 2,
  min: 12,
  max: 12,
  value: ({ session }) => shortId(session.id),
  // Coloured ID, trailing pad left plain (added by the renderer).
  style: (text, { prefixLen }) => highlightId(text, prefixLen),
};

const name: Column<SessionRow> = {
  key: 'name',
  label: 'Name',
  priority: 2,
  min: 8,
  max: Infinity,
  flex: true,
  value: ({ session, skipTranscript }) => getDisplayName(session, skipTranscript),
  style: (text, { session, skipTranscript }, width) =>
    (getDisplayName(session, skipTranscript) ? chalk.whiteBright : chalk.dim)(fixedWidth(text, width)),
};

const status: Column<SessionRow> = {
  key: 'status',
  label: 'State',
  priority: 1,
  min: 7,
  max: 9,
  truncate: false, // never shorten; the renderer keeps ≥1 trailing space
  value: ({ session }) => session.state,
  style: (_text, { session }) => formatStatus(session),
};

const usage: Column<SessionRow> = {
  key: 'usage',
  label: 'Usage',
  priority: 7,
  min: 4,
  max: 6,
  value: ({ session }) => (usagePresent(session) ? `${session.context_pct}%` : ''),
  style: (text, { session }, width) => {
    if (!usagePresent(session)) return fixedWidth(text, width);
    const pct = session.context_pct!;
    const colorFn = pct >= 60 ? chalk.red : pct >= 33 ? chalk.yellow : chalk.green;
    return colorFn(fixedWidth(text, width));
  },
};

const repo: Column<SessionRow> = {
  key: 'repo',
  label: 'Repo',
  priority: 3,
  min: 6,
  max: 20,
  value: ({ session }) => getRepoName(session.directory),
  style: (text, { repoSlug }, width) => {
    const linked = repoSlug ? hyperlink(`https://github.com/${repoSlug}`, text) : text;
    return chalk.blue(fixedWidth(linked, width));
  },
};

const branch: Column<SessionRow> = {
  key: 'branch',
  label: 'Worktree/Branch',
  priority: 4,
  min: 6,
  max: 30,
  value: ({ session }) => getBranchDisplay(session).text,
  style: (text, { session, repoSlug }, width) => {
    const { color } = getBranchDisplay(session);
    const linked =
      text && repoSlug && session.resources.branch
        ? hyperlink(`https://github.com/${repoSlug}/tree/${session.resources.branch}`, text)
        : text;
    const padded = fixedWidth(linked, width);
    return color === 'dim' ? chalk.dim(padded) : chalk[color](padded);
  },
};

const cost: Column<SessionRow> = {
  key: 'cost',
  label: 'Cost',
  priority: 6,
  min: 5,
  max: 8,
  value: ({ session }) => (costPresent(session) ? formatCost(session.cost_usd!) : ''),
  style: (text, { session }, width) =>
    costPresent(session) ? chalk.dim(fixedWidth(text, width)) : fixedWidth(text, width),
};

const resources: Column<SessionRow> = {
  key: 'resources',
  label: 'Resources',
  priority: 9,
  min: 4,
  max: 24,
  value: ({ session }) => buildResourceText(session),
  style: (text, { session }, width) => {
    const resourceText = buildResourceText(session);
    if (resourceText === '-') return chalk.dim(fixedWidth('-', width));
    // Truncated cells (the fitted text carries an ellipsis) render dim.
    if (text.includes('…')) return chalk.dim(fixedWidth(text, width));
    const prNum = session.resources.pr?.match(/\/pull\/(\d+)/)?.[1];
    const coloredParts = [
      prNum ? chalk.green(hyperlink(session.resources.pr!, `#${prNum}`)) : '',
      session.resources.jira ? chalk.yellow(hyperlink(buildJiraUrl(session.resources.jira), session.resources.jira)) : '',
      session.tags.values.length > 0 ? chalk.cyan(session.tags.values[0]) : '',
    ]
      .filter(Boolean)
      .join(' ');
    return coloredParts + ' '.repeat(Math.max(0, width - displayWidth(resourceText)));
  },
};

const size: Column<SessionRow> = {
  key: 'size',
  label: 'Size',
  priority: 8,
  min: 7,
  max: 10,
  value: ({ size }) => (size != null ? formatFileSize(size) : ''),
  style: (text, { size }, width) =>
    size != null ? chalk.dim(fixedWidth(text, width)) : fixedWidth(text, width),
};

const time: Column<SessionRow> = {
  key: 'time',
  label: 'Last Active',
  priority: 5,
  min: 6,
  max: 12,
  truncate: false, // relative time is never shortened; the renderer leaves it unpadded
  value: ({ session }) => relativeTime(session.last_active_at),
  style: (text) => chalk.dim(text),
};

/** Columns in render order. ID and Name lead; Last Active trails (unpadded). */
export const SESSION_COLUMNS: Column<SessionRow>[] = [
  id,
  name,
  status,
  usage,
  repo,
  branch,
  cost,
  resources,
  size,
  time,
];
