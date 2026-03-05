/**
 * Processes audit-tests-output.json into classification files.
 * Reads AST data + applies manual classification rules.
 *
 * Output: .claude/audit/{classification.json, classification.md, approaches.md, report.md, smells.md}
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname!, '..');
const audits = JSON.parse(readFileSync(resolve(ROOT, 'scripts/audit-tests-output.json'), 'utf-8'));

// ── Classification rules ───────────────────────────────────────────────

type TestType = 'unit' | 'integration' | 'e2e' | 'inline-reimpl';
type Approach =
  | 'cli-harness'
  | 'direct-source-call'
  | 'inline-reimpl'
  | 'subprocess-spawn'
  | 'real-filesystem'
  | 'time-mocking'
  | 'mock-module'
  | 'direct-handler-call'
  | 'real-shell-commands';

interface ClassifiedFile {
  file: string;
  type: TestType;
  approaches: Approach[];
  testCount: number;
  tests: { path: string; name: string }[];
}

// Manual classification map based on exploration
const TYPE_MAP: Record<string, TestType> = {
  // CLI harness integration tests
  'test/commands/archive.test.ts': 'integration',
  'test/commands/bankruptcy.test.ts': 'integration',
  'test/commands/clean.test.ts': 'integration',
  'test/commands/close.test.ts': 'integration',
  'test/commands/delete.test.ts': 'integration',
  'test/commands/dir.test.ts': 'integration',
  'test/commands/exec.test.ts': 'integration',
  'test/commands/find.test.ts': 'integration',
  'test/commands/link.test.ts': 'integration',
  'test/commands/list.test.ts': 'integration',
  'test/commands/log.test.ts': 'integration',
  'test/commands/memory.test.ts': 'integration',
  'test/commands/meta.test.ts': 'integration',
  'test/commands/name.test.ts': 'integration',
  'test/commands/show.test.ts': 'integration',
  'test/commands/stats.test.ts': 'integration',
  'test/commands/tag.test.ts': 'integration',
  'test/commands/tmux.test.ts': 'integration',
  'test/commands/unlink.test.ts': 'integration',
  'test/commands/untag.test.ts': 'integration',

  // Direct handler call integration
  'test/commands/init.test.ts': 'integration',
  'test/completion.test.ts': 'integration',

  // Real I/O integration
  'test/store/index.test.ts': 'integration',
  'test/store/status-cache.test.ts': 'integration',
  'test/detection/git.test.ts': 'integration',

  // Mixed integration (real process spawn)
  'test/util/exec.test.ts': 'integration',
  'test/util/process.test.ts': 'integration',

  // Claude sessions (real filesystem)
  'test/claude/sessions.test.ts': 'integration',

  // E2E
  'test/cli/routing.test.ts': 'e2e',

  // Pure unit tests
  'test/detection/jira.test.ts': 'unit',
  'test/detection/pr.test.ts': 'unit',
  'test/detection/github.test.ts': 'unit',
  'test/store/schema.test.ts': 'unit',
  'test/util/format.test.ts': 'unit',
  'test/util/layout.test.ts': 'unit',
  'test/util/sanitize.test.ts': 'unit',
  'test/config.test.ts': 'unit',
  'test/util/reflow.test.ts': 'unit',

  // Hook handler integration tests (call real handlers against temp store)
  'test/hooks/session-end.test.ts': 'integration',
  'test/hooks/stop.test.ts': 'integration',
  'test/hooks/user-prompt.test.ts': 'integration',
  'test/hooks/post-bash.test.ts': 'integration',
  'test/hooks/session-start.test.ts': 'integration',

  // Direct source call integration (exported functions + store persistence)
  'test/commands/new.test.ts': 'integration',
  'test/commands/resume.test.ts': 'integration',
};

const APPROACH_MAP: Record<string, Approach[]> = {
  // CLI harness
  'test/commands/archive.test.ts': ['cli-harness', 'real-filesystem'],
  'test/commands/bankruptcy.test.ts': ['cli-harness', 'real-filesystem'],
  'test/commands/clean.test.ts': ['cli-harness', 'real-filesystem', 'mock-module'],
  'test/commands/close.test.ts': ['cli-harness', 'real-filesystem'],
  'test/commands/delete.test.ts': ['cli-harness', 'real-filesystem'],
  'test/commands/dir.test.ts': ['cli-harness', 'real-filesystem'],
  'test/commands/exec.test.ts': ['cli-harness', 'real-filesystem'],
  'test/commands/find.test.ts': ['cli-harness', 'real-filesystem'],
  'test/commands/link.test.ts': ['cli-harness', 'real-filesystem'],
  'test/commands/list.test.ts': ['cli-harness', 'real-filesystem', 'mock-module', 'time-mocking'],
  'test/commands/log.test.ts': ['cli-harness', 'real-filesystem', 'mock-module'],
  'test/commands/memory.test.ts': ['cli-harness', 'real-filesystem', 'mock-module'],
  'test/commands/meta.test.ts': ['cli-harness', 'real-filesystem'],
  'test/commands/name.test.ts': ['cli-harness', 'real-filesystem'],
  'test/commands/show.test.ts': ['cli-harness', 'real-filesystem', 'mock-module'],
  'test/commands/stats.test.ts': ['cli-harness', 'real-filesystem', 'mock-module'],
  'test/commands/tag.test.ts': ['cli-harness', 'real-filesystem'],
  'test/commands/tmux.test.ts': ['cli-harness', 'real-filesystem', 'mock-module'],
  'test/commands/unlink.test.ts': ['cli-harness', 'real-filesystem'],
  'test/commands/untag.test.ts': ['cli-harness', 'real-filesystem'],

  // Direct handler call
  'test/commands/init.test.ts': ['direct-handler-call'],
  'test/completion.test.ts': ['direct-handler-call', 'real-filesystem'],

  // Real I/O integration
  'test/store/index.test.ts': ['direct-source-call', 'real-filesystem'],
  'test/store/status-cache.test.ts': ['direct-source-call', 'real-filesystem', 'real-shell-commands'],
  'test/detection/git.test.ts': ['direct-source-call', 'real-shell-commands'],
  'test/claude/sessions.test.ts': ['direct-source-call', 'real-filesystem'],

  // Real process tests
  'test/util/exec.test.ts': ['direct-source-call', 'real-shell-commands'],
  'test/util/process.test.ts': ['direct-source-call', 'subprocess-spawn'],

  // E2E
  'test/cli/routing.test.ts': ['subprocess-spawn'],

  // Pure unit
  'test/detection/jira.test.ts': ['direct-source-call'],
  'test/detection/pr.test.ts': ['direct-source-call'],
  'test/detection/github.test.ts': ['direct-source-call'],
  'test/store/schema.test.ts': ['direct-source-call'],
  'test/util/format.test.ts': ['direct-source-call', 'time-mocking'],
  'test/util/layout.test.ts': ['direct-source-call'],
  'test/util/sanitize.test.ts': ['direct-source-call'],
  'test/config.test.ts': ['direct-source-call'],
  'test/util/reflow.test.ts': ['direct-source-call', 'time-mocking'],

  // Hook handler integration (real handlers + temp store)
  'test/hooks/session-end.test.ts': ['direct-handler-call', 'real-filesystem'],
  'test/hooks/stop.test.ts': ['direct-handler-call', 'real-filesystem'],
  'test/hooks/user-prompt.test.ts': ['direct-handler-call', 'real-filesystem'],
  'test/hooks/post-bash.test.ts': ['direct-handler-call', 'direct-source-call', 'real-filesystem'],
  'test/hooks/session-start.test.ts': ['direct-handler-call', 'real-filesystem'],

  // Direct source call integration (exported functions + store)
  'test/commands/new.test.ts': ['direct-source-call', 'real-filesystem'],
  'test/commands/resume.test.ts': ['direct-source-call', 'real-filesystem', 'mock-module'],
};

// ── Build classification ───────────────────────────────────────────────

const classified: ClassifiedFile[] = audits.map((a: any) => ({
  file: a.file,
  type: TYPE_MAP[a.file] ?? 'unit',
  approaches: APPROACH_MAP[a.file] ?? ['direct-source-call'],
  testCount: a.tests.length,
  tests: a.tests.map((t: any) => ({ path: t.path, name: t.name })),
}));

// ── Write classification.json ──────────────────────────────────────────

writeFileSync(
  resolve(ROOT, '.claude/audit/classification.json'),
  JSON.stringify(classified, null, 2),
);

// ── Write classification.md ────────────────────────────────────────────

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const k = key(item);
    (groups[k] ??= []).push(item);
  }
  return groups;
}

const byType = groupBy(classified, c => c.type);
const typeOrder: TestType[] = ['unit', 'integration', 'e2e', 'inline-reimpl'];
const typeLabels: Record<TestType, string> = {
  'unit': 'Unit',
  'integration': 'Integration',
  'e2e': 'E2E (subprocess)',
  'inline-reimpl': 'Inline re-implementation',
};

let classificationMd = '# Test Classification\n\n';
for (const type of typeOrder) {
  const files = byType[type] ?? [];
  const count = files.reduce((s, f) => s + f.testCount, 0);
  classificationMd += `## ${typeLabels[type]} (${files.length} files, ${count} tests)\n\n`;
  for (const f of files.sort((a, b) => a.file.localeCompare(b.file))) {
    classificationMd += `### ${f.file} (${f.testCount} tests)\n\n`;
    classificationMd += `Approaches: ${f.approaches.join(', ')}\n\n`;
    for (const t of f.tests) {
      classificationMd += `- ${t.path} > ${t.name}\n`;
    }
    classificationMd += '\n';
  }
}

writeFileSync(resolve(ROOT, '.claude/audit/classification.md'), classificationMd);

// ── Write approaches.md ───────────────────────────────────────────────

const approachLabels: Record<Approach, string> = {
  'cli-harness': 'CLI harness (setupCLI + cli.run)',
  'direct-source-call': 'Direct source function call',
  'inline-reimpl': 'Inline re-implementation',
  'subprocess-spawn': 'Subprocess spawn (spawnSync/spawn)',
  'real-filesystem': 'Real filesystem (temp dirs)',
  'time-mocking': 'Time mocking (useFakeTime)',
  'mock-module': 'mock.module',
  'direct-handler-call': 'Direct handler/command call',
  'real-shell-commands': 'Real shell commands (exec/execSync)',
};

const approachOrder: Approach[] = [
  'cli-harness', 'direct-source-call', 'direct-handler-call',
  'inline-reimpl', 'subprocess-spawn', 'real-filesystem',
  'real-shell-commands', 'time-mocking', 'mock-module',
];

let approachesMd = '# Test Approaches\n\n';
for (const approach of approachOrder) {
  const files = classified.filter((f: ClassifiedFile) => f.approaches.includes(approach));
  if (files.length === 0) continue;
  const count = files.reduce((s: number, f: ClassifiedFile) => s + f.testCount, 0);
  approachesMd += `## ${approachLabels[approach]} (${files.length} files, ${count} tests)\n\n`;
  approachesMd += '| File | Tests | Type |\n|------|-------|------|\n';
  for (const f of files.sort((a: ClassifiedFile, b: ClassifiedFile) => a.file.localeCompare(b.file))) {
    approachesMd += `| ${f.file} | ${f.testCount} | ${typeLabels[f.type]} |\n`;
  }
  approachesMd += '\n';
}

writeFileSync(resolve(ROOT, '.claude/audit/approaches.md'), approachesMd);

// ── Write report.md ───────────────────────────────────────────────────

const totalFiles = classified.length;
const totalTests = classified.reduce((s: number, f: ClassifiedFile) => s + f.testCount, 0);

let reportMd = '# Test Suite Audit Report\n\n';
reportMd += `**Total: ${totalFiles} files, ${totalTests} tests**\n\n`;

// Type summary
reportMd += '## By type\n\n';
reportMd += '| Type | Files | Tests | % of tests |\n|------|-------|-------|------------|\n';
for (const type of typeOrder) {
  const files = byType[type] ?? [];
  const count = files.reduce((s, f) => s + f.testCount, 0);
  const pct = ((count / totalTests) * 100).toFixed(1);
  reportMd += `| ${typeLabels[type]} | ${files.length} | ${count} | ${pct}% |\n`;
}
reportMd += '\n';

// Approach summary
reportMd += '## By approach\n\n';
reportMd += '| Approach | Files | Tests (with overlap) |\n|----------|-------|---------------------|\n';
for (const approach of approachOrder) {
  const files = classified.filter((f: ClassifiedFile) => f.approaches.includes(approach));
  if (files.length === 0) continue;
  const count = files.reduce((s: number, f: ClassifiedFile) => s + f.testCount, 0);
  approachesMd += '';
  reportMd += `| ${approachLabels[approach]} | ${files.length} | ${count} |\n`;
}
reportMd += '\n';
reportMd += '*Note: Approach counts overlap — a file can use multiple approaches.*\n\n';

// Per-file summary
reportMd += '## Per-file summary\n\n';
reportMd += '| File | Type | Tests | Approaches |\n|------|------|-------|------------|\n';
for (const f of classified.sort((a: ClassifiedFile, b: ClassifiedFile) => a.file.localeCompare(b.file))) {
  reportMd += `| ${f.file} | ${typeLabels[f.type]} | ${f.testCount} | ${f.approaches.join(', ')} |\n`;
}
reportMd += '\n';

writeFileSync(resolve(ROOT, '.claude/audit/report.md'), reportMd);

// ── Write smells.md ───────────────────────────────────────────────────

const inlineReimplFiles = byType['inline-reimpl'] ?? [];
const inlineReimplCount = inlineReimplFiles.reduce((s, f) => s + f.testCount, 0);

let smellsMd = '# Code Smells\n\n';

if (inlineReimplCount > 0) {
  smellsMd += `## Critical: Inline re-implementation\n\n`;
  smellsMd += `${inlineReimplCount} tests across ${inlineReimplFiles.length} files manually perform operations instead of calling the real handler.\n\n`;
  for (const f of inlineReimplFiles) {
    smellsMd += `- \`${f.file}\` (${f.testCount} tests)\n`;
  }
  smellsMd += '\n';
} else {
  smellsMd += `## Inline re-implementation: None\n\nAll tests call real handlers or exported functions.\n\n`;
}

smellsMd += `## Minor\n\n`;
smellsMd += `| Smell | Files | Detail |\n|-------|-------|--------|\n`;
smellsMd += `| Environment-dependent | \`detection/git.test.ts\` | Assumes running inside a git repo |\n`;
smellsMd += `| Mixed test levels in single file | \`util/process.test.ts\`, \`util/exec.test.ts\` | Unit and integration tests without separation |\n`;
smellsMd += '\n';

writeFileSync(resolve(ROOT, '.claude/audit/smells.md'), smellsMd);

// ── Summary ────────────────────────────────────────────────────────────

console.log('Classification output written to .claude/audit/');
console.log(`  ${totalFiles} files, ${totalTests} tests`);
console.log('  Type breakdown:');
for (const type of typeOrder) {
  const files = byType[type] ?? [];
  const count = files.reduce((s, f) => s + f.testCount, 0);
  console.log(`    ${typeLabels[type]}: ${files.length} files, ${count} tests`);
}
