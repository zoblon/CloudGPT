import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { configPath, validateConfig } from './config.mjs';
import { servicePaths } from './service-config.mjs';

export const runtimeContents = ['runtime.mjs', 'runtime-update.mjs', 'config.mjs', 'install.mjs', 'install-flow.mjs', 'connect.mjs', 'connection-guide.mjs', 'service-lifecycle.mjs', 'chatgpt-plugin.zip', 'chatgpt-plugin.zip.sha256', 'setup.mjs', 'secret-input.mjs', 'service.mjs', 'service-config.mjs', 'plugin.json', 'mcp.json', 'README.md', 'LICENSE', 'server', 'bin', 'assets', 'skills'];

/** A downloaded package chooses the safe update path before any setup prompts. */
export async function installPackage({ source, configFile = configPath, paths = servicePaths() }) {
  for (const file of runtimeContents) {
    if (!existsSync(join(source, file))) throw new Error('The CloudGPT package is incomplete. Download and unpack the full macOS release.');
  }
  for (const file of ['server/index.mjs', 'bin/keychain', 'bin/tunnel-client', 'bin/cloudflared', 'assets/cloudgpt.png', 'skills/icloud/SKILL.md']) {
    if (!existsSync(join(source, file)) || !statSync(join(source, file)).isFile()) throw new Error('The CloudGPT package is incomplete. Download and unpack the full macOS release.');
  }
  const run = (file, args = []) => execFileSync(process.execPath, [join(source, file), ...args], { cwd: source, stdio: 'inherit' });
  const credentialsAvailable = () => {
    for (const account of ['icloud', 'openai-runtime']) {
      try { execFileSync(join(source, 'bin', 'keychain'), [], { input: JSON.stringify({ operation: 'read', account }), stdio: ['pipe', 'ignore', 'pipe'] }); }
      catch { return false; }
    }
    return true;
  };
  const installed = existsSync(paths.agent);
  if (installed && !existsSync(paths.runtime)) throw new Error('The installed runtime is missing. Check the existing login service before installing again.');
  if (!installed && existsSync(paths.runtime)) throw new Error('An existing runtime has no login service. Open Install at Login.command to restore it, then run this installer again.');
  if (existsSync(configFile)) {
    try { validateConfig(JSON.parse(readFileSync(configFile, 'utf8'))); }
    catch { throw new Error('The existing configuration is invalid. Repair it with Setup.command before running the installer again.'); }
  } else if (installed) {
    throw new Error('The installed service has no configuration. Repair it with Setup.command before running the installer again.');
  }
  // Setup writes settings before asking for secrets. A valid config alone does
  // not mean an interrupted initial setup has completed. Never probe or change
  // credentials on the existing-service update path.
  if (!installed && (!existsSync(configFile) || !credentialsAvailable())) {
    run('setup.mjs', ['--installer']);
    validateConfig(JSON.parse(readFileSync(configFile, 'utf8')));
    if (!credentialsAvailable()) throw new Error('Both credentials must be available in the Keychain before installing. Check Keychain access and run the installer again.');
  }
  const action = installed ? 'update' : 'install';
  run('service.mjs', [action]);
  return action;
}
