/**
 * Tests for dynamic column layout
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  computeColumnLayout,
  COLUMN_SPECS,
  GUTTER,
  ID_FIXED_WIDTH,
  type ColumnKey,
} from '../../src/util/layout.js';

/** Sum of all column minimums */
const ALL_MIN = COLUMN_SPECS.reduce((sum, col) => sum + col.min, 0);

/** Helper: empty content widths (all zero) */
function emptyWidths(): Map<ColumnKey, number> {
  return new Map();
}

/** Helper: content widths with specific values */
function widths(entries: Partial<Record<ColumnKey, number>>): Map<ColumnKey, number> {
  return new Map(Object.entries(entries) as [ColumnKey, number][]);
}

describe('c > util > layout > computeColumnLayout', () => {
  it('all columns visible when terminal is wide', () => {
    const layout = computeColumnLayout(emptyWidths(), 200);
    assert.strictEqual(layout.visible.size, 6);
    for (const spec of COLUMN_SPECS) {
      assert.ok(layout.visible.has(spec.key), `${spec.key} should be visible`);
    }
  });

  it('all columns at minimums when terminal equals sum of minimums + gutter', () => {
    const minTerminal = ALL_MIN + GUTTER;
    const layout = computeColumnLayout(emptyWidths(), minTerminal);

    assert.strictEqual(layout.visible.size, 6);
    assert.strictEqual(layout.status, 7);
    assert.strictEqual(layout.id + layout.name, 20); // idName min
    assert.strictEqual(layout.repo, 6);
    assert.strictEqual(layout.branch, 6);
    assert.strictEqual(layout.time, 6);
    assert.strictEqual(layout.resources, 4);
  });

  it('lowest-priority column drops first when too narrow', () => {
    // Just below the point where all 6 fit
    const tooNarrow = ALL_MIN + GUTTER - 1;
    const layout = computeColumnLayout(emptyWidths(), tooNarrow);

    // resources (priority 6) should be dropped
    assert.ok(!layout.visible.has('resources'), 'resources should be dropped');
    assert.strictEqual(layout.visible.size, 5);
    assert.ok(layout.visible.has('status'));
    assert.ok(layout.visible.has('idName'));
    assert.ok(layout.visible.has('repo'));
    assert.ok(layout.visible.has('branch'));
    assert.ok(layout.visible.has('time'));
  });

  it('multiple columns drop progressively', () => {
    // Only enough room for status(7) + idName(20) + repo(6) + gutter(2) = 35
    const layout = computeColumnLayout(emptyWidths(), 35);

    assert.ok(layout.visible.has('status'));
    assert.ok(layout.visible.has('idName'));
    assert.ok(layout.visible.has('repo'));
    assert.ok(!layout.visible.has('branch'), 'branch should be dropped');
    assert.ok(!layout.visible.has('time'), 'time should be dropped');
    assert.ok(!layout.visible.has('resources'), 'resources should be dropped');
  });

  it('extreme narrow: only status + idName visible', () => {
    // status(7) + idName(20) + gutter(2) = 29
    const layout = computeColumnLayout(emptyWidths(), 29);

    assert.strictEqual(layout.visible.size, 2);
    assert.ok(layout.visible.has('status'));
    assert.ok(layout.visible.has('idName'));
  });

  it('ID always 12 within idName budget', () => {
    const layout = computeColumnLayout(emptyWidths(), 200);
    assert.strictEqual(layout.id, ID_FIXED_WIDTH);
    assert.strictEqual(layout.id, 12);
  });

  it('name gets remainder of idName budget up to content width', () => {
    // With enough space but no content, idName stays at min
    const layout = computeColumnLayout(emptyWidths(), 200);
    assert.strictEqual(layout.id + layout.name, 20); // idName min

    // With content, idName expands to fit
    const content = widths({ idName: 60 });
    const layout2 = computeColumnLayout(content, 200);
    assert.strictEqual(layout2.id + layout2.name, 60);
  });

  it('empty content widths → all at minimums (plus leftover to idName)', () => {
    const minTerminal = ALL_MIN + GUTTER;
    const layout = computeColumnLayout(emptyWidths(), minTerminal);

    // With exactly min space, no room to expand
    assert.strictEqual(layout.status, 7);
    assert.strictEqual(layout.repo, 6);
    assert.strictEqual(layout.branch, 6);
    assert.strictEqual(layout.time, 6);
    assert.strictEqual(layout.resources, 4);
  });

  it('higher-priority columns expand before lower-priority', () => {
    // Give all columns large content, but limited extra space
    const content = widths({
      status: 9,
      idName: 44,
      repo: 20,
      branch: 30,
      time: 12,
      resources: 24,
    });

    // Exactly enough for minimums + 10 extra
    const layout = computeColumnLayout(content, ALL_MIN + GUTTER + 10);

    // Status expands first (priority 1): min 7, content 9, max 9 → grow by 2. Remaining = 8.
    assert.strictEqual(layout.status, 9);
    // idName expands next (priority 2): min 20, content 44 → grow by min(24, 8) = 8
    assert.strictEqual(layout.id + layout.name, 28);
    // Others stay at minimums
    assert.strictEqual(layout.repo, 6);
    assert.strictEqual(layout.branch, 6);
    assert.strictEqual(layout.time, 6);
    assert.strictEqual(layout.resources, 4);
  });

  it('content shorter than min does not shrink column below min', () => {
    const content = widths({
      repo: 2, // shorter than min of 6
      branch: 1,
    });

    const layout = computeColumnLayout(content, ALL_MIN + GUTTER);
    assert.ok(layout.repo >= 6, 'repo should not go below min');
    assert.ok(layout.branch >= 6, 'branch should not go below min');
  });

  it('max width cap respected per column (idName expands to content)', () => {
    // Give huge content but plenty of terminal space
    const content = widths({
      status: 50,
      idName: 100,
      repo: 100,
      branch: 100,
      time: 100,
      resources: 100,
    });

    const layout = computeColumnLayout(content, 500);

    assert.ok(layout.status <= 9, 'status capped at max 9');
    assert.strictEqual(layout.id + layout.name, 100, 'idName expands to content width');
    assert.ok(layout.repo <= 20, 'repo capped at max 20');
    assert.ok(layout.branch <= 30, 'branch capped at max 30');
    assert.ok(layout.time <= 12, 'time capped at max 12');
    assert.ok(layout.resources <= 24, 'resources capped at max 24');
  });

  it('leftover space goes to idName (up to content width)', () => {
    // Content at minimums except idName has long content
    const content = widths({
      status: 7,
      idName: 60,
      repo: 6,
      branch: 6,
      time: 6,
      resources: 4,
    });

    // 50 extra beyond minimums — enough for idName to reach content width of 60
    const layout = computeColumnLayout(content, ALL_MIN + GUTTER + 50);

    // idName min is 20, content is 60, so grows by 40 (within 50 available)
    assert.strictEqual(layout.id + layout.name, 60);
  });

  it('totalWidth equals sum of allocated widths + gutter', () => {
    const layout = computeColumnLayout(emptyWidths(), 200);

    const sumOfWidths =
      (layout.id + layout.name) +
      layout.status +
      layout.repo +
      layout.branch +
      layout.time +
      layout.resources;

    assert.strictEqual(layout.totalWidth, sumOfWidths + GUTTER);
  });

  it('totalWidth correct when columns are dropped', () => {
    // Only status + idName
    const layout = computeColumnLayout(emptyWidths(), 29);

    const sumOfWidths = (layout.id + layout.name) + layout.status;
    assert.strictEqual(layout.totalWidth, sumOfWidths + GUTTER);
    assert.strictEqual(layout.repo, 0);
    assert.strictEqual(layout.branch, 0);
    assert.strictEqual(layout.time, 0);
    assert.strictEqual(layout.resources, 0);
  });
});
