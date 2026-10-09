import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { profileYaml, quoteCommand, validateConfig } from '../chatgpt/config.mjs';

const cfg = { appleId: 'test@example.com', mailUser: 'test@icloud.com', timezone: 'Europe/Berlin', defaultCalendar: '', mode: 'standard', tunnelId: 'tunnel_test0123456789', nodePath: process.execPath };
const children = [];
afterEach(() => { for (const child of children.splice(0)) child.kill('SIGTERM'); });

function client(mode, entry = process.env.CLOUDGPT_TEST_BUNDLE ? process.execPath : resolve('node_modules/.bin/tsx'), args = process.env.CLOUDGPT_TEST_BUNDLE ? [resolve(process.env.CLOUDGPT_TEST_BUNDLE)] : ['src/chatgpt.ts']) {
  const child = spawn(entry, args, { env: {
    PATH: process.env.PATH, HOME: process.env.HOME,
    ICLOUD_APPLE_ID: cfg.appleId, ICLOUD_MAIL_USER: cfg.mailUser,
    ICLOUD_APP_PASSWORD: 'fake-password-only-for-tests', ICLOUD_CHATGPT_MODE: mode,
  }, stdio: ['pipe', 'pipe', 'pipe'] });
  children.push(child);
  let serial = 0, buffer = '', stderr = '';
  const pending = new Map();
  child.stderr.on('data', b => { stderr += b.toString(); });
  child.stdout.on('data', b => {
    buffer += b.toString();
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      try {
        const message = JSON.parse(line);
        const callback = pending.get(message.id);
        if (callback) { pending.delete(message.id); callback.resolve(message); }
      } catch { for (const callback of pending.values()) callback.reject(new Error('Non-JSON protocol output')); }
    }
  });
  child.on('exit', () => { for (const callback of pending.values()) callback.reject(new Error(`Server exited: ${stderr}`)); });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Request timed out: ${method}`)); }, 5000);
    pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  return { request, child, stderr: () => stderr };
}
async function initialize(c) {
  const result = await c.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test-chatgpt', version: '1.0.0' } });
  expect(result.error).toBeUndefined();
  c.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  return result;
}

describe('ChatGPT configuration and tunnel boundary', () => {
  it('validates identity, mode, timezone and tunnel identifier', () => {
    expect(validateConfig(cfg)).toEqual(cfg);
    for (const patch of [{ mode: 'arbitrary' }, { timezone: 'invalid' }, { appleId: '' }, { tunnelId: 'https://evil.test' }, { nodePath: 'node' }, { appPassword: 'secret' }]) {
      expect(() => validateConfig({ ...cfg, ...patch })).toThrow();
    }
  });
  it('quotes paths with spaces, apostrophes, dollars and backticks literally', () => {
    expect(quoteCommand("/a b/O'Brien/$secret/`cmd`")).toBe("'/a b/O'\\''Brien/$secret/`cmd`'");
    const yaml = profileYaml(cfg, '/Users/test/My Folder', '/Users/test/Private Folder');
    expect(yaml).toContain('127.0.0.1:0');
    expect(yaml).toContain('max_concurrent_requests: 1');
    expect(yaml).toContain('env:CONTROL_PLANE_API_KEY');
    expect(yaml).toContain("'/Users/test/My Folder/runtime.mjs' 'server'");
    expect(yaml).not.toContain(cfg.appleId);
    expect(yaml).not.toContain(cfg.mailUser);
  });
});

describe('MCP protocol and permissions without iCloud network calls', () => {
  it('preserves the existing Claude identity and all original tools', async () => {
    const c = client('standard', resolve('node_modules/.bin/tsx'), ['src/stdio.ts']);
    const init = await initialize(c);
    expect(init.result.serverInfo).toEqual({ name: 'iClaude', version: '0.4.1' });
    const r = await c.request('tools/list');
    expect(r.result.tools.map(t => t.name)).toEqual(expect.arrayContaining(['create_event', 'create_draft', 'delete_event', 'trash_message']));
  });
  it.each(['readonly', 'standard', 'full'])('initializes and advertises exactly the allowed tools: %s', async mode => {
    const c = client(mode);
    const init = await initialize(c);
    expect(init.result.serverInfo.name).toBe('CloudGPT');
    expect(init.result.instructions).toContain('Nothing is ever sent');
    const r = await c.request('tools/list');
    expect(r.error).toBeUndefined();
    const names = r.result.tools.map(t => t.name);
    expect(names).toEqual(expect.arrayContaining(['list_calendars', 'list_events', 'search_contacts', 'get_message', 'list_mailboxes']));
    for (const name of ['create_event', 'update_event', 'create_draft', 'create_contact', 'update_contact', 'import_invitation', 'move_message', 'set_message_flags', 'create_reminder', 'update_reminder', 'complete_reminder', 'create_note']) expect(names.includes(name)).toBe(mode !== 'readonly');
    for (const name of ['delete_event', 'trash_message']) expect(names.includes(name)).toBe(mode === 'full');
    expect(names).toEqual(expect.arrayContaining(['read_attachment', 'list_contact_groups', 'upcoming_contact_dates', 'list_reminder_lists', 'list_reminders', 'search_reminders', 'list_note_folders', 'list_notes', 'search_notes', 'get_note']));
    expect(names).toHaveLength(mode === 'readonly' ? 22 : mode === 'standard' ? 34 : 36);
    expect(names).not.toEqual(expect.arrayContaining(['send_message']));
    expect(names.some(n => /send|expunge/.test(n))).toBe(false);
    for (const tool of r.result.tools) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.outputSchema).toBeTruthy();
      expect(tool.annotations.readOnlyHint).toBe(mode === 'readonly' ? true : !['create_event', 'update_event', 'delete_event', 'create_draft', 'trash_message', 'create_contact', 'update_contact', 'import_invitation', 'move_message', 'set_message_flags', 'create_reminder', 'update_reminder', 'complete_reminder', 'create_note'].includes(tool.name));
    }
    expect((await c.request('ping')).error).toBeUndefined();
    expect(c.stderr()).not.toContain('fake-password-only-for-tests');
  });
  it.each([['readonly', 'create_event'], ['readonly', 'create_contact'], ['readonly', 'update_contact'], ['readonly', 'create_reminder'], ['readonly', 'update_reminder'], ['readonly', 'complete_reminder'], ['readonly', 'create_note'], ['readonly', 'move_message'], ['readonly', 'set_message_flags'], ['readonly', 'import_invitation'], ['standard', 'delete_event'], ['standard', 'trash_message']])('rejects a direct call to an unavailable tool: %s/%s', async (mode, name) => {
    const c = client(mode); await initialize(c);
    const r = await c.request('tools/call', { name, arguments: {} });
    expect(Boolean(r.error) || r.result?.isError === true).toBe(true);
  });
  it('refuses calendar moves in standard mode before any network access', async () => {
    const c = client('standard'); await initialize(c);
    const r = await c.request('tools/call', { name: 'update_event', arguments: { id: 'fake-test-event', move_to_calendar: 'Other' } });
    expect(r.result.isError).toBe(true);
    expect(JSON.stringify(r.result)).toContain('full');
  });
  it('rejects unknown draft fields before calling iCloud', async () => {
    const c = client('standard'); await initialize(c);
    const r = await c.request('tools/call', { name: 'create_draft', arguments: { body: 'Only a test', bcc: ['x@example.com'] } });
    expect(Boolean(r.error) || r.result?.isError === true).toBe(true);
  });
  it('refuses unknown access modes at startup', async () => {
    const c = client('not-a-mode');
    const exitCode = await new Promise(resolve => c.child.on('exit', resolve));
    expect(exitCode).toBe(1);
    expect(c.stderr()).not.toContain('fake-password-only-for-tests');
  });
});
