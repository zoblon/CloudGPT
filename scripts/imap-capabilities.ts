/**
 * Read-only iCloud Mail diagnostic: authenticated capabilities and folder role flags.
 *
 * CAPABILITY and LIST only; no message is opened or changed.
 * Output includes account folder names, never message content or credentials.
 * Start: npm run imap-capabilities
 */
import { ImapFlow } from 'imapflow';

const env = (k: string) => (process.env[k] ?? '').trim();
const user = env('ICLOUD_MAIL_USER');
const pass = env('ICLOUD_APP_PASSWORD');
if (!user || !pass) {
  console.error('Missing values in .env: ICLOUD_MAIL_USER or ICLOUD_APP_PASSWORD');
  process.exit(1);
}

const clean = (e: unknown) => {
  let m = e instanceof Error ? e.message : String(e);
  for (const s of [pass, user]) m = m.split(s).join('***');
  return m.slice(0, 300);
};

const client = new ImapFlow({ host: 'imap.mail.me.com', port: 993, secure: true, auth: { user, pass }, logger: false, disableAutoIdle: true });
client.on('error', () => undefined);
try {
  await client.connect();
  const caps = [...client.capabilities.keys()].sort();
  console.log(`Authenticated capabilities (${caps.length}):\n  ${caps.join(' ')}`);
  for (const c of ['MOVE', 'SPECIAL-USE', 'UIDPLUS', 'UNSELECT', 'XLIST']) console.log(`${c.padEnd(12)} ${client.capabilities.has(c) ? 'YES' : 'no'}`);
  console.log('\nFolders (name | flags | role identified by imapflow):');
  for (const e of await client.list()) {
    console.log(`  ${e.path} | ${[...(e.flags ?? [])].join(' ') || '-'} | ${e.specialUse ?? '-'} (${e.specialUseSource ?? '-'})`);
  }
} catch (e) {
  console.log(`ERROR: ${clean(e)}`);
  process.exitCode = 1;
} finally {
  try {
    await client.logout();
  } catch {
    client.close();
  }
}
