/**
 * Test setup - mock helpers for time, console, stdout, and process.exit
 */

import { mock } from 'node:test';

/**
 * Mock Date.now() for deterministic time tests
 */
export function useFakeTime(timestamp: number): { restore: () => void } {
  const originalDate = global.Date;

  class MockDate extends Date {
    constructor(value?: string | number | Date) {
      if (value === undefined) {
        super(timestamp);
      } else {
        super(value as string | number);
      }
    }
    static override now() {
      return timestamp;
    }
  }

  global.Date = MockDate as DateConstructor;

  return {
    restore: () => {
      global.Date = originalDate;
    },
  };
}

/**
 * Capture console output
 */
export function captureConsole(): { logs: string[]; errors: string[]; restore: () => void } {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  };

  return {
    logs,
    errors,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

/**
 * Capture process.stdout.write
 */
export function captureStdout(): { output: string[]; restore: () => void } {
  const output: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  process.stdout.write = ((chunk: string | Uint8Array, encoding?: BufferEncoding | ((err?: Error) => void), cb?: (err?: Error) => void): boolean => {
    if (typeof chunk === 'string') {
      output.push(chunk);
    }
    // Pass through to original — the Node.js test runner uses stdout for its
    // internal protocol, so swallowing writes causes tests to be silently dropped.
    if (typeof encoding === 'function') {
      return originalWrite(chunk, encoding);
    }
    return originalWrite(chunk, encoding as BufferEncoding, cb);
  }) as typeof process.stdout.write;

  return {
    output,
    restore: () => {
      process.stdout.write = originalWrite;
    },
  };
}

/**
 * Mock process.exit to capture exit code instead of exiting
 */
export function mockProcessExit(): { exitCode: number | null; restore: () => void } {
  const state = { exitCode: null as number | null };
  const originalExit = process.exit;

  process.exit = ((code?: number) => {
    state.exitCode = code ?? 0;
    throw new Error(`process.exit(${code})`);
  }) as typeof process.exit;

  return {
    get exitCode() { return state.exitCode; },
    restore: () => {
      process.exit = originalExit;
    },
  };
}

/** Strip ANSI escape sequences from a string */
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

export { mock };
