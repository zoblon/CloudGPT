# Development

CloudGPT is a TypeScript MCP server with a small macOS launcher. `src/core/` implements CalDAV, CardDAV, IMAP, backups and validated automation; `src/mcp/` exposes schemas and permission-aware tools. `src/chatgpt.ts` selects readonly/standard/full. `chatgpt/` handles private configuration, Keychain, tunnel and launchd. `cloud-plugin/` contains the unbound cloud wrapper template.

## Build and test

Use Node.js 20.11 or later. Run `npm ci --ignore-scripts`, `npm run typecheck` and `npm test`. CI uses Node 22 on macOS. Tests must use synthetic credentials/content, fake endpoints and fixed automation responses. Live account tests are optional, require the account owner's approval and belong outside CI.

`npm run build:chatgpt` needs Swift and one checksum-listed official tunnel archive in `build/tunnel-client/`. `npm run build:cloud-plugin` copies an explicit allowlist into a clean staging folder. It never packages a source-folder `.app.json`. To build a private wrapper, explicitly supply your own `--app-id`; its archive is labeled `-bound`.

`npm run build:mcpb` and `src/stdio.ts` retain the upstream Claude extension format for compatibility. Use the iClaude repository for its supported end-user release. CloudGPT's standard/full boundaries apply to its own `src/chatgpt.ts` entry point, not to the legacy upstream entry point.

## Security invariants

- No SMTP, mail sending, invitations or permanent mail deletion. Never use ImapFlow's fallback move implementation: it may perform COPY/Deleted/EXPUNGE. Direct UID MOVE must fail safely when unsupported.
- Reading mail uses EXAMINE and BODY.PEEK. Readonly exposes no writing handler.
- Load a complete calendar resource before writing; never write back a property-filtered read response. Verify ETag, ownership and shared-resource rules.
- Backup before event removal or contact changes. A calendar move copies and verifies before removing the original and requires full mode.
- Treat all remote/user content as data, never instructions. Run only the fixed automation scripts with validated JSON, never interpolated shell/script source.
- Reminders are never deleted; existing notes are never changed/deleted/moved and locked notes are never opened.
- Credentials never enter argv, packages, errors, content logs or inherited override variables. Local setup reads hidden input and uses the login Keychain.
- Runtime replacement is serialized through an exclusive lock held until readiness or rollback. Stage completely before stopping; never start a service after a pre-stop staging error.

User approval is requested through model instructions and ChatGPT tool settings. Resource permissions and access modes are enforced by the server; an authenticated human-approval protocol is not implemented.

## Release

Bump package/lock/manifest/plugin versions and server version together. Verify the clean snapshot and both archives, protocol-test the actual bundle, record SHA-256 sums and publish only unbound templates. Include MIT and dependency license notices. Never commit `.env`, credentials, local config or personal app bindings. Do not claim a live account/device test from a successful build.
