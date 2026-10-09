import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadConfig } from './core/config.js';
import { log, toUserMessage } from './core/errors.js';
import { createServer } from './mcp/server.js';

try {
  const cfg = loadConfig();
  const mode = process.env.ICLOUD_CHATGPT_MODE ?? 'standard';
  if (!['readonly', 'standard', 'full'].includes(mode)) throw new Error('Invalid ChatGPT access mode.');
  serveStdio(() => createServer(cfg, {
    name: 'CloudGPT',
    readOnly: mode === 'readonly',
    allowDeletion: mode === 'full',
  }), { onerror: (e) => log('transport-error', { kind: e.name }) });
  log('chatgpt-start', { timezone: cfg.timezone, mode });
} catch (e) {
  process.stderr.write(`[icloud-mcp] Startup failed: ${toUserMessage(e)}\n`);
  process.exit(1);
}
