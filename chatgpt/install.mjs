import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installPackage } from './install-flow.mjs';
import { connectChatGPT } from './connect.mjs';

try {
  if (process.platform !== 'darwin') throw new Error('macOS is required.');
  if (process.argv.slice(2).some(arg => arg !== '--no-open')) throw new Error('Usage: install.mjs [--no-open]');
  console.log('CloudGPT – install or update\n');
  const action = await installPackage({ source: dirname(fileURLToPath(import.meta.url)) });
  console.log(`\nCloudGPT ${action === 'update' ? 'updated' : 'installed'}; the background service is ready.`);
  await connectChatGPT({ source: dirname(fileURLToPath(import.meta.url)), open: !process.argv.includes('--no-open') });
} catch (error) {
  // Subprocess exceptions can contain output. Only display our own safe messages.
  console.error(error instanceof Error && !('status' in error) && !('stderr' in error) ? error.message : 'Installation did not complete. Review the message above; the installer did not report success.');
  process.exitCode = 1;
}
