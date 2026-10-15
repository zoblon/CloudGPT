import { describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import { simpleParser } from 'mailparser';
import { DraftRevisionService, draftRevisionHash, patchDraft } from '../src/core/mail/revision.js';
import { buildDraft } from '../src/core/mail/mime.js';
import { DraftGrant } from '../src/core/permissions.js';
import type { MailReader } from '../src/core/mail/types.js';
import { registerDraftRevisionTools, reviseDraftSchema } from '../src/mcp/draftRevisionTools.js';
const own = 'me@icloud.com';
const id = 'Drafts|123|1';
const source = () => buildDraft({ from: { address: own }, to: [{ address: 'you@example.com' }], cc: [], subject: 'Original', body: 'Hello', inReplyTo: 'parent@example.com', references: ['root@example.com', 'parent@example.com'], date: DateTime.utc(), attachments: [{ filename: 'binary.dat', contentType: 'application/octet-stream', data: Buffer.from([0, 255, 128, 42]) }] }, 'icloud.com').raw;
function setup() {
  const original = source();
  let stored: Buffer | undefined;
  const load = vi.fn(async (ref: { uid: number }) => ({ source: ref.uid === 1 ? original : stored!, summary: { id: ref.uid === 1 ? id : 'Drafts|123|2', draft: true }, truncated: false, attachments: [] }));
  const reader = { listMailboxes: vi.fn(async () => [{ path: 'Drafts', role: 'drafts', roleBy: 'flag' }]), fetchSource: load } as unknown as MailReader;
  const appendDraft = vi.fn(async (grant: DraftGrant, raw: Buffer) => { expect(DraftGrant.isValid(grant)).toBe(true); stored = raw; return { mailbox: 'Drafts', id: 'Drafts|123|2' }; });
  const save = vi.fn(async (_title: string, _source: string) => ({ path: '/draft.eml.b64', file: 'draft.eml.b64' }));
  return { original, reader, load, appendDraft, save, service: new DraftRevisionService(own, reader, { appendDraft }, { save }) };
}
describe('draft MIME revisions', () => {
  it('updates recipients, Unicode subject and body while preserving attachment bytes and reply headers', async () => {
    const original = source();
    const raw = patchDraft(original, { to: ['"Tobi" <tobi@example.com>'], cc: ['Other <other@example.com>'], subject: 'Grüße 😀', body: 'Neue Nachricht\nÄÖÜ' }, 'icloud.com');
    const before = await simpleParser(original), after = await simpleParser(raw);
    expect(after.subject).toBe('Grüße 😀');
    expect(after.text?.trim()).toBe('Neue Nachricht\nÄÖÜ');
    expect(after.attachments[0]?.content.equals(before.attachments[0]!.content)).toBe(true);
    expect(after.inReplyTo).toBe(before.inReplyTo);
    expect(after.references).toEqual(before.references);
    expect(after.messageId).not.toBe(before.messageId);
    // The whole attachment MIME part, including original headers, is byte-identical.
    const tail = original.toString('latin1').slice(original.toString('latin1').indexOf('Content-Type: application/octet-stream'));
    expect(raw.toString('latin1').endsWith(tail)).toBe(true);
  });
  it('keeps the entire MIME body byte-identical for header-only changes, including HTML', () => {
    const raw = Buffer.from('From: me@icloud.com\r\nTo: a@example.com\r\nSubject: Old\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<b>Hello</b>\r\n');
    expect(patchDraft(raw, { subject: 'New' }, 'icloud.com').toString().split('\r\n\r\n')[1]).toBe('<b>Hello</b>\r\n');
    expect(() => patchDraft(raw, { body: 'New' }, 'icloud.com')).toThrow(/plain text|plain-text/);
  });
  it('refuses signed/encrypted drafts, ambiguous headers, header injection and unsupported MIME bodies', () => {
    const raw = source();
    for (const patch of [{ to: ['x@example.com\r\nBcc: evil@example.com'] }, { subject: 'x\r\nBcc: evil@example.com' }, {}]) expect(() => patchDraft(raw, patch, 'icloud.com')).toThrow();
    for (const type of ['multipart/signed', 'multipart/encrypted', 'multipart/alternative']) {
      const altered = Buffer.from(raw.toString().replace('multipart/mixed', type));
      expect(() => patchDraft(altered, { body: 'new' }, 'icloud.com')).toThrow();
    }
    expect(() => patchDraft(Buffer.from('From: me@icloud.com\r\nSubject: A\r\nSubject: B\r\n\r\nx'), { subject: 'C' }, 'icloud.com')).toThrow(/duplicate/);
  });
  it('backs up original raw bytes, rechecks freshness, appends once and verifies readback', async () => {
    const x = setup();
    const inspected = await x.service.inspect(id);
    const result = await x.service.revise(id, inspected.revisionHash, { body: 'New body' });
    expect(result).toMatchObject({ originalUnchanged: true, originalId: id, id: 'Drafts|123|2' });
    expect(Buffer.from(x.save.mock.calls[0]![1] as string, 'base64').equals(x.original)).toBe(true);
    expect(x.appendDraft).toHaveBeenCalledTimes(1);
    expect(x.save.mock.invocationCallOrder[0]).toBeLessThan(x.appendDraft.mock.invocationCallOrder[0]!);
  });
  it('fails before APPEND on stale source, failed backup, missing Draft flag, truncation, foreign sender and wrong folder', async () => {
    for (const kind of ['stale', 'backup', 'changed', 'flag', 'truncated', 'sender', 'folder', 'recipient']) {
      const x = setup();
      if (kind === 'backup') x.save.mockRejectedValue(new Error('failed'));
      const response = { source: x.original, summary: { id, draft: true }, truncated: false, attachments: [] };
      if (kind === 'changed') x.load.mockResolvedValueOnce(response).mockResolvedValue({ ...response, source: Buffer.from(x.original.toString().replace('Original', 'CHANGED')) });
      if (kind === 'flag') x.load.mockResolvedValue({ ...response, summary: { id, draft: false } });
      if (kind === 'truncated') x.load.mockResolvedValue({ ...response, truncated: true });
      if (kind === 'sender') x.load.mockResolvedValue({ ...response, source: Buffer.from(x.original.toString().replace(own, 'other@icloud.com')) });
      await expect(x.service.revise(kind === 'folder' ? 'INBOX|123|1' : id, kind === 'stale' ? '0'.repeat(64) : draftRevisionHash(x.original), kind === 'recipient' ? { to: [], cc: [] } : { subject: 'new' })).rejects.toThrow();
      expect(x.appendDraft, kind).not.toHaveBeenCalled();
    }
  });
  it('reports uncertain success without retrying or touching original', async () => {
    const x = setup();
    x.appendDraft.mockResolvedValue({ mailbox: 'Drafts' } as never);
    await expect(x.service.revise(id, draftRevisionHash(x.original), { subject: 'new' })).rejects.toThrow(/Do not retry automatically/);
    expect(x.appendDraft).toHaveBeenCalledTimes(1);
    expect(x.save).toHaveBeenCalledTimes(1);
  });
  it('refuses guessed Drafts folders and reports failed readback after one append', async () => {
    const guessed = setup();
    vi.spyOn(guessed.reader, 'listMailboxes').mockResolvedValue([{ path: 'Drafts', name: 'Drafts', role: 'drafts', roleBy: 'name' }]);
    await expect(guessed.service.inspect(id)).rejects.toThrow(/explicit server Drafts flag/);
    const x = setup();
    const response = { source: x.original, summary: { id, draft: true }, truncated: false, attachments: [] };
    x.load.mockResolvedValueOnce(response).mockResolvedValueOnce(response).mockResolvedValue({ ...response, summary: { id: 'Drafts|123|2', draft: true } });
    await expect(x.service.revise(id, draftRevisionHash(x.original), { subject: 'new' })).rejects.toThrow(/readback differs/);
    expect(x.appendDraft).toHaveBeenCalledTimes(1);
  });
  it('exposes inspection only in readonly and rejects send, Bcc and attachment arguments', () => {
    const names: string[] = [];
    registerDraftRevisionTools({ registerTool: (name: string) => names.push(name) } as never, setup().service, true);
    expect(names).toEqual(['inspect_draft_revision']);
    for (const field of ['send', 'bcc', 'from', 'attachments']) expect(reviseDraftSchema.safeParse({ id, expected_hash: '0'.repeat(64), subject: 'new', [field]: true }).success).toBe(false);
  });
});
