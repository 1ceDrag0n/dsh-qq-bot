# Security Policy

## Reporting a vulnerability

Please do not open a public issue containing a working exploit, a real access
token, or a QQ account credential.

Instead, open a minimal issue that describes:

- the affected component
- the impact
- the conditions required
- a safe reproduction outline without secrets

If the report needs a private channel, say so in the issue and the maintainer
will arrange one.

## Security model

- The QQ agent is restricted to web and read-only file tools.
- Shell, file writes, edits, subagents, workflows, and interactive host tools
  are not exposed.
- `tools.restrict` and `tools.guard` enforce an allowlist.
- OneBot access tokens and local `settings.json` / `state.json` are secrets:
  they can contain account access and chat history.
- Never commit `settings.json`, `state.json`, `diary/`, `stickers/`, logs,
  screenshots with QQ numbers, or local `.env` files.

## Scope

Issues in NapCat, Lagrange, LLOneBot, QQ itself, or the DSH runtime should be
reported to their respective projects.
