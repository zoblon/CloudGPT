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
4. Open **Install CloudGPT.command**. It checks the package and detects any existing login service. On a new Mac, enter account addresses, time zone, a private default calendar (or leave it empty), mode and tunnel ID. Paste the Apple app-specific password and OpenAI runtime key with Command-V, then press Enter. `input present` confirms hidden input. The two secrets are stored separately in the macOS login Keychain; other clients' credentials are not read. Empty secret input keeps an existing value.
5. The same installer copies the runtime to Application Support, enables startup at Mac login, starts the background service and checks tunnel readiness. No separate setup, install-at-login or update command is needed. Stop an old manually started tunnel with Control-C before installing the service. If installation fails, use **Diagnose.command** and resolve access/Keychain errors. **Status.command** checks service and readiness. Completed valid setup is reused when you run the installer again; an invalid existing configuration is never silently replaced.
6. The installer opens a **local connection assistant** after checking the live tunnel and matching its ID against your settings. You can reopen and recheck with **Connect ChatGPT.command**. Follow its link to ChatGPT Plugins, choose **Add custom MCP server** and name it CloudGPT. Explicitly select **Tunnel**: the field must change to **Tunnel-ID**, not **Server-URL**. Copy the supplied ID and wait for ChatGPT to recognize the tunnel name. Choose **No authentication** for this private stdio connection. The assistant includes the unbound branding/skill ZIP for **Upload plugin archive** in the same dialog; no separate download or manual app ID is needed for this path. Review the warning, create the plugin and install it for your own account. Tunnel permissions and account association control access; there is no public unauthenticated iCloud endpoint.
7. Start a new chat, select the plugin and test **List my calendars**. Configure write tools to require confirmation; use `readonly` if the client has no approval controls. Approval is a client setting and model instruction, not proof of an authenticated human approval at the server.
8. On iPhone and iPad, select the same account/workspace and verify the connection separately in a new chat. A desktop test does not establish mobile availability.

macOS may ask to open a downloaded file, access Keychain or control an app. Check the source and executable path. Do not disable macOS protections.

## Update an existing service

Unpack the new ZIP separately and open **Install CloudGPT.command**, the same entry point used for initial setup. It detects the installed service and automatically runs the safe update without asking for credentials again. The updater stages the complete package, backs up the previous runtime under `~/Library/Application Support/CloudGPT/backups/`, replaces it, and checks tunnel readiness. It restores and checks the previous runtime if the candidate fails. Settings, mode, tunnel ID and Keychain entries are preserved. Review any Keychain prompt for the known helper. **Update.command** is an alias for the same complete installer and connection handoff.

The installer checks the new local runtime and opens the connection assistant. **Keep and refresh the existing working ChatGPT connection**; configure approval for new write tools and start a new chat. Do not delete it for routine updates. Mac readiness is reported separately from ChatGPT installation. Changes to the GitHub repository do not update your running Mac, and a build cannot verify your account installation. If ChatGPT reports **Connector not found**, recreate the connection through the assistant. Reuploading an archive that points to the deleted app ID cannot fix that error.

Restarts wait for the previous launchd job to be removed and discard its old health address before starting the replacement. Readiness checks match the running tunnel ID against the configuration.

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

## Connection troubleshooting

If a `tunnel_…` value makes the URL field red, **Server URL is still selected**. Select **Tunnel** and verify the **Tunnel-ID** field label first. Do not turn the ID into a guessed `api.openai.com` URL: the control-plane address is not the MCP connection address. If discovery still fails in Tunnel mode, check the target ChatGPT account/workspace association and the operator’s Tunnels Read + Use permissions in Platform. A locally ready tunnel does not prove ChatGPT access.

The connection assistant checks readiness, ID consistency and the included ZIP checksum without reading credentials. It also checks that the downloaded package matches the installed runtime version. Its generated HTML and ZIP live under `~/Library/Application Support/CloudGPT/connection/` (private filesystem permissions). The page contains the tunnel ID, never a key. It is an offline snapshot with a check time; reopen **Connect ChatGPT.command** to check again. It does not log into ChatGPT or claim account installation automatically. A real calendar read in a new ChatGPT conversation remains the acceptance test.

## Advanced private cloud-plugin wrapper

Normally use the archive supplied by the connection assistant in ChatGPT’s custom MCP dialog. The released cloud-plugin ZIP is an **unbound template**, not an account connection. If you separately maintain an existing private wrapper, first verify that its app ID still exists and works in your own ChatGPT account, then build locally:

```sh
node scripts/build-cloud-plugin.mjs --app-id YOUR_APP_ID
```

The result ends in `-bound.zip` and includes your own `.app.json`. Keep it private. The builder cannot verify ChatGPT ownership or existence of that app ID. Never copy a binding from an old ZIP without checking it; recreate a deleted connector first. The default `npm run build:cloud-plugin` produces the distributable template with no app binding. The wrapper supplies branding and a skill; it never replaces the Mac runtime. Refreshing MCP discovery does not upload that skill automatically.

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
