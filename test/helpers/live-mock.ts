/**
 * Mock for src/util/process.ts used by tests that run commands which call
 * reconcileLiveState() (list, waiting, tmux-status, tmux-jump, tmux-menu).
 *
 * reconcileLiveState() reads Claude Code's live session files from the real
 * ~/.claude/sessions via collectLiveSessions(). Left unmocked, seeded test
 * sessions (which have no live file) would be projected to `closed`. This mock
 * makes collectLiveSessions() mirror the current index so the projection is an
 * idempotent no-op: active seeds stay live with their own state; closed/archived
 * seeds are simply absent (not live) but, being inactive, are left untouched.
 *
 * Usage (top of test file, before importing the CLI):
 *   let readIndexFn = null;
 *   mock.module(resolve('src/util/process.ts'), {
 *     namedExports: makeProcessMock(() => readIndexFn()),
 *   });
 *   const { readIndex } = await import('../../src/store/index.ts');
 *   readIndexFn = readIndex;
 */

export function makeProcessMock(
  getIndex: () => { sessions: Record<string, { state: string }> }
): Record<string, unknown> {
  return {
    isProcessAlive: () => true,
    processStartMatches: () => true,
    collectLiveSessions: () => {
      const m = new Map<string, unknown>();
      const idx = getIndex();
      for (const [id, s] of Object.entries(idx.sessions)) {
        let status: string | null = null;
        let waitingFor: string | null = null;
        if (s.state === 'waiting') { status = 'waiting'; waitingFor = 'permission prompt'; }
        else if (s.state === 'busy') status = 'busy';
        else if (s.state === 'idle') status = 'idle';
        else continue; // closed / archived: not a live process
        m.set(id, { sessionId: id, pid: 0, status, waitingFor, updatedAt: 0 });
      }
      return m;
    },
    collectLiveSessionIds: () => new Set<string>(),
    isTranscriptOpen: () => true,
    signalSession: async () => {},
  };
}
