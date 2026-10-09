# CloudGPT setup

CloudGPT runs a background service on your Mac and connects it to your own ChatGPT account through OpenAI's Secure MCP Tunnel. An online, awake Mac, available login Keychain and working tunnel are required. This is a private connection, not a public hosted connector.

## Requirements

- macOS with Node.js 20.11 or later (`node --version`). Downloaded runtime packages include the bundled server, native Keychain helper and checksum-verified tunnel client; no npm installation is needed.
- Your Apple Account email, iCloud Mail address and an **app-specific password** from [account.apple.com](https://account.apple.com). Never use the main account password.
- An OpenAI account/workspace with private tunnel access and a dedicated runtime key. Check platform access and billing separately; a ChatGPT subscription does not guarantee tunnel access.

## Initial setup

1. Unpack the ZIP into a new folder. The `macos-arm64` package is for Apple Silicon. Intel Macs need a source build with the matching `darwin-amd64` tunnel client.
2. Create a **private** tunnel at [OpenAI Platform → Tunnels](https://platform.openai.com/settings/organization/tunnels). Associate it with the intended ChatGPT account/workspace; platform organization membership alone may not provide ChatGPT access. Management requires Tunnels Read + Manage, runtime use requires Read + Use.
3. Create a dedicated runtime API key with Tunnels Read + Use. Do not use an admin key or put credentials in chat, source files or shell arguments.
4. Open **Setup.command**. Enter account addresses, time zone, a private default calendar (or leave it empty), mode and tunnel ID. Paste the Apple app-specific password and OpenAI runtime key with Command-V, then press Enter. `input present` confirms hidden input. The two secrets are stored separately in the macOS login Keychain; other clients' credentials are not read. Empty secret input keeps an existing value.
5. Open **Diagnose.command**, resolve access/Keychain errors, then open **Install at Login.command**. Stop an old manually started tunnel with Control-C before installing the service. The runtime is copied to Application Support and starts now and at future Mac logins. **Status.command** checks service and readiness.
6. In [ChatGPT Plugins](https://chatgpt.com/plugins), choose **Add custom MCP server**, name it CloudGPT, select **Tunnel** and your tunnel ID, then create/install it as a plugin. For this private stdio tunnel choose **No authentication**: the tunnel's OpenAI permissions and account association control access. Grant access only to your own account/workspace. There is no public unauthenticated iCloud endpoint.
7. Start a new chat, select the plugin and test **List my calendars**. Configure write tools to require confirmation; use `readonly` if the client has no approval controls. Approval is a client setting and model instruction, not proof of an authenticated human approval at the server.
8. On iPhone and iPad, select the same account/workspace and verify the connection separately in a new chat. A desktop test does not establish mobile availability.

macOS may ask to open a downloaded file, access Keychain or control an app. Check the source and executable path. Do not disable macOS protections.

## Update an existing service

Unpack the new ZIP separately and open **Update.command**. The updater stages the complete package, backs up the previous runtime under `~/Library/Application Support/CloudGPT/backups/`, replaces it, and checks tunnel readiness. It restores and checks the previous runtime if the candidate fails. Settings, mode, tunnel ID and Keychain entries are preserved. Review any Keychain prompt for the known helper.

Refresh the existing connection in ChatGPT, configure approval for new write tools and start a new chat. Changes to the GitHub repository do not update your running Mac. A build on a different Mac cannot verify your installation.

Updates hold an exclusive filesystem lock through readiness or recovery. After a crash, `.cloudgpt-update.lock` can remain under Application Support/CloudGPT. Verify that no updater is running before removing that lock and checking service status. Old runtime backups are not automatically pruned.

## Reminders and Notes permissions

Fixed JXA scripts control the Apple apps locally. Grant Automation permission to the process actually running CloudGPT (often Node, Terminal or its launcher). Permission granted to Claude does not automatically cover this service. Open the apps once if necessary and inspect **System Settings → Privacy & Security → Automation**. Repeat a reading call through the background service after granting access; a ready tunnel does not prove Automation permission.

Reminders can be read, created, edited and completed, never deleted. Removing an existing due date is unsupported and rejected. Apple's scripting interface does not reliably identify shared reminder lists, so explicitly select the target list. Notes can be read and created only. Locked notes stay locked; shared note folders require the exact `shared_folder` name.

## Modes and boundaries

`readonly` exposes 22 reading tools; `standard` exposes 34 tools; `full` exposes 36 tools, adding deletion of your own events, moving events between calendars and trashing mail. Change the mode with **Setup.command**, run **Restart.command**, refresh ChatGPT and start a new chat.

Reads never mark mail read. No sending, permanent mail deletion, contact/group deletion, attendees or invitations. Shared calendars need an exact `shared_calendar`; they cannot be deleted from. Single recurring occurrences use `occurrence_start`. Calendar moves use `move_to_calendar`, require `full` and cannot be combined with other changes. Review and send drafts yourself in Apple Mail.

## Local storage and removal

- Settings: `~/Library/Application Support/icloud-chatgpt/config.json` (0600), containing account addresses and settings, not passwords. Tunnel profile and health URL are in the same private folder.
- Keychain service: `de.rehkopf.icloud-chatgpt`, accounts `icloud` and `openai-runtime`.
- Runtime/logs/backups: `~/Library/Application Support/CloudGPT/`; LaunchAgent: `~/Library/LaunchAgents/de.rehkopf.cloudgpt.plist`. These stable names are retained for upgrades.
- Event backups: `~/Library/Application Support/icloud-mcp/deleted/`; contact backups: `~/Library/Application Support/icloud-mcp/contacts-backup/`. These upstream paths may be shared with iClaude. Retention is 90 days / at most 200 files per folder; backup failure blocks the write. They contain personal data.

**Stop.command** stops the service until the next login; **Remove from Login.command** removes the login service while retaining package, settings and credentials. Disconnect the ChatGPT plugin and revoke the tunnel/runtime key if no longer needed. Remove only this service's Keychain entries and folders. Revoking an Apple app password can affect other clients using it; inspect shared backup folders before deleting them.

## Optional cloud-plugin wrapper

The released cloud-plugin ZIP is an **unbound template**. It cannot connect to someone else's account and is not ready to install as a connected plugin. After creating your own tunnel-backed app, find its app ID in your account and build the wrapper locally:

```sh
node scripts/build-cloud-plugin.mjs --app-id YOUR_APP_ID
```

The result ends in `-bound.zip` and includes your own `.app.json`. Keep it private. The default `npm run build:cloud-plugin` produces the distributable template with no app binding. The wrapper supplies branding and a skill; it never replaces the Mac runtime. Refreshing MCP discovery does not upload that skill automatically.

`chatgpt/plugin.json`, `mcp.json` and `skills/` also form a local stdio agent plugin; this local package alone cannot run on web/iOS. Tunnel connections are not sufficient for submission to a public ChatGPT plugin directory. Source publication does not change that.

## Verify your installation

- Read calendars, tomorrow's events, mail folders and one message; confirm in Apple Mail that it remains unread.
- Read reminder lists and note folders through the installed service. Check actual Automation permissions.
- With your explicit approval, use only made-up objects in a private test calendar, test contact, test note/list and test messages. Verify event/contact backups and draft contents; send nothing. Never test against client data or shared calendars.
- In `full`, delete only a designated test event and trash only a designated test message. Check the backup and Trash.
- Verify iPhone and iPad separately. Stop the tunnel and confirm a connection error; restart and repeat a read. Check a real Mac logout/login separately.
- In `readonly`, no writing tool may be available or callable. In `standard`, deletion/trash are absent and calendar moves fail.

Automatic tests use simulated endpoints and automation responses. They verify protocol, permissions, backups and failure handling; they do not certify real accounts or devices.

## Sources and builds

- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [Connect a custom MCP server](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Plugins](https://learn.chatgpt.com/docs/plugins)
- [Official tunnel client](https://github.com/openai/tunnel-client/releases)

Reviewed 2026-10-09. API/UI availability may change. For source builds, download exactly one official architecture-matching tunnel client and its checksum list to `build/tunnel-client/`, then run typecheck, tests and `npm run build:chatgpt`. `bin/PROVENANCE.json` records the exact included client release and SHA-256. There are no automatic downloads or silent client upgrades at runtime.
