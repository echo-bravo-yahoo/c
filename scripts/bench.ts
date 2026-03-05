import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';

const iterations = parseInt(process.argv[2] || '100', 10);
const bin = resolve('dist/index.js');

// --- helpers ---

function run(...args: string[]): Buffer {
  return execFileSync('node', [bin, ...args], { stdio: ['ignore', 'pipe', 'ignore'] });
}

function runSilent(...args: string[]): void {
  execFileSync('node', [bin, ...args], { stdio: 'ignore' });
}

function measure(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

function stats(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
  const p95 = sorted[Math.ceil(n * 0.95) - 1];
  const p99 = sorted[Math.ceil(n * 0.99) - 1];
  const variance = sorted.reduce((acc, t) => acc + (t - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  return {
    count: n,
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    median,
    p95,
    p99,
    stddev,
  };
}

function fmt(ms: number): string {
  return ms.toFixed(1);
}

// --- setup ---

let sessionId: string | undefined;
let sessionCount = 0;

try {
  const out = run('list', '--json');
  const sessions = JSON.parse(out.toString());
  sessionCount = sessions.length;
  if (sessionCount > 0) {
    sessionId = sessions[0].id;
  }
} catch {
  // no sessions or command failed
}

interface Benchmark {
  name: string;
  args: string[];
}

const benchmarks: Benchmark[] = [{ name: 'c list', args: ['list'] }];

if (sessionId) {
  benchmarks.push({ name: 'c show', args: ['show', sessionId] });
} else {
  console.log('No sessions found — skipping c show benchmark\n');
}

// --- warmup ---

for (const b of benchmarks) {
  runSilent(...b.args);
}

// --- benchmark ---

const results = new Map<string, number[]>();

for (const b of benchmarks) {
  const timings: number[] = [];
  for (let i = 0; i < iterations; i++) {
    timings.push(measure(() => runSilent(...b.args)));
  }
  results.set(b.name, timings);
}

// --- report ---

console.log(`Iterations: ${iterations}`);
console.log(`Node.js:    ${process.version}`);
console.log(`Sessions:   ${sessionCount}`);
console.log();

const columns = ['command', 'count', 'min', 'max', 'mean', 'median', 'p95', 'p99', 'stddev'];
const rows: string[][] = [];

for (const [name, timings] of results) {
  const s = stats(timings);
  rows.push([
    name,
    String(s.count),
    fmt(s.min),
    fmt(s.max),
    fmt(s.mean),
    fmt(s.median),
    fmt(s.p95),
    fmt(s.p99),
    fmt(s.stddev),
  ]);
}

const widths = columns.map((col, i) =>
  Math.max(col.length, ...rows.map(r => r[i].length))
);

const header = columns.map((c, i) => c.padStart(widths[i])).join('  ');
const separator = widths.map(w => '─'.repeat(w)).join('──');

console.log(header);
console.log(separator);
for (const row of rows) {
  console.log(row.map((cell, i) => cell.padStart(widths[i])).join('  '));
}
