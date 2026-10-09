import { join } from 'node:path';
import { homedir } from 'node:os';

export const serviceLabel = 'de.rehkopf.cloudgpt';
export function servicePaths(home = homedir()) {
  const base = join(home, 'Library', 'Application Support', 'CloudGPT');
  return { base, runtime: join(base, 'runtime'), logs: join(base, 'logs'),
    agent: join(home, 'Library', 'LaunchAgents', `${serviceLabel}.plist`) };
}
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
export function launchAgentPlist(nodePath, paths) {
  if (!nodePath.startsWith('/') || /[\r\n\0]/.test(nodePath)) throw new Error('An absolute Node path is required.');
  // No credentials or shell command: launchd directly launches the existing
  // launcher, which reads its two credentials from the login keychain.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${serviceLabel}</string>
<key>ProgramArguments</key><array><string>${xml(nodePath)}</string><string>${xml(join(paths.runtime, 'runtime.mjs'))}</string><string>tunnel</string></array>
<key>WorkingDirectory</key><string>${xml(paths.runtime)}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>30</integer>
<key>ProcessType</key><string>Background</string>
<key>LimitLoadToSessionType</key><string>Aqua</string>
<key>Umask</key><integer>63</integer>
<key>StandardOutPath</key><string>${xml(join(paths.logs, 'stdout.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(paths.logs, 'stderr.log'))}</string>
</dict></plist>
`;
}
