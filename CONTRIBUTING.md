# Contributing

Thanks for improving dsh-qq-bot.

## Before opening a PR

- Do not commit `settings.json`, `state.json`, `diary/`, `stickers/`, access
  tokens, real QQ numbers, chat logs, or screenshots containing private data.
- Run syntax checks:

  ```sh
  node --check index.js
  node --check client.js
  ```

- Keep the QQ agent's tool allowlist read-only. Do not add shell, write, edit,
  subagent, or workflow tools to make a feature easier.
- When adding a setting, update all of:
  - `Config`
  - `normalizeConfig`
  - `SETTINGS_SHAPE`
  - the settings page tab/field definition
  - README

## Commit style

Short imperative subject, for example:

```text
fix: keep proactive private messages inside the whitelist
feat: add custom error replies
docs: document the persona board workflow
```

## Testing locally

1. Start NapCat / Lagrange / LLOneBot with OneBot v11 WebSocket.
2. Install the bundle in a DSH profile.
3. Send a private message and a group @ message.
4. Verify status, settings save, memory, persona switch, and reply formatting.

Do not use a production QQ account for destructive moderation tests.
