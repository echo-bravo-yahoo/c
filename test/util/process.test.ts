/**
 * Tests for process signaling utilities
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { signalSession, processStartMatches } from '../../src/util/process.ts';

const HAS_PROC = existsSync('/proc/self/stat');

/** Read field 22 (starttime) of /proc/<pid>/stat — the value Claude stores as procStart. */
function readProcStart(pid: number): string {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8');
  return stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/)[19];
}

describe('c', () => {
  describe('util', () => {
    describe('process', () => {
      describe('processStartMatches', () => {
        it('returns true when procStart is missing (no signal to validate)', () => {
          assert.strictEqual(processStartMatches(process.pid, null), true);
          assert.strictEqual(processStartMatches(process.pid, undefined), true);
        });

        it('returns true when /proc is unavailable (e.g. macOS)', { skip: HAS_PROC }, () => {
          assert.strictEqual(processStartMatches(process.pid, '12345'), true);
        });

        it('matches a live process against its real start time', { skip: !HAS_PROC }, async () => {
          const { spawn } = await import('node:child_process');
          const child = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
          const pid = child.pid!;
          child.unref();
          try {
            const real = readProcStart(pid);
            assert.strictEqual(processStartMatches(pid, real), true);
            // A mismatched start time is how PID reuse is caught.
            assert.strictEqual(processStartMatches(pid, `${Number(real) + 1}`), false);
          } finally {
            try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
          }
        });

        it('returns true for a nonexistent pid (degrades; liveness gates first)', { skip: !HAS_PROC }, () => {
          assert.strictEqual(processStartMatches(2 ** 30, '12345'), true);
        });
      });

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
