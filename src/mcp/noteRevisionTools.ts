import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { NoteRevisionService, noteRevisionHash } from '../core/notes/revision.js';
import { dataOutputSchema, dataResult } from '../core/untrusted.js';
import { guarded } from './safe.js';

const id = z.string().min(5).max(220);
export const reviseNoteSchema = z.strictObject({
  id,
  expected_hash: z.string().regex(/^[a-f0-9]{64}$/),
  edits: z.array(z.strictObject({ find: z.string().min(1).max(50000), replace: z.string().max(50000) })).min(1).max(20),
  folder: z.string().min(1).max(100).describe('Explicit private destination folder for the revised copy.'),
  acknowledge_export_limit: z.literal(true).describe('Only with user acceptance of an HTML-export copy: native styles may be missing. Original stays untouched.'),
});

export function registerNoteRevisionTools(server: McpServer, revisions: NoteRevisionService, readOnly = false) {
  server.registerTool('inspect_note_revision', {
    title: 'Inspect note for revision',
    description: 'Read a complete HTML export and revision hash for a safe COPY. Refuses locked notes, attachments and incomplete inventories. This does not establish native formatting fidelity.',
    inputSchema: z.strictObject({ id }), outputSchema: dataOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, a => guarded('inspect_note_revision', async () => {
    const snapshot = await revisions.inspect(a.id);
    return dataResult({ summary: 'Note export inspected for a copy revision.', source: 'Apple Notes HTML export', data: { ...snapshot, revisionHash: noteRevisionHash(snapshot), exportOnly: true } });
  }));
  if (readOnly) return;
  server.registerTool('create_note_revision', {
    title: 'Create revised note copy',
    description: 'Create a revised COPY using unique text replacements in supported HTML text nodes. NEVER modifies the original. Native formatting fidelity is not guaranteed; requires explicit acceptance of the export limitation. Refuses attachments, unsupported markup, shared targets, ambiguous matches and stale snapshots. Creates a verified export backup before creating the copy. Review in Notes; no automatic retry after uncertain failures.',
    inputSchema: reviseNoteSchema, outputSchema: dataOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, a => guarded('create_note_revision', async () => dataResult({ summary: 'Revised note COPY created. Original unchanged.', source: 'the revised note copy', data: await revisions.revise({ id: a.id, expectedHash: a.expected_hash, edits: a.edits, folder: a.folder, acknowledgeExportLimit: a.acknowledge_export_limit }) })));
}
