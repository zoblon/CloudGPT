import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Stage first, keep the complete previous runtime, and restore it on a failed startup.
 * Configuration and keychain entries are outside runtime and are never touched. */
export async function updateRuntime({ source, runtime, backups, contents, stop, start, ready }) {
  if (resolve(source) === resolve(runtime) || (existsSync(runtime) && realpathSync(source) === realpathSync(runtime))) {
    throw new Error('Use a separate unpacked CloudGPT update package.');
  }
  if (!existsSync(runtime)) throw new Error('No installed runtime found. Use the initial installation command.');
  for (const file of contents) {
    if (!existsSync(join(source, file))) throw new Error('The update package is incomplete. The installed service was not changed.');
  }
  // Atomic across processes; held until readiness or complete rollback. Never
  // remove another updater's lock. After a crash it remains for manual recovery.
  const lock = join(dirname(runtime), '.cloudgpt-update.lock');
  try { mkdirSync(lock, { mode: 0o700 }); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`An update is already running or was interrupted. Lock: ${lock}. Do not remove it while an updater is running.`);
    throw new Error('Could not lock the runtime for update. The installed service was not changed.');
  }
  let staging, backupFolder, backup;
  let stopAttempted = false, moved = false, active = false;
  try {
    writeFileSync(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { mode: 0o600 });
    mkdirSync(backups, { recursive: true, mode: 0o700 }); chmodSync(backups, 0o700);
    staging = mkdtempSync(join(dirname(runtime), '.cloudgpt-update-'));
    backupFolder = mkdtempSync(join(backups, 'runtime-'));
    backup = join(backupFolder, 'runtime');
    for (const file of contents) cpSync(join(source, file), join(staging, file), { recursive: true });
    chmodSync(staging, 0o700);
    stopAttempted = true; await stop();
    renameSync(runtime, backup); moved = true;
    renameSync(staging, runtime); active = true;
    await start(); await ready();
    return { backup };
  } catch {
    if (!moved) {
      if (!stopAttempted) throw new Error('Could not stage the package. The installed service was not changed.');
      // stop() may have succeeded before a later filesystem failure.
      try { await start(); } catch { /* report below; runtime files remain intact */ }
      throw new Error('Update failed before replacing the runtime. The previous files remain in place. Check the service status.');
    }
    try {
      await stop();
      if (active) renameSync(runtime, join(backupFolder, 'failed-runtime'));
      renameSync(backup, runtime);
      await start(); await ready();
    } catch {
      throw new Error(`Update failed and automatic recovery could not be confirmed. Previous runtime: ${existsSync(backup) ? backup : runtime}. Check the service status.`);
    }
    throw new Error('Update failed; previous runtime restored and ready.');
  } finally {
    if (staging) rmSync(staging, { recursive: true, force: true });
    rmSync(lock, { recursive: true, force: true });
  }
}
