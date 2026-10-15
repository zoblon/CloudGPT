# Safe note revisions, without in-place rewriting

New tools: inspect_note_revision and create_note_revision. Existing tools keep
their schemas and behavior. Read-only mode exposes inspection only.

Inspect returns a complete bounded HTML export and a SHA-256 snapshot token.
The fixed JXA reader refuses locked notes, any attachment and failed attachment
inventories. Revision accepts 1–20 unique literal replacements within individual
HTML text nodes. It escapes replacement text and refuses unsupported tags or
attributes, including tables, resources, links and styled spans. It preserves the
accepted exported markup, not unexported native formatting.

The caller must explicitly accept the export limitation. The destination must
be an explicitly named private folder. A verified local JSON export backup is
written before creation; a second snapshot check rejects concurrent changes.
The Notes creation script rechecks the granted folder's sharing state.

The original is NEVER mutated or deleted and remains the authoritative native
backup, including any native styles missing from HTML export. The JSON backup
is an export, not a full native restoration archive. A new note ID is returned.
There is no automatic cleanup, retry or migration. Inspect copies in Notes;
a timeout may have created a copy even if no ID was returned.

In-place editing is intentionally unavailable: public Notes body assignment
rewrites the whole body and can destroy unsupported formatting/content. A
native helper requires separate macOS capability and integrity validation.
No database writes, UI keystrokes, private API writes or upstream code copying
were added. See sweetrb/apple-notes-mcp TECHNICAL_NOTES.md at
4d489c65ae0285a02724ecd71ae5d2db7891b6dc for the researched export limitations.

Tests use synthetic exports and fake app objects. Real Notes automation still
requires isolated macOS validation: create a disposable note, inspect/revise,
confirm original ID/body/date stay unchanged, compare the copy and verify the
backup's contents and owner-only permissions. Test denied Automation access,
unsupported markup, locked notes and attachments before considering release.

Linux review validation: typecheck passed; regression suite passed with 588 tests
and 2 macOS skips, excluding test/install.test.mjs and test/service-config.test.mjs
(the installer/launch-agent checks require macOS). The unfiltered run was also
attempted. MCP protocol tests now launch node --import tsx directly to avoid an
unnecessary Unix IPC socket in the tsx CLI. No live Notes library was accessed.
