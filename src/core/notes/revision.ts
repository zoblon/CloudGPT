import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ScriptRunner, AutomationScript } from '../automation/runner.js';
import type { BackupStore } from '../calendar/backup.js';
import { UserError } from '../errors.js';
import { authorizeNoteCreate } from '../permissions.js';
import type { NoteBackend } from './service.js';
import { escapeHtml, MAX_NOTE_CHARS } from './markdown.js';

const snapshotSchema = z.object({ id: z.string(), title: z.string(), folder: z.string(), modified: z.string(), html: z.string().max(150_000) });
export type NoteSnapshot = z.infer<typeof snapshotSchema>;
export const notesRevisionSnapshot: AutomationScript = {
  name: 'notesRevisionSnapshot', app: 'Notes', source: String.raw`
function run(argv) {
  try {
    var input = JSON.parse(argv[0]), app = Application('Notes'), n = app.notes.byId(input.id);
    if (n.passwordProtected()) throw new Error('locked');
    // No catch-and-empty fallback: a failed attachment inventory is a refusal.
    if (n.attachments.id().length !== 0) throw new Error('attachments');
    var before = n.modificationDate().toISOString();
    var out = { id: n.id(), title: n.name(), folder: n.container().name(), modified: before, html: n.body() };
    if (n.modificationDate().toISOString() !== before) throw new Error('changed');
    return JSON.stringify({ ok: true, data: out });
  } catch (e) {
    return JSON.stringify({ ok: false, code: 'UNSAFE_REVISION', message: 'Cannot safely snapshot this note. Locked notes, attachments, changed notes or an incomplete inventory are refused. Nothing was written.' });
  }
}`,
};

export const noteRevisionHash = (s: NoteSnapshot) => createHash('sha256').update(JSON.stringify(s)).digest('hex');

/** Edit only a unique, complete text-node substring; never markup or ranges across tags. */
export function editExportedNote(html: string, edits: Array<{ find: string; replace: string }>): string {
  // A deliberately narrow HTML export subset. No resources, tables, checklists,
  // event handlers, unknown elements/attributes or CSS are imported into a copy.
  const tag = /<\/?(?:div|p|h[1-3]|br|b|strong|i|em|u|s|strike|tt|pre|code|ul|ol|li)\s*\/?>/i;
  const tokens = html.split(/(<[^>]*>)/g);
  const stack: string[] = [];
  for (const token of tokens) {
    if (token.startsWith('<') && (!tag.test(token) || tag.exec(token)?.[0] !== token)) {
      throw new UserError('This HTML export has unsupported formatting or content. Edit the original in Apple Notes. Nothing was created.');
    }
    if (token.startsWith('<')) {
      const name = /^<\/?([a-z0-9]+)/i.exec(token)![1]!.toLowerCase();
      if (name !== 'br') {
        if (token.startsWith('</')) {
          if (stack.pop() !== name) throw new UserError('Malformed HTML export. Nothing was created.');
        } else stack.push(name);
      }
    }
  }
  if (stack.length) throw new UserError('Incomplete HTML export. Nothing was created.');
  if (!edits.length || edits.length > 20) throw new UserError('Provide 1 to 20 targeted text replacements.');
  let out = html;
  for (const edit of edits) {
    if (!edit.find || edit.find === edit.replace || /[\u0000-\u001f\u007f]/.test(edit.find + edit.replace)) throw new UserError('Use nonempty, different text within one paragraph; control characters are refused.');
    if (edit.find.length + edit.replace.length > MAX_NOTE_CHARS) throw new UserError('Replacement text is too long.');
    const find = escapeHtml(edit.find), replacement = escapeHtml(edit.replace);
    const parts = out.split(/(<[^>]*>)/g);
    let hits = 0;
    for (let i = 0; i < parts.length; i += 2) {
      const text = parts[i]!;
      // Count overlapping occurrences too, so a selector can never be ambiguous.
      for (let pos = text.indexOf(find); pos >= 0; pos = text.indexOf(find, pos + 1)) hits++;
    }
    if (hits !== 1) throw new UserError('The selected text must occur exactly once within one HTML text node. Nothing was created.');
    for (let i = 0; i < parts.length; i += 2) parts[i] = parts[i]!.replace(find, () => replacement);
    out = parts.join('');
  }
  if (out.length > 150_000) throw new UserError('The resulting note is too large.');
  return out;
}

export class NoteRevisionService {
  constructor(private readonly read: (id: string) => Promise<NoteSnapshot>, private readonly backend: NoteBackend, private readonly backup: Pick<BackupStore, 'save'>) {}

  async inspect(id: string) {
    if (!/^x-coredata:\/\/[^\s]{5,200}$/.test(id)) throw new UserError('Invalid note ID.');
    const s = snapshotSchema.parse(await this.read(id));
    if (s.id !== id) throw new UserError('Note identity mismatch.');
    return s;
  }

  async revise(a: { id: string; expectedHash: string; edits: Array<{ find: string; replace: string }>; folder: string; acknowledgeExportLimit: boolean }) {
    if (a.acknowledgeExportLimit !== true) throw new UserError('Acknowledge that the copy preserves exported HTML only; native styles may be absent. The original remains unchanged.');
    const before = await this.inspect(a.id);
    if (noteRevisionHash(before) !== a.expectedHash) throw new UserError('The note changed. Inspect it again. Nothing was created.');
    const html = editExportedNote(before.html, a.edits);
    const grant = authorizeNoteCreate({ folders: await this.backend.folders(), folder: a.folder });
    if (grant.shared) throw new UserError('Revision copies require a private folder.');
    const saved = await this.backup.save(before.title, JSON.stringify(before));
    if (noteRevisionHash(await this.inspect(a.id)) !== a.expectedHash) throw new UserError('The note changed after backup. Nothing was created. The export backup was retained.');
    const made = await this.backend.create(grant, html);
    return { ...made, originalId: a.id, backup: saved.path, originalUnchanged: true, exportOnly: true, note: 'A revised COPY was created. The original is the authoritative native backup. The JSON backup contains exported HTML only, not native Notes data.' };
  }
}

export const jxaNoteRevisionReader = (runner: ScriptRunner) => (id: string) => runner.run(notesRevisionSnapshot, { id }, snapshotSchema);
