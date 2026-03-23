/**
 * launchd scheduling for `c repair --thorough`
 */

import { existsSync, mkdirSync, writeFileSync, unlinkSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import { exec } from '../util/exec.ts';
import { getStoreDir } from '../store/index.ts';

const PLIST_LABEL = 'com.c.repair';
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${PLIST_LABEL}.plist`);

function resolveBinaryPath(): string {
  const argv1 = process.argv[1];
  if (!argv1) throw new Error('Cannot resolve binary path');
  return realpathSync(argv1);
}

function resolvePathEnv(): string {
  // Include directories for both `c` and `gh`
  const dirs = new Set<string>();

  const cBin = resolveBinaryPath();
  dirs.add(dirname(cBin));

  const ghPath = exec('command -v gh 2>/dev/null');
  if (ghPath) dirs.add(dirname(ghPath.trim()));

  // Always include standard paths
  dirs.add('/usr/local/bin');
  dirs.add('/usr/bin');
  dirs.add('/bin');

  return [...dirs].join(':');
}

function generatePlist(cBinary: string, pathEnv: string): string {
  const logDir = join(getStoreDir(), 'logs');
  const logPath = join(logDir, 'repair.log');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${cBinary}</string>
    <string>repair</string>
    <string>--thorough</string>
    <string>--quiet</string>
  </array>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${pathEnv}</string>
    <key>HOME</key>
    <string>${homedir()}</string>
  </dict>
</dict>
</plist>`;
}

export function installRepairSchedule(): void {
  const cBinary = resolveBinaryPath();
  const pathEnv = resolvePathEnv();
  const plist = generatePlist(cBinary, pathEnv);

  // Ensure directories exist
  const plistDir = dirname(PLIST_PATH);
  if (!existsSync(plistDir)) mkdirSync(plistDir, { recursive: true });

  const logDir = join(getStoreDir(), 'logs');
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

  // Unload existing if present
  if (existsSync(PLIST_PATH)) {
    exec(`launchctl bootout gui/$(id -u) ${PLIST_PATH} 2>/dev/null`);
  }

  writeFileSync(PLIST_PATH, plist, 'utf-8');
  exec(`launchctl bootstrap gui/$(id -u) ${PLIST_PATH}`);

  console.log(chalk.green(`Installed: ${PLIST_PATH}`));
  console.log(chalk.dim(`Runs c repair --thorough --quiet every 5 minutes`));
  console.log(chalk.dim(`Logs: ${logDir}/repair.log`));
}

export function uninstallRepairSchedule(): void {
  if (!existsSync(PLIST_PATH)) {
    console.log(chalk.yellow('No schedule installed.'));
    return;
  }

  exec(`launchctl bootout gui/$(id -u) ${PLIST_PATH} 2>/dev/null`);
  unlinkSync(PLIST_PATH);
  console.log(chalk.green(`Removed: ${PLIST_PATH}`));
}

/** Exported for testing */
export { PLIST_PATH, generatePlist, resolveBinaryPath, resolvePathEnv };
