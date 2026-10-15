# Notes formatting: supported fallback and native-style boundary

## Architecture and finding

CloudGPT creates notes with fixed JXA scripts and caller data passed as JSON,
never executable source. Folder grants and read-only tool registration remain
unchanged. Existing notes are never rewritten.

The public Notes scripting interface accepts HTML. Its h1/h2/h3 import is visual
font/bold formatting, not native Title/Heading/Subheading paragraph styles.
Adding CSS or different heading tags cannot reliably fix that distinction.

Reviewed reference: https://github.com/sweetrb/apple-notes-mcp at
4d489c65ae0285a02724ecd71ae5d2db7891b6dc, especially TECHNICAL_NOTES.md
“Rich Text” and native/private-helper/apple-notes-private-helper.m. That project
uses native/internal Notes objects and protobuf-backed structure for operations
beyond public scripting. Its probes also document that HTML export drops native
highlight, superscript/subscript and alignment. No upstream code was copied.

## Changes

Blank Markdown paragraph separators now produce explicit empty Notes blocks;
plain text paragraphs use the same spacing. Consecutive separators are bounded.
Existing lists, bold, italic, code and safe links are retained. Link URLs are
protected from emphasis rewriting. HTML input remains escaped.

create_note returns formatting.nativeHeadings=false. New optional
require_native_formatting=true refuses before any write instead of silently
promising native styles. Existing calls continue to work.

## Deferred native implementation

Native heading styles and native color highlights are not implemented. The safe
alternative is creating the visual draft and applying native styles in Notes.
A native helper would need explicit OS/version capability probing, native
readback tests, signed/distributed helper support, and isolated live macOS tests
before enabling mutations. Direct SQLite/protobuf writes or an unverified
private helper are inappropriate for the current integrity guarantee.

## Verification

Synthetic converter/service tests cover spacing, headings, lists, emphasis,
unsafe markup/URLs, grant checks and native-format refusal. A real Notes import
must still be checked on supported macOS versions; unit tests do not establish
native formatting support. On an isolated Mac create a disposable note with
all heading levels, both list types, bold/italic/code and blank paragraphs;
inspect the Format menu and confirm that headings remain visual-only.

Validation in the Linux review environment: typecheck passed. The regression
suite excluding the two macOS-only installation/service-config files passed
(586 passed, 2 macOS skips). The unfiltered run was attempted: the macOS tests
cannot run here, and the original tsx CLI launcher hit the sandbox's Unix-socket
restriction. The protocol tests now use node --import tsx directly and pass
without that socket. No app, installation or release was invoked.
