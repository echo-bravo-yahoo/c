/**
 * Tests for process signaling utilities
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { signalSession } from '../../src/util/process.js';

describe('c', () => {
  describe('util', () => {
    describe('process', () => {
      describe('signalSession', () => {
        it('ignores undefined pid', async () => {
          // Should resolve without error
          await signalSession(undefined);
        });

        it('ignores pid 0', async () => {
          await signalSession(0);
        });

        it('tolerates already-exited process', async () => {
          // PID 99999 is almost certainly not running
          await assert.doesNotReject(() => signalSession(99999));
        });

        it('terminates a running process', async () => {
          const { spawn } = await import('node:child_process');
          const child = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' });
          const pid = child.pid!;
          child.unref();

          // Verify process exists
          assert.doesNotThrow(() => process.kill(pid, 0));

          await signalSession(pid);

          // Process should be gone (or exiting)
          let alive = false;
          try {
            process.kill(pid, 0);
            alive = true;
          } catch {
            // Expected: ESRCH
          }
          assert.strictEqual(alive, false);
        });
      });
    });
  });
});
