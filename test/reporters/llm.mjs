/**
 * LLM-friendly test reporter for node:test
 *
 * - Flattens nested describe/it names into fully-qualified paths
 * - Only reports failures (with file:line and assertion details)
 * - Suppresses passing tests, stdout/stderr, and diagnostics
 * - Emits a one-line summary at the end
 */

export default async function* reporter(source) {
  const stack = [];
  const cwd = process.cwd() + '/';

  for await (const event of source) {
    switch (event.type) {
      case 'test:start':
        stack[event.data.nesting] = event.data.name;
        break;

      case 'test:fail': {
        // Skip suite-level rollup failures — only report leaf tests
        if (event.data.details?.type !== 'test') break;

        const path = stack.slice(0, event.data.nesting).concat(event.data.name).join(' > ');
        const file = (event.data.file || '').replace(cwd, '');
        const line = event.data.line;
        const cause = event.data.details?.error?.cause;

        yield `FAIL: ${path}\n`;
        yield `  ${file}:${line}\n`;

        if (cause) {
          if (cause.operator) {
            yield `  ${cause.operator}: expected ${JSON.stringify(cause.expected)}, got ${JSON.stringify(cause.actual)}\n`;
          } else if (cause.message) {
            yield `  ${cause.message}\n`;
          } else {
            yield `  ${JSON.stringify(cause)}\n`;
          }
        }

        yield '\n';
        break;
      }

      case 'test:summary': {
        // Final aggregate summary has no file property
        if (event.data.file) break;
        const { passed, failed, tests } = event.data.counts;
        const sec = (event.data.duration_ms / 1000).toFixed(1);
        yield `${passed} passed, ${failed} failed (${tests} total) in ${sec}s\n`;
        break;
      }

      // Suppress: test:pass, test:stdout, test:stderr, test:diagnostic,
      // test:enqueue, test:dequeue, test:plan, test:complete
      default:
        break;
    }
  }
}
