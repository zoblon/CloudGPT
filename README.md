# CloudGPT

<p align="center"><img src="assets/cloudgpt.png" width="240" alt="CloudGPT intertwined cloud logo"></p>

A private iCloud connector for ChatGPT, running on your Mac. Read calendars, contacts and mail; prepare drafts and manage events, reminders and notes through your own OpenAI Secure MCP Tunnel.

**Public source, private connection.** Each user needs their own Apple app-specific password, OpenAI runtime key, tunnel and ChatGPT account association. Publishing this repository does not expose an iCloud account or provide a hosted service.

## Features

- **Calendar:** read and search events, find free time, create and edit events, edit individual recurring occurrences, and import an emailed invitation as your own event without replying. Full mode supports deleting your own events and moving them between calendars, with a backup first.
- **Contacts:** search by name, address or group; list groups and upcoming birthdays/anniversaries; create with duplicate detection and edit with a `.vcf` backup. No contact or group deletion.
- **Mail:** read messages and threads without marking them read; extract text, PDF text and calendar attachments; prepare reply and forwarding drafts with existing attachments; organize messages and change read/flag status. No sending or permanent deletion.
- **Reminders and Notes:** use the local Apple apps through fixed automation scripts. Read, create, update and complete reminders; read and create notes. Existing notes are never changed, moved or deleted; locked notes are never opened.

## Install

Download the Apple Silicon ZIP from [Releases](https://github.com/zoblon/CloudGPT/releases/latest), verify its checksum, and follow the [setup guide](chatgpt/README.md). You need macOS, Node.js 20.11 or later, your own iCloud account and access to OpenAI's private tunnel feature. The Mac must stay awake and online with an available login Keychain.

Open **Setup.command**, then **Install at Login.command**. Create your own private tunnel connection in ChatGPT. Account, workspace and mobile availability depend on OpenAI; verify them on each device.

For an existing CloudGPT installation, unpack the new ZIP in a separate folder and open **Update.command**. The complete previous runtime is backed up before replacement and restored if the new tunnel does not become ready. Settings, credentials and tunnel association are preserved. Updates are manual; a GitHub release does not update another Mac automatically.

## Access modes

| Mode | Tools |
|---|---|
| `readonly` | 22 reading tools; no writes |
| `standard` (default) | 34 tools, including edits, drafts, message organization and reminder completion |
| `full` | 36 tools; also event deletion, mail trash and calendar moves |

The server enforces these tool boundaries. Calendar moves require `full` even through `update_event`, because the original is removed after a verified copy. Configure ChatGPT to require approval for write tools; the instruction to ask is not a server-authenticated human approval mechanism. If approval controls are unavailable, use `readonly`.

Shared calendars and note folders require explicit naming. No mail sending, calendar invitations, permanent mail deletion, reminder deletion or changes to existing notes.

## Plugin templates

The cloud-plugin ZIP contains English instructions and branding, **without an app ID**. It is a template, not an already connected ChatGPT plugin. Create your own tunnel-backed app first, then build a locally bound wrapper with your own app ID as described in the [setup guide](chatgpt/README.md). Never reuse someone else's binding. The standalone Mac runtime does not need this wrapper to establish its tunnel connection.

## Development

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build:chatgpt
npm run build:cloud-plugin
```

The macOS build needs Swift and one official tunnel-client archive for your CPU architecture, plus its `SHA256SUMS.txt`, in `build/tunnel-client/`. CI pins the client version and the build verifies its checksum. Packages include project and dependency license notices. [Development guide](docs/DEVELOPMENT.md) · [Upstream provenance](docs/UPSTREAM-ICLAUDE.md).

## Privacy, security and license

Credentials stay in the macOS Keychain. Requested tool results pass through OpenAI to your authorized ChatGPT context. Backups may contain personal data. See [Privacy](PRIVACY.md), [Security](SECURITY.md) and [MIT License](LICENSE).

CloudGPT is an independent project and is not affiliated with, endorsed by or sponsored by Apple or OpenAI. iCloud and macOS are trademarks of Apple Inc.; ChatGPT and GPT are trademarks of OpenAI. The new cloud mark was generated with AI for this project; it is not Apple's iCloud logo or OpenAI's logo. Older private versions used Apple-derived artwork and are not the source of the public project's artwork. See [Branding](docs/BRANDING.md).
