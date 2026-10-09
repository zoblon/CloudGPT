import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { startService, stopService } from '../chatgpt/service-lifecycle.mjs';

const folders = [];
afterEach(() => { for (const path of folders.splice(0)) rmSync(path, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cloudgpt-lifecycle-')); folders.push(root);
  const healthFile = join(root, 'health.url'), agent = join(root, 'agent.plist');
  writeFileSync(healthFile, 'http://127.0.0.1:1234'); writeFileSync(agent, 'test');
  return { healthFile, agent };
}
it('waits for asynchronous launchd deregistration before bootstrapping and discards the old health address', async () => {
  const f = fixture(); let registered = true, bootstraps = 0;
  const isRegistered = () => registered;
  await stopService({ ...f, isRegistered, bootout: () => { setTimeout(() => { registered = false; }, 20); }, pollMs: 2 });
  startService({ ...f, isRegistered, bootstrap: () => {
    expect(registered).toBe(false); expect(existsSync(f.healthFile)).toBe(false);
    registered = true; bootstraps++; writeFileSync(f.healthFile, 'http://127.0.0.1:5678');
  } });
  expect(bootstraps).toBe(1); expect(registered).toBe(true);
  expect(readFileSync(f.healthFile, 'utf8')).toBe('http://127.0.0.1:5678');
});
it('refuses to proceed while the old launchd job is still registered', async () => {
  const f = fixture();
  await expect(stopService({ ...f, isRegistered: () => true, bootout: () => {}, timeoutMs: 10, pollMs: 2 })).rejects.toThrow(/still stopping/);
  expect(readFileSync(f.healthFile, 'utf8')).toBe('http://127.0.0.1:1234');
});
it('preserves the readiness address of an already running service', () => {
  const f = fixture(); let called = false;
  startService({ ...f, isRegistered: () => true, bootstrap: () => { called = true; } });
  expect(called).toBe(false); expect(existsSync(f.healthFile)).toBe(true);
});
it('drops a stale readiness address before starting a previously stopped service', () => {
  const f = fixture(); let called = false;
  startService({ ...f, isRegistered: () => false, bootstrap: () => { called = true; expect(existsSync(f.healthFile)).toBe(false); } });
  expect(called).toBe(true);
});
