import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { updateRuntime } from '../chatgpt/runtime-update.mjs';

const folders = [];
afterEach(() => { for (const p of folders.splice(0)) rmSync(p, { recursive: true, force: true }); });
function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'cloudgpt-update-')); folders.push(base);
  const source = join(base, 'candidate'), runtime = join(base, 'runtime'), backups = join(base, 'backups');
  mkdirSync(source); mkdirSync(runtime);
  writeFileSync(join(source, 'server.mjs'), 'new'); writeFileSync(join(runtime, 'server.mjs'), 'old');
  writeFileSync(join(base, 'config.json'), 'existing configuration');
  return { base, source, runtime, backups, contents: ['server.mjs'] };
}
it('checks the complete candidate before stopping the service', async () => {
  const f = fixture(); let stopped = false;
  await expect(updateRuntime({ ...f, contents: ['missing'], stop: () => { stopped = true; }, start: () => {}, ready: async () => {} })).rejects.toThrow();
  expect(stopped).toBe(false); expect(readFileSync(join(f.runtime, 'server.mjs'), 'utf8')).toBe('old');
});
it('keeps a complete previous runtime and installs before starting without touching configuration', async () => {
  const f = fixture(); const states = [];
  const result = await updateRuntime({ ...f, stop: () => { states.push(readFileSync(join(f.runtime, 'server.mjs'), 'utf8')); }, start: () => { states.push(readFileSync(join(f.runtime, 'server.mjs'), 'utf8')); }, ready: async () => { states.push('ready'); } });
  expect(states).toEqual(['old', 'new', 'ready']);
  expect(readFileSync(join(result.backup, 'server.mjs'), 'utf8')).toBe('old');
  expect(readFileSync(join(f.base, 'config.json'), 'utf8')).toBe('existing configuration');
});
it('restores and starts the previous runtime when the new service never becomes ready', async () => {
  const f = fixture(); const starts = []; let checks = 0;
  await expect(updateRuntime({ ...f, stop: () => {}, start: () => { starts.push(readFileSync(join(f.runtime, 'server.mjs'), 'utf8')); }, ready: async () => { if (++checks === 1) throw new Error('not ready'); } })).rejects.toThrow(/previous runtime restored/);
  expect(starts).toEqual(['new', 'old']); expect(checks).toBe(2);
  expect(readFileSync(join(f.runtime, 'server.mjs'), 'utf8')).toBe('old');
});
it('refuses updating from the installed runtime itself', async () => {
  const f = fixture();
  await expect(updateRuntime({ ...f, source: f.runtime, stop: () => {}, start: () => {}, ready: async () => {} })).rejects.toThrow(/separate/);
  expect(existsSync(join(f.runtime, 'server.mjs'))).toBe(true);
});
it('does not start an intentionally stopped service when staging a malformed file fails', async () => {
  const f = fixture(); const calls = [];
  const { execFileSync } = await import('node:child_process');
  execFileSync('/usr/bin/mkfifo', [join(f.source, 'broken-file')]);
  await expect(updateRuntime({ ...f, contents: ['server.mjs', 'broken-file'], stop: () => { calls.push('stop'); }, start: () => { calls.push('start'); }, ready: async () => {} })).rejects.toThrow();
  expect(calls).toEqual([]); expect(readFileSync(join(f.runtime, 'server.mjs'), 'utf8')).toBe('old');
});
it('refuses a concurrent updater without service effects while the first waits for readiness', async () => {
  const f = fixture(); let release;
  let entered; const reachedReady = new Promise(resolve => { entered = resolve; });
  const first = updateRuntime({ ...f, stop: () => {}, start: () => {}, ready: () => { entered(); return new Promise(resolve => { release = resolve; }); } });
  await reachedReady;
  const otherCalls = [];
  try {
    await expect(updateRuntime({ ...f, stop: () => { otherCalls.push('stop'); }, start: () => { otherCalls.push('start'); }, ready: async () => {} })).rejects.toThrow(/already/);
    expect(otherCalls).toEqual([]);
  } finally { release(); await first; }
  expect(readFileSync(join(f.runtime, 'server.mjs'), 'utf8')).toBe('new');
});
