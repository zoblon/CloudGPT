import { execFileSync } from 'node:child_process';
import { mkdirSync, cpSync, chmodSync, readFileSync, writeFileSync, existsSync, realpathSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { configPath, dataDir, validateConfig } from './config.mjs';
import { updateRuntime } from './runtime-update.mjs';
import { launchAgentPlist, servicePaths, serviceLabel } from './service-config.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const contents = ['runtime.mjs', 'runtime-update.mjs', 'config.mjs', 'setup.mjs', 'secret-input.mjs', 'service.mjs', 'service-config.mjs', 'plugin.json', 'mcp.json', 'README.md', 'LICENSE', 'server', 'bin', 'assets', 'skills'];
const paths = servicePaths();
const domain = `gui/${process.getuid()}`;
const target = `${domain}/${serviceLabel}`;
const launchctl = (...args) => execFileSync('/bin/launchctl', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
function registered() { try { launchctl('print', target); return true; } catch { return false; } }
function stop() { if (registered()) launchctl('bootout', target); }
function start() {
  if (!existsSync(paths.agent)) throw new Error('Open Install at Login.command first.');
  if (!registered()) launchctl('bootstrap', domain, paths.agent);
}
async function ready() {
  try {
    const url = readFileSync(join(dataDir, 'health.url'), 'utf8').trim();
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url)) return false;
    const result = await fetch(`${url}/readyz`, { redirect: 'error', signal: AbortSignal.timeout(1500) });
    return result.ok;
  } catch { return false; }
}
async function waitReady() {
  for (let i = 0; i < 30; i++) { if (registered() && await ready()) return; await delay(1000); }
  throw new Error('Service installed but not ready. Open Diagnose.command; Keychain approval may be required.');
}
try {
  if (process.platform !== 'darwin') throw new Error('macOS is required.');
  const action = process.argv[2];
  if (action === 'install') {
    if (!registered() && await ready()) throw new Error('A manual tunnel is already running. Stop it with Control-C before installing the login service.');
    const cfg = validateConfig(JSON.parse(readFileSync(configPath, 'utf8')));
    // Prefer the stable Homebrew symlink across future Node upgrades.
    for (const node of ['/opt/homebrew/bin/node', '/usr/local/bin/node']) {
      if (existsSync(node) && realpathSync(node) === realpathSync(process.execPath)) { cfg.nodePath = node; break; }
    }
    for (const file of contents) if (!existsSync(join(root, file))) throw new Error('Use the built CloudGPT package.');
    stop();
    for (const path of [paths.base, paths.runtime, paths.logs, dirname(paths.agent)]) mkdirSync(path, { recursive: true, mode: 0o700 });
    for (const path of [paths.base, paths.runtime, paths.logs]) chmodSync(path, 0o700);
    if (resolve(root) !== resolve(paths.runtime)) {
      for (const file of contents) cpSync(join(root, file), join(paths.runtime, file), { recursive: true });
    }
    writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
    chmodSync(configPath, 0o600);
    for (const name of ['stdout.log', 'stderr.log']) {
      const path = join(paths.logs, name);
      if (!existsSync(path)) writeFileSync(path, '', { mode: 0o600 });
      chmodSync(path, 0o600);
    }
    writeFileSync(paths.agent, launchAgentPlist(cfg.nodePath, paths), { mode: 0o600 });
    chmodSync(paths.agent, 0o600);
    execFileSync('/usr/bin/plutil', ['-lint', paths.agent], { stdio: ['ignore', 'pipe', 'pipe'] });
    start(); await waitReady();
    console.log('CloudGPT runs in the background and will start at Mac login. No terminal window is needed.');
  } else if (action === 'update') {
    if (!existsSync(paths.agent)) throw new Error('No installed CloudGPT service found. Install the login service first.');
    validateConfig(JSON.parse(readFileSync(configPath, 'utf8')));
    const result = await updateRuntime({ source: root, runtime: paths.runtime, backups: join(paths.base, 'backups'), contents, stop, start, ready: waitReady });
    console.log(`CloudGPT updated and tunnel ready. Previous runtime backed up at: ${result.backup}`);
  } else if (action === 'start') {
    start(); await waitReady(); console.log('CloudGPT runs in the background.');
  } else if (action === 'restart') {
    stop(); start(); await waitReady(); console.log('CloudGPT restarted.');
  } else if (action === 'stop') {
    stop(); console.log('CloudGPT stopped. It will start again at the next Mac login.');
  } else if (action === 'uninstall') {
    stop(); if (existsSync(paths.agent)) unlinkSync(paths.agent);
    console.log('Login service removed. Package, settings and Keychain entries are retained.');
  } else if (action === 'status') {
    if (!registered()) { console.log('CloudGPT background service is stopped or not installed.'); process.exitCode = 1; }
    else if (await ready()) console.log('CloudGPT background service running; tunnel ready.');
    else { console.log('CloudGPT background service loaded; tunnel not ready yet.'); process.exitCode = 1; }
  } else throw new Error('Usage: service.mjs install|update|start|restart|stop|uninstall|status');
} catch (error) {
  // Only our own error messages are safe; subprocess exceptions may carry data.
  console.error(error instanceof Error && !('stderr' in error) ? error.message : 'Could not configure the CloudGPT service. Check diagnostics and Keychain.');
  process.exitCode = 1;
}
