import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Stage only declared assets/instructions; never inherit a private source binding. */
export function stageCloudPlugin({ source, stage, license, appId }) {
  if (appId !== undefined && !/^[A-Za-z0-9_-]{8,200}$/.test(appId)) throw new Error('Invalid app ID. Supply your own account app ID.');
  const manifest = JSON.parse(readFileSync(join(source, 'plugin.json'), 'utf8'));
  const openai = manifest.extensions['com.openai'];
  const ui = openai.interface;
  if (manifest.name !== 'cloudgpt' || ui.shortDescription.length > 30) throw new Error('Invalid plugin metadata.');
  const assets = new Set();
  for (const key of ['logo', 'logoDark', 'composerIcon', 'composerIconDark']) {
    const path = ui[key];
    if (!/^\.\/assets\/[A-Za-z0-9_-]+\.png$/.test(path ?? '') || !existsSync(join(source, path))) throw new Error('Plugin logo missing or invalid.');
    assets.add(path);
  }
  // Remove any manifest pointer supplied by an old private checkout.
  delete openai.apps;
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(join(stage, 'assets'), { recursive: true });
  mkdirSync(join(stage, 'skills', 'icloud'), { recursive: true });
  for (const asset of assets) cpSync(join(source, asset), join(stage, asset));
  cpSync(join(source, 'skills', 'icloud', 'SKILL.md'), join(stage, 'skills', 'icloud', 'SKILL.md'));
  cpSync(license, join(stage, 'LICENSE'));
  if (appId !== undefined) {
    openai.apps = './.app.json';
    writeFileSync(join(stage, '.app.json'), JSON.stringify({ apps: { cloudgpt: { id: appId, required: true } } }, null, 2) + '\n', { mode: 0o600 });
  }
  writeFileSync(join(stage, 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
