/**
 * Spec reporter wrapper that filters test:stdout and test:stderr events.
 *
 * The built-in spec reporter interleaves stdout/stderr from test code
 * (e.g. JSON from --json command tests) into its tree output. This
 * wrapper strips those events before delegating to spec.
 */

import { spec } from 'node:test/reporters';
import { PassThrough } from 'node:stream';

export default async function* reporter(source) {
  const filtered = new PassThrough({ objectMode: true });
  const specStream = filtered.compose(spec);

  const drainSource = (async () => {
    for await (const event of source) {
      if (event.type !== 'test:stdout' && event.type !== 'test:stderr') {
        filtered.write(event);
      }
    }
    filtered.end();
  })();

  for await (const chunk of specStream) {
    yield chunk;
  }

  await drainSource;
}
