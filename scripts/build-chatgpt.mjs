import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stageCloudPlugin } from './cloud-plugin-package.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stage = join(root, 'build', 'chatgpt', 'cloudgpt');
const source = join(root, 'chatgpt');
const manifest = JSON.parse(readFileSync(join(source, 'plugin.json'), 'utf8'));
if (process.platform !== 'darwin') throw new Error('The Keychain package must be built on macOS.');
if (manifest.extensions['com.openai'].interface.shortDescription.length > 30) throw new Error('Plugin subtitle is too long.');
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, 'server'), { recursive: true });
mkdirSync(join(stage, 'bin'), { recursive: true });
mkdirSync(join(stage, 'assets'), { recursive: true });
for (const file of ['plugin.json', 'mcp.json', 'config.mjs', 'runtime.mjs', 'runtime-update.mjs', 'install.mjs', 'install-flow.mjs', 'connect.mjs', 'connection-guide.mjs', 'service-lifecycle.mjs', 'setup.mjs', 'secret-input.mjs', 'service.mjs', 'service-config.mjs', 'README.md']) cpSync(join(source, file), join(stage, file));
cpSync(join(root, 'LICENSE'), join(stage, 'LICENSE'));
cpSync(join(source, 'skills'), join(stage, 'skills'), { recursive: true });
cpSync(join(root, 'assets', 'cloudgpt.png'), join(stage, 'assets', 'cloudgpt.png'));
// Carry the clean cloud wrapper in the same download. Never copy an account binding.
const cloudStage = join(root, 'build', 'chatgpt', 'cloud-template', 'cloudgpt');
const cloudManifest = stageCloudPlugin({ source: join(root, 'cloud-plugin', 'cloudgpt'), stage: cloudStage, license: join(root, 'LICENSE') });
if (cloudManifest.version !== manifest.version) throw new Error('Runtime and cloud-plugin versions differ.');
const cloudArchive = join(stage, 'chatgpt-plugin.zip');
execFileSync('/usr/bin/zip', ['-qr', cloudArchive, 'cloudgpt'], { cwd: dirname(cloudStage) });
writeFileSync(cloudArchive + '.sha256', createHash('sha256').update(readFileSync(cloudArchive)).digest('hex') + '  chatgpt-plugin.zip\n');
await build({
  entryPoints: [join(root, 'src', 'chatgpt.ts')], outfile: join(stage, 'server', 'index.mjs'),
  bundle: true, platform: 'node', target: 'node20', format: 'esm',
  banner: { js: "import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);" },
  legalComments: 'external', logLevel: 'warning',
});
const legalFile = join(stage, 'server', 'index.mjs.LEGAL.txt');
const { existsSync } = await import('node:fs');
writeFileSync(legalFile, (existsSync(legalFile) ? readFileSync(legalFile, 'utf8') : '') + '\n\nunpdf (MIT), bundling PDF.js (Apache-2.0):\n' + readFileSync(join(root, 'node_modules', 'unpdf', 'LICENSE'), 'utf8') + '\nPDF.js: Copyright Mozilla Foundation and contributors. https://www.apache.org/licenses/LICENSE-2.0\n');
const swiftCache = join(root, 'build', 'swift-cache');
mkdirSync(swiftCache, { recursive: true });
execFileSync('/usr/bin/swiftc', ['-O', '-module-cache-path', swiftCache, join(source, 'macos', 'keychain.swift'), '-o', join(stage, 'bin', 'keychain')], { stdio: 'inherit' });
// Download via the current official release, verify SHA256SUMS before placing
// the vendor executable here. No silent download/upgrade occurs in this build.
const downloads = join(root, 'build', 'tunnel-client');
const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
const { readdirSync } = await import('node:fs');
const archives = readdirSync(downloads).filter(x => new RegExp(`^tunnel-client-v[^/]+-darwin-${arch}\\.zip$`).test(x));
if (archives.length !== 1) throw new Error('Exactly one official tunnel-client archive for this architecture is required.');
const archive = archives[0];
const sha = createHash('sha256').update(readFileSync(join(downloads, archive))).digest('hex');
const expected = readFileSync(join(downloads, 'SHA256SUMS.txt'), 'utf8').split('\n').find(line => line.trim().split(/\s+/).at(-1)?.replace(/^\*/, '') === archive)?.split(/\s+/)[0];
if (sha !== expected) throw new Error('Tunnel-client checksum mismatch.');
const vendor = join(root, 'build', 'chatgpt', 'vendor');
rmSync(vendor, { recursive: true, force: true });
mkdirSync(vendor, { recursive: true });
execFileSync('/usr/bin/unzip', ['-q', join(downloads, archive), '-d', vendor]);
for (const name of ['tunnel-client', 'cloudflared', 'cloudflared-manifest.json', 'LICENSE', 'NOTICE']) cpSync(join(vendor, name), join(stage, 'bin', name));
for (const name of ['keychain', 'tunnel-client', 'cloudflared']) chmodSync(join(stage, 'bin', name), 0o755);
writeFileSync(join(stage, 'bin', 'PROVENANCE.json'), JSON.stringify({ archive, sha256: sha, source: `https://github.com/openai/tunnel-client/releases/tag/${/^tunnel-client-(v.+)-darwin-/.exec(archive)[1]}`, builtFor: `darwin-${arch}` }, null, 2) + '\n');
for (const [name, script, action] of [
  ['Install CloudGPT.command', 'install.mjs', ''],
  ['Connect ChatGPT.command', 'connect.mjs', ''],
  ['Setup.command', 'setup.mjs', ''], ['Update.command', 'install.mjs', ''], ['Start.command', 'service.mjs', 'start'],
  ['Diagnose.command', 'runtime.mjs', 'doctor'], ['Status.command', 'service.mjs', 'status'], ['Install at Login.command', 'service.mjs', 'install'], ['Restart.command', 'service.mjs', 'restart'], ['Stop.command', 'service.mjs', 'stop'], ['Remove from Login.command', 'service.mjs', 'uninstall'],
]) {
  const command = `#!/bin/sh\nset -eu\nPATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"\nexport PATH\ncd "$(dirname "$0")"\nnode "${script}" ${action} "$@"\n`;
  writeFileSync(join(stage, name), command, { mode: 0o755 });
}
mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', `cloudgpt-${manifest.version}-macos-${arch}.zip`);
rmSync(out, { force: true });
execFileSync('/usr/bin/zip', ['-qr', out, 'cloudgpt'], { cwd: dirname(stage) });
execFileSync('/usr/bin/unzip', ['-tq', out], { stdio: 'inherit' });
const listing = execFileSync('/usr/bin/unzip', ['-Z1', out], { encoding: 'utf8' }).split('\n');
if (listing.some(p => /(^|\/)(\.env[^/]*|node_modules|config\.json|tunnel\.yaml|health\.url)(\/|$)/.test(p))) throw new Error('Private data or dependencies in the plugin package.');
writeFileSync(out + '.sha256', createHash('sha256').update(readFileSync(out)).digest('hex') + '  ' + out.split('/').at(-1) + '\n');
console.log(`Done: ${out}`);
