/**
 * Dynamic column layout for session tables
 */

export type ColumnKey = 'status' | 'idName' | 'repo' | 'branch' | 'time' | 'cost' | 'resources' | 'size';

export interface ColumnSpec {
  key: ColumnKey;
  label: string;
  min: number;
  max: number;
  priority: number;
}

export interface ColumnLayout {
  id: number;
  name: number;
  status: number;
  repo: number;
  branch: number;
  cost: number;
  resources: number;
  size: number;
  time: number;
  visible: Set<ColumnKey>;
  totalWidth: number;
}

export const GUTTER = 2;
export const ID_FIXED_WIDTH = 12;

export const COLUMN_SPECS: readonly ColumnSpec[] = [
  { key: 'status',    label: 'State',           min:  7, max:  9, priority: 1 },
  { key: 'idName',    label: 'ID',              min: 20, max: Infinity, priority: 2 },
  { key: 'repo',      label: 'Repo',            min:  6, max: 20, priority: 3 },
  { key: 'branch',    label: 'Worktree/Branch', min:  6, max: 30, priority: 4 },
  { key: 'time',      label: 'Last Active',     min:  6, max: 12, priority: 5 },
  { key: 'cost',      label: 'Cost',            min:  5, max:  8, priority: 6 },
  { key: 'size',      label: 'Size',            min:  7, max: 10, priority: 7 },
  { key: 'resources', label: 'Resources',       min:  4, max: 24, priority: 8 },
];

/**
 * Compute dynamic column widths based on content and terminal width.
 *
 * 1. Drop lowest-priority columns until minimums + gutter fit.
 * 2. Allocate minimums.
 * 3. Expand in priority order toward content width (capped by max).
 * 4. Leftover space goes to idName (up to content width).
 */
export function computeColumnLayout(
  contentWidths: Map<ColumnKey, number>,
  terminalWidth: number
): ColumnLayout {
  // Work with a mutable copy sorted by priority (ascending = highest first)
  let active = [...COLUMN_SPECS].sort((a, b) => a.priority - b.priority);

  // Step 1: Drop lowest-priority columns until minimums fit
  while (active.length > 0) {
    const minSum = active.reduce((sum, col) => sum + col.min, 0) + GUTTER;
    if (minSum <= terminalWidth) break;
    // Drop lowest priority (highest number = last in sorted array)
    active.pop();
  }

  // Step 2: Allocate minimums
  const widths = new Map<ColumnKey, number>();
  for (const col of active) {
    widths.set(col.key, col.min);
  }

  let used = active.reduce((sum, col) => sum + col.min, 0) + GUTTER;
  let remaining = Math.max(0, terminalWidth - used);

  // Step 3: Expand in priority order toward content width (capped by max)
  for (const col of active) {
    if (remaining <= 0) break;
    const current = widths.get(col.key)!;
    const content = contentWidths.get(col.key) ?? 0;
    const target = Math.min(Math.max(content, current), col.max);
    const grow = Math.min(target - current, remaining);
    if (grow > 0) {
      widths.set(col.key, current + grow);
      remaining -= grow;
    }
  }

  // Step 4: Leftover to idName (up to content width)
  if (remaining > 0 && widths.has('idName')) {
    const current = widths.get('idName')!;
    const content = contentWidths.get('idName') ?? 0;
    const target = Math.max(content, current);
    const grow = Math.min(target - current, remaining);
    if (grow > 0) {
      widths.set('idName', current + grow);
      remaining -= grow;
    }
  }

  // Step 5: Expand toward header label width (only if space remains)
  for (const col of active) {
    if (remaining <= 0) break;
    const current = widths.get(col.key)!;
    const labelWidth = col.label.length + 1;
    if (labelWidth > current) {
      const grow = Math.min(labelWidth - current, remaining);
      widths.set(col.key, current + grow);
      remaining -= grow;
    }
  }

  const visible = new Set(active.map((c) => c.key));
  const idNameWidth = widths.get('idName') ?? 0;

  const totalWidth =
    active.reduce((sum, col) => sum + (widths.get(col.key) ?? 0), 0) + GUTTER;

  return {
    id: ID_FIXED_WIDTH,
    name: Math.max(0, idNameWidth - ID_FIXED_WIDTH),
    status: widths.get('status') ?? 0,
    repo: widths.get('repo') ?? 0,
    branch: widths.get('branch') ?? 0,
    cost: widths.get('cost') ?? 0,
    resources: widths.get('resources') ?? 0,
    size: widths.get('size') ?? 0,
    time: widths.get('time') ?? 0,
    visible,
    totalWidth,
  };
}
