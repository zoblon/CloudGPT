import { createHash, randomUUID } from 'node:crypto';
import { simpleParser } from 'mailparser';
import type { BackupStore } from '../calendar/backup.js';
import { UserError } from '../errors.js';
import { authorizeDraft } from '../permissions.js';
import type { DraftStore, MailReader } from './types.js';
import { decodeRef } from './ref.js';
import { encodeText, parseMailbox } from './mime.js';

export const draftRevisionHash = (raw: Buffer) => createHash('sha256').update(raw).digest('hex');
type Field = { name: string; raw: string };
function splitMessage(raw: string): { fields: Field[]; body: string } {
  const at = raw.indexOf('\r\n\r\n');
  if (at < 0 || at > 100_000) throw new UserError('Unsupported or incomplete MIME headers.');
  const head = raw.slice(0, at);
  if (/[^\r]\n|\r[^\n]|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(head)) throw new UserError('Malformed MIME headers.');
  const fields: Field[] = [];
  for (const line of head.split('\r\n')) {
    if (/^[ \t]/.test(line)) {
      if (!fields.length) throw new UserError('Malformed folded MIME header.');
      fields.at(-1)!.raw += `\r\n${line}`;
    } else {
      const m = /^([A-Za-z0-9!#$%&'*+.^_`|~-]+):/.exec(line);
      if (!m) throw new UserError('Malformed MIME header.');
      fields.push({ name: m[1]!.toLowerCase(), raw: line });
    }
  }
  for (const name of ['from', 'to', 'cc', 'subject', 'message-id', 'content-type', 'content-transfer-encoding', 'mime-version', 'in-reply-to', 'references']) {
    if (fields.filter(f => f.name === name).length > 1) throw new UserError('Ambiguous duplicate MIME header.');
  }
  if (fields.some(f => /^(?:bcc|resent-.*|dkim-signature|content-length)$/.test(f.name))) throw new UserError('Draft has unsupported Bcc, resent, signed or length-sensitive headers. Edit it in Apple Mail.');
  return { fields, body: raw.slice(at + 4) };
}
const value = (fields: Field[], name: string) => fields.find(f => f.name === name)?.raw.replace(/^[^:]+:\s*/, '').replace(/\r\n[ \t]+/g, ' ').trim();
const joinMessage = (fields: Field[], body: string) => `${fields.map(f => f.raw).join('\r\n')}\r\n\r\n${body}`;
function set(fields: Field[], name: string, raw: string | undefined) {
  const at = fields.findIndex(f => f.name === name);
  if (at >= 0) fields.splice(at, 1, ...(raw === undefined ? [] : [{ name, raw }]));
  else if (raw !== undefined) fields.push({ name, raw });
}
function recipients(items: string[]) {
  if (items.length > 20) throw new UserError('Too many recipients.');
  return items.map(s => {
    const m = parseMailbox(s);
    // Always quote ASCII display names; non-ASCII names use encoded words.
    const name = m.name ? (/[^\x20-\x7e]/.test(m.name) ? encodeText(m.name) : `"${m.name.replace(/[\\"]/g, '\\$&')}"`) : '';
    return name ? `${name} <${m.address}>` : m.address;
  }).join(',\r\n ');
}
function replacePlain(raw: string, text: string) {
  const m = splitMessage(raw);
  if (!/^text\/plain(?:\s*;|$)/i.test(value(m.fields, 'content-type') ?? 'text/plain') || m.fields.some(f => f.name === 'content-disposition')) throw new UserError('Body edits support only a plain-text body, not HTML, alternative, signed or attached body parts. Edit this draft in Apple Mail.');
  set(m.fields, 'content-type', 'Content-Type: text/plain; charset=UTF-8');
  set(m.fields, 'content-transfer-encoding', 'Content-Transfer-Encoding: base64');
  const body = Buffer.from(text.replace(/\r\n?|\n/g, '\r\n'), 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? '';
  return joinMessage(m.fields, body + '\r\n');
}
function replaceBody(fields: Field[], body: string, text: string): { fields: Field[]; body: string } {
  const type = value(fields, 'content-type') ?? 'text/plain';
  if (/^text\/plain(?:\s*;|$)/i.test(type)) return splitMessage(replacePlain(joinMessage(fields, body), text));
  if (!/^multipart\/mixed\s*;/i.test(type)) throw new UserError('Body edits require plain text or multipart/mixed with a first plain-text part. HTML/alternative drafts are refused.');
  // Refuse exotic, ambiguous or unquoted boundaries rather than guessing.
  const matches = [...type.matchAll(/\bboundary="([A-Za-z0-9_=+.-]{1,70})"/g)];
  if (matches.length !== 1) throw new UserError('Unsupported MIME boundary.');
  const boundary = matches[0]![1]!;
  const marker = `--${boundary}`;
  const lines = body.split('\r\n');
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) if (lines[i] === marker || lines[i] === `${marker}--`) starts.push(i);
  if (starts.length < 3 || lines[starts.at(-1)!] !== `${marker}--` || starts.slice(0, -1).some(i => lines[i] !== marker)) throw new UserError('Incomplete or malformed multipart draft.');
  const first = starts[0]!, second = starts[1]!;
  const part = lines.slice(first + 1, second).join('\r\n');
  const changed = replacePlain(part, text);
  // All subsequent MIME parts, boundaries, preamble and epilogue stay byte-identical.
  return { fields, body: [...lines.slice(0, first + 1), changed.replace(/\r\n$/, ''), ...lines.slice(second)].join('\r\n') };
}

export interface DraftRevisionPatch { to?: string[]; cc?: string[]; subject?: string; body?: string; }
/** Patch envelope headers and a supported body only; never reserialize attachments. */
export function patchDraft(raw: Buffer, patch: DraftRevisionPatch, domain: string): Buffer {
  if (!Object.values(patch).some(v => v !== undefined)) throw new UserError('Provide at least one change.');
  let { fields, body } = splitMessage(raw.toString('latin1'));
  if (/multipart\/(?:signed|encrypted)|application\/(?:pkcs7|x-pkcs7)/i.test(raw.toString('latin1'))) throw new UserError('Signed or encrypted drafts are refused.');
  if (patch.to !== undefined) set(fields, 'to', patch.to.length ? `To: ${recipients(patch.to)}` : undefined);
  if (patch.cc !== undefined) set(fields, 'cc', patch.cc.length ? `Cc: ${recipients(patch.cc)}` : undefined);
  if (patch.subject !== undefined) {
    if (!patch.subject.trim() || Array.from(patch.subject).length > 300 || /[\u0000-\u001f\u007f]/.test(patch.subject)) throw new UserError('Invalid draft subject.');
    set(fields, 'subject', `Subject: ${encodeText(patch.subject)}`);
  }
  if (patch.body !== undefined) {
    if (!patch.body.trim() || Array.from(patch.body).length > 20000 || /\u0000/.test(patch.body)) throw new UserError('Invalid draft body.');
    ({ fields, body } = replaceBody(fields, body, patch.body));
  }
  set(fields, 'message-id', `Message-ID: <${randomUUID()}@${domain}>`);
  return Buffer.from(joinMessage(fields, body), 'latin1');
}

export class DraftRevisionService {
  constructor(private readonly ownAddress: string, private readonly reader: MailReader, private readonly store: DraftStore, private readonly backup: Pick<BackupStore, 'save'>) {}

  private async load(id: string) {
    const folders = await this.reader.listMailboxes();
    const grant = authorizeDraft(folders);
    if (!folders.some(f => f.path === grant.mailbox && f.role === 'drafts' && f.roleBy === 'flag')) throw new UserError('Drafts folder must have the explicit server Drafts flag.');
    const ref = decodeRef(id);
    if (ref.path !== grant.mailbox) throw new UserError('Only messages in the verified Drafts folder can be revised.');
    const snapshot = await this.reader.fetchSource(ref);
    if (snapshot.truncated || !snapshot.summary.draft || snapshot.summary.id !== id) throw new UserError('Draft source is incomplete, no longer a draft, or identity changed. Nothing was written.');
    splitMessage(snapshot.source.toString('latin1'));
    const parsed = await simpleParser(snapshot.source);
    if (parsed.from?.value.length !== 1 || parsed.from.value[0]?.address?.toLowerCase() !== this.ownAddress.toLowerCase() || parsed.headers.has('sender')) throw new UserError('Only drafts from your own iCloud address without a Sender header can be revised.');
    return { ...snapshot, parsed, grant, hash: draftRevisionHash(snapshot.source) };
  }

  async inspect(id: string) {
    const s = await this.load(id);
    return { id, revisionHash: s.hash, subject: s.parsed.subject ?? '', to: s.parsed.to, cc: s.parsed.cc, text: s.parsed.text, hasHtml: !!s.parsed.html, attachments: s.parsed.attachments.map(a => ({ filename: a.filename, size: a.size })), copyOnly: true };
  }

  async revise(id: string, expectedHash: string, patch: DraftRevisionPatch) {
    const before = await this.load(id);
    if (before.hash !== expectedHash) throw new UserError('The draft changed. Inspect it again. Nothing was written.');
    const raw = patchDraft(before.source, patch, this.ownAddress.split('@')[1]!);
    const after = await simpleParser(raw);
    const addresses = (a: typeof after.to) => (Array.isArray(a) ? a : a ? [a] : []).flatMap(v => v.value.map(x => (x.address ?? '').toLowerCase()));
    const to = addresses(after.to), cc = addresses(after.cc);
    if (!to.length && !cc.length || to.length + cc.length > 20) throw new UserError('A draft requires 1 to 20 recipients in total.');
    for (const [wanted, actual] of [[patch.to, to], [patch.cc, cc]] as const) {
      if (wanted !== undefined && JSON.stringify(wanted.map(x => parseMailbox(x).address.toLowerCase())) !== JSON.stringify(actual)) throw new UserError('Recipient verification failed. Nothing was written.');
    }
    if (patch.subject !== undefined && after.subject !== patch.subject) throw new UserError('Subject verification failed. Nothing was written.');
    if (patch.body !== undefined && after.text?.replace(/\r\n?/g, '\n').trimEnd() !== patch.body.replace(/\r\n?/g, '\n').trimEnd()) throw new UserError('Body verification failed. Nothing was written.');
    const attachmentHashes = (p: typeof after) => p.attachments.map(a => [a.filename, a.contentType, a.contentId, a.contentDisposition, draftRevisionHash(a.content)]);
    if (JSON.stringify(attachmentHashes(before.parsed)) !== JSON.stringify(attachmentHashes(after)) || before.parsed.inReplyTo !== after.inReplyTo || JSON.stringify(before.parsed.references) !== JSON.stringify(after.references)) throw new UserError('Attachment or reply-reference verification failed. Nothing was written.');
    const saved = await this.backup.save(before.parsed.subject ?? 'Draft', before.source.toString('base64'));
    if ((await this.load(id)).hash !== expectedHash) throw new UserError('Draft changed after backup. Nothing was written; backup retained.');
    const made = await this.store.appendDraft(before.grant, raw);
    if (!made.id) throw new UserError('A revised draft may have been created but no verifiable ID was returned. Original and backup retained. Do not retry automatically; inspect Drafts in Apple Mail.');
    const check = await this.load(made.id);
    if (check.hash !== draftRevisionHash(raw)) throw new UserError('Revision readback differs from the submitted draft. Original and backup retained; inspect Drafts in Apple Mail. Do not retry automatically.');
    return { ...made, originalId: id, originalUnchanged: true, backup: saved.path, note: 'A revised COPY was saved, never sent. Review it in Apple Mail. The original draft remains; remove obsolete drafts manually.' };
  }
}
