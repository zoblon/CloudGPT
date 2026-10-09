import { existsSync, unlinkSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

/** bootout can return before launchd has removed the job. Never start/update
 * against that disappearing registration or its old health endpoint. */
export async function stopService({ isRegistered, bootout, healthFile, timeoutMs = 10000, pollMs = 100 }) {
  if (isRegistered()) await bootout();
  const deadline = Date.now() + timeoutMs;
  while (isRegistered()) {
    if (Date.now() >= deadline) throw new Error('CloudGPT is still stopping. No replacement was started. Check the service status and try again.');
    await delay(pollMs);
  }
  if (existsSync(healthFile)) unlinkSync(healthFile);
}

export function startService({ isRegistered, bootstrap, agent, healthFile }) {
  if (!existsSync(agent)) throw new Error('Open Install at Login.command first.');
  if (!isRegistered()) {
    if (existsSync(healthFile)) unlinkSync(healthFile);
    bootstrap();
  }
}
