import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { stageCloudPlugin } from '../scripts/cloud-plugin-package.mjs';
const temps = [];
afterEach(() => { for (const path of temps.splice(0)) rmSync(path, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cloudgpt-public-package-')); temps.push(root);
  const source = join(root, 'source'), stage = join(root, 'stage'), license = join(root, 'LICENSE');
  mkdirSync(join(source, 'assets'), { recursive: true }); mkdirSync(join(source, 'skills', 'icloud'), { recursive: true });
  const interface_ = Object.fromEntries(['logo', 'logoDark', 'composerIcon', 'composerIconDark'].map(k => [k, './assets/cloudgpt.png']));
  const manifest = { name: 'cloudgpt', version: '0.4.1', extensions: { 'com.openai': { apps: './.app.json', interface: { ...interface_, shortDescription: 'Test' } } } };
  writeFileSync(join(source, 'plugin.json'), JSON.stringify(manifest));
  writeFileSync(join(source, '.app.json'), '{"apps":{"cloudgpt":{"id":"app_private_synthetic","required":true}}}');
  writeFileSync(join(source, '.env'), 'FAKE_SECRET=synthetic-private-value');
  writeFileSync(join(source, 'extra.txt'), 'synthetic-private-value');
  writeFileSync(join(source, 'assets', 'cloudgpt.png'), 'synthetic image');
  writeFileSync(join(source, 'skills', 'icloud', 'SKILL.md'), 'Test skill'); writeFileSync(license, 'MIT');
  return { source, stage, license, manifest };
}
it('public staging excludes an inherited binding, secrets and unrelated files', () => {
  const f = fixture(); const m = stageCloudPlugin(f);
  expect(m.extensions['com.openai'].apps).toBeUndefined();
  expect(readdirSync(f.stage).sort()).toEqual(['LICENSE', 'assets', 'plugin.json', 'skills']);
  expect(readFileSync(join(f.stage, 'plugin.json'), 'utf8')).not.toMatch(/app_private|synthetic-private/);
  expect(readFileSync(join(f.source, '.app.json'), 'utf8')).toContain('app_private_synthetic');
});
it('rebuilding a previously bound stage removes the old binding', () => {
  const f = fixture(); stageCloudPlugin({ ...f, appId: 'app_personal_synthetic' });
  expect(existsSync(join(f.stage, '.app.json'))).toBe(true);
  stageCloudPlugin(f); expect(existsSync(join(f.stage, '.app.json'))).toBe(false);
});
it('only an explicitly supplied app ID is placed in a private bound wrapper', () => {
  const f = fixture(); const m = stageCloudPlugin({ ...f, appId: 'app_own_synthetic' });
  expect(m.extensions['com.openai'].apps).toBe('./.app.json');
  expect(JSON.parse(readFileSync(join(f.stage, '.app.json'), 'utf8'))).toEqual({ apps: { cloudgpt: { id: 'app_own_synthetic', required: true } } });
});
it('rejects malformed IDs before replacing an existing stage', () => {
  const f = fixture(); mkdirSync(f.stage); writeFileSync(join(f.stage, 'retained'), 'test');
  for (const appId of ['', '../other', 'app_bad\nvalue']) expect(() => stageCloudPlugin({ ...f, appId })).toThrow('Invalid app ID');
  expect(readFileSync(join(f.stage, 'retained'), 'utf8')).toBe('test');
});
it('rejects asset path traversal before staging', () => {
  const f = fixture(); f.manifest.extensions['com.openai'].interface.logo = '../private.png';
  writeFileSync(join(f.source, 'plugin.json'), JSON.stringify(f.manifest));
  expect(() => stageCloudPlugin(f)).toThrow('logo missing or invalid');
  expect(existsSync(f.stage)).toBe(false);
});
