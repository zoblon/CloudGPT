import { describe, expect, it, vi } from 'vitest';
import { editExportedNote, NoteRevisionService, noteRevisionHash, notesRevisionSnapshot, type NoteSnapshot } from '../src/core/notes/revision.js';
import { reviseNoteSchema, registerNoteRevisionTools } from '../src/mcp/noteRevisionTools.js';
import type { NoteBackend } from '../src/core/notes/service.js';
import { NoteGrant } from '../src/core/permissions.js';
import vm from 'node:vm';

const original: NoteSnapshot = { id: 'x-coredata://AAAA/ICNote/p1', title: 'T', folder: 'Notes', modified: '2026-10-15T10:00:00Z', html: '<div><h1>T</h1></div><div>Hello <b>world</b></div>' };
function setup() {
  const read = vi.fn(async () => ({ ...original }));
  const save = vi.fn(async () => ({ path: '/backup.json', file: 'backup.json' }));
  const create = vi.fn(async (grant: NoteGrant, html: string) => {
    expect(NoteGrant.isValid(grant)).toBe(true);
    expect(html).toContain('<b>friend</b>');
    return { id: 'new', title: 'T', folder: 'Notes' };
  });
  const folders = vi.fn(async () => [{ id: 'f', name: 'Notes', account: 'iCloud', shared: false, count: 1, isDefault: true }]);
  const service = new NoteRevisionService(read, { create, folders } as unknown as NoteBackend, { save });
  const input = { id: original.id, expectedHash: noteRevisionHash(original), edits: [{ find: 'world', replace: 'friend' }], folder: 'Notes', acknowledgeExportLimit: true };
  return { read, save, create, folders, service, input };
}

describe('targeted note copy revisions', () => {
  it('retains exported markup, escapes replacement and refuses ambiguous/cross-tag selectors', () => {
    expect(editExportedNote('<div>A <b>B</b></div>', [{ find: 'B', replace: '<img>' }])).toBe('<div>A <b>&lt;img&gt;</b></div>');
    for (const html of ['<div>x x</div>', '<div>xxx</div>']) expect(() => editExportedNote(html, [{ find: html.includes('xxx') ? 'xx' : 'x', replace: 'y' }])).toThrow(/exactly once/);
    expect(() => editExportedNote('<div>A <b>B</b></div>', [{ find: 'A B', replace: 'y' }])).toThrow(/exactly once/);
    for (const html of ['<img src="x">', '<table><tr></tr></table>', '<div onclick="x">x</div>', '<span style="color:red">x</span>']) expect(() => editExportedNote(html, [{ find: 'x', replace: 'y' }])).toThrow(/unsupported/);
  });
  it('backs up the exact export, checks freshness twice and creates only a copy', async () => {
    const x = setup();
    expect(await x.service.revise(x.input)).toMatchObject({ originalUnchanged: true, originalId: original.id, exportOnly: true });
    expect(x.save).toHaveBeenCalledWith('T', JSON.stringify(original));
    expect(x.read).toHaveBeenCalledTimes(2);
    expect(x.save.mock.invocationCallOrder[0]).toBeLessThan(x.create.mock.invocationCallOrder[0]!);
  });
  it('refuses stale snapshots, denied backup, ambiguous edits, shared targets and unacknowledged export loss', async () => {
    for (const kind of ['stale', 'backup', 'changed', 'ambiguous', 'shared', 'ack']) {
      const x = setup();
      if (kind === 'stale') x.input.expectedHash = '0'.repeat(64);
      if (kind === 'backup') x.save.mockRejectedValue(new Error('backup failed'));
      if (kind === 'changed') x.read.mockResolvedValueOnce(original).mockResolvedValue({ ...original, modified: 'later' });
      if (kind === 'ambiguous') x.input.edits[0]!.find = 'missing';
      if (kind === 'shared') x.folders.mockResolvedValue([{ id: 'f', name: 'Notes', account: 'iCloud', shared: true, count: 1, isDefault: true }]);
      if (kind === 'ack') x.input.acknowledgeExportLimit = false;
      await expect(x.service.revise(x.input)).rejects.toThrow();
      expect(x.create).not.toHaveBeenCalled();
    }
  });
  it('fails closed on locked notes, failed attachment inventory and attachments in the fixed script', () => {
    for (const state of ['locked', 'attachments', 'inventory']) {
      let bodyReads = 0;
      const note = { passwordProtected: () => state === 'locked', attachments: { id: () => { if (state === 'inventory') throw Error(); return ['attachment']; } }, body: () => { bodyReads++; return 'secret'; } };
      const context = vm.createContext({ Application: () => ({ notes: { byId: () => note } }) });
      const result = JSON.parse(vm.runInContext(`${notesRevisionSnapshot.source}\nrun(['{"id":"test"}'])`, context));
      expect(result.ok).toBe(false);
      expect(bodyReads).toBe(0);
    }
  });
  it('never registers a write tool in readonly mode; refuses unknown mutation fields', () => {
    const names: string[] = [];
    registerNoteRevisionTools({ registerTool: (name: string) => names.push(name) } as never, setup().service, true);
    expect(names).toEqual(['inspect_note_revision']);
    expect(reviseNoteSchema.safeParse({ id: original.id, expected_hash: '0'.repeat(64), edits: [{ find: 'a', replace: 'b' }], folder: 'Notes', acknowledge_export_limit: true, overwrite: true }).success).toBe(false);
  });
});
