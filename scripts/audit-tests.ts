/**
 * AST-based test file auditor.
 *
 * Parses each test file with the TypeScript compiler API and extracts:
 *  - nested describe paths
 *  - it() test names
 *  - body signals (function calls, assignments, assertions)
 *  - file-level import metadata
 *
 * Output: scripts/audit-tests-output.json
 */

import * as ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';

// ── Types ──────────────────────────────────────────────────────────────

interface ImportMeta {
  specifier: string;
  source: 'src' | 'test' | 'node' | 'external';
  names: string[];
}

interface BodySignal {
  type: 'call' | 'assignment' | 'assertion';
  text: string;
}

interface TestInfo {
  path: string;   // e.g. "c > commands > close > state transitions"
  name: string;   // the it() label
  bodySignals: BodySignal[];
}

interface DescribeInfo {
  label: string;
  children: DescribeInfo[];
  tests: { name: string; bodySignals: BodySignal[] }[];
}

interface FileAudit {
  file: string;
  imports: ImportMeta[];
  describes: DescribeInfo[];
  tests: TestInfo[];
}

// ── Helpers ────────────────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname!, '..');

function classifyImportSource(specifier: string): ImportMeta['source'] {
  if (specifier.startsWith('node:')) return 'node';
  if (specifier.includes('/src/') || specifier.startsWith('../../src/')) return 'src';
  if (specifier.includes('/test/') || specifier.startsWith('../') || specifier.startsWith('./')) return 'test';
  return 'external';
}

function getStringLiteral(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return undefined;
}

function getCallName(expr: ts.Expression): string | undefined {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    const obj = getCallName(expr.expression);
    return obj ? `${obj}.${expr.name.text}` : expr.name.text;
  }
  return undefined;
}

// ── Import extraction ──────────────────────────────────────────────────

function extractImports(sourceFile: ts.SourceFile): ImportMeta[] {
  const imports: ImportMeta[] = [];
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const specifier = getStringLiteral(stmt.moduleSpecifier);
    if (!specifier) continue;

    const names: string[] = [];
    const clause = stmt.importClause;
    if (clause) {
      if (clause.name) names.push(clause.name.text);
      if (clause.namedBindings) {
        if (ts.isNamedImports(clause.namedBindings)) {
          for (const el of clause.namedBindings.elements) {
            // Skip type-only imports
            if (!el.isTypeOnly) names.push(el.name.text);
          }
        } else if (ts.isNamespaceImport(clause.namedBindings)) {
          names.push(`* as ${clause.namedBindings.name.text}`);
        }
      }
    }

    imports.push({
      specifier,
      source: classifyImportSource(specifier),
      names,
    });
  }
  return imports;
}

// ── Body signal extraction ─────────────────────────────────────────────

function extractBodySignals(body: ts.Block, sourceFile: ts.SourceFile): BodySignal[] {
  const signals: BodySignal[] = [];
  const seen = new Set<string>();

  function add(signal: BodySignal) {
    const key = `${signal.type}:${signal.text}`;
    if (!seen.has(key)) {
      seen.add(key);
      signals.push(signal);
    }
  }

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const name = getCallName(node.expression);
      if (name) {
        // Classify assertions
        if (
          name.startsWith('assert.') ||
          name === 'assert' ||
          name.startsWith('assert(')
        ) {
          add({ type: 'assertion', text: name });
        } else {
          add({ type: 'call', text: name });
        }
      }
    }

    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = node.left.getText(sourceFile);
      add({ type: 'assignment', text: left });
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(body, visit);
  return signals;
}

// ── Describe/it tree extraction ────────────────────────────────────────

function isDescribeOrIt(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  const name = getCallName(node.expression);
  return name === 'describe' || name === 'it';
}

function processDescribe(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  parentPath: string[],
): { describes: DescribeInfo[]; tests: TestInfo[] } {
  const name = getCallName(node.expression);
  const label = node.arguments[0] ? getStringLiteral(node.arguments[0]) : undefined;

  if (name === 'it' && label) {
    // Extract body signals from the callback
    const callback = node.arguments[1];
    let bodySignals: BodySignal[] = [];
    if (callback && (ts.isFunctionExpression(callback) || ts.isArrowFunction(callback))) {
      const body = callback.body;
      if (ts.isBlock(body)) {
        bodySignals = extractBodySignals(body, sourceFile);
      }
    }

    const path = parentPath.join(' > ');
    return {
      describes: [],
      tests: [{ path, name: label, bodySignals }],
    };
  }

  if (name === 'describe' && label) {
    const currentPath = [...parentPath, label];
    const callback = node.arguments[1];

    const childDescribes: DescribeInfo[] = [];
    const childTests: { name: string; bodySignals: BodySignal[] }[] = [];
    const allTests: TestInfo[] = [];

    if (callback && (ts.isFunctionExpression(callback) || ts.isArrowFunction(callback))) {
      const body = callback.body;
      if (ts.isBlock(body)) {
        for (const stmt of body.statements) {
          walkForDescribeIt(stmt, sourceFile, currentPath, childDescribes, childTests, allTests);
        }
      }
    }

    return {
      describes: [{
        label,
        children: childDescribes,
        tests: childTests,
      }],
      tests: allTests,
    };
  }

  return { describes: [], tests: [] };
}

function walkForDescribeIt(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  parentPath: string[],
  outDescribes: DescribeInfo[],
  outDirectTests: { name: string; bodySignals: BodySignal[] }[],
  outAllTests: TestInfo[],
) {
  if (isDescribeOrIt(node)) {
    const result = processDescribe(node, sourceFile, parentPath);
    outDescribes.push(...result.describes);
    outAllTests.push(...result.tests);

    // Direct tests (it blocks) at this level
    for (const t of result.tests) {
      if (t.path === parentPath.join(' > ')) {
        outDirectTests.push({ name: t.name, bodySignals: t.bodySignals });
      }
    }
    return;
  }

  // Check if this is an expression statement containing a describe/it call
  if (ts.isExpressionStatement(node) && isDescribeOrIt(node.expression)) {
    const result = processDescribe(node.expression, sourceFile, parentPath);
    outDescribes.push(...result.describes);
    outAllTests.push(...result.tests);

    for (const t of result.tests) {
      if (t.path === parentPath.join(' > ')) {
        outDirectTests.push({ name: t.name, bodySignals: t.bodySignals });
      }
    }
    return;
  }

  // Recurse into other nodes to find nested describe/it
  ts.forEachChild(node, child => {
    walkForDescribeIt(child, sourceFile, parentPath, outDescribes, outDirectTests, outAllTests);
  });
}

// ── Main ───────────────────────────────────────────────────────────────

function auditFile(filePath: string): FileAudit {
  const content = readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const imports = extractImports(sourceFile);

  const describes: DescribeInfo[] = [];
  const tests: TestInfo[] = [];

  for (const stmt of sourceFile.statements) {
    const dummyTests: { name: string; bodySignals: BodySignal[] }[] = [];
    walkForDescribeIt(stmt, sourceFile, [], describes, dummyTests, tests);
  }

  return {
    file: relative(ROOT, filePath),
    imports,
    describes,
    tests,
  };
}

function findTestFiles(): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.test.ts')) {
        results.push(full);
      }
    }
  }

  walk(join(ROOT, 'test'));
  return results;
}

// ── Entry point ────────────────────────────────────────────────────────

const files = findTestFiles();
console.log(`Found ${files.length} test files`);

const audits: FileAudit[] = [];
for (const file of files.sort()) {
  try {
    const audit = auditFile(file);
    audits.push(audit);
    console.log(`  ${audit.file}: ${audit.tests.length} tests`);
  } catch (err) {
    console.error(`  ERROR processing ${file}: ${err}`);
  }
}

const totalTests = audits.reduce((sum, a) => sum + a.tests.length, 0);
console.log(`\nTotal: ${audits.length} files, ${totalTests} tests`);

const outPath = resolve(ROOT, 'scripts/audit-tests-output.json');
writeFileSync(outPath, JSON.stringify(audits, null, 2));
console.log(`Output written to ${outPath}`);
