import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { DraftRevisionService } from '../core/mail/revision.js';
import { dataOutputSchema, dataResult } from '../core/untrusted.js';
import { guarded } from './safe.js';
const id = z.string().min(5).max(600);
const address = z.string().min(3).max(300);
export const reviseDraftSchema = z.strictObject({
  id, expected_hash: z.string().regex(/^[a-f0-9]{64}$/),
  to: z.array(address).max(20).optional(), cc: z.array(address).max(20).optional(),
  subject: z.string().min(1).max(300).optional(), body: z.string().min(1).max(20000).optional(),
});
export function registerDraftRevisionTools(server: McpServer, revisions: DraftRevisionService, readOnly = false) {
  server.registerTool('inspect_draft_revision', {
    title: 'Inspect mail draft for revision', description: 'Reads a complete draft snapshot and hash from the verified Drafts folder. Nothing is changed or sent.',
    inputSchema: z.strictObject({ id }), outputSchema: dataOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, a => guarded('inspect_draft_revision', async () => dataResult({ summary: 'Draft inspected for revision.', source: 'the iCloud draft', data: await revisions.inspect(a.id) })));
  if (readOnly) return;
  server.registerTool('create_draft_revision', {
    title: 'Create revised mail draft copy', description: 'Saves a revised COPY of an existing draft after a verified backup and freshness checks. Original remains unchanged. Changes To, Cc, subject and supported plain-text bodies. Keeps attachments and reply headers. Refuses truncated, signed, encrypted or unsafe MIME. HTML/alternative body editing is refused; header-only changes can preserve HTML. NEVER sends mail. Review the revised copy and remove obsolete drafts manually in Apple Mail. Do not automatically retry uncertain failures.',
    inputSchema: reviseDraftSchema, outputSchema: dataOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, a => guarded('create_draft_revision', async () => dataResult({ summary: 'Revised draft COPY saved. Original unchanged; nothing sent.', source: 'the revised mail draft', data: await revisions.revise(a.id, a.expected_hash, { ...(a.to !== undefined ? { to: a.to } : {}), ...(a.cc !== undefined ? { cc: a.cc } : {}), ...(a.subject !== undefined ? { subject: a.subject } : {}), ...(a.body !== undefined ? { body: a.body } : {}) }) })));
}
