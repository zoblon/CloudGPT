import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareConnection } from './connection-guide.mjs';

export async function connectChatGPT({ source, open = true }) {
  const result = await prepareConnection({ source });
  console.log(`\nMac-Dienst geprüft und bereit. ChatGPT-Verbindung noch nicht geprüft.\nEinrichtungsassistent: ${result.page}`);
  if (open) {
    try { execFileSync('/usr/bin/open', [result.page], { stdio: ['ignore', 'ignore', 'pipe'] }); }
    catch { console.log('Die Seite konnte nicht automatisch geöffnet werden. Öffne die oben genannte Datei.'); }
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    if (process.platform !== 'darwin') throw new Error('macOS is required.');
    if (process.argv.slice(2).some(arg => arg !== '--no-open')) throw new Error('Usage: connect.mjs [--no-open]');
    await connectChatGPT({ source: dirname(fileURLToPath(import.meta.url)), open: !process.argv.includes('--no-open') });
  } catch (error) {
    console.error(error instanceof Error && !('stderr' in error) ? error.message : 'Der Verbindungsassistent konnte nicht gestartet werden.');
    process.exitCode = 1;
  }
}
