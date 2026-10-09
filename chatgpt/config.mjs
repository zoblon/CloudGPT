import { homedir } from 'node:os';
import { join } from 'node:path';

export const dataDir = join(homedir(), 'Library', 'Application Support', 'icloud-chatgpt');
export const configPath = join(dataDir, 'config.json');
export const modes = ['readonly', 'standard', 'full'];

export function validateConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuration missing. Open Setup.command first.');
  const allowed = ['appleId', 'mailUser', 'timezone', 'defaultCalendar', 'mode', 'tunnelId', 'nodePath'];
  if (Object.keys(input).some(k => !allowed.includes(k))) throw new Error('Unknown configuration field.');
  for (const key of ['appleId', 'mailUser']) {
    if (typeof input[key] !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input[key]) || input[key].length > 254) throw new Error('Invalid Apple Account or mail address.');
  }
  if (!modes.includes(input.mode)) throw new Error('Invalid access mode.');
  if (typeof input.tunnelId !== 'string' || !/^tunnel_[a-zA-Z0-9_-]{8,100}$/.test(input.tunnelId)) throw new Error('Invalid tunnel ID.');
  if (typeof input.timezone !== 'string') throw new Error('Time zone missing.');
  try { new Intl.DateTimeFormat('en-US', { timeZone: input.timezone }); }
  catch { throw new Error('Invalid time zone.'); }
  if (typeof input.defaultCalendar !== 'string' || input.defaultCalendar.length > 100) throw new Error('Invalid default calendar.');
  if (typeof input.nodePath !== 'string' || !input.nodePath.startsWith('/') || /[\r\n\0]/.test(input.nodePath)) throw new Error('An absolute Node path is required.');
  return input;
}

// tunnel-client's command field uses shell-style tokenization; quote paths, never credentials.
export const quoteCommand = value => "'" + value.replaceAll("'", "'\\''") + "'";
export function profileYaml(cfg, root, stateDir = dataDir) {
  validateConfig(cfg);
  const command = [cfg.nodePath, join(root, 'runtime.mjs'), 'server'].map(quoteCommand).join(' ');
  return `config_version: 1
control_plane:
  base_url: "https://api.openai.com"
  tunnel_id: ${JSON.stringify(cfg.tunnelId)}
  api_key: "env:CONTROL_PLANE_API_KEY"
health:
  listen_addr: "127.0.0.1:0"
  url_file: ${JSON.stringify(join(stateDir, 'health.url'))}
admin_ui:
  open_browser: false
log:
  level: warn
  format: json
mcp:
  max_concurrent_requests: 1
  stdio_send_initialized_notification: true
  commands:
    - channel: main
      command: ${JSON.stringify(command)}
`;
}
