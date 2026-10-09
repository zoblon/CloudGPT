import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configPath, dataDir, validateConfig } from './config.mjs';
import { readSecret } from './secret-input.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const fromInstaller = process.argv.includes('--installer');
function saveSecret(account, secret) {
  try {
    execFileSync(join(root, 'bin', 'keychain'), [], {
      input: JSON.stringify({ operation: 'write', account, secret }), stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch { throw new Error('Could not save credentials in the macOS Keychain.'); }
}
function secretPresent(account) {
  try { execFileSync(join(root, 'bin', 'keychain'), [], { input: JSON.stringify({ operation: 'read', account }), stdio: ['pipe', 'ignore', 'pipe'] }); return true; }
  catch { return false; }
}
try {
  if (process.platform !== 'darwin') throw new Error('macOS is required.');
  console.log('CloudGPT – private setup on your Mac\n');
  console.log('The Apple app-specific password and OpenAI runtime key are entered without echo and stored only in the macOS Keychain.');
  console.log('First create a private tunnel at https://platform.openai.com/settings/organization/tunnels and associate it with your ChatGPT account.');
  let previous = {};
  try { previous = validateConfig(JSON.parse(readFileSync(configPath, 'utf8'))); } catch {}
  let cfg;
  if (fromInstaller && previous.appleId) {
    cfg = { ...previous, nodePath: process.execPath };
    console.log('Using your saved settings; completing Keychain setup.');
  } else {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = async (label, fallback = '') => (await rl.question(`${label}${fallback ? ` [${fallback}]` : ''}: `)).trim() || fallback;
    try {
      cfg = validateConfig({
        appleId: await ask('Apple Account email', previous.appleId),
        mailUser: await ask('iCloud Mail address', previous.mailUser),
        timezone: await ask('Time zone', previous.timezone ?? 'Europe/Berlin'),
        defaultCalendar: await ask('Private default calendar (empty = select before creating an event)', previous.defaultCalendar),
        mode: await ask('Access: readonly / standard / full (full includes deletion)', previous.mode ?? 'standard'),
        tunnelId: await ask('Tunnel ID', previous.tunnelId ?? process.argv.slice(2).find(arg => arg !== '--installer')),
        nodePath: process.execPath,
      });
    } finally { rl.close(); }
  }
  // Keep the public settings on disk so an interrupted secret prompt is retryable.
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  chmodSync(dataDir, 0o700);
  writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  chmodSync(configPath, 0o600);
  console.log('\nstandard: read and edit calendars, contacts and reminders; read mail, prepare drafts and organize messages; read and create notes.');
  console.log('full: also delete your own events, move events between calendars and trash messages. Configure ChatGPT to request approval for write tools.');
  console.log('Paste credentials with Command-V, then press Enter. The input indicator confirms a value without displaying it.');
  if (!fromInstaller || !secretPresent('icloud')) {
    const apple = await readSecret('Apple app-specific password (empty = keep existing): ');
    if (apple) saveSecret('icloud', apple);
  }
  if (!fromInstaller || !secretPresent('openai-runtime')) {
    const openai = await readSecret('OpenAI runtime API key with Tunnels Read + Use (no admin key; empty = keep existing): ');
    if (openai) saveSecret('openai-runtime', openai);
  }
  // Verify presence without showing either secret.
  for (const account of ['icloud', 'openai-runtime']) {
    if (!secretPresent(account)) throw new Error('Both credentials must be configured.');
  }
  console.log(fromInstaller ? '\nSettings saved. The installer will now start the background service and enable startup at Mac login.' : '\nSettings saved. Open Install CloudGPT.command to start the background service and enable startup at Mac login.');
  console.log('In ChatGPT: Plugins → + → Add custom MCP server → Tunnel → your tunnel ID → Create as a plugin.');
  console.log('Name: CloudGPT. For this private stdio connection choose No authentication: access is controlled by OpenAI tunnel permissions and account association.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Setup failed.');
  process.exitCode = 1;
}
