/**
 * Test setup - mock helpers for filesystem, exec, and time
 */

import { mock } from 'node:test';

/**
 * Virtual filesystem storage
 */
export interface VirtualFS {
  files: Map<string, string>;
  directories: Set<string>;
  stats: Map<string, { mtime: Date; isDirectory: boolean }>;
}

/**
 * Create a mock filesystem
 */
export function createMockFS(): VirtualFS {
  return {
    files: new Map(),
    directories: new Set(['/tmp', '/home/test', '/home/test/.c', '/home/test/.claude']),
    stats: new Map(),
  };
}

/**
 * Setup fs module mocks using the virtual filesystem
 */
export function mockFS(vfs: VirtualFS) {
  const existsSync = (p: string): boolean => {
    return vfs.files.has(p) || vfs.directories.has(p);
  };

  const readFileSync = (p: string, _encoding?: string): string => {
    const content = vfs.files.get(p);
    if (content === undefined) {
      const err = new Error(`ENOENT: no such file or directory, open '${p}'`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    return content;
  };

  const writeFileSync = (p: string, content: string, _options?: unknown): void => {
    vfs.files.set(p, content);
    vfs.stats.set(p, { mtime: new Date(), isDirectory: false });
  };

  const mkdirSync = (p: string, _options?: unknown): void => {
    vfs.directories.add(p);
    vfs.stats.set(p, { mtime: new Date(), isDirectory: true });
  };

  const unlinkSync = (p: string): void => {
    vfs.files.delete(p);
    vfs.stats.delete(p);
  };

  const readdirSync = (p: string): string[] => {
    const results: string[] = [];
    const prefix = p.endsWith('/') ? p : p + '/';

    for (const file of vfs.files.keys()) {
      if (file.startsWith(prefix)) {
        const rest = file.slice(prefix.length);
        const segment = rest.split('/')[0];
        if (segment && !results.includes(segment)) {
          results.push(segment);
        }
      }
    }

    for (const dir of vfs.directories) {
      if (dir.startsWith(prefix) && dir !== p) {
        const rest = dir.slice(prefix.length);
        const segment = rest.split('/')[0];
        if (segment && !results.includes(segment)) {
          results.push(segment);
        }
      }
    }

    return results;
  };

  const statSync = (p: string): { mtime: Date; isDirectory: () => boolean } => {
    const stat = vfs.stats.get(p);
    if (stat) {
      return { mtime: stat.mtime, isDirectory: () => stat.isDirectory };
    }
    if (vfs.directories.has(p)) {
      return { mtime: new Date(), isDirectory: () => true };
    }
    if (vfs.files.has(p)) {
      return { mtime: new Date(), isDirectory: () => false };
    }
    const err = new Error(`ENOENT: no such file or directory, stat '${p}'`) as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    throw err;
  };

  return {
    existsSync,
    readFileSync,
    writeFileSync,
    mkdirSync,
    unlinkSync,
    readdirSync,
    statSync,
  };
}

/**
 * Mock os module
 */
export function createMockOS(options: { homedir?: string; hostname?: string } = {}) {
  return {
    homedir: () => options.homedir ?? '/home/test',
    hostname: () => options.hostname ?? 'test-machine',
  };
}

/**
 * Mock exec responses
 */
export interface ExecMockConfig {
  [command: string]: string | (() => string);
}

/**
 * Create a mock exec function
 */
export function createMockExec(config: ExecMockConfig = {}) {
  return (command: string, _options?: { cwd?: string }): string => {
    for (const [pattern, response] of Object.entries(config)) {
      if (command.includes(pattern)) {
        return typeof response === 'function' ? response() : response;
      }
    }
    return '';
  };
}

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
    if (typeof encoding === 'function') {
      encoding();
    } else if (cb) {
      cb();
    }
    return true;
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

export { mock };
