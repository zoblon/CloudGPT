# iCloud implementation notes

These notes describe the implemented protocol boundaries. They are not a guarantee that every iCloud account has identical server behavior.

## CalDAV

Read queries request selected VEVENT properties to reduce payload. Such responses are incomplete and must never be used as a write source. Writes fetch the full resource first, verify permissions and ETag, use If-Match for changes and If-None-Match for creation, and update SEQUENCE/LAST-MODIFIED. Unknown time-zone identifiers trigger a full GET.

Shared-calendar detection is conservative: uncertain ownership or sharing is treated as shared. Shared targets require explicit naming; deletion in shared calendars is refused. Recurring edits preserve occurrence identity and exclusions. Moves only operate on eligible own events, save a backup, create and read back the target, then remove the source.

## CardDAV

Apple vCards can carry grouped labels (`item1.EMAIL` / `item1.X-ABLabel`). Birthdays without a real year are normalized to month/day. Photo data is not returned. Creates check duplicates; updates preserve unspecified fields, validate identity/ETag and first save a `.vcf` backup. Contacts and groups are never deleted.

## IMAP

Reads use EXAMINE and BODY.PEEK. Server-side MIME-header search may miss decoded Unicode text, so a bounded local check of recent decoded headers supplements matching. Long messages are paginated; search/thread results expose limits rather than claiming completeness.

Folder-role discovery must distinguish explicit server flags from name guesses. Mail trash requires an actual Trash flag. UID MOVE is issued directly and fails safely if unsupported; no fallback to COPY/Deleted/EXPUNGE is allowed. Organization and flag changes check message identity before modifying bounded batches.

Drafts are saved with Draft/Seen flags and verified through UIDPLUS/readback where applicable. The user reviews and sends drafts in their mail app. Forwarding can preserve existing attachments. PDF text is extracted locally; scanned images without a text layer are not OCRed. Calendar attachment import creates an own event without attendees or acceptance/rejection messages.

## Apple automation

Reminders and Notes use fixed JXA scripts on the executing Mac. macOS Automation consent is specific to the actual process. The scripting interface cannot reliably identify shared reminder lists or remove an existing reminder due date. Notes support reading and creation only; locked notes remain closed. These constraints are validated by tests with synthetic responses and need live installation checks.
