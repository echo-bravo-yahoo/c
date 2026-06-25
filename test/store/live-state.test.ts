/**
 * Tests for the live-state projection: mapLiveStatusToState (pure mapping) and
 * reconcileLiveState (read-time projection from Claude Code's session files).
 *
 * collectLiveSessions() is mocked via a controllable map so each case can pin
 * exactly what the live file reports.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { resolve } from 'node:path';

let liveMap = new Map<string, unknown>();
mock.module(resolve('src/util/process.ts'), {
  namedExports: {
    isProcessAlive: () => true,
    processStartMatches: () => true,
    collectLiveSessions: () => liveMap,
    collectLiveSessionIds: () => new Set(liveMap.keys()),
    isTranscriptOpen: () => true,
    signalSession: async () => {},
  },
});

type CLIHarness = import('../helpers/cli.ts').CLIHarness;
const { setupCLI } = await import('../helpers/cli.ts');
const { mapLiveStatusToState, reconcileLiveState } = await import('../../src/store/index.ts');

const liveEntry = (id: string, status: string | null, waitingFor: string | null = null, updatedAt = 0) =>
  ({ sessionId: id, pid: 0, status, waitingFor, updatedAt });

describe('c', () => {
  describe('store', () => {
    describe('mapLiveStatusToState', () => {
      it('maps waitingFor (any status) to waiting', () => {
        assert.strictEqual(mapLiveStatusToState({ status: 'busy', waitingFor: 'plan approval' }), 'waiting');
      });
      it('maps status waiting to waiting', () => {
        assert.strictEqual(mapLiveStatusToState({ status: 'waiting', waitingFor: null }), 'waiting');
      });
      it('maps busy to busy', () => {
        assert.strictEqual(mapLiveStatusToState({ status: 'busy', waitingFor: null }), 'busy');
      });
      it('maps idle to idle', () => {
        assert.strictEqual(mapLiveStatusToState({ status: 'idle', waitingFor: null }), 'idle');
      });
      it('maps shell to busy', () => {
        assert.strictEqual(mapLiveStatusToState({ status: 'shell', waitingFor: null }), 'busy');
      });
      it('returns null for null status (no signal)', () => {
        assert.strictEqual(mapLiveStatusToState({ status: null, waitingFor: null }), null);
      });
      it('returns null for an unknown status (defensive)', () => {
        assert.strictEqual(mapLiveStatusToState({ status: 'frobnicate', waitingFor: null }), null);
      });
    });

    describe('reconcileLiveState', () => {
      let cli: CLIHarness;
      beforeEach(() => { cli = setupCLI(); liveMap = new Map(); });
      afterEach(() => { cli.cleanup(); });

      it('projects a live waiting file onto waiting and stores the reason', async () => {
        await cli.seed({ id: 's1', state: 'busy' });
        liveMap.set('s1', liveEntry('s1', 'waiting', 'permission prompt'));
        await reconcileLiveState();
        assert.strictEqual(cli.session('s1')?.state, 'waiting');
        assert.strictEqual(cli.session('s1')?.meta._waiting_for, 'permission prompt');
      });

      it('treats waitingFor as authoritative even when status is busy (plan approval)', async () => {
        await cli.seed({ id: 's1', state: 'busy' });
        liveMap.set('s1', liveEntry('s1', 'busy', 'plan approval'));
        await reconcileLiveState();
        assert.strictEqual(cli.session('s1')?.state, 'waiting');
      });

      it('maps a live shell session to busy', async () => {
        await cli.seed({ id: 's1', state: 'idle' });
        liveMap.set('s1', liveEntry('s1', 'shell'));
        await reconcileLiveState();
        assert.strictEqual(cli.session('s1')?.state, 'busy');
      });

      it('leaves a known state unchanged when status is null', async () => {
        await cli.seed({ id: 's1', state: 'waiting', meta: { _waiting_for: 'permission prompt' } });
        liveMap.set('s1', liveEntry('s1', null));
        await reconcileLiveState();
        assert.strictEqual(cli.session('s1')?.state, 'waiting');
      });

      it('closes an active session with no live file (dead/recycled pid)', async () => {
        await cli.seed({ id: 's1', state: 'busy' });
        // liveMap stays empty → no live entry
        await reconcileLiveState();
        assert.strictEqual(cli.session('s1')?.state, 'closed');
      });

      it('clears the wait reason when a waiting session goes busy', async () => {
        await cli.seed({ id: 's1', state: 'waiting', meta: { _waiting_for: 'permission prompt' } });
        liveMap.set('s1', liveEntry('s1', 'busy'));
        await reconcileLiveState();
        assert.strictEqual(cli.session('s1')?.state, 'busy');
        assert.strictEqual(cli.session('s1')?.meta._waiting_for, undefined);
      });

      it('never touches archived sessions', async () => {
        await cli.seed({ id: 's1', state: 'archived' });
        await reconcileLiveState();
        assert.strictEqual(cli.session('s1')?.state, 'archived');
      });

      it('advances last_active_at to the live updatedAt (max of stored)', async () => {
        const old = new Date('2020-01-01T00:00:00Z');
        await cli.seed({ id: 's1', state: 'busy', last_active_at: old });
        const newer = Date.parse('2024-01-01T00:00:00Z');
        liveMap.set('s1', liveEntry('s1', 'busy', null, newer));
        await reconcileLiveState();
        assert.strictEqual(cli.session('s1')?.last_active_at.getTime(), newer);
      });

      it('does not rewind last_active_at below the stored value', async () => {
        const recent = new Date('2024-06-01T00:00:00Z');
        await cli.seed({ id: 's1', state: 'busy', last_active_at: recent });
        liveMap.set('s1', liveEntry('s1', 'busy', null, Date.parse('2020-01-01T00:00:00Z')));
        await reconcileLiveState();
        assert.strictEqual(cli.session('s1')?.last_active_at.getTime(), recent.getTime());
      });
    });
  });
});
