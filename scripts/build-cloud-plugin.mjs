import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stageCloudPlugin } from './cloud-plugin-package.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--app-id')) throw new Error('Usage: build-cloud-plugin.mjs [--app-id YOUR_APP_ID]');
const appId = args[1];
const stage = join(root, 'build', 'cloud-plugin', 'cloudgpt');
const manifest = stageCloudPlugin({ source: join(root, 'cloud-plugin', 'cloudgpt'), stage, license: join(root, 'LICENSE'), appId });
mkdirSync(join(root, 'dist'), { recursive: true });
const archive = join(root, 'dist', `cloudgpt-cloud-plugin-${manifest.version}${appId ? '-bound' : ''}.zip`);
rmSync(archive, { force: true });
execFileSync('/usr/bin/zip', ['-qr', archive, 'cloudgpt'], { cwd: dirname(stage) });
execFileSync('/usr/bin/unzip', ['-tq', archive], { stdio: 'inherit' });
const listing = execFileSync('/usr/bin/unzip', ['-Z1', archive], { encoding: 'utf8' }).split('\n').filter(p => p && !p.endsWith('/'));
const allowed = ['cloudgpt/plugin.json', 'cloudgpt/LICENSE', 'cloudgpt/assets/cloudgpt.png', 'cloudgpt/skills/icloud/SKILL.md'];
if (appId) allowed.push('cloudgpt/.app.json');
if (listing.some(p => !allowed.includes(p))) { rmSync(archive, { force: true }); throw new Error('Unexpected data in plugin package.'); }
writeFileSync(archive + '.sha256', createHash('sha256').update(readFileSync(archive)).digest('hex') + '  ' + archive.split('/').at(-1) + '\n');
console.log(`${appId ? 'Private bound package (do not publish)' : 'Unbound public template'}: ${archive}`);
