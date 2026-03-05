/**
 * c stats - show session statistics
 */

import { statSync } from 'node:fs';
import { getSessions, getStoreDir } from '../store/index.js';
import { listClaudeSessions } from '../claude/sessions.js';
import { formatFileSize } from '../util/format.js';

export function statsCommand(): void {
  const all = getSessions({ state: ['busy', 'idle', 'waiting', 'closed', 'archived'] });
  const active = all.filter(s => ['busy', 'idle', 'waiting'].includes(s.state));
  const busy = active.filter(s => s.state === 'busy').length;
  const idle = active.filter(s => s.state === 'idle').length;
  const waiting = active.filter(s => s.state === 'waiting').length;

  const repos = new Set(all.map(s => s.directory.split('/').pop()));
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thisWeek = all.filter(s => s.created_at > weekAgo).length;

  const claudeSessions = listClaudeSessions();
  const claudeStorage = claudeSessions.reduce((sum, s) => sum + (s.fileSize ?? 0), 0);

  const indexPath = getStoreDir() + '/index.toml';
  let cStorage = 0;
  try { cStorage = statSync(indexPath).size; } catch {}

  const parts = [
    `${busy} busy`, idle ? `${idle} idle` : '', waiting ? `${waiting} waiting` : ''
  ].filter(Boolean).join(', ');

  console.log(`  Active sessions: ${active.length} (${parts})`);
  console.log(`  Total sessions:  ${all.length}`);
  console.log(`  Repos:           ${repos.size} (${[...repos].slice(0, 5).join(', ')})`);
  console.log(`  This week:       ${thisWeek} sessions created`);
  console.log(`  Claude storage:  ${formatFileSize(claudeStorage)} across ${claudeSessions.length} transcripts`);
  console.log(`  c storage:       ${formatFileSize(cStorage)}`);
}
