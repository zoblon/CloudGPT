import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installPackage } from './install-flow.mjs';

try {
  if (process.platform !== 'darwin') throw new Error('macOS is required.');
  console.log('CloudGPT – install or update\n');
  const action = await installPackage({ source: dirname(fileURLToPath(import.meta.url)) });
  console.log(`\nCloudGPT ${action === 'update' ? 'updated' : 'installed'}; the background service is ready.`);
  console.log('Refresh the connection in ChatGPT and start a new chat. Configure write tools to require confirmation.');
  console.log('The ChatGPT plugin logo and skill are updated separately using your own app-bound plugin package.');
} catch (error) {
  // Subprocess exceptions can contain output. Only display our own safe messages.
  console.error(error instanceof Error && !('status' in error) && !('stderr' in error) ? error.message : 'Installation did not complete. Review the message above; the installer did not report success.');
  process.exitCode = 1;
}
