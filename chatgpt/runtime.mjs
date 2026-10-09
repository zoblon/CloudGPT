import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configPath, dataDir, validateConfig, profileYaml } from './config.mjs';

const root = dirname(fileURLToPath(import.meta.url));
function secret(account) {
  try {
    const value = execFileSync(join(root, 'bin', 'keychain'), [], {
      input: JSON.stringify({ operation: 'read', account }), encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 8192,
    });
    if (!value) throw new Error();
    return value;
  } catch { throw new Error('Keychain credentials are missing or locked. Open Setup.command.'); }
}
function forward(child) {
  child.on('error', () => { process.stderr.write('Could not start the local process.\n'); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
try {
  if (process.platform !== 'darwin') throw new Error('This package requires macOS.');
  const cfg = validateConfig(JSON.parse(readFileSync(configPath, 'utf8')));
  const action = process.argv[2];
  // Only explicitly selected variables reach children: no inherited overrides
  // can reroute the OpenAI API key, turn on raw logs, or expose the admin UI.
  const base = { HOME: process.env.HOME, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'en_US.UTF-8', TMPDIR: process.env.TMPDIR };
  if (action === 'server') {
    forward(spawn(cfg.nodePath, [join(root, 'server', 'index.mjs')], {
      cwd: root, stdio: 'inherit', env: {
        ...base, ICLOUD_APPLE_ID: cfg.appleId, ICLOUD_MAIL_USER: cfg.mailUser,
        ICLOUD_APP_PASSWORD: secret('icloud'), ICLOUD_TIMEZONE: cfg.timezone,
        ICLOUD_DEFAULT_CALENDAR: cfg.defaultCalendar, ICLOUD_CHATGPT_MODE: cfg.mode,
      },
    }));
  } else if (action === 'tunnel' || action === 'doctor') {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const profile = join(dataDir, 'tunnel.yaml');
    writeFileSync(profile, profileYaml(cfg, root), { mode: 0o600 });
    const args = [action === 'doctor' ? 'doctor' : 'run', '--profile-file', profile];
    if (action === 'doctor') args.push('--explain');
    forward(spawn(join(root, 'bin', 'tunnel-client'), args, {
      cwd: root, stdio: 'inherit', env: { ...base, CONTROL_PLANE_API_KEY: secret('openai-runtime') },
    }));
  } else if (action === 'status') {
    const address = readFileSync(join(dataDir, 'health.url'), 'utf8').trim();
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(address)) throw new Error('Invalid local status address.');
    const result = await fetch(`${address}/readyz`, { signal: AbortSignal.timeout(5000), redirect: 'error' });
    console.log(result.ok ? 'Tunnel ready. Connect it in ChatGPT.' : 'Tunnel not ready yet. Open Diagnose.command.');
    process.exitCode = result.ok ? 0 : 1;
  } else throw new Error('Usage: runtime.mjs server|tunnel|doctor|status');
} catch {
  // Never print a caught subprocess exception: it may contain a secret buffer.
  process.stderr.write('CloudGPT could not start. Check setup, Keychain and local tunnel.\n');
  process.exitCode = 1;
}
