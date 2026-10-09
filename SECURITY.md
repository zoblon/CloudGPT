# Security policy

CloudGPT handles iCloud credentials and personal data, so security reports are welcome.

## Reporting a vulnerability

If GitHub offers **Report a vulnerability** in the Security tab, use that private channel. Private vulnerability reporting is currently not enabled for this repository. Until a private channel is available, open an issue titled **Private security contact request** with no technical details and wait for the maintainer to arrange private disclosure. Do not publish exploit details, real passwords or personal content in an issue. Once a private channel is established, explain the problem and reproduction steps using made-up data.

You will get an answer as soon as possible. This is a one-person project, so there is no fixed response time.

## Scope

Especially relevant are ways in which CloudGPT could:

- send mail, invitations or other messages,
- delete mail permanently, or delete events or contacts outside the documented, backed-up paths,
- write to a shared calendar without it being named explicitly,
- follow instructions contained in mail, event or contact content,
- delete reminders or lists, or change or delete existing notes, open locked notes, or write to a shared folder without it being named,
- run anything other than the fixed scripts through the Reminders and Notes automation (for example by crafting the text of a reminder, note or mail),
- bypass readonly mode or use calendar moves outside full mode,
- leak credentials into logs, error messages or tool results.

## Supported versions

Only the latest release receives fixes.
