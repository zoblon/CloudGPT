import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const folders = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
const config = { appleId: 'test@example.com', mailUser: 'test@icloud.com', timezone: 'Europe/Berlin', defaultCalendar: '', mode: 'readonly', tunnelId: 'tunnel_test12345', nodePath: process.execPath };
async function installer() {
  const module = await import('../chatgpt/install-flow.mjs').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  });
  expect(module.installPackage, 'the unified installer must exist').toBeTypeOf('function');
  return module.installPackage;
}
function fixture({ configured = false, installed = false } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'cloudgpt-install-')); folders.push(base);
  const source = join(base, 'package'), configFile = join(base, 'config.json');
  const paths = { runtime: join(base, 'runtime'), agent: join(base, 'agent.plist') };
  const credentials = join(base, 'synthetic-keychain.json');
  writeFileSync(credentials, JSON.stringify(configured || installed ? ['icloud', 'openai-runtime'] : []));
  mkdirSync(source);
  for (const file of ['runtime.mjs', 'runtime-update.mjs', 'config.mjs', 'install.mjs', 'install-flow.mjs', 'secret-input.mjs', 'service-config.mjs', 'plugin.json', 'mcp.json', 'README.md', 'LICENSE']) writeFileSync(join(source, file), 'fixture');
  for (const name of ['server', 'bin', 'assets', 'skills']) mkdirSync(join(source, name));
  mkdirSync(join(source, 'skills', 'icloud'));
  for (const file of ['server/index.mjs', 'bin/keychain', 'bin/tunnel-client', 'bin/cloudflared', 'assets/cloudgpt.png', 'skills/icloud/SKILL.md']) writeFileSync(join(source, file), 'fixture');
  // Only the external setup/service boundary is simulated. Selection, filesystem
  // checks, configuration validation and subprocess execution remain real.
  writeFileSync(join(source, 'bin', 'keychain'), `#!/usr/bin/env node\nconst fs = require('node:fs'); const request=JSON.parse(fs.readFileSync(0, 'utf8')); if(!JSON.parse(fs.readFileSync(${JSON.stringify(credentials)}, 'utf8')).includes(request.account))process.exit(1); process.stdout.write('synthetic fixture value');`);
  chmodSync(join(source, 'bin', 'keychain'), 0o755);
  writeFileSync(join(source, 'setup.mjs'), `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(configFile)}, ${JSON.stringify(JSON.stringify(config))}); writeFileSync(${JSON.stringify(credentials)}, JSON.stringify(['icloud','openai-runtime'])); writeFileSync(${JSON.stringify(join(base, 'setup-args.json'))}, JSON.stringify(process.argv.slice(2)));`);
  writeFileSync(join(source, 'service.mjs'), `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(join(base, 'action.txt'))}, process.argv[2]);`);
  if (configured || installed) writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
  if (installed) { mkdirSync(paths.runtime); writeFileSync(paths.agent, 'installed'); }
  return { base, source, configFile, paths, credentials };
}

it('updates an existing service without opening setup or rewriting its configuration', async () => {
  const installPackage = await installer(), f = fixture({ installed: true });
  const before = readFileSync(f.configFile);
  await installPackage(f);
  expect(readFileSync(join(f.base, 'action.txt'), 'utf8')).toBe('update');
  expect(existsSync(join(f.base, 'setup-args.json'))).toBe(false);
  expect(readFileSync(f.configFile)).toEqual(before);
});
it('sets up a fresh Mac and installs the login service in one invocation', async () => {
  const installPackage = await installer(), f = fixture();
  await installPackage(f);
  expect(JSON.parse(readFileSync(f.configFile, 'utf8'))).toEqual(config);
  expect(JSON.parse(readFileSync(join(f.base, 'setup-args.json'), 'utf8'))).toEqual(['--installer']);
  expect(readFileSync(join(f.base, 'action.txt'), 'utf8')).toBe('install');
});
it('resumes after completed setup without asking for credentials again', async () => {
  const installPackage = await installer(), f = fixture({ configured: true });
  const before = readFileSync(f.configFile);
  await installPackage(f);
  expect(readFileSync(join(f.base, 'action.txt'), 'utf8')).toBe('install');
  expect(existsSync(join(f.base, 'setup-args.json'))).toBe(false);
  expect(readFileSync(f.configFile)).toEqual(before);
});
it('resumes credential setup after cancellation left valid settings but one missing secret', async () => {
  const installPackage = await installer(), f = fixture({ configured: true });
  writeFileSync(f.credentials, JSON.stringify(['icloud']));
  await installPackage(f);
  expect(JSON.parse(readFileSync(join(f.base, 'setup-args.json'), 'utf8'))).toEqual(['--installer']);
  expect(JSON.parse(readFileSync(f.credentials, 'utf8'))).toEqual(['icloud', 'openai-runtime']);
  expect(readFileSync(join(f.base, 'action.txt'), 'utf8')).toBe('install');
});
it('does not install if a successful setup process still leaves a credential missing', async () => {
  const installPackage = await installer(), f = fixture({ configured: true });
  writeFileSync(f.credentials, '[]');
  writeFileSync(join(f.source, 'setup.mjs'), 'process.exit(0);');
  await expect(installPackage(f)).rejects.toThrow(/credentials/i);
  expect(existsSync(join(f.base, 'action.txt'))).toBe(false);
});
it('the real setup resumes saved settings and prompts only for the missing credential', async () => {
  const installPackage = await installer(), f = fixture({ configured: true });
  const saved = { ...config, mode: 'full', defaultCalendar: 'Private test calendar' };
  writeFileSync(f.configFile, JSON.stringify(saved));
  writeFileSync(f.credentials, JSON.stringify(['icloud']));
  cpSync(new URL('../chatgpt/setup.mjs', import.meta.url), join(f.source, 'setup.mjs'));
  writeFileSync(join(f.source, 'config.mjs'), `export {validateConfig} from ${JSON.stringify(new URL('../chatgpt/config.mjs', import.meta.url).href)}; export const configPath=${JSON.stringify(f.configFile)}, dataDir=${JSON.stringify(f.base)};`);
  writeFileSync(join(f.source, 'secret-input.mjs'), `import {writeFileSync} from 'node:fs'; export async function readSecret(prompt){writeFileSync(${JSON.stringify(join(f.base, 'secret-prompt.txt'))},prompt); return 'synthetic fixture value';}`);
  writeFileSync(join(f.source, 'bin', 'keychain'), `#!/usr/bin/env node
const fs=require('node:fs'), request=JSON.parse(fs.readFileSync(0,'utf8'));
const path=${JSON.stringify(f.credentials)}, accounts=JSON.parse(fs.readFileSync(path,'utf8'));
if(request.operation==='write'){accounts.push(request.account);fs.writeFileSync(path,JSON.stringify(accounts));}
else if(request.operation!=='read'||!accounts.includes(request.account))process.exit(1);
else process.stdout.write('synthetic fixture value');`);
  await installPackage(f);
  expect(JSON.parse(readFileSync(f.configFile, 'utf8'))).toEqual(saved);
  expect(readFileSync(join(f.base, 'secret-prompt.txt'), 'utf8')).toMatch(/^OpenAI runtime API key/);
  expect(JSON.parse(readFileSync(f.credentials, 'utf8'))).toEqual(['icloud', 'openai-runtime']);
  expect(readFileSync(join(f.base, 'action.txt'), 'utf8')).toBe('install');
});
it('refuses an incomplete package before collecting credentials or changing the service', async () => {
  const installPackage = await installer(), f = fixture();
  rmSync(join(f.source, 'bin'), { recursive: true });
  await expect(installPackage(f)).rejects.toThrow(/incomplete/);
  expect(existsSync(f.configFile)).toBe(false);
  expect(existsSync(join(f.base, 'action.txt'))).toBe(false);
});
it('does not silently replace an invalid existing configuration', async () => {
  const installPackage = await installer(), f = fixture({ configured: true });
  writeFileSync(f.configFile, 'broken');
  await expect(installPackage(f)).rejects.toThrow(/configuration/i);
  expect(readFileSync(f.configFile, 'utf8')).toBe('broken');
  expect(existsSync(join(f.base, 'setup-args.json'))).toBe(false);
  expect(existsSync(join(f.base, 'action.txt'))).toBe(false);
});
it('refuses a package with a missing keychain helper before asking for credentials', async () => {
  const installPackage = await installer(), f = fixture();
  rmSync(join(f.source, 'bin', 'keychain'));
  await expect(installPackage(f)).rejects.toThrow(/incomplete/);
  expect(existsSync(f.configFile)).toBe(false);
  expect(existsSync(join(f.base, 'action.txt'))).toBe(false);
});
it('stops after a failed setup rather than attempting to install a service', async () => {
  const installPackage = await installer(), f = fixture();
  writeFileSync(join(f.source, 'setup.mjs'), 'process.exit(1);');
  await expect(installPackage(f)).rejects.toThrow();
  expect(existsSync(join(f.base, 'action.txt'))).toBe(false);
});
it('refuses to overwrite a runtime whose login service is missing', async () => {
  const installPackage = await installer(), f = fixture({ configured: true });
  mkdirSync(f.paths.runtime); writeFileSync(join(f.paths.runtime, 'old.txt'), 'old');
  await expect(installPackage(f)).rejects.toThrow(/login service/);
  expect(readFileSync(join(f.paths.runtime, 'old.txt'), 'utf8')).toBe('old');
  expect(existsSync(join(f.base, 'action.txt'))).toBe(false);
});
it('refuses a broken existing service without falling back to initial setup', async () => {
  const installPackage = await installer(), f = fixture({ installed: true });
  rmSync(f.paths.runtime, { recursive: true });
  await expect(installPackage(f)).rejects.toThrow(/runtime/i);
  expect(existsSync(join(f.base, 'setup-args.json'))).toBe(false);
  expect(existsSync(join(f.base, 'action.txt'))).toBe(false);
});
