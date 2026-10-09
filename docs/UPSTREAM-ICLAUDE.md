# Upstream provenance

CloudGPT's shared core, MCP tools and regression tests were ported from [zoblon/iClaude](https://github.com/zoblon/iClaude/tree/e7ffd36cafbca743fa769c940eb6b42d37c37c8b), commit `e7ffd36cafbca743fa769c940eb6b42d37c37c8b` (2026-10-09), under the MIT License. The repositories are independent.

The port covers expanded contacts, local PDF extraction, mail organization and forwarding drafts, recurring occurrences and verified calendar moves, invitation import without replies, and fixed Reminders/Notes automation scripts.

CloudGPT adds the private OpenAI tunnel, two separate Keychain credentials, launchd background service, three access modes, English setup and private per-user configuration. All writing tools are absent in readonly mode. Calendar moves are refused outside full mode before network access. The updater stages and backs up a complete runtime and restores it after readiness failure.

The public snapshot removes private account bindings and internal handoff notes, replaces Apple-derived artwork with a new project mark and includes only generic release templates. Storage and launchd identifiers remain stable for existing users. The legacy `src/stdio.ts`, `manifest.json` and MCPB build preserve the upstream iClaude compatibility identity; CloudGPT's runtime uses `src/chatgpt.ts`.

Tests use simulated accounts and automation responses. Live iCloud connections, Automation approval, real login and mobile devices require installation-specific verification.
