/**
 * Hook entry point - dispatches to specific hook handlers
 */

import { handleSessionStart } from './session-start.js';
import { handleSessionEnd } from './session-end.js';
import { handleNotificationWaiting } from './notification.js';
import { handleUserPrompt } from './user-prompt.js';
import { handlePostBash } from './post-bash.js';
import { handleStop } from './stop.js';
import { debugLog } from '../util/debug.js';

export interface HookInput {
  session_id: string;
  cwd: string;
  type?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: string;
  stop_hook_active?: boolean;
}

/**
 * Read hook input from stdin
 */
async function readStdin(): Promise<HookInput | null> {
  const chunks: Buffer[] = [];

  // Check if stdin has data (non-blocking)
  if (process.stdin.isTTY) {
    return null;
  }

  return new Promise((resolve) => {
    process.stdin.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    process.stdin.on('end', () => {
      if (chunks.length === 0) {
        resolve(null);
        return;
      }

      const input = Buffer.concat(chunks).toString('utf-8');
      try {
        resolve(JSON.parse(input) as HookInput);
      } catch {
        resolve(null);
      }
    });

    process.stdin.on('error', () => {
      resolve(null);
    });

    // Timeout after 100ms if no data
    setTimeout(() => {
      if (chunks.length === 0) {
        resolve(null);
      }
    }, 100);
  });
}

/**
 * Main hook handler
 */
export async function handleHook(event: string): Promise<void> {
  debugLog(`[hook] handleHook(${event}) invoked — C_DEBUG=${process.env.C_DEBUG} pid=${process.pid}`);
  const input = await readStdin();
  debugLog(`[hook] handleHook(${event}) stdin parsed — sessionId=${input?.session_id}`);

  if (!input) {
    // Some hooks may be called without stdin
    // Fall back to environment or cwd detection
  }

  const sessionId = input?.session_id;
  const cwd = input?.cwd ?? process.cwd();

  switch (event) {
    case 'session-start':
      await handleSessionStart(sessionId, cwd, input);
      break;

    case 'session-end':
      await handleSessionEnd(sessionId, cwd, input);
      break;

    case 'notification-waiting':
      await handleNotificationWaiting(sessionId, cwd, input);
      break;

    case 'user-prompt':
      await handleUserPrompt(sessionId, cwd, input);
      break;

    case 'post-bash':
      await handlePostBash(sessionId, cwd, input);
      break;

    case 'stop':
      await handleStop(sessionId, cwd, input);
      break;

    default:
      console.error(`Unknown hook event: ${event}`);
      process.exit(1);
  }
}
