import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { checkTunnel, connectionHtml, prepareConnection } from '../chatgpt/connection-guide.mjs';

const folders = [], servers = [];
afterEach(async () => {
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
const cfg = { appleId: 'fixture@example.com', mailUser: 'fixture@icloud.com', timezone: 'Europe/Berlin', defaultCalendar: '', mode: 'full', tunnelId: 'tunnel_test12345', nodePath: process.execPath };
function fixture() {
  const source = mkdtempSync(join(tmpdir(), 'cloudgpt-connection-')); folders.push(source);
  const healthFile = join(source, 'health.url'), configFile = join(source, 'config.json'), output = join(source, 'output');
  writeFileSync(configFile, JSON.stringify(cfg));
  writeFileSync(join(source, 'plugin.json'), JSON.stringify({ version: '0.4.3' }));
  writeFileSync(join(source, 'chatgpt-plugin.zip'), 'synthetic test archive');
  writeFileSync(join(source, 'chatgpt-plugin.zip.sha256'), createHash('sha256').update('synthetic test archive').digest('hex') + '  chatgpt-plugin.zip\n');
  return { source, installedRuntime: source, healthFile, configFile, output };
}
async function live(f, { ready = true, tunnelId = cfg.tunnelId, redirect = false, statusCode = 200 } = {}) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    if (redirect) { response.writeHead(302, { location: 'https://example.com' }); response.end(); return; }
    if (request.url === '/readyz') { response.writeHead(ready ? 200 : 503); response.end(); return; }
    response.writeHead(statusCode, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ control_plane_tunnel_id: tunnelId, unrelated_secret: 'synthetic do not export' }));
  });
  servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  writeFileSync(f.healthFile, `http://127.0.0.1:${server.address().port}`);
  return requests;
}
it('hands off a matching ready tunnel without exporting account addresses or operator data', async () => {
  const f = fixture(), requests = await live(f);
  const before = readFileSync(f.configFile);
  const result = await prepareConnection({ ...f, now: new Date('2026-10-09T18:30:00Z') });
  const html = readFileSync(result.page, 'utf8');
  expect(requests).toEqual(['/readyz', '/api/status']);
  expect(result.tunnelId).toBe(cfg.tunnelId);
  expect(html).toContain(cfg.tunnelId);
  expect(html).toContain('noch nicht geprüft');
  expect(html).toContain('Tunnel-ID');
  expect(html).not.toMatch(/fixture@|synthetic do not export|asdk_app_|\/v1\/tunnel\//);
  expect(readFileSync(f.configFile)).toEqual(before);
  expect(readFileSync(join(f.output, 'CloudGPT Plugin.zip'))).toEqual(readFileSync(join(f.source, 'chatgpt-plugin.zip')));
  expect(statSync(f.output).mode & 0o777).toBe(0o700);
  expect(statSync(result.page).mode & 0o777).toBe(0o600);
  expect(statSync(join(f.output, 'CloudGPT Plugin.zip')).mode & 0o777).toBe(0o600);
});
it('refuses a live but different tunnel instead of copying a stale ID', async () => {
  const f = fixture(); await live(f, { tunnelId: 'tunnel_different123' });
  await expect(prepareConnection(f)).rejects.toThrow(/passt nicht/);
  expect(existsSync(f.output)).toBe(false);
});
it('refuses an unready tunnel before requesting operator metadata', async () => {
  const f = fixture(), requests = await live(f, { ready: false });
  await expect(prepareConnection(f)).rejects.toThrow(/nicht bereit/);
  expect(requests).toEqual(['/readyz']);
  expect(existsSync(f.output)).toBe(false);
});
it('does not accept a ready endpoint when its status cannot be checked', async () => {
  const f = fixture(); await live(f, { statusCode: 403 });
  await expect(prepareConnection(f)).rejects.toThrow(/nicht bereit/);
});
it.each(['https://example.com', 'http://localhost:1234', 'http://127.0.0.1:0', 'http://127.0.0.1:65536', 'http://127.0.0.1:1234/path', 'http://127.0.0.1:1234@evil.example'])('rejects a non-loopback or malformed status address %s before network access', async address => {
  const f = fixture(); writeFileSync(f.healthFile, address);
  let called = false;
  await expect(checkTunnel({ tunnelId: cfg.tunnelId, healthFile: f.healthFile, fetchImpl: () => { called = true; } })).rejects.toThrow(/Statusadresse/);
  expect(called).toBe(false);
});
it('rejects redirects rather than following an operator endpoint outside loopback', async () => {
  const f = fixture(); await live(f, { redirect: true });
  await expect(prepareConnection(f)).rejects.toThrow(/nicht bereit/);
});
it('rejects a modified plugin archive before any network access or handoff', async () => {
  const f = fixture(); writeFileSync(join(f.source, 'chatgpt-plugin.zip'), 'tampered');
  let called = false;
  await expect(prepareConnection({ ...f, fetchImpl: () => { called = true; } })).rejects.toThrow(/beschädigt/);
  expect(called).toBe(false); expect(existsSync(f.output)).toBe(false);
});
it('does not label an older installed runtime with the downloaded package version', async () => {
  const f = fixture();
  const installedRuntime = mkdtempSync(join(tmpdir(), 'cloudgpt-old-runtime-')); folders.push(installedRuntime);
  writeFileSync(join(installedRuntime, 'plugin.json'), JSON.stringify({ version: '0.4.2' }));
  await expect(prepareConnection({ ...f, installedRuntime })).rejects.toThrow(/passt nicht zum installierten/);
  expect(existsSync(f.output)).toBe(false);
});
it('escapes dynamic content and keeps clipboard failure usable on file URLs', () => {
  const html = connectionHtml({ tunnelId: '"><script>bad()</script>', version: '<test>', mode: 'full', checkedAt: '<test>', archiveName: 'CloudGPT Plugin.zip' });
  expect(html).not.toContain('<script>bad()');
  expect(html).toContain('&lt;test&gt;');
  expect(html).toContain('Bitte mit ⌘C kopieren');
  expect(html).toContain("connect-src 'none'");
});
