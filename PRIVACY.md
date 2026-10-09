# Privacy

CloudGPT runs as a background service on your Mac and connects to your private OpenAI Secure MCP Tunnel. The project has no analytics or telemetry; the author receives no data. Tool results are transmitted to your authorized ChatGPT account through OpenAI and processed under OpenAI's applicable privacy terms.

## Access and data flow

Calendar, contacts and mail are accessed directly from Apple's iCloud servers over TLS using your app-specific password (CalDAV, CardDAV, IMAP). PDF attachment text is extracted locally; there is no external PDF or OCR service.

For Apple Reminders and Notes the automation component makes no network connection. It controls the local apps through fixed JXA scripts and `osascript`; the apps handle their own iCloud synchronization. macOS permission for each app must be granted on the executing Mac. The readonly mode prevents writes through every tool, including automation.

## Local storage

- Apple app password and OpenAI runtime key are separate entries in the macOS login Keychain, service `de.rehkopf.icloud-chatgpt`. They are never included in packages, configuration files, errors or tool output.
- Account addresses, time zone, mode and tunnel ID are stored in `~/Library/Application Support/icloud-chatgpt/config.json` (0600). The tunnel profile and health URL live in the same private directory.
- Events are backed up before deletion or calendar moves in `~/Library/Application Support/icloud-mcp/deleted/`; contacts before changes in `~/Library/Application Support/icloud-mcp/contacts-backup/`. Backups contain personal data in plain text, use private filesystem permissions and are retained for 90 days / at most 200 files per folder. These folders retain the upstream path and are shared with iClaude if both use them.
- Runtime files and service logs live under `~/Library/Application Support/CloudGPT/`. The updater preserves the complete previous runtime under `backups/`; these runtime snapshots do not contain the separate configuration or Keychain entries. They are not pruned automatically.
- CloudGPT application logs record operation names, status and duration, not personal content or credentials. Third-party client logs and ChatGPT conversation retention are governed separately. Reminders and notes are not persistently copied by CloudGPT.

## Removal

Use `Remove from Login.command`, disconnect the private ChatGPT plugin, and revoke the tunnel/runtime key if no longer needed. Remove only the two CloudGPT Keychain entries and its own configuration/runtime directories. Revoking the Apple app password may affect other clients using the same password. The shared `icloud-mcp` backup directory should only be removed after checking whether iClaude still needs it.
