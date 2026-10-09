import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { launchAgentPlist, servicePaths } from '../chatgpt/service-config.mjs';

it('produces a valid private launch agent with literal paths and no credentials', () => {
  const paths = servicePaths('/Users/Test & <special>');
  const plist = launchAgentPlist('/opt/homebrew/bin/node', paths);
  expect(plist).toContain('Test &amp; &lt;special&gt;');
  expect(plist).not.toMatch(/CONTROL_PLANE_API_KEY|ICLOUD_APP_PASSWORD|<key>EnvironmentVariables/);
  const parsed = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], { input: plist, encoding: 'utf8' }));
  expect(parsed.ProgramArguments).toEqual(['/opt/homebrew/bin/node', paths.runtime + '/runtime.mjs', 'tunnel']);
  expect(parsed).toMatchObject({ Label: 'de.rehkopf.cloudgpt', RunAtLoad: true, KeepAlive: true, ThrottleInterval: 30, ProcessType: 'Background', Umask: 63 });
  expect(parsed.StandardErrorPath).toBe(paths.logs + '/stderr.log');
});
it('rejects relative or multiline executable paths', () => {
  for (const path of ['node', '/usr/bin/node\nother', '/usr/bin/node\0other']) expect(() => launchAgentPlist(path, servicePaths())).toThrow();
});
