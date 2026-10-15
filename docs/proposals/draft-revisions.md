# Non-destructive mail draft revisions

New tools: inspect_draft_revision and create_draft_revision. Existing draft
creation and IMAP interfaces are unchanged. Read-only mode exposes inspection
only. No SMTP, send command, deletion or expunge was added.

IMAP messages are immutable. Replacing an existing draft requires appending a
new message and removing the old UID. Because CloudGPT must not risk deleting
an active Apple Mail draft, this implementation creates a revised COPY and
leaves the original for the user to remove manually.

Inspect returns a SHA-256 token for a complete, untruncated draft from the
explicitly server-flagged Drafts folder. Revision requires that token, the
Draft flag and the user's own sender. An owner-only, readback-verified backup
is written under ~/Library/Application Support/icloud-mcp/draft-revisions/.
The .eml.b64 file contains the complete original RFC822 bytes encoded as Base64;
decode it to .eml before importing it into Mail. Backups are retained, without
automatic pruning. A second source check precedes APPEND. The append happens
once, without retries. Its UID is required for exact source readback.

To, Cc and subject can be patched without changing any MIME-body bytes.
Body changes support a single text/plain body or multipart/mixed whose first
part is a text/plain body. Subsequent MIME parts remain byte-identical.
Parsed attachment hashes/metadata and In-Reply-To/References are verified
before APPEND. The revision gets a new Message-ID; reply references stay.
Unknown envelope headers remain unchanged.

HTML/alternative body edits, signed/encrypted MIME, Bcc, resent headers,
ambiguous headers, unsupported boundaries, truncation, stale snapshots and
failed backups are refused. Header-only HTML revisions preserve the HTML.
No attachments can be added, removed or replaced. Keep Apple Mail closed while
revising a draft if possible. A later client autosave can still create another
version: this is not a distributed transaction or an in-place update.

If APPEND/readback is uncertain, the tool reports that a copy may exist and
instructs the caller not to retry automatically. Original and backup remain;
inspect Drafts manually. Exact readback may reject server normalization; that
is a conservative failure and never triggers cleanup or deletion.

Tests cover binary preservation, Unicode, reply headers, injection, unsupported
MIME, stale reads, backup failure, unknown APPEND outcome and readonly schemas.
Local IMAP integration tests also exercise the gateway. Real iCloud/Apple Mail
validation remains necessary before release, using a disposable draft with a
binary attachment and reply chain, and checking both original and revised UID.

Linux review validation: typecheck passed; regression suite passed with 591 tests
and 2 macOS skips, excluding test/install.test.mjs and test/service-config.test.mjs.
The unfiltered run was attempted; these two files require macOS. Protocol tests
use node --import tsx directly, avoiding the CLI's unnecessary Unix IPC socket.
No live iCloud account or running installation was accessed.
