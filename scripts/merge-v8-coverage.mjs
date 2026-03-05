#!/usr/bin/env node
/**
 * Merge V8 coverage files before c8 report.
 *
 * Problem: when `node --test` runs each test file in a child process,
 * every process produces V8 coverage for every loaded module. c8's
 * merge of these per-process reports is broken — it clobbers detailed
 * coverage with zeroed-out entries from processes that loaded but
 * didn't exercise a function.
 *
 * Solution: use @bcoe/v8-coverage's mergeProcessCovs() to correctly
 * merge all per-process V8 coverage into a single report. It matches
 * functions by URL + root range, resolves nested range trees, and
 * sums execution counts across processes.
 *
 * Usage: node scripts/merge-v8-coverage.mjs <v8-coverage-dir>
 * Writes merged output back to the same directory (removes originals).
 */
import { readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { mergeProcessCovs } from '@bcoe/v8-coverage';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: merge-v8-coverage.mjs <coverage-dir>');
  process.exit(1);
}

const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const processCovs = files.map((f) =>
  JSON.parse(readFileSync(join(dir, f), 'utf8'))
);

const merged = mergeProcessCovs(processCovs);

// Post-merge cleanup: when both block-level (isBlockCoverage: true) and
// function-level (isBlockCoverage: false) entries exist for the same
// function name in a script, drop the function-level ones. They carry
// less information and their count-0 flat ranges cause c8 to mark
// covered functions as uncovered.
for (const script of merged.result) {
  const blockFnNames = new Set();
  for (const fn of script.functions) {
    if (fn.isBlockCoverage) blockFnNames.add(fn.functionName);
  }
  script.functions = script.functions.filter(
    (fn) => fn.isBlockCoverage || !blockFnNames.has(fn.functionName)
  );
}

for (const file of files) {
  unlinkSync(join(dir, file));
}

writeFileSync(
  join(dir, 'coverage-merged.json'),
  JSON.stringify(merged)
);
